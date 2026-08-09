package handlers

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type OrderHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
}

// notifyNewOrder - Redis pub/sub orqali kassa/oshxona panellariga real-time signal yuboradi.
// Frontend WebSocket orqali shu kanalga obuna bo'lib turadi va yangi buyurtma kelganda
// ovozli/vizual bildirishnoma ko'rsatadi.
func (h *OrderHandler) notifyNewOrder(businessID, orderID string) {
	channel := "orders:" + businessID
	payload, _ := json.Marshal(fiber.Map{"event": "new_order", "order_id": orderID})
	h.RDB.Publish(context.Background(), channel, payload)
}

type CreateOrderRequest struct {
	TableID string `json:"table_id"`
	Source  string `json:"source"` // cashier, waiter
	Items   []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
}

// CreateOrder - kassir yoki ofitsiant tomonidan qo'lda buyurtma yaratish
// (masalan QR-siz kelgan mijoz uchun, "aktivlashtirish" jarayoni)
func (h *OrderHandler) CreateOrder(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)

	var req CreateOrderRequest
	if err := c.BodyParser(&req); err != nil || len(req.Items) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Kamida bitta mahsulot tanlanishi kerak"})
	}
	if req.Source == "" {
		req.Source = "cashier"
	}

	ctx := context.Background()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var orderID string
	err = tx.QueryRow(ctx,
		`INSERT INTO orders (business_id, table_id, source, status, created_by_user_id)
		 VALUES ($1,$2,$3,'activated',$4) RETURNING id`,
		businessID, req.TableID, req.Source, userID,
	).Scan(&orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	var total float64
	for _, item := range req.Items {
		var name string
		var price float64
		err = tx.QueryRow(ctx, `SELECT name, price FROM products WHERE id=$1`, item.ProductID).Scan(&name, &price)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot topilmadi"})
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
			 VALUES ($1,$2,$3,$4,$5)`,
			orderID, item.ProductID, name, price, item.Quantity,
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		total += price * float64(item.Quantity)
	}

	_, err = tx.Exec(ctx, `UPDATE orders SET total_amount=$1, final_amount=$1 WHERE id=$2`, total, orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if req.TableID != "" {
		_, err = tx.Exec(ctx, `UPDATE tables SET status='occupied' WHERE id=$1`, req.TableID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	h.notifyNewOrder(businessID, orderID)
	return c.Status(201).JSON(fiber.Map{"id": orderID, "total_amount": total})
}

// ActivateOrder - QR orqali "yangi" (new) statusda kelgan buyurtmani kassir tasdiqlaydi.
// Shundan keyin buyurtma oshxona/kassa uchun rasmiy hisoblanadi.
func (h *OrderHandler) ActivateOrder(c *fiber.Ctx) error {
	orderID := c.Params("id")
	ctx := context.Background()

	_, err := h.DB.Exec(ctx,
		`UPDATE orders SET status='activated', activated_at=now() WHERE id=$1 AND status='new'`, orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// AddItem - mavjud buyurtmaga qo'shimcha mahsulot qo'shish (kassir yoki ofitsiant tomonidan)
func (h *OrderHandler) AddItem(c *fiber.Ctx) error {
	orderID := c.Params("id")
	var body struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	}
	if err := c.BodyParser(&body); err != nil || body.Quantity <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	ctx := context.Background()
	var name string
	var price float64
	if err := h.DB.QueryRow(ctx, `SELECT name, price FROM products WHERE id=$1`, body.ProductID).Scan(&name, &price); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Mahsulot topilmadi"})
	}

	_, err := h.DB.Exec(ctx,
		`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
		 VALUES ($1,$2,$3,$4,$5)`, orderID, body.ProductID, name, price, body.Quantity)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	itemTotal := price * float64(body.Quantity)
	_, err = h.DB.Exec(ctx,
		`UPDATE orders SET total_amount = total_amount + $1, final_amount = final_amount + $1 WHERE id=$2`,
		itemTotal, orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true})
}

type PayOrderRequest struct {
	Payments []struct {
		Method   string  `json:"method"`    // cash, transfer, card
		CardType string  `json:"card_type"` // uzcard, humo, visa, mastercard (ixtiyoriy)
		Amount   float64 `json:"amount"`
	} `json:"payments"`
}

// PayOrder - to'lovni yakunlash. Bir nechta to'lov turi bo'lishi mumkin
// (masalan 20000 naqt + 50000 o'tkazma), shuning uchun ro'yxat qabul qilinadi.
func (h *OrderHandler) PayOrder(c *fiber.Ctx) error {
	orderID := c.Params("id")
	userID := c.Locals("user_id").(string)

	var req PayOrderRequest
	if err := c.BodyParser(&req); err != nil || len(req.Payments) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "To'lov ma'lumoti kiritilishi shart"})
	}

	ctx := context.Background()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	for _, p := range req.Payments {
		var cardType interface{}
		if p.CardType != "" {
			cardType = p.CardType
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO payments (order_id, method, card_type, amount, received_by)
			 VALUES ($1,$2,$3,$4,$5)`, orderID, p.Method, cardType, p.Amount, userID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	var tableID *string
	err = tx.QueryRow(ctx,
		`UPDATE orders SET status='paid', paid_at=now() WHERE id=$1 RETURNING table_id`, orderID,
	).Scan(&tableID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if tableID != nil {
		_, err = tx.Exec(ctx, `UPDATE tables SET status='empty' WHERE id=$1`, *tableID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// CancelOrder - buyurtmani bekor qilish, sababi majburiy yoziladi (shaffoflik uchun)
func (h *OrderHandler) CancelOrder(c *fiber.Ctx) error {
	orderID := c.Params("id")
	userID := c.Locals("user_id").(string)

	var body struct {
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil || body.Reason == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Bekor qilish sababi kiritilishi shart"})
	}

	ctx := context.Background()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE orders SET status='cancelled' WHERE id=$1`, orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO order_cancellations (order_id, reason, cancelled_by) VALUES ($1,$2,$3)`,
		orderID, body.Reason, userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ApplyDiscount - kassir hisobni kamaytirib kiritishi uchun (masalan 270000 -> 250000)
func (h *OrderHandler) ApplyDiscount(c *fiber.Ctx) error {
	orderID := c.Params("id")
	var body struct {
		DiscountAmount float64 `json:"discount_amount"`
		Reason         string  `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil || body.DiscountAmount < 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	ctx := context.Background()
	_, err := h.DB.Exec(ctx,
		`UPDATE orders SET discount_amount=$1, discount_reason=$2, final_amount = total_amount - $1 WHERE id=$3`,
		body.DiscountAmount, body.Reason, orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ListActiveOrders - kassa dashboardida ko'rinadigan hozirgi faol buyurtmalar
func (h *OrderHandler) ListActiveOrders(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	rows, err := h.DB.Query(context.Background(),
		`SELECT id, table_id, source, status, total_amount, final_amount, created_at
		 FROM orders WHERE business_id=$1 AND status IN ('new','activated')
		 ORDER BY created_at DESC`, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type orderDTO struct {
		ID          string  `json:"id"`
		TableID     *string `json:"table_id"`
		Source      string  `json:"source"`
		Status      string  `json:"status"`
		TotalAmount float64 `json:"total_amount"`
		FinalAmount float64 `json:"final_amount"`
	}
	var orders []orderDTO
	for rows.Next() {
		var o orderDTO
		var createdAt interface{}
		rows.Scan(&o.ID, &o.TableID, &o.Source, &o.Status, &o.TotalAmount, &o.FinalAmount, &createdAt)
		orders = append(orders, o)
	}
	return c.JSON(orders)
}
