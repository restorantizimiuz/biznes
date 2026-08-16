package handlers

import (
	"context"

	"cafesystem/backend/internal/middleware"
	"cafesystem/backend/internal/notify"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// QRHandler - stol QR kodini o'qigan mijoz uchun ochiq (login talab qilmaydigan) endpoint'lar
type QRHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
	Hub *notify.Hub
}

type menuProductDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	ImageURL    string  `json:"image_url"`
}

// fetchMenuCategories - berilgan biznes uchun faol kategoriya/mahsulotlarni oladi.
// Ham stol-tokeni orqali, ham biznes-kodi orqali menyu olishda ishlatiladi (kod takrorlanmasin deb).
func (h *QRHandler) fetchMenuCategories(ctx context.Context, businessID string) ([]fiber.Map, error) {
	rows, err := h.DB.Query(ctx,
		`SELECT c.id, c.name, COALESCE(c.description, ''), COALESCE(c.image_url, ''),
		        p.id, p.name, COALESCE(p.description, ''), p.price, COALESCE(p.image_url, '')
		 FROM categories c
		 JOIN products p ON p.category_id = c.id
		 WHERE c.business_id=$1 AND c.is_active=true AND c.is_deleted=false
		   AND p.is_available=true AND p.is_deleted=false
		 ORDER BY c.sort_order, c.name`, businessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	categoriesMap := map[string]*fiber.Map{}
	var order []string

	for rows.Next() {
		var catID, catName, catDescription, catImageURL string
		var p menuProductDTO
		if err := rows.Scan(&catID, &catName, &catDescription, &catImageURL,
			&p.ID, &p.Name, &p.Description, &p.Price, &p.ImageURL); err != nil {
			return nil, err
		}

		if _, ok := categoriesMap[catID]; !ok {
			categoriesMap[catID] = &fiber.Map{
				"id":          catID,
				"name":        catName,
				"description": catDescription,
				"image_url":   catImageURL,
				"products":    []menuProductDTO{},
			}
			order = append(order, catID)
		}
		items := (*categoriesMap[catID])["products"].([]menuProductDTO)
		(*categoriesMap[catID])["products"] = append(items, p)
	}

	var result []fiber.Map
	for _, id := range order {
		result = append(result, *categoriesMap[id])
	}
	return result, nil
}

// fetchTableActiveOrder - stolning hozirgi to'lanmagan buyurtmasini (bo'lsa) qaytaradi.
// Mijoz QR/Telegram orqali kirganda shu stolda nima buyurtma qilinganini (kassir
// kiritganlari ham) va oshxona holatini ko'rishi uchun ishlatiladi.
func (h *QRHandler) fetchTableActiveOrder(ctx context.Context, tableID string) (fiber.Map, error) {
	var orderID, status, kitchenStatus string
	var totalAmount, finalAmount float64
	err := h.DB.QueryRow(ctx,
		`SELECT id, status, kitchen_status, total_amount, final_amount FROM orders
		 WHERE table_id=$1 AND status IN ('new','activated')
		 ORDER BY created_at DESC LIMIT 1`, tableID,
	).Scan(&orderID, &status, &kitchenStatus, &totalAmount, &finalAmount)
	if err != nil {
		return nil, nil // faol buyurtma yo'q — bu xato emas
	}

	itemsByOrder, err := fetchOrderItems(ctx, h.DB, []string{orderID})
	if err != nil {
		return nil, err
	}
	items := itemsByOrder[orderID]
	if items == nil {
		items = []orderItemDTO{}
	}

	return fiber.Map{
		"id":             orderID,
		"status":         status,
		"kitchen_status": kitchenStatus,
		"items":          items,
		"total_amount":   totalAmount,
		"final_amount":   finalAmount,
	}, nil
}

// GetMenuByTableToken - QR skaner qilinganda ochiladigan sahifa uchun menyuni qaytaradi.
// Javobga stolning joriy buyurtmasi (active_order) ham qo'shiladi — mijoz o'z
// buyurtmasi holatini (qabul qilindi / tayyorlanmoqda / tayyor) kuzatib turishi uchun.
func (h *QRHandler) GetMenuByTableToken(c *fiber.Ctx) error {
	token := c.Params("table_token")
	ctx := context.Background()

	var tableID, businessID, tableName, businessName string
	err := h.DB.QueryRow(ctx,
		`SELECT t.id, f.business_id, t.name, b.name FROM tables t
		 JOIN floors f ON f.id = t.floor_id
		 JOIN businesses b ON b.id = f.business_id
		 WHERE t.qr_code_token=$1 AND t.is_deleted=false`, token,
	).Scan(&tableID, &businessID, &tableName, &businessName)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
	}

	result, err := h.fetchMenuCategories(ctx, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	activeOrder, err := h.fetchTableActiveOrder(ctx, tableID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"table_id":      tableID,
		"table_name":    tableName,
		"business_id":   businessID,
		"business_name": businessName,
		"categories":    result,
		"active_order":  activeOrder,
	})
}

// GetMenuByBusinessCode - Telegram bot /start orqali (hali stol tanlanmagan holatda) ochiladigan
// menyuni qaytaradi. business_code — businesses jadvalidagi mavjud, login'da ham ishlatiladigan
// ustun; bu yerda faqat menyuni ko'rsatish uchun ochiq (auth talab qilinmaydi) ishlatiladi.
// Buyurtma yaratishda baribir table_token talab qilinadi (TelegramHandler.CreateOrder) —
// bu endpoint faqat ko'rish/browsing bosqichi uchun.
func (h *QRHandler) GetMenuByBusinessCode(c *fiber.Ctx) error {
	businessCode := c.Query("business_code")
	if businessCode == "" {
		return c.Status(400).JSON(fiber.Map{"error": "business_code kiritilishi shart"})
	}
	ctx := context.Background()

	var businessID, businessName string
	err := h.DB.QueryRow(ctx,
		`SELECT id, name FROM businesses WHERE business_code=$1 AND is_active=true`, businessCode,
	).Scan(&businessID, &businessName)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Restoran topilmadi"})
	}

	result, err := h.fetchMenuCategories(ctx, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"business_id":   businessID,
		"business_name": businessName,
		"categories":    result,
		// Uydan buyurtma sahifasi shu bayroqlarga qarab "Stolga buyurtma"/
		// "Yetkazib berish"/"Olib ketish" tugmalarini ko'rsatadi yoki
		// yashiradi. dine_in — Telegram QR-skaner orqali stol tanlab
		// buyurtma berish oqimi haqiqatan ishlashini bildiradi: u
		// POST /telegram/:table_token/order orqali yuboriladi, bu
		// endpoint FeatureTelegramBot bilan himoyalangan — shuning uchun
		// shu bayroqning o'zi ishlatiladi (button ko'rinishi = so'rov
		// muvaffaqiyatli bo'lishi bilan mos keladi).
		"order_types": fiber.Map{
			"dine_in":  middleware.FeatureEnabled(ctx, h.DB, businessID, middleware.FeatureTelegramBot),
			"delivery": middleware.FeatureEnabled(ctx, h.DB, businessID, middleware.FeatureDelivery),
			"pickup":   middleware.FeatureEnabled(ctx, h.DB, businessID, middleware.FeaturePickup),
		},
	})
}

type qrOrderRequest struct {
	Items []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
}

// CreateOrderFromQR - mijoz QR-menyu orqali stoldan turib buyurtma beradi.
// Status "new" bilan yaratiladi - kassa panelida bu "faollashtirish kutilmoqda" deb ko'rinadi.
func (h *QRHandler) CreateOrderFromQR(c *fiber.Ctx) error {
	token := c.Params("table_token")
	ctx := context.Background()

	var tableID, businessID, tableName string
	err := h.DB.QueryRow(ctx,
		`SELECT t.id, f.business_id, t.name FROM tables t
		 JOIN floors f ON f.id = t.floor_id
		 WHERE t.qr_code_token=$1 AND t.is_deleted=false`, token,
	).Scan(&tableID, &businessID, &tableName)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
	}

	// QR menyu funksiyasi super-admin tomonidan o'chirilgan bo'lishi mumkin.
	// Tekshiruv aynan shu yerda: bu endpoint ochiq (JWT yo'q), shuning uchun
	// middleware emas, to'g'ridan-to'g'ri chaqiruv ishlatiladi.
	if !middleware.FeatureEnabled(ctx, h.DB, businessID, middleware.FeatureQRMenu) {
		return c.Status(403).JSON(fiber.Map{"error": middleware.ErrFeatureDisabled.Error()})
	}

	var req qrOrderRequest
	if err := c.BodyParser(&req); err != nil || len(req.Items) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Kamida bitta mahsulot tanlanishi kerak"})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var orderID string
	err = tx.QueryRow(ctx,
		`INSERT INTO orders (business_id, table_id, source, status) VALUES ($1,$2,'qr','new') RETURNING id`,
		businessID, tableID,
	).Scan(&orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	var total float64
	for _, item := range req.Items {
		var name string
		var price float64
		if err := tx.QueryRow(ctx,
			`SELECT name, price FROM products
			 WHERE id=$1 AND business_id=$2 AND is_available=true AND is_deleted=false`,
			item.ProductID, businessID).Scan(&name, &price); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot mavjud emas"})
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
			 VALUES ($1,$2,$3,$4,$5)`, orderID, item.ProductID, name, price, item.Quantity)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		total += price * float64(item.Quantity)
	}

	_, err = tx.Exec(ctx, `UPDATE orders SET total_amount=$1, final_amount=$1 WHERE id=$2`, total, orderID)
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

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		ActorLabel: "QR mijoz",
		OrderID:    orderID,
		Action:     AuditOrderCreated,
		Details:    map[string]any{"amount": total, "source": "qr", "table": tableName},
	})

	// Kassa paneliga real-time bildirishnoma. FromCustomer=true — kassa
	// panelida ovoz va banner aynan shunday buyurtmalar uchun chiqadi.
	publishOrderEvent(h.Hub, h.RDB, businessID, notify.Event{
		Event:        "new_order",
		OrderID:      orderID,
		TableID:      tableID,
		TableName:    tableName,
		Source:       "qr",
		OrderType:    "dine_in",
		Amount:       total,
		FromCustomer: true,
	})

	return c.Status(201).JSON(fiber.Map{"id": orderID, "total_amount": total})
}
