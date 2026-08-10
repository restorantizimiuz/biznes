package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"
	"cafesystem/backend/internal/notify"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// TelegramHandler - Telegram WebApp orqali stoldan buyurtma berish uchun ochiq (login talab qilmaydigan) endpoint
type TelegramHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
	Hub *notify.Hub
	Cfg *config.Config
}

type telegramWebAppUser struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

// verifyTelegramInitData - Telegram WebApp initData imzosini tekshiradi.
// Algoritm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
// Bu qadam muhim: aks holda mijoz o'zining telegram_id/username'ini soxtalashtirib,
// boshqa kishi nomidan buyurtma berishi yoki chek olishi mumkin bo'lardi.
func verifyTelegramInitData(initData, botToken string, maxAge time.Duration) (*telegramWebAppUser, error) {
	values, err := url.ParseQuery(initData)
	if err != nil {
		return nil, errors.New("initData formatida xatolik")
	}

	receivedHash := values.Get("hash")
	if receivedHash == "" {
		return nil, errors.New("hash mavjud emas")
	}
	values.Del("hash")

	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, k+"="+values.Get(k))
	}
	dataCheckString := strings.Join(pairs, "\n")

	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(botToken))

	mac := hmac.New(sha256.New, secretKey.Sum(nil))
	mac.Write([]byte(dataCheckString))
	computedHash := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(computedHash), []byte(receivedHash)) {
		return nil, errors.New("initData imzosi noto'g'ri")
	}

	if authDateStr := values.Get("auth_date"); authDateStr != "" && maxAge > 0 {
		authUnix, err := strconv.ParseInt(authDateStr, 10, 64)
		if err == nil && time.Since(time.Unix(authUnix, 0)) > maxAge {
			return nil, errors.New("initData muddati o'tgan, sahifani qayta oching")
		}
	}

	userJSON := values.Get("user")
	if userJSON == "" {
		return nil, errors.New("foydalanuvchi ma'lumoti topilmadi")
	}
	var user telegramWebAppUser
	if err := json.Unmarshal([]byte(userJSON), &user); err != nil {
		return nil, errors.New("foydalanuvchi ma'lumotini o'qib bo'lmadi")
	}
	return &user, nil
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

type telegramOrderRequest struct {
	InitData string `json:"init_data"`
	Items    []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
}

// CreateOrder - Telegram WebApp'dan mijoz stol uchun buyurtma yuboradi.
// Stolda allaqachon faol (to'lanmagan) buyurtma bo'lsa, mahsulotlar o'sha buyurtmaga
// qo'shiladi (bitta stol — bitta faol buyurtma), aks holda yangisi ochiladi.
func (h *TelegramHandler) CreateOrder(c *fiber.Ctx) error {
	token := c.Params("table_token")
	ctx := context.Background()

	var req telegramOrderRequest
	if err := c.BodyParser(&req); err != nil || len(req.Items) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Kamida bitta mahsulot tanlanishi kerak"})
	}
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot miqdori musbat son bo'lishi kerak"})
		}
	}

	if h.Cfg.TelegramBotToken == "" {
		return c.Status(500).JSON(fiber.Map{"error": "Telegram bot sozlanmagan"})
	}
	tgUser, err := verifyTelegramInitData(req.InitData, h.Cfg.TelegramBotToken, 24*time.Hour)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Telegram autentifikatsiyasi muvaffaqiyatsiz: " + err.Error()})
	}

	var tableID, businessID, tableName string
	err = h.DB.QueryRow(ctx,
		`SELECT t.id, f.business_id, t.name FROM tables t
		 JOIN floors f ON f.id = t.floor_id
		 WHERE t.qr_code_token=$1 AND t.is_deleted=false`, token,
	).Scan(&tableID, &businessID, &tableName)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
	}

	if !middleware.FeatureEnabled(ctx, h.DB, businessID, middleware.FeatureTelegramBot) {
		return c.Status(403).JSON(fiber.Map{"error": middleware.ErrFeatureDisabled.Error()})
	}

	fullName := strings.TrimSpace(tgUser.FirstName + " " + tgUser.LastName)
	var telegramCustomerID string
	err = h.DB.QueryRow(ctx, `
		INSERT INTO telegram_customers (business_id, telegram_id, telegram_username, full_name)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (business_id, telegram_id)
		DO UPDATE SET telegram_username=EXCLUDED.telegram_username, full_name=EXCLUDED.full_name
		RETURNING id`,
		businessID, tgUser.ID, nullIfEmpty(tgUser.Username), nullIfEmpty(fullName),
	).Scan(&telegramCustomerID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var orderID string
	isNewOrder := false
	err = tx.QueryRow(ctx,
		`SELECT id FROM orders WHERE table_id=$1 AND status IN ('new','activated') ORDER BY created_at DESC LIMIT 1`,
		tableID,
	).Scan(&orderID)
	if err != nil {
		isNewOrder = true
		err = tx.QueryRow(ctx,
			`INSERT INTO orders (business_id, table_id, source, status, telegram_customer_id)
			 VALUES ($1,$2,'online_telegram','new',$3) RETURNING id`,
			businessID, tableID, telegramCustomerID,
		).Scan(&orderID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	var addedTotal float64
	addedNames := []string{}
	for _, item := range req.Items {
		var name string
		var price float64
		if err := tx.QueryRow(ctx,
			`SELECT name, price FROM products
			 WHERE id=$1 AND business_id=$2 AND is_available=true AND is_deleted=false`,
			item.ProductID, businessID,
		).Scan(&name, &price); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot mavjud emas"})
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
			 VALUES ($1,$2,$3,$4,$5)`, orderID, item.ProductID, name, price, item.Quantity)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		addedTotal += price * float64(item.Quantity)
		addedNames = append(addedNames, describeItem(name, item.Quantity))
	}

	_, err = tx.Exec(ctx,
		`UPDATE orders SET total_amount = total_amount + $1, final_amount = final_amount + $1 WHERE id=$2`,
		addedTotal, orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	_, err = tx.Exec(ctx, `UPDATE tables SET status='pending_payment' WHERE id=$1`, tableID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	action := AuditItemAdded
	event := "order_updated"
	if isNewOrder {
		action = AuditOrderCreated
		event = "new_order"
	}
	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		ActorLabel: "Telegram mijoz",
		OrderID:    orderID,
		Action:     action,
		Details:    map[string]any{"items": addedNames, "amount": addedTotal, "table": tableName},
	})

	publishOrderEvent(h.Hub, h.RDB, businessID, notify.Event{
		Event:        event,
		OrderID:      orderID,
		TableID:      tableID,
		TableName:    tableName,
		Source:       "online_telegram",
		OrderType:    "dine_in",
		Amount:       addedTotal,
		FromCustomer: true,
	})

	return c.Status(201).JSON(fiber.Map{"id": orderID, "added_total": addedTotal})
}

type telegramOnlineOrderRequest struct {
	InitData     string `json:"init_data"`
	BusinessCode string `json:"business_code"`
	OrderType    string `json:"order_type"` // delivery yoki pickup
	Phone        string `json:"phone"`
	Address      string `json:"address"`
	Items        []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
}

// CreateOnlineOrder - mijoz uyda o'tirib yetkazib berish yoki olib ketishga buyurtma beradi.
// Stol yo'q (table_id NULL), shuning uchun aloqa ma'lumotlari buyurtmaning o'zida saqlanadi.
// Buyurtma 'new' holatida keladi — kassir uni qabul qilishi yoki bekor qilishi kerak.
func (h *TelegramHandler) CreateOnlineOrder(c *fiber.Ctx) error {
	ctx := context.Background()

	var req telegramOnlineOrderRequest
	if err := c.BodyParser(&req); err != nil || len(req.Items) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Kamida bitta mahsulot tanlanishi kerak"})
	}
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot miqdori musbat son bo'lishi kerak"})
		}
	}
	if req.OrderType != "delivery" && req.OrderType != "pickup" {
		return c.Status(400).JSON(fiber.Map{"error": "Buyurtma turi noto'g'ri"})
	}
	req.Phone = strings.TrimSpace(req.Phone)
	req.Address = strings.TrimSpace(req.Address)
	if req.Phone == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Telefon raqami kiritilishi shart"})
	}
	if req.OrderType == "delivery" && req.Address == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Yetkazib berish uchun manzil kiritilishi shart"})
	}

	if h.Cfg.TelegramBotToken == "" {
		return c.Status(500).JSON(fiber.Map{"error": "Telegram bot sozlanmagan"})
	}
	tgUser, err := verifyTelegramInitData(req.InitData, h.Cfg.TelegramBotToken, 24*time.Hour)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Telegram autentifikatsiyasi muvaffaqiyatsiz: " + err.Error()})
	}

	var businessID string
	if err := h.DB.QueryRow(ctx,
		`SELECT id FROM businesses WHERE business_code=$1 AND is_active=true`, req.BusinessCode,
	).Scan(&businessID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Restoran topilmadi"})
	}

	// Yetkazib berish/olib ketish alohida funksiya — super-admin uni kafe
	// uchun o'chirib qo'ygan bo'lishi mumkin (masalan tarifga kirmasa).
	if !middleware.FeatureEnabled(ctx, h.DB, businessID, middleware.FeatureOnlineOrder) {
		return c.Status(403).JSON(fiber.Map{"error": middleware.ErrFeatureDisabled.Error()})
	}

	fullName := strings.TrimSpace(tgUser.FirstName + " " + tgUser.LastName)
	var telegramCustomerID string
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO telegram_customers (business_id, telegram_id, telegram_username, full_name, phone)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (business_id, telegram_id)
		DO UPDATE SET telegram_username=EXCLUDED.telegram_username, full_name=EXCLUDED.full_name,
		              phone=COALESCE(EXCLUDED.phone, telegram_customers.phone)
		RETURNING id`,
		businessID, tgUser.ID, nullIfEmpty(tgUser.Username), nullIfEmpty(fullName), req.Phone,
	).Scan(&telegramCustomerID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var orderID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO orders (business_id, source, status, order_type, customer_phone, delivery_address, telegram_customer_id)
		 VALUES ($1,'online_telegram','new',$2,$3,$4,$5) RETURNING id`,
		businessID, req.OrderType, req.Phone, nullIfEmpty(req.Address), telegramCustomerID,
	).Scan(&orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	var total float64
	addedNames := []string{}
	for _, item := range req.Items {
		var name string
		var price float64
		if err := tx.QueryRow(ctx,
			`SELECT name, price FROM products
			 WHERE id=$1 AND business_id=$2 AND is_available=true AND is_deleted=false`,
			item.ProductID, businessID,
		).Scan(&name, &price); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot mavjud emas"})
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
			 VALUES ($1,$2,$3,$4,$5)`, orderID, item.ProductID, name, price, item.Quantity); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		total += price * float64(item.Quantity)
		addedNames = append(addedNames, describeItem(name, item.Quantity))
	}

	if _, err := tx.Exec(ctx,
		`UPDATE orders SET total_amount=$1, final_amount=$1 WHERE id=$2`, total, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		ActorLabel: "Telegram mijoz",
		OrderID:    orderID,
		Action:     AuditOrderCreated,
		Details: map[string]any{
			"items": addedNames, "amount": total,
			"order_type": req.OrderType, "phone": req.Phone,
		},
	})

	publishOrderEvent(h.Hub, h.RDB, businessID, notify.Event{
		Event:        "new_order",
		OrderID:      orderID,
		Source:       "online_telegram",
		OrderType:    req.OrderType,
		Amount:       total,
		FromCustomer: true,
	})

	return c.Status(201).JSON(fiber.Map{"id": orderID, "total_amount": total})
}

// sendTelegramMessage - Telegram Bot API orqali oddiy matnli xabar yuboradi (chek uchun ishlatiladi)
func sendTelegramMessage(botToken string, chatID int64, text string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	body, _ := json.Marshal(fiber.Map{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "Markdown",
	})
	req, err := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("telegram API status %d", resp.StatusCode)
	}
	return nil
}
