package handlers

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// Yopilgan (to'langan) buyurtmani tahrirlash.
//
// Nega kerak: kassir shoshib noto'g'ri to'lov turini bosishi yoki taomni
// buyurtmaga qo'shishni unutishi mumkin. Vaqt o'tib bunday xato hisobotda
// chalkashlik bo'lib qoladi, shuning uchun tuzatish imkoni bo'lishi kerak.
//
// Nega faqat owner/admin: bu moliyaviy yozuvni o'zgartirish. Kassir o'zi
// yopgan hisobni keyin o'zi o'zgartira olsa, nazorat ma'nosini yo'qotadi.
// Kassir hisobotni **ko'radi**, lekin tahrirlay olmaydi.
//
// Har bir tahrir sababi bilan birga audit jurnaliga yoziladi
// (action = order_edited_after_close), shuning uchun keyin "nega o'zgardi?"
// degan savolga javob topiladi.

// findClosedOrder - tahrirlanadigan yopilgan buyurtmani topadi va
// business_id tegishliligini tekshiradi (boshqa kafening buyurtmasiga
// tegib bo'lmaydi).
func (h *ReportHandler) findClosedOrder(ctx context.Context, orderID, businessID string) (status string, err error) {
	err = h.DB.QueryRow(ctx,
		`SELECT status::text FROM orders WHERE id=$1 AND business_id=$2`,
		orderID, businessID).Scan(&status)
	return status, err
}

// editReason - sabab majburiy. Bo'sh sabab bilan tuzatishga ruxsat berilsa,
// jurnal "nima uchun" degan savolga javob bermay qolardi.
func editReason(c *fiber.Ctx, fallbackBody string) (string, bool) {
	reason := strings.TrimSpace(fallbackBody)
	if reason == "" {
		reason = strings.TrimSpace(c.Query("reason"))
	}
	return reason, reason != ""
}

type updatePaymentRequest struct {
	Method   string  `json:"method"`    // cash, card, transfer
	CardType string  `json:"card_type"` // uzcard, humo, visa, mastercard
	Amount   float64 `json:"amount"`    // 0 bo'lsa buyurtma summasi olinadi
	Reason   string  `json:"reason"`
}

// UpdateOrderPayment - yopilgan buyurtmaning to'lov turini/summasini to'g'rilash.
func (h *ReportHandler) UpdateOrderPayment(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)
	orderID := c.Params("id")

	var req updatePaymentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}
	if req.Method != "cash" && req.Method != "card" && req.Method != "transfer" {
		return c.Status(400).JSON(fiber.Map{"error": "To'lov turi noto'g'ri"})
	}
	reason, ok := editReason(c, req.Reason)
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "O'zgartirish sababi kiritilishi shart"})
	}

	ctx := context.Background()
	status, err := h.findClosedOrder(ctx, orderID, businessID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	if status != "paid" {
		return c.Status(400).JSON(fiber.Map{"error": "Faqat to'langan buyurtmaning to'lovini tuzatish mumkin"})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var finalAmount float64
	if err := tx.QueryRow(ctx, `SELECT final_amount FROM orders WHERE id=$1`, orderID).Scan(&finalAmount); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	amount := req.Amount
	if amount <= 0 {
		amount = finalAmount
	}

	// Eski to'lov qatorlari jurnalga yozib olinadi, so'ng bittasi bilan
	// almashtiriladi — hisobotdagi naqd/karta summalari ikki marta
	// hisoblanib ketmasligi uchun.
	var oldMethods *string
	if err := tx.QueryRow(ctx,
		`SELECT string_agg(method::text || COALESCE('/' || card_type::text, ''), ', ')
		 FROM payments WHERE order_id=$1`, orderID).Scan(&oldMethods); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// To'lovni kim qabul qilgani o'zgarmaydi — pulni haqiqatda o'sha kassir
	// olgan. Tuzatishni kim qilgani audit jurnalida qoladi.
	var receivedBy *string
	if err := tx.QueryRow(ctx,
		`SELECT received_by FROM payments WHERE order_id=$1 ORDER BY created_at LIMIT 1`,
		orderID).Scan(&receivedBy); err != nil {
		receivedBy = &userID
	}
	if receivedBy == nil {
		receivedBy = &userID
	}

	if _, err := tx.Exec(ctx, `DELETE FROM payments WHERE order_id=$1`, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	var cardType interface{}
	if req.Method == "card" && req.CardType != "" {
		cardType = req.CardType
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO payments (order_id, method, card_type, amount, received_by)
		 VALUES ($1,$2,$3,$4,$5)`, orderID, req.Method, cardType, amount, *receivedBy); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	newMethod := req.Method
	if cardType != nil {
		newMethod += "/" + req.CardType
	}
	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditEditedAfterClose,
		Details: map[string]any{
			"change": "payment",
			"from":   derefString(oldMethods),
			"to":     newMethod,
			"amount": amount,
			"reason": reason,
		},
	})

	return c.JSON(fiber.Map{"success": true})
}

type closedOrderItemRequest struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
	Reason    string `json:"reason"`
}

// AddClosedOrderItem - yopilgan buyurtmaga taom qo'shish (unutib qolingan taom).
// Summa recalcOrderTotals bilan qayta hisoblanadi.
func (h *ReportHandler) AddClosedOrderItem(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)
	orderID := c.Params("id")

	var req closedOrderItemRequest
	if err := c.BodyParser(&req); err != nil || req.ProductID == "" || req.Quantity <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Mahsulot va musbat miqdor kiritilishi shart"})
	}
	reason, ok := editReason(c, req.Reason)
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "O'zgartirish sababi kiritilishi shart"})
	}

	ctx := context.Background()
	if _, err := h.findClosedOrder(ctx, orderID, businessID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	var name string
	var price float64
	if err := h.DB.QueryRow(ctx,
		`SELECT name, price FROM products WHERE id=$1 AND business_id=$2`,
		req.ProductID, businessID).Scan(&name, &price); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Mahsulot topilmadi"})
	}

	if _, err := h.DB.Exec(ctx,
		`INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
		 VALUES ($1,$2,$3,$4,$5)`, orderID, req.ProductID, name, price, req.Quantity); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if err := recalcOrderTotals(ctx, h.DB, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditEditedAfterClose,
		Details: map[string]any{
			"change":  "item_added",
			"product": describeItem(name, req.Quantity),
			"amount":  price * float64(req.Quantity),
			"reason":  reason,
		},
	})

	return c.JSON(fiber.Map{"success": true})
}

// DeleteClosedOrderItem - yopilgan buyurtmadan taomni olib tashlash.
// Oxirgi qatorni o'chirish taqiqlangan: bo'sh, ammo "to'langan" buyurtma
// hisobotda ma'nosiz qator bo'lib qolardi — bunday holatda butun buyurtmani
// qaytarish (revert) kerak.
func (h *ReportHandler) DeleteClosedOrderItem(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)
	orderID := c.Params("id")
	itemID := c.Params("item_id")

	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&body)
	reason, ok := editReason(c, body.Reason)
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "O'zgartirish sababi kiritilishi shart"})
	}

	ctx := context.Background()
	if _, err := h.findClosedOrder(ctx, orderID, businessID); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	var remaining int
	if err := h.DB.QueryRow(ctx, `SELECT count(*) FROM order_items WHERE order_id=$1`, orderID).Scan(&remaining); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if remaining <= 1 {
		return c.Status(400).JSON(fiber.Map{
			"error": "Bu oxirgi taom — butun buyurtmani qaytarish (vozvrat) tugmasidan foydalaning",
		})
	}

	var removedName string
	var removedQty int
	if err := h.DB.QueryRow(ctx,
		`DELETE FROM order_items WHERE id=$1 AND order_id=$2 RETURNING product_name, quantity`,
		itemID, orderID).Scan(&removedName, &removedQty); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma qatori topilmadi"})
	}
	if err := recalcOrderTotals(ctx, h.DB, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditEditedAfterClose,
		Details: map[string]any{
			"change":  "item_removed",
			"product": describeItem(removedName, removedQty),
			"reason":  reason,
		},
	})

	return c.JSON(fiber.Map{"success": true})
}

// RevertOrder - yopilgan buyurtmani bekor qilish (qaytarish/vozvrat).
//
// To'lov qatorlari ham o'chiriladi: aks holda buyurtma "bekor qilingan"
// bo'lsa ham naqd/karta summalari hisobotda qolib, kunlik kassa
// mos kelmay qolardi. O'chirilgan summalar jurnalga yozib olinadi.
func (h *ReportHandler) RevertOrder(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	userID := c.Locals("user_id").(string)
	orderID := c.Params("id")

	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&body)
	reason, ok := editReason(c, body.Reason)
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "Qaytarish sababi kiritilishi shart"})
	}

	ctx := context.Background()
	status, err := h.findClosedOrder(ctx, orderID, businessID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	if status == "cancelled" {
		return c.Status(400).JSON(fiber.Map{"error": "Bu buyurtma allaqachon bekor qilingan"})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var refunded float64
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=$1`, orderID).Scan(&refunded); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if _, err := tx.Exec(ctx, `DELETE FROM payments WHERE order_id=$1`, orderID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if _, err := tx.Exec(ctx,
		`UPDATE orders SET status='cancelled' WHERE id=$1 AND business_id=$2`, orderID, businessID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO order_cancellations (order_id, reason, cancelled_by) VALUES ($1,$2,$3)`,
		orderID, reason, userID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1,'cancelled',$2)`,
		orderID, userID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	writeAudit(ctx, h.DB, auditEntry{
		BusinessID: businessID,
		UserID:     userID,
		OrderID:    orderID,
		Action:     AuditEditedAfterClose,
		Details: map[string]any{
			"change":   "reverted",
			"refunded": refunded,
			"reason":   reason,
		},
	})

	return c.JSON(fiber.Map{"success": true, "refunded": refunded})
}
