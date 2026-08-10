package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cafesystem/backend/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReceiptHandler - to'langan buyurtma uchun chek ma'lumotini shakllantirish
// (kassa panelida chop etish yoki Telegram orqali yuborish uchun)
type ReceiptHandler struct {
	DB  *pgxpool.Pool
	Cfg *config.Config
}

type receiptItem struct {
	Name     string  `json:"name"`
	Quantity int     `json:"quantity"`
	Price    float64 `json:"unit_price"`
	Total    float64 `json:"line_total"`
}

type receiptDTO struct {
	OrderID          string        `json:"order_id"`
	BusinessName     string        `json:"business_name"`
	TableName        *string       `json:"table_name"`
	Items            []receiptItem `json:"items"`
	TotalAmount      float64       `json:"total_amount"`
	DiscountAmount   float64       `json:"discount_amount"`
	FinalAmount      float64       `json:"final_amount"`
	PaymentMethods   []string      `json:"payment_methods"`
	PaidAt           *time.Time    `json:"paid_at"`
	TelegramUsername *string       `json:"telegram_username,omitempty"`
}

func (h *ReceiptHandler) buildReceipt(ctx context.Context, businessID, orderID string) (*receiptDTO, error) {
	var r receiptDTO
	r.OrderID = orderID

	err := h.DB.QueryRow(ctx, `
		SELECT b.name, t.name, o.total_amount, o.discount_amount, o.final_amount, o.paid_at, tc.telegram_username
		FROM orders o
		JOIN businesses b ON b.id = o.business_id
		LEFT JOIN tables t ON t.id = o.table_id
		LEFT JOIN telegram_customers tc ON tc.id = o.telegram_customer_id
		WHERE o.id=$1 AND o.business_id=$2`, orderID, businessID,
	).Scan(&r.BusinessName, &r.TableName, &r.TotalAmount, &r.DiscountAmount, &r.FinalAmount, &r.PaidAt, &r.TelegramUsername)
	if err != nil {
		return nil, err
	}

	rows, err := h.DB.Query(ctx,
		`SELECT product_name, quantity, unit_price FROM order_items WHERE order_id=$1 ORDER BY created_at`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var it receiptItem
		if err := rows.Scan(&it.Name, &it.Quantity, &it.Price); err != nil {
			return nil, err
		}
		it.Total = it.Price * float64(it.Quantity)
		r.Items = append(r.Items, it)
	}

	payRows, err := h.DB.Query(ctx, `SELECT DISTINCT method FROM payments WHERE order_id=$1`, orderID)
	if err != nil {
		return nil, err
	}
	defer payRows.Close()
	for payRows.Next() {
		var m string
		if err := payRows.Scan(&m); err != nil {
			return nil, err
		}
		r.PaymentMethods = append(r.PaymentMethods, m)
	}

	return &r, nil
}

// GetReceipt - kassa panelida chekni chop etish/ko'rsatish uchun ma'lumot qaytaradi
func (h *ReceiptHandler) GetReceipt(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	orderID := c.Params("id")

	r, err := h.buildReceipt(context.Background(), businessID, orderID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	return c.JSON(r)
}

// SendReceiptTelegram - printer ulanmagan holatlarda kassir tomonidan chaqiriladi:
// chekni Telegram bot orqali formatlangan xabar sifatida mijozga yuboradi.
func (h *ReceiptHandler) SendReceiptTelegram(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	orderID := c.Params("id")
	ctx := context.Background()

	var telegramID *int64
	err := h.DB.QueryRow(ctx, `
		SELECT tc.telegram_id FROM orders o
		LEFT JOIN telegram_customers tc ON tc.id = o.telegram_customer_id
		WHERE o.id=$1 AND o.business_id=$2`, orderID, businessID,
	).Scan(&telegramID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}
	if telegramID == nil {
		return c.Status(400).JSON(fiber.Map{"error": "Bu buyurtma Telegram orqali berilmagan, mijozning telegram ID'si yo'q"})
	}
	if h.Cfg.TelegramBotToken == "" {
		return c.Status(500).JSON(fiber.Map{"error": "Telegram bot sozlanmagan"})
	}

	r, err := h.buildReceipt(ctx, businessID, orderID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Buyurtma topilmadi"})
	}

	if err := sendTelegramMessage(h.Cfg.TelegramBotToken, *telegramID, formatReceiptText(r)); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "Telegram orqali yuborib bo'lmadi: " + err.Error()})
	}

	_, _ = h.DB.Exec(ctx, `UPDATE orders SET receipt_sent_at=now() WHERE id=$1`, orderID)

	return c.JSON(fiber.Map{"success": true})
}

func formatReceiptText(r *receiptDTO) string {
	var b strings.Builder
	fmt.Fprintf(&b, "🧾 *%s*\n", r.BusinessName)
	if r.TableName != nil {
		fmt.Fprintf(&b, "Stol: %s\n", *r.TableName)
	}
	if r.PaidAt != nil {
		fmt.Fprintf(&b, "Sana: %s\n", r.PaidAt.Format("2006-01-02 15:04"))
	}
	b.WriteString("\n")
	for _, it := range r.Items {
		fmt.Fprintf(&b, "%s  x%d — %s so'm\n", it.Name, it.Quantity, formatMoney(it.Total))
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "Jami: %s so'm\n", formatMoney(r.TotalAmount))
	if r.DiscountAmount > 0 {
		fmt.Fprintf(&b, "Chegirma: -%s so'm\n", formatMoney(r.DiscountAmount))
	}
	fmt.Fprintf(&b, "*To'langan: %s so'm*\n", formatMoney(r.FinalAmount))
	if len(r.PaymentMethods) > 0 {
		fmt.Fprintf(&b, "To'lov turi: %s\n", strings.Join(r.PaymentMethods, ", "))
	}
	b.WriteString("\nXaridingiz uchun rahmat! 🙏")
	return b.String()
}

func formatMoney(amount float64) string {
	s := fmt.Sprintf("%.0f", amount)
	n := len(s)
	if n <= 3 {
		return s
	}
	var parts []string
	for n > 3 {
		parts = append([]string{s[n-3 : n]}, parts...)
		n -= 3
	}
	parts = append([]string{s[:n]}, parts...)
	return strings.Join(parts, " ")
}
