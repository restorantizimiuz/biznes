package handlers

import (
	"context"
	"strings"
	"time"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"
	"cafesystem/backend/internal/notify"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// WebOrderHandler - Instagram havolasi orqali ochiladigan ochiq menyu va
// undan berilgan buyurtmalar.
//
// NEGA TELEGRAM'DAN AJRATILDI: ilgari uydan buyurtma faqat Telegram orqali
// ishlardi va u `TELEGRAM_BOT_TOKEN` hamda `initData` imzosini talab qilardi.
// Ya'ni kafe bot ochmaguncha online savdo qila olmasdi, mijoz esa Telegram
// ichida bo'lishi shart edi. Endi Telegram faqat **stol** buyurtmasi uchun,
// uydan buyurtma esa oddiy veb havola orqali beriladi.
type WebOrderHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
	Hub *notify.Hub
	Cfg *config.Config
}

// ---------------------------------------------------------------------------
// Suiiste'moldan himoya
//
// Mijoz tasdiqlanmaydi (SMS yo'q), shuning uchun soxta buyurtmaga qarshi
// ikki qatlam bor:
//
//  1. Bir telefon raqamdan bir vaqtda ochiq turadigan buyurtma soni cheklanadi.
//  2. Buyurtma `status='new'` bilan tushadi — kassir tasdiqlamaguncha
//     oshxonaga ketmaydi. Ya'ni soxta buyurtma eng ko'pi bilan kassirning
//     bir daqiqasini oladi, mahsulot sarflanmaydi.
//
// IP bo'yicha chastota chegarasi routes.go da limiter middleware bilan
// qo'yiladi — u butun endpointga tegishli.
// ---------------------------------------------------------------------------

const maxOpenOrdersPerPhone = 3

type webOrderItem struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type webOrderRequest struct {
	BusinessCode string `json:"business_code"`
	OrderType    string `json:"order_type"` // delivery | pickup
	CustomerName string `json:"customer_name"`
	Phone        string `json:"phone"`
	Address      string `json:"address"`
	Note         string `json:"note"`
	// Xarita nuqtasi. Manzil matni bo'sh yoki noaniq bo'lishi mumkin (OSM
	// O'zbekistonda uy raqamini ko'pincha topa olmaydi), koordinata esa
	// kuryerga aniq joyni beradi — shuning uchun ikkalasi ham saqlanadi.
	Lat           *float64       `json:"lat"`
	Lng           *float64       `json:"lng"`
	PaymentMethod string         `json:"payment_method"` // cash | card | transfer
	Items         []webOrderItem `json:"items"`
}

var validPaymentMethods = map[string]bool{"cash": true, "card": true, "transfer": true}

// CreateWebOrder - ochiq veb sahifadan buyurtma qabul qiladi (auth talab qilinmaydi).
func (h *WebOrderHandler) CreateWebOrder(c *fiber.Ctx) error {
	ctx := context.Background()

	var req webOrderRequest
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
	req.CustomerName = strings.TrimSpace(req.CustomerName)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Address = strings.TrimSpace(req.Address)
	req.Note = strings.TrimSpace(req.Note)

	if req.CustomerName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Ismingizni kiriting"})
	}
	if req.Phone == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Telefon raqamini kiriting"})
	}
	// Manzil matni bo'lmasa ham xaritadagi nuqta yetarli — kuryer shu nuqtaga
	// boradi. Lekin ikkalasi ham bo'lmasa buyurtmani yetkazib bo'lmaydi.
	if req.OrderType == "delivery" && req.Address == "" && (req.Lat == nil || req.Lng == nil) {
		return c.Status(400).JSON(fiber.Map{"error": "Yetkazib berish manzilini kiriting yoki xaritada belgilang"})
	}
	if req.PaymentMethod == "" {
		req.PaymentMethod = "cash"
	}
	if !validPaymentMethods[req.PaymentMethod] {
		return c.Status(400).JSON(fiber.Map{"error": "To'lov usuli noto'g'ri"})
	}

	var businessID string
	var minOrderAmount float64
	if err := h.DB.QueryRow(ctx,
		`SELECT id, min_order_amount FROM businesses WHERE business_code=$1 AND is_active=true`,
		req.BusinessCode,
	).Scan(&businessID, &minOrderAmount); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Restoran topilmadi"})
	}

	// Online buyurtma alohida funksiya — super-admin uni kafe uchun
	// o'chirib qo'ygan bo'lishi mumkin (masalan tarifga kirmasa).
	if !middleware.FeatureEnabled(ctx, h.DB, businessID, middleware.FeatureOnlineOrder) {
		return c.Status(403).JSON(fiber.Map{"error": middleware.ErrFeatureDisabled.Error()})
	}

	var openCount int
	if err := h.DB.QueryRow(ctx,
		`SELECT count(*) FROM orders
		 WHERE business_id=$1 AND customer_phone=$2 AND status IN ('new','activated')`,
		businessID, req.Phone).Scan(&openCount); err == nil && openCount >= maxOpenOrdersPerPhone {
		return c.Status(429).JSON(fiber.Map{
			"error": "Sizda tugallanmagan buyurtmalar bor. Ular yakunlangach yangisini bering.",
		})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var orderID, publicToken string
	if err := tx.QueryRow(ctx,
		`INSERT INTO orders (business_id, source, status, order_type,
		                     customer_name, customer_phone, delivery_address, delivery_note,
		                     delivery_lat, delivery_lng, preferred_payment_method)
		 VALUES ($1,'online_web','new',$2,$3,$4,$5,$6,$7,$8,$9)
		 RETURNING id, public_token`,
		businessID, req.OrderType, req.CustomerName, req.Phone,
		nullIfEmpty(req.Address), nullIfEmpty(req.Note),
		req.Lat, req.Lng, req.PaymentMethod,
	).Scan(&orderID, &publicToken); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Narx **bazadan** olinadi. Mijoz yuborgan summaga hech qachon
	// ishonilmaydi: so'rovni o'zgartirib taomni 1 so'mga sotib olish
	// mumkin bo'lardi.
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

	// Minimal summa faqat yetkazib berishga tegishli: olib ketishda kuryer
	// xarajati yo'q, shuning uchun cheklov ham ma'nosiz.
	if req.OrderType == "delivery" && minOrderAmount > 0 && total < minOrderAmount {
		return c.Status(400).JSON(fiber.Map{
			"error":            "Yetkazib berish uchun eng kam buyurtma summasiga yetmadi",
			"min_order_amount": minOrderAmount,
			"current_amount":   total,
		})
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
		ActorLabel: "Veb mijoz",
		OrderID:    orderID,
		Action:     AuditOrderCreated,
		Details: map[string]any{
			"items": addedNames, "amount": total,
			"order_type": req.OrderType, "phone": req.Phone, "name": req.CustomerName,
		},
	})

	publishOrderEvent(h.Hub, h.RDB, businessID, notify.Event{
		Event:        "new_order",
		OrderID:      orderID,
		Source:       "online_web",
		OrderType:    req.OrderType,
		Amount:       total,
		FromCustomer: true,
	})

	// public_token — mijozning kuzatuv havolasi. Buyurtma ID'si emas:
	// ID boshqa endpointlarda ham ishlatiladi va uni ommaga berish kerak emas.
	return c.Status(201).JSON(fiber.Map{
		"order_id":     orderID,
		"public_token": publicToken,
		"total_amount": total,
	})
}

// GetWebOrderStatus - mijozning kuzatuv sahifasi shu endpointni har bir necha
// soniyada so'raydi. Auth yo'q: token o'zi kalit vazifasini bajaradi.
//
// Javobda kafe ichki ma'lumotlari (kassir kim, chegirma sababi, boshqa
// buyurtmalar) **berilmaydi** — faqat mijozning o'z buyurtmasi.
func (h *WebOrderHandler) GetWebOrderStatus(c *fiber.Ctx) error {
	ctx := context.Background()
	token := c.Params("token")

	var (
		orderID, status, kitchenStatus, orderType string
		businessName, businessCode                string
		customerName                              string
		address, note                             *string
		paymentMethod                             *string
		totalAmount, discountAmount, finalAmount  float64
		createdAt                                 time.Time
	)
	err := h.DB.QueryRow(ctx, `
		SELECT o.id, o.status, o.kitchen_status, o.order_type, b.name, b.business_code,
		       COALESCE(o.customer_name, ''), o.delivery_address, o.delivery_note,
		       o.preferred_payment_method,
		       o.total_amount, o.discount_amount, o.final_amount, o.created_at
		FROM orders o
		JOIN businesses b ON b.id = o.business_id
		WHERE o.public_token=$1`, token,
	).Scan(&orderID, &status, &kitchenStatus, &orderType, &businessName, &businessCode,
		&customerName, &address, &note, &paymentMethod,
		&totalAmount, &discountAmount, &finalAmount, &createdAt)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	itemsByOrder, err := fetchOrderItems(ctx, h.DB, []string{orderID})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	items := itemsByOrder[orderID]
	if items == nil {
		items = []orderItemDTO{}
	}

	return c.JSON(fiber.Map{
		"business_name": businessName,
		// Mijoz kuzatuv sahifasidan menyuga qaytishi uchun kerak.
		"business_code":            businessCode,
		"status":                   status,
		"kitchen_status":           kitchenStatus,
		"order_type":               orderType,
		"customer_name":            customerName,
		"delivery_address":         address,
		"delivery_note":            note,
		"preferred_payment_method": paymentMethod,
		"total_amount":             totalAmount,
		"discount_amount":          discountAmount,
		"final_amount":             finalAmount,
		"created_at":               createdAt,
		"items":                    items,
	})
}
