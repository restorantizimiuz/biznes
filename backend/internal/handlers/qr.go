package handlers

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// QRHandler - stol QR kodini o'qigan mijoz uchun ochiq (login talab qilmaydigan) endpoint'lar
type QRHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
}

// GetMenuByTableToken - QR skaner qilinganda ochiladigan sahifa uchun menyuni qaytaradi
func (h *QRHandler) GetMenuByTableToken(c *fiber.Ctx) error {
	token := c.Params("table_token")
	ctx := context.Background()

	var tableID, businessID string
	err := h.DB.QueryRow(ctx,
		`SELECT t.id, f.business_id FROM tables t
		 JOIN floors f ON f.id = t.floor_id
		 WHERE t.qr_code_token=$1`, token,
	).Scan(&tableID, &businessID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
	}

	rows, err := h.DB.Query(ctx,
		`SELECT c.id, c.name, p.id, p.name, p.description, p.price, p.image_url
		 FROM categories c
		 JOIN products p ON p.category_id = c.id
		 WHERE c.business_id=$1 AND c.is_active=true AND p.is_available=true
		 ORDER BY c.sort_order`, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type productDTO struct {
		ID          string  `json:"id"`
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
		ImageURL    string  `json:"image_url"`
	}
	categoriesMap := map[string]*fiber.Map{}
	var order []string

	for rows.Next() {
		var catID, catName string
		var p productDTO
		rows.Scan(&catID, &catName, &p.ID, &p.Name, &p.Description, &p.Price, &p.ImageURL)

		if _, ok := categoriesMap[catID]; !ok {
			categoriesMap[catID] = &fiber.Map{"id": catID, "name": catName, "products": []productDTO{}}
			order = append(order, catID)
		}
		items := (*categoriesMap[catID])["products"].([]productDTO)
		(*categoriesMap[catID])["products"] = append(items, p)
	}

	var result []fiber.Map
	for _, id := range order {
		result = append(result, *categoriesMap[id])
	}

	return c.JSON(fiber.Map{
		"table_id":    tableID,
		"business_id": businessID,
		"categories":  result,
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

	var tableID, businessID string
	err := h.DB.QueryRow(ctx,
		`SELECT t.id, f.business_id FROM tables t
		 JOIN floors f ON f.id = t.floor_id
		 WHERE t.qr_code_token=$1`, token,
	).Scan(&tableID, &businessID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
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
		if err := tx.QueryRow(ctx, `SELECT name, price FROM products WHERE id=$1 AND is_available=true`, item.ProductID).Scan(&name, &price); err != nil {
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

	// Kassa paneliga real-time bildirishnoma
	channel := "orders:" + businessID
	payload, _ := json.Marshal(fiber.Map{"event": "new_order", "order_id": orderID, "table_id": tableID})
	h.RDB.Publish(ctx, channel, payload)

	return c.Status(201).JSON(fiber.Map{"id": orderID, "total_amount": total})
}
