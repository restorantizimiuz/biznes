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

// telegramInitDataFromHeader - "Authorization: tma <initData>" sarlavhasini o'qiydi.
//
// Nega sarlavha, nega so'rov parametri emas: initData mijozning ismi va
// telegram ID'sini o'z ichiga oladi va u URL'ga qo'yilsa server/proksi
// loglariga tushib qolardi. `Authorization` esa main.go dagi CORS
// AllowHeaders ro'yxatida allaqachon bor, ya'ni qo'shimcha sozlash
// talab qilmaydi.
//
// `tma` prefiksi Telegram hujjatidagi konventsiya (Telegram Mini App).
// CutPrefix ataylab TrimPrefix o'rniga: TrimPrefix prefiks bo'lmasa satrni
// **o'zgarishsiz** qaytaradi, ya'ni "Bearer <jwt>" ham initData deb
// o'qilib ketardi.
func telegramInitDataFromHeader(c *fiber.Ctx) string {
	initData, ok := strings.CutPrefix(c.Get("Authorization"), "tma ")
	if !ok {
		return ""
	}
	return strings.TrimSpace(initData)
}

// authenticateTelegram - sarlavhadagi initData'ni tekshirib, mijozni qaytaradi.
// Xato bo'lsa tayyor fiber.Error qaytadi (chaqiruvchi uni to'g'ridan-to'g'ri
// qaytaradi).
func (h *TelegramHandler) authenticateTelegram(c *fiber.Ctx) (*telegramWebAppUser, error) {
	if h.Cfg.TelegramBotToken == "" {
		return nil, fiber.NewError(500, "Telegram bot sozlanmagan")
	}
	initData := telegramInitDataFromHeader(c)
	if initData == "" {
		return nil, fiber.NewError(401, "Telegram autentifikatsiyasi talab qilinadi")
	}
	user, err := verifyTelegramInitData(initData, h.Cfg.TelegramBotToken, 24*time.Hour)
	if err != nil {
		return nil, fiber.NewError(401, "Telegram autentifikatsiyasi muvaffaqiyatsiz: "+err.Error())
	}
	return user, nil
}

// upsertTelegramCustomer - mijozni topadi yoki yaratadi va id'sini qaytaradi.
//
// Ism va username har safar Telegram'dan kelgan qiymat bilan yangilanadi:
// ular Telegram'ning o'z ma'lumoti va mijoz uni o'sha yerda o'zgartiradi.
// Profilda tahrirlanadigan maydonlar (telefon, manzil) bu yerda **tegilmaydi** —
// aks holda har buyurtmada ular o'chib ketardi.
func upsertTelegramCustomer(ctx context.Context, db dbQuerier, businessID string, u *telegramWebAppUser) (string, error) {
	fullName := strings.TrimSpace(u.FirstName + " " + u.LastName)
	var id string
	err := db.QueryRow(ctx, `
		INSERT INTO telegram_customers (business_id, telegram_id, telegram_username, full_name)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (business_id, telegram_id)
		DO UPDATE SET telegram_username=EXCLUDED.telegram_username, full_name=EXCLUDED.full_name
		RETURNING id`,
		businessID, u.ID, nullIfEmpty(u.Username), nullIfEmpty(fullName),
	).Scan(&id)
	return id, err
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

	telegramCustomerID, err := upsertTelegramCustomer(ctx, h.DB, businessID, tgUser)
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
	} else if _, err := tx.Exec(ctx,
		// Mavjud hisobga qo'shilmoqda. Ilgari telegram_customer_id faqat
		// **yangi** buyurtmada yozilardi: mijoz kassir ochgan stolga taom
		// qo'shsa, buyurtma unga bog'lanmasdi — profildagi tarixda ko'rinmasdi
		// va chekni Telegram orqali yuborib ham bo'lmasdi.
		//
		// COALESCE ataylab: allaqachon boshqa mijozga bog'langan hisob
		// qayta yozilmaydi (bitta stolda ikki kishi buyurtma bersa,
		// birinchisi egasi bo'lib qoladi).
		`UPDATE orders SET telegram_customer_id = COALESCE(telegram_customer_id, $1) WHERE id=$2`,
		telegramCustomerID, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

// Eslatma: Telegram orqali uydan (yetkazib berish/olib ketish) buyurtma berish
// olib tashlandi. Sabab: u TELEGRAM_BOT_TOKEN va initData imzosini talab
// qilardi, ya'ni kafe bot ochmaguncha online savdo qila olmasdi. Endi uydan
// buyurtma ochiq veb sahifa orqali beriladi — qarang: weborder.go.
// Telegram esa faqat stol buyurtmasi uchun qoldi (CreateOrder, yuqorida).
//
// order_source enum'idagi eski online_telegram qiymati saqlanadi: bazadagi
// eski buyurtmalar unga bog'langan va hisobot tarixi buzilmasligi kerak.

// ---------------------------------------------------------------------------
// MIJOZ PROFILI
//
// Mini App'da mijoz o'zining kim ekanini, nechta buyurtma berganini va
// oxirgi buyurtmalarini ko'radi; telefon va manzilni bir marta saqlab
// qo'ysa, keyingi checkout'lar avtomatik to'ladi.
//
// Auth: JWT emas, Telegram initData imzosi (Authorization: tma <initData>).
// Kafe `business_code` orqali aniqlanadi — mijoz har bir kafeda alohida
// yozuvga ega (telegram_customers UNIQUE(business_id, telegram_id)).
// ---------------------------------------------------------------------------

// maxProfileOrders - profilda ko'rsatiladigan buyurtmalar soni.
// Mijozga oxirgi bir nechtasi yetarli; to'liq tarix kafe hisobotida qoladi.
const maxProfileOrders = 20

// Profil maydonlarining chegaralari. phone uchun 20 — telegram_customers.phone
// ustuni VARCHAR(20) (001_init_schema.sql). Usiz uzun raqam Postgres xatosi
// bo'lib 500 qaytarardi; bu yerda aniq 400 beriladi.
const (
	maxProfilePhoneLength   = 20
	maxProfileAddressLength = 500
	maxProfileNoteLength    = 300
)

type profileOrderDTO struct {
	ID            string         `json:"id"`
	PublicToken   *string        `json:"public_token"`
	CreatedAt     time.Time      `json:"created_at"`
	Status        string         `json:"status"`
	KitchenStatus string         `json:"kitchen_status"`
	OrderType     string         `json:"order_type"`
	TableName     *string        `json:"table_name"`
	TotalAmount   float64        `json:"total_amount"`
	DiscountAmnt  float64        `json:"discount_amount"`
	FinalAmount   float64        `json:"final_amount"`
	Items         []orderItemDTO `json:"items"`
}

type profileDTO struct {
	TelegramID      int64      `json:"telegram_id"`
	Username        *string    `json:"username"`
	FullName        string     `json:"full_name"`
	Phone           *string    `json:"phone"`
	DeliveryAddress *string    `json:"delivery_address"`
	DeliveryNote    *string    `json:"delivery_note"`
	OrdersCount     int        `json:"orders_count"`
	TotalSpent      float64    `json:"total_spent"`
	FirstOrderAt    *time.Time `json:"first_order_at"`
}

// resolveProfileBusiness - business_code so'rov parametrini biznes ID'siga
// aylantiradi. Ikkala profil endpointi uchun umumiy.
func (h *TelegramHandler) resolveProfileBusiness(c *fiber.Ctx) (string, error) {
	businessCode := strings.TrimSpace(c.Query("business_code"))
	if businessCode == "" {
		return "", fiber.NewError(400, "business_code kiritilishi shart")
	}
	var businessID string
	if err := h.DB.QueryRow(context.Background(),
		`SELECT id FROM businesses WHERE business_code=$1 AND is_active=true`,
		businessCode).Scan(&businessID); err != nil {
		return "", fiber.NewError(404, "Restoran topilmadi")
	}
	return businessID, nil
}

// GetProfile - GET /api/v1/telegram/me?business_code=<kod>
//
// Hech qachon **yozmaydi**: hali buyurtma bermagan mijoz uchun ham 200
// qaytadi, profil initData'dan yig'iladi va buyurtmalar ro'yxati bo'sh
// bo'ladi. telegram_customers qatori faqat buyurtma berilganda yoki
// UpdateProfile chaqirilganda yaratiladi.
func (h *TelegramHandler) GetProfile(c *fiber.Ctx) error {
	tgUser, err := h.authenticateTelegram(c)
	if err != nil {
		return err
	}
	businessID, err := h.resolveProfileBusiness(c)
	if err != nil {
		return err
	}
	ctx := context.Background()

	profile := profileDTO{
		TelegramID: tgUser.ID,
		FullName:   strings.TrimSpace(tgUser.FirstName + " " + tgUser.LastName),
	}
	if tgUser.Username != "" {
		profile.Username = &tgUser.Username
	}

	var customerID string
	err = h.DB.QueryRow(ctx,
		`SELECT id, phone, delivery_address, delivery_note FROM telegram_customers
		 WHERE business_id=$1 AND telegram_id=$2`,
		businessID, tgUser.ID,
	).Scan(&customerID, &profile.Phone, &profile.DeliveryAddress, &profile.DeliveryNote)
	if err != nil {
		// Yozuv yo'q — mijoz bu kafeda hali buyurtma bermagan.
		return c.JSON(fiber.Map{"profile": profile, "orders": []profileOrderDTO{}})
	}

	// Statistika. Sarflangan summa faqat **to'langan** buyurtmalardan:
	// bekor qilingan yoki hali ochiq hisob "sarflandi" degani emas.
	if err := h.DB.QueryRow(ctx, `
		SELECT count(*),
		       COALESCE(SUM(final_amount) FILTER (WHERE status='paid'), 0),
		       min(created_at)
		FROM orders WHERE telegram_customer_id=$1`, customerID,
	).Scan(&profile.OrdersCount, &profile.TotalSpent, &profile.FirstOrderAt); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := h.DB.Query(ctx, `
		SELECT o.id, o.created_at, o.status, o.kitchen_status, o.order_type, t.name,
		       o.total_amount, o.discount_amount, o.final_amount,
		       -- Kuzatuv havolasi faqat uydan berilgan buyurtmada ma'noli.
		       -- Stol buyurtmasida u keraksiz, shuning uchun tokenni ochmaymiz.
		       CASE WHEN o.order_type <> 'dine_in' THEN o.public_token END
		FROM orders o
		LEFT JOIN tables t ON t.id = o.table_id
		WHERE o.telegram_customer_id=$1
		ORDER BY o.created_at DESC
		LIMIT $2`, customerID, maxProfileOrders)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	orders := []profileOrderDTO{}
	var orderIDs []string
	for rows.Next() {
		var o profileOrderDTO
		if err := rows.Scan(&o.ID, &o.CreatedAt, &o.Status, &o.KitchenStatus, &o.OrderType,
			&o.TableName, &o.TotalAmount, &o.DiscountAmnt, &o.FinalAmount, &o.PublicToken); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		orders = append(orders, o)
		orderIDs = append(orderIDs, o.ID)
	}
	if err := rows.Err(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Tarkib bitta so'rovda olinadi (N+1 muammosi bo'lmasin) — orders.go dagi
	// mavjud yordamchi qayta ishlatiladi.
	itemsByOrder, err := fetchOrderItems(ctx, h.DB, orderIDs)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	for i := range orders {
		orders[i].Items = itemsByOrder[orders[i].ID]
		if orders[i].Items == nil {
			orders[i].Items = []orderItemDTO{}
		}
	}

	return c.JSON(fiber.Map{"profile": profile, "orders": orders})
}

type updateProfileRequest struct {
	Phone           *string `json:"phone"`
	DeliveryAddress *string `json:"delivery_address"`
	DeliveryNote    *string `json:"delivery_note"`
}

// UpdateProfile - PATCH /api/v1/telegram/me?business_code=<kod>
//
// Faqat mijozning **o'zi kiritadigan** maydonlari tahrirlanadi. Ism va
// username bu yerda yo'q: ular Telegram'ning ma'lumoti va har buyurtmada
// upsertTelegramCustomer tomonidan qayta yoziladi — tahrirlashga ruxsat
// berilsa, keyingi buyurtmada jimgina eskisiga qaytib qolardi.
//
// Ko'rsatkich (pointer) maydonlar: "yuborilmadi" (o'zgarmaydi) va "bo'sh
// qilib yuborildi" (tozalanadi) holatlarini ajratish uchun.
func (h *TelegramHandler) UpdateProfile(c *fiber.Ctx) error {
	tgUser, err := h.authenticateTelegram(c)
	if err != nil {
		return err
	}
	businessID, err := h.resolveProfileBusiness(c)
	if err != nil {
		return err
	}

	var req updateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	limits := []struct {
		value *string
		max   int
		name  string
	}{
		{req.Phone, maxProfilePhoneLength, "Telefon raqami"},
		{req.DeliveryAddress, maxProfileAddressLength, "Manzil"},
		{req.DeliveryNote, maxProfileNoteLength, "Mo'ljal"},
	}
	for _, l := range limits {
		if l.value == nil {
			continue
		}
		*l.value = strings.TrimSpace(*l.value)
		if len([]rune(*l.value)) > l.max {
			return c.Status(400).JSON(fiber.Map{
				"error": fmt.Sprintf("%s juda uzun (eng ko'pi %d belgi)", l.name, l.max),
			})
		}
	}

	ctx := context.Background()
	// Qator hali bo'lmasligi mumkin (mijoz hali buyurtma bermagan, lekin
	// profilini oldindan to'ldirmoqda), shuning uchun avval upsert.
	customerID, err := upsertTelegramCustomer(ctx, h.DB, businessID, tgUser)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// SET qismi faqat kelgan maydonlardan yig'iladi — staff.go dagi
	// UpdateStaff bilan bir xil naqsh. COALESCE ishlatilmaydi: mijoz
	// maydonni ataylab **tozalashi** ham mumkin bo'lishi kerak, COALESCE
	// esa bo'sh qiymatda eskisini qoldirib qo'yardi.
	sets := []string{}
	args := []any{}
	add := func(column string, value any) {
		args = append(args, value)
		sets = append(sets, fmt.Sprintf("%s=$%d", column, len(args)))
	}
	if req.Phone != nil {
		add("phone", nullIfEmpty(*req.Phone))
	}
	if req.DeliveryAddress != nil {
		add("delivery_address", nullIfEmpty(*req.DeliveryAddress))
	}
	if req.DeliveryNote != nil {
		add("delivery_note", nullIfEmpty(*req.DeliveryNote))
	}
	if len(sets) == 0 {
		return c.JSON(fiber.Map{"success": true})
	}

	args = append(args, customerID)
	query := fmt.Sprintf(`UPDATE telegram_customers SET %s WHERE id=$%d`,
		strings.Join(sets, ", "), len(args))
	if _, err := h.DB.Exec(ctx, query, args...); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true})
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
