package handlers

import (
	"context"

	"cafesystem/backend/internal/notify"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type OrderHandler struct {
	DB  *pgxpool.Pool
	RDB *redis.Client
	Hub *notify.Hub
}

// notifyOrderChange - kassa panellariga real-time signal yuboradi.
// Kassir/ofitsiantning o'z amallari uchun ovoz chiqmaydi, shuning uchun
// FromCustomer bayrog'i qo'yilmaydi (qarang: notify.Event).
func (h *OrderHandler) notifyOrderChange(businessID, orderID, event string) {
	publishOrderEvent(h.Hub, h.RDB, businessID, notify.Event{
		Event:   event,
		OrderID: orderID,
	})
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
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot miqdori musbat son bo'lishi kerak"})
		}
	}
	// Manba mijoz yuborgan qiymatdan emas, **roldan** aniqlanadi: so'rovni
	// brauzer konsolidan o'zgartirib, ofitsiant o'z buyurtmasini kassirniki
	// qilib ko'rsatishi mumkin edi va hisobotdagi "qaysi ofitsiant" ustuni
	// ishonchsiz bo'lib qolardi.
	role, _ := c.Locals("role").(string)
	req.Source = "cashier"
	if role == "waiter" {
		req.Source = "waiter"
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
	addedNames := []string{}
	for _, item := range req.Items {
		var name string
		var price float64
		err = tx.QueryRow(ctx, `SELECT name, price FROM products WHERE id=$1 AND business_id=$2`, item.ProductID, businessID).Scan(&name, &price)
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
		addedNames = append(addedNames, describeItem(name, item.Quantity))
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

	if err := recordStatusChange(ctx, tx, orderID, "activated", userID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	// Ofitsiant ochgan buyurtma xizmat ko'rsatuvchiga bog'lanadi — hisobotda
	// "qaysi ofitsiant" ustuni shu yozuvdan to'ldiriladi.
	if role == "waiter" {
		if _, err := tx.Exec(ctx,
			`INSERT INTO waiter_assignments (order_id, waiter_id) VALUES ($1,$2)`,
			orderID, userID); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditOrderCreated,
		Details:    map[string]any{"items": addedNames, "amount": total, "source": req.Source},
	})

	h.notifyOrderChange(businessID, orderID, "new_order")
	return c.Status(201).JSON(fiber.Map{"id": orderID, "total_amount": total})
}

// ActivateOrder - QR orqali "yangi" (new) statusda kelgan buyurtmani kassir tasdiqlaydi.
// Shundan keyin buyurtma oshxona/kassa uchun rasmiy hisoblanadi.
func (h *OrderHandler) ActivateOrder(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	orderID := c.Params("id")
	ctx := context.Background()

	cmd, err := h.DB.Exec(ctx,
		`UPDATE orders SET status='activated', kitchen_status='preparing', activated_at=now()
		 WHERE id=$1 AND business_id=$2 AND status='new'`,
		orderID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	userID := c.Locals("user_id").(string)
	if err := recordStatusChange(ctx, h.DB, orderID, "activated", userID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditOrderActivated,
	})

	h.notifyOrderChange(businessID, orderID, "order_activated")
	return c.JSON(fiber.Map{"success": true})
}

// kitchenStagesForType - buyurtma turiga ruxsat etilgan tayyorlash bosqichlari.
//
// Stolda o'tirgan yoki olib ketadigan mijoz uchun ikkita bosqich yetarli.
// Yetkazib berishda esa taom tayyor bo'lgandan keyin yana ikkitasi bor va
// mijoz ularni o'z kuzatuv sahifasida ko'radi.
func kitchenStagesForType(orderType string) map[string]bool {
	stages := map[string]bool{"preparing": true, "ready": true}
	if orderType == "delivery" {
		stages["delivering"] = true
		stages["delivered"] = true
	}
	return stages
}

// UpdateKitchenStatus - kassir buyurtmaning tayyorlash bosqichini belgilaydi.
// Bu holat mijozga QR/Telegram va veb kuzatuv sahifasida ko'rinib turadi.
func (h *OrderHandler) UpdateKitchenStatus(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	orderID := c.Params("id")

	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil || body.Status == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Holat kiritilishi shart"})
	}

	ctx := context.Background()

	// Ruxsat etilgan bosqich buyurtma turiga bog'liq, shuning uchun avval
	// turni o'qiymiz. Bu bir vaqtning o'zida buyurtma shu kafega tegishli
	// ekanini ham tekshiradi.
	var orderType string
	if err := h.DB.QueryRow(ctx,
		`SELECT order_type FROM orders WHERE id=$1 AND business_id=$2 AND status IN ('new','activated')`,
		orderID, businessID).Scan(&orderType); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	if !kitchenStagesForType(orderType)[body.Status] {
		return c.Status(400).JSON(fiber.Map{"error": "Bu holat ushbu buyurtma turiga mos emas"})
	}

	cmd, err := h.DB.Exec(ctx,
		`UPDATE orders SET kitchen_status=$1 WHERE id=$2 AND business_id=$3 AND status IN ('new','activated')`,
		body.Status, orderID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     c.Locals("user_id").(string),
		OrderID:    orderID,
		Action:     AuditKitchenStatusChanged,
		Details:    map[string]any{"to": body.Status},
	})

	h.notifyOrderChange(businessID, orderID, "kitchen_status_changed")
	return c.JSON(fiber.Map{"success": true})
}

// dbExecutor - pgxpool.Pool ham, pgx.Tx ham shu interfeysga mos keladi,
// shuning uchun yordamchilar ikkalasi bilan ham ishlay oladi.
type dbExecutor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// recordStatusChange - buyurtma holati o'zgarishini tarixga yozadi.
//
// order_status_history jadvali sxemada boshidan bor edi, lekin unga hech narsa
// yozilmasdi. Hisobotda "soat nechida nima bo'lgan" degan savolga javob berish
// uchun endi ishga tushirildi. Audit jurnalidan farqi: bu yerda faqat rasmiy
// holat (new → activated → paid/cancelled) saqlanadi.
func recordStatusChange(ctx context.Context, db dbExecutor, orderID, status, userID string) error {
	_, err := db.Exec(ctx,
		`INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1,$2,$3)`,
		orderID, status, nullIfEmpty(userID))
	return err
}

// recalcOrderTotals - buyurtma summasini qatorlardan qayta hisoblaydi.
//
// Summani qo'shish/ayirish bilan yuritish (total = total + x) tahrirlash
// qo'shilgandan keyin xavfli: bitta xato amal summani abadiy noto'g'ri
// qoldiradi. Shuning uchun har o'zgarishdan keyin haqiqiy manba —
// order_items — bo'yicha qayta hisoblanadi.
func recalcOrderTotals(ctx context.Context, db dbExecutor, orderID string) error {
	_, err := db.Exec(ctx, `
		UPDATE orders SET
			total_amount = COALESCE((SELECT SUM(unit_price * quantity) FROM order_items WHERE order_id=$1), 0),
			final_amount = COALESCE((SELECT SUM(unit_price * quantity) FROM order_items WHERE order_id=$1), 0) - discount_amount
		WHERE id=$1`, orderID)
	return err
}

// findEditableOrder - tahrirlash mumkin bo'lgan (to'lanmagan) buyurtmani topadi.
// business_id tekshiruvi shu yerda markazlashtirilgan — boshqa kafening
// buyurtmasini tahrirlab bo'lmasligi uchun.
func findEditableOrder(ctx context.Context, db *pgxpool.Pool, orderID, businessID string) error {
	var id string
	return db.QueryRow(ctx,
		`SELECT id FROM orders WHERE id=$1 AND business_id=$2 AND status IN ('new','activated')`,
		orderID, businessID).Scan(&id)
}

type addItemsRequest struct {
	Items []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
}

// AddItem - mavjud buyurtmaga qo'shimcha mahsulot(lar) qo'shish (kassir yoki ofitsiant tomonidan).
// Kassir bir vaqtda bir nechta taom tanlashi mumkin, shuning uchun ro'yxat qabul qilinadi.
func (h *OrderHandler) AddItem(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)
	orderID := c.Params("id")

	var req addItemsRequest
	if err := c.BodyParser(&req); err != nil || len(req.Items) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Kamida bitta mahsulot tanlanishi kerak"})
	}
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot miqdori musbat son bo'lishi kerak"})
		}
	}

	ctx := context.Background()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var orderExists string
	if err := tx.QueryRow(ctx,
		`SELECT id FROM orders WHERE id=$1 AND business_id=$2 AND status IN ('new','activated')`,
		orderID, businessID).Scan(&orderExists); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	var addedTotal float64
	addedNames := []string{}
	for _, item := range req.Items {
		var name string
		var price float64
		if err := tx.QueryRow(ctx,
			`SELECT name, price FROM products WHERE id=$1 AND business_id=$2`,
			item.ProductID, businessID).Scan(&name, &price); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Mahsulot topilmadi"})
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
			 VALUES ($1,$2,$3,$4,$5)`, orderID, item.ProductID, name, price, item.Quantity); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		addedTotal += price * float64(item.Quantity)
		addedNames = append(addedNames, describeItem(name, item.Quantity))
	}

	if err := recalcOrderTotals(ctx, tx, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditItemAdded,
		Details:    map[string]any{"items": addedNames, "amount": addedTotal},
	})

	h.notifyOrderChange(businessID, orderID, "order_updated")
	return c.JSON(fiber.Map{"success": true, "added_total": addedTotal})
}

// UpdateOrderItem - buyurtmadagi bitta qatorning miqdorini o'zgartirish.
// Tahrirlash faqat kassa tomonidan qilinadi (mijoz o'zgartira olmaydi) —
// shunda ikki tomondan bir vaqtda tahrirlash nizosi bo'lmaydi.
func (h *OrderHandler) UpdateOrderItem(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)
	orderID := c.Params("id")
	itemID := c.Params("item_id")

	var body struct {
		Quantity int `json:"quantity"`
	}
	if err := c.BodyParser(&body); err != nil || body.Quantity <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Miqdor musbat son bo'lishi kerak"})
	}

	ctx := context.Background()
	if err := findEditableOrder(ctx, h.DB, orderID, businessID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	// Eski miqdor jurnal uchun kerak ("2 dan 5 ga"), shuning uchun avval o'qiladi.
	var productName string
	var oldQuantity int
	if err := h.DB.QueryRow(ctx,
		`SELECT product_name, quantity FROM order_items WHERE id=$1 AND order_id=$2`,
		itemID, orderID).Scan(&productName, &oldQuantity); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma qatori topilmadi"})
	}

	if _, err := h.DB.Exec(ctx,
		`UPDATE order_items SET quantity=$1 WHERE id=$2 AND order_id=$3`,
		body.Quantity, itemID, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := recalcOrderTotals(ctx, h.DB, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditItemQtyChanged,
		Details:    map[string]any{"product": productName, "from": oldQuantity, "to": body.Quantity},
	})

	h.notifyOrderChange(businessID, orderID, "order_updated")
	return c.JSON(fiber.Map{"success": true})
}

// DeleteOrderItem - buyurtmadan bitta qatorni olib tashlash.
// Oxirgi qator ham o'chirilsa, bo'sh buyurtma qolib ketmasligi uchun
// buyurtma bekor qilinadi va stol bo'shatiladi.
func (h *OrderHandler) DeleteOrderItem(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	orderID := c.Params("id")
	itemID := c.Params("item_id")
	userID := c.Locals("user_id").(string)

	ctx := context.Background()
	if err := findEditableOrder(ctx, h.DB, orderID, businessID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var removedName string
	var removedQty int
	if err := tx.QueryRow(ctx,
		`DELETE FROM order_items WHERE id=$1 AND order_id=$2 RETURNING product_name, quantity`,
		itemID, orderID).Scan(&removedName, &removedQty); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma qatori topilmadi"})
	}

	var remaining int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM order_items WHERE order_id=$1`, orderID).Scan(&remaining); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	orderCancelled := remaining == 0
	if orderCancelled {
		var tableID *string
		if err := tx.QueryRow(ctx,
			`UPDATE orders SET status='cancelled', total_amount=0, final_amount=0
			 WHERE id=$1 RETURNING table_id`, orderID).Scan(&tableID); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO order_cancellations (order_id, reason, cancelled_by) VALUES ($1,$2,$3)`,
			orderID, "Barcha taomlar kassir tomonidan o'chirildi", userID); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		if tableID != nil {
			if _, err := tx.Exec(ctx, `UPDATE tables SET status='empty' WHERE id=$1`, *tableID); err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
		}
	} else if err := recalcOrderTotals(ctx, tx, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditItemRemoved,
		Details:    map[string]any{"product": removedName, "quantity": removedQty},
	})
	if orderCancelled {
		writeAudit(ctx, h.DB, auditEntry{
			BusinessID: businessID,
			UserID:     userID,
			OrderID:    orderID,
			Action:     AuditOrderCancelled,
			Details:    map[string]any{"reason": "Barcha taomlar kassir tomonidan o'chirildi"},
		})
	}

	h.notifyOrderChange(businessID, orderID, "order_updated")
	return c.JSON(fiber.Map{"success": true, "order_cancelled": orderCancelled})
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
	businessID := c.Locals("business_id").(string)
	orderID := c.Params("id")
	userID := c.Locals("user_id").(string)

	var req PayOrderRequest
	if err := c.BodyParser(&req); err != nil || len(req.Payments) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "To'lov ma'lumoti kiritilishi shart"})
	}

	var paymentTotal float64
	for _, p := range req.Payments {
		paymentTotal += p.Amount
	}

	ctx := context.Background()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var finalAmount float64
	if err := tx.QueryRow(ctx,
		`SELECT final_amount FROM orders WHERE id=$1 AND business_id=$2`, orderID, businessID,
	).Scan(&finalAmount); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	if paymentTotal < finalAmount {
		return c.Status(400).JSON(fiber.Map{"error": "To'lov summasi buyurtma summasidan kam"})
	}

	methods := []string{}
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
		method := p.Method
		if p.CardType != "" {
			method += "/" + p.CardType
		}
		methods = append(methods, method)
	}

	var tableID *string
	err = tx.QueryRow(ctx,
		`UPDATE orders SET status='paid', paid_at=now() WHERE id=$1 AND business_id=$2 RETURNING table_id`,
		orderID, businessID,
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

	if err := recordStatusChange(ctx, tx, orderID, "paid", userID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditOrderPaid,
		Details:    map[string]any{"methods": methods, "amount": paymentTotal, "order_amount": finalAmount},
	})

	h.notifyOrderChange(businessID, orderID, "order_paid")
	return c.JSON(fiber.Map{"success": true})
}

// CancelOrder - buyurtmani bekor qilish, sababi majburiy yoziladi (shaffoflik uchun)
func (h *OrderHandler) CancelOrder(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
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

	cmd, err := tx.Exec(ctx, `UPDATE orders SET status='cancelled' WHERE id=$1 AND business_id=$2`, orderID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO order_cancellations (order_id, reason, cancelled_by) VALUES ($1,$2,$3)`,
		orderID, body.Reason, userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if err := recordStatusChange(ctx, tx, orderID, "cancelled", userID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Bekor qilingan buyurtmaning stoli bo'shatiladi — aks holda stol
	// "band" bo'lib qolib, kassir uni qayta ishlata olmasdi.
	if _, err := tx.Exec(ctx,
		`UPDATE tables SET status='empty'
		 WHERE id = (SELECT table_id FROM orders WHERE id=$1)`, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditOrderCancelled,
		Details:    map[string]any{"reason": body.Reason},
	})

	h.notifyOrderChange(businessID, orderID, "order_cancelled")
	return c.JSON(fiber.Map{"success": true})
}

// ApplyDiscount - kassir hisobni kamaytirib kiritishi uchun (masalan 270000 -> 250000)
func (h *OrderHandler) ApplyDiscount(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)
	orderID := c.Params("id")
	var body struct {
		DiscountAmount float64 `json:"discount_amount"`
		Reason         string  `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil || body.DiscountAmount < 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	ctx := context.Background()

	var totalAmount float64
	if err := h.DB.QueryRow(ctx,
		`SELECT total_amount FROM orders WHERE id=$1 AND business_id=$2`, orderID, businessID,
	).Scan(&totalAmount); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	if body.DiscountAmount > totalAmount {
		return c.Status(400).JSON(fiber.Map{"error": "Chegirma summasi buyurtma summasidan katta bo'lishi mumkin emas"})
	}

	_, err := h.DB.Exec(ctx,
		`UPDATE orders SET discount_amount=$1, discount_reason=$2, final_amount = total_amount - $1 WHERE id=$3 AND business_id=$4`,
		body.DiscountAmount, body.Reason, orderID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditDiscountApplied,
		Details:    map[string]any{"amount": body.DiscountAmount, "reason": body.Reason},
	})

	h.notifyOrderChange(businessID, orderID, "order_updated")
	return c.JSON(fiber.Map{"success": true})
}

// orderItemDTO - buyurtma tarkibidagi bitta qator (kassa va mijoz ilovasi uchun bir xil shakl).
// ID kassa tomonida qatorni tahrirlash/o'chirish uchun kerak.
type orderItemDTO struct {
	ID          string  `json:"id"`
	ProductName string  `json:"product_name"`
	UnitPrice   float64 `json:"unit_price"`
	Quantity    int     `json:"quantity"`
}

// fetchOrderItems - berilgan buyurtmalar uchun tarkibni bitta so'rovda oladi.
// Har bir buyurtma uchun alohida so'rov yubormaslik uchun (N+1 muammosi) ID'lar
// ro'yxati bo'yicha birdaniga olinadi va order_id bo'yicha guruhlanadi.
func fetchOrderItems(ctx context.Context, db *pgxpool.Pool, orderIDs []string) (map[string][]orderItemDTO, error) {
	result := map[string][]orderItemDTO{}
	if len(orderIDs) == 0 {
		return result, nil
	}
	rows, err := db.Query(ctx,
		`SELECT order_id, id, product_name, unit_price, quantity FROM order_items
		 WHERE order_id = ANY($1) ORDER BY created_at`, orderIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var orderID string
		var item orderItemDTO
		if err := rows.Scan(&orderID, &item.ID, &item.ProductName, &item.UnitPrice, &item.Quantity); err != nil {
			return nil, err
		}
		result[orderID] = append(result[orderID], item)
	}
	return result, rows.Err()
}

// ListActiveOrders - kassa dashboardida ko'rinadigan hozirgi faol buyurtmalar.
// Stol nomi, oshxona holati, buyurtma tarkibi va (agar Telegram orqali kelgan bo'lsa)
// mijozning telegram username/ID'si ham qo'shib qaytariladi — kassa sahifasi stol
// bosilganda qo'shimcha so'rovsiz to'liq hisobni ko'rsata olishi uchun.
func (h *OrderHandler) ListActiveOrders(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	ctx := context.Background()

	rows, err := h.DB.Query(ctx, `
		SELECT o.id, o.table_id, t.name, o.source, o.status, o.kitchen_status,
		       o.order_type, o.customer_name, o.customer_phone, o.delivery_address,
		       o.delivery_note, o.delivery_lat, o.delivery_lng, o.preferred_payment_method,
		       o.total_amount, o.discount_amount, o.final_amount,
		       tc.telegram_username, tc.telegram_id
		FROM orders o
		LEFT JOIN tables t ON t.id = o.table_id
		LEFT JOIN telegram_customers tc ON tc.id = o.telegram_customer_id
		WHERE o.business_id=$1 AND o.status IN ('new','activated')
		ORDER BY o.created_at DESC`, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type orderDTO struct {
		ID              string  `json:"id"`
		TableID         *string `json:"table_id"`
		TableName       *string `json:"table_name"`
		Source          string  `json:"source"`
		Status          string  `json:"status"`
		KitchenStatus   string  `json:"kitchen_status"`
		OrderType       string  `json:"order_type"`
		CustomerName    *string `json:"customer_name"`
		CustomerPhone   *string `json:"customer_phone"`
		DeliveryAddress *string `json:"delivery_address"`
		DeliveryNote    *string `json:"delivery_note"`
		// Koordinata manzil matnidan ustun: kassir uni xaritada ochib
		// kuryerga aniq nuqtani beradi.
		DeliveryLat            *float64       `json:"delivery_lat"`
		DeliveryLng            *float64       `json:"delivery_lng"`
		PreferredPaymentMethod *string        `json:"preferred_payment_method"`
		TotalAmount            float64        `json:"total_amount"`
		DiscountAmount         float64        `json:"discount_amount"`
		FinalAmount            float64        `json:"final_amount"`
		TelegramUsername       *string        `json:"telegram_username"`
		TelegramID             *int64         `json:"telegram_id"`
		Items                  []orderItemDTO `json:"items"`
	}
	orders := []orderDTO{}
	var orderIDs []string
	for rows.Next() {
		var o orderDTO
		if err := rows.Scan(&o.ID, &o.TableID, &o.TableName, &o.Source, &o.Status, &o.KitchenStatus,
			&o.OrderType, &o.CustomerName, &o.CustomerPhone, &o.DeliveryAddress,
			&o.DeliveryNote, &o.DeliveryLat, &o.DeliveryLng, &o.PreferredPaymentMethod,
			&o.TotalAmount, &o.DiscountAmount, &o.FinalAmount,
			&o.TelegramUsername, &o.TelegramID); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		orders = append(orders, o)
		orderIDs = append(orderIDs, o.ID)
	}

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
	return c.JSON(orders)
}
