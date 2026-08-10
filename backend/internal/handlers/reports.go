package handlers

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"cafesystem/backend/internal/i18n"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

type ReportHandler struct {
	DB *pgxpool.Pool
}

// ---------------------------------------------------------------------------
// Filtrlar
// ---------------------------------------------------------------------------

// sqlArgs - so'rov argumentlarini tartib bilan yig'adi va $1, $2... nomlarini
// o'zi beradi. Filtrlar ixtiyoriy bo'lgani uchun raqamlarni qo'lda sanash
// xatoga olib keladi — bu yordamchi shuning oldini oladi.
type sqlArgs struct{ values []any }

func (a *sqlArgs) add(v any) string {
	a.values = append(a.values, v)
	return "$" + strconv.Itoa(len(a.values))
}

// reportFilter - hisobotni toraytiruvchi shartlar.
// Bir xil filtr ham ekranda ko'rishga, ham Excel'ga yuklashga qo'llanadi —
// shuning uchun u bitta joyda tahlil qilinadi va bitta joyda SQL'ga o'giriladi.
type reportFilter struct {
	from          string
	to            string
	tableID       string
	source        string // 'online' (stolsiz) yoki order_source qiymati
	paymentMethod string
	status        string
}

func parseReportFilter(c *fiber.Ctx) (reportFilter, error) {
	f := reportFilter{
		from:          c.Query("from"),
		to:            c.Query("to"),
		tableID:       c.Query("table_id"),
		source:        c.Query("source"),
		paymentMethod: c.Query("payment_method"),
		status:        c.Query("status"),
	}
	// Sana ko'rsatilmasa bugungi kun olinadi — hisobot sahifasiga kirgan
	// zahoti oxirgi buyurtmalar ko'rinishi kerak (hech narsa tanlanmasa ham).
	if f.from == "" {
		f.from = time.Now().Format("2006-01-02")
	}
	if f.to == "" {
		f.to = f.from
	}
	if _, err := time.Parse("2006-01-02", f.from); err != nil {
		return f, fmt.Errorf("'from' sanasi noto'g'ri formatda (YYYY-MM-DD)")
	}
	if _, err := time.Parse("2006-01-02", f.to); err != nil {
		return f, fmt.Errorf("'to' sanasi noto'g'ri formatda (YYYY-MM-DD)")
	}
	return f, nil
}

// conditions - filtrni SQL shartlariga o'giradi (orders jadvali "o" taxallusi bilan).
func (f reportFilter) conditions(businessID string, args *sqlArgs) string {
	parts := []string{
		"o.business_id = " + args.add(businessID),
		"o.created_at::date BETWEEN " + args.add(f.from) + " AND " + args.add(f.to),
	}
	if f.tableID != "" {
		parts = append(parts, "o.table_id = "+args.add(f.tableID))
	}
	switch f.source {
	case "":
	case "online":
		// "Online" — mijozning uyiga/olib ketishga bo'lgan, stolsiz buyurtma.
		parts = append(parts, "o.table_id IS NULL")
	default:
		parts = append(parts, "o.source = "+args.add(f.source)+"::order_source")
	}
	if f.paymentMethod != "" {
		parts = append(parts,
			"EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.method = "+
				args.add(f.paymentMethod)+"::payment_method)")
	}
	if f.status != "" {
		parts = append(parts, "o.status = "+args.add(f.status)+"::order_status")
	}
	return strings.Join(parts, " AND ")
}

// hasExtraFilters - sana va kafedan tashqari filtr qo'yilganmi.
// Amallar jurnalini ham shu buyurtmalar bilan cheklash uchun kerak.
func (f reportFilter) hasExtraFilters() bool {
	return f.tableID != "" || f.source != "" || f.paymentMethod != "" || f.status != ""
}

// ---------------------------------------------------------------------------
// Ma'lumot o'qish
// ---------------------------------------------------------------------------

type reportOrder struct {
	ID              string         `json:"id"`
	CreatedAt       time.Time      `json:"created_at"`
	TableID         *string        `json:"table_id"`
	TableName       *string        `json:"table_name"`
	Source          string         `json:"source"`
	Status          string         `json:"status"`
	OrderType       string         `json:"order_type"`
	CustomerPhone   *string        `json:"customer_phone"`
	DeliveryAddress *string        `json:"delivery_address"`
	TotalAmount     float64        `json:"total_amount"`
	DiscountAmount  float64        `json:"discount_amount"`
	DiscountReason  *string        `json:"discount_reason"`
	FinalAmount     float64        `json:"final_amount"`
	CreatedBy       *string        `json:"created_by"`
	PaidBy          *string        `json:"paid_by"`
	WaiterName      *string        `json:"waiter_name"`
	PaymentMethods  *string        `json:"payment_methods"`
	Edited          bool           `json:"edited"`
	Items           []orderItemDTO `json:"items"`
}

const reportOrdersSQL = `
	SELECT o.id, o.created_at, o.table_id, t.name, o.source, o.status, o.order_type,
	       o.customer_phone, o.delivery_address,
	       o.total_amount, o.discount_amount, o.discount_reason, o.final_amount,
	       creator.full_name,
	       (SELECT string_agg(DISTINCT payer.full_name, ', ')
	          FROM payments p JOIN users payer ON payer.id = p.received_by
	         WHERE p.order_id = o.id),
	       (SELECT string_agg(p.method::text || COALESCE('/' || p.card_type::text, ''), ', ')
	          FROM payments p WHERE p.order_id = o.id),
	       waiter.full_name,
	       EXISTS (SELECT 1 FROM audit_log al
	                WHERE al.order_id = o.id AND al.action = 'order_edited_after_close')
	FROM orders o
	LEFT JOIN tables t ON t.id = o.table_id
	LEFT JOIN users creator ON creator.id = o.created_by_user_id
	LEFT JOIN LATERAL (
	    SELECT u.full_name FROM waiter_assignments wa
	    JOIN users u ON u.id = wa.waiter_id
	    WHERE wa.order_id = o.id ORDER BY wa.assigned_at DESC LIMIT 1
	) waiter ON true
	WHERE %s
	ORDER BY o.created_at DESC`

// fetchReportOrders - filtrga mos buyurtmalarni tarkibi bilan qaytaradi.
func (h *ReportHandler) fetchReportOrders(ctx context.Context, businessID string, f reportFilter) ([]reportOrder, error) {
	args := &sqlArgs{}
	query := fmt.Sprintf(reportOrdersSQL, f.conditions(businessID, args))

	rows, err := h.DB.Query(ctx, query, args.values...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := []reportOrder{}
	var ids []string
	for rows.Next() {
		var o reportOrder
		if err := rows.Scan(&o.ID, &o.CreatedAt, &o.TableID, &o.TableName, &o.Source, &o.Status,
			&o.OrderType, &o.CustomerPhone, &o.DeliveryAddress,
			&o.TotalAmount, &o.DiscountAmount, &o.DiscountReason, &o.FinalAmount,
			&o.CreatedBy, &o.PaidBy, &o.PaymentMethods, &o.WaiterName, &o.Edited); err != nil {
			return nil, err
		}
		orders = append(orders, o)
		ids = append(ids, o.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	itemsByOrder, err := fetchOrderItems(ctx, h.DB, ids)
	if err != nil {
		return nil, err
	}
	for i := range orders {
		orders[i].Items = itemsByOrder[orders[i].ID]
		if orders[i].Items == nil {
			orders[i].Items = []orderItemDTO{}
		}
	}
	return orders, nil
}

type reportActivity struct {
	ID        string         `json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	Action    string         `json:"action"`
	Actor     string         `json:"actor"`
	ActorRole *string        `json:"actor_role"`
	OrderID   *string        `json:"order_id"`
	TableName *string        `json:"table_name"`
	Details   map[string]any `json:"details"`
}

// activityLimit - jurnal yozuvlari juda ko'p bo'lishi mumkin (har bir taom
// qo'shilishi alohida qator). Ekran uchun oxirgi 500 tasi yetarli;
// to'liq tarix Excel'da bo'ladi.
const activityLimit = 500

func (h *ReportHandler) fetchActivity(ctx context.Context, businessID string, f reportFilter) ([]reportActivity, error) {
	args := &sqlArgs{}
	where := []string{
		"al.business_id = " + args.add(businessID),
		"al.created_at::date BETWEEN " + args.add(f.from) + " AND " + args.add(f.to),
	}
	// Filtr qo'yilgan bo'lsa (masalan faqat bitta stol), jurnal ham shu
	// buyurtmalar bilan cheklanadi — aks holda ekranda mos kelmaydigan
	// yozuvlar ko'rinib chalkashtirardi.
	if f.hasExtraFilters() {
		// conditions() argumentlarni shu builderga qo'shadi va $-raqamlarni
		// o'zi to'g'ri beradi, shuning uchun ichki so'rovni shunchaki
		// shartlar bilan birga qo'shsak bo'ladi.
		where = append(where,
			"al.order_id IN (SELECT o.id FROM orders o WHERE "+f.conditions(businessID, args)+")")
	}

	query := `
		SELECT al.id, al.created_at, al.action,
		       COALESCE(u.full_name, al.actor_label, ''), u.role::text,
		       al.order_id, t.name, al.details
		FROM audit_log al
		LEFT JOIN users u ON u.id = al.user_id
		LEFT JOIN orders o ON o.id = al.order_id
		LEFT JOIN tables t ON t.id = o.table_id
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY al.created_at DESC
		LIMIT ` + strconv.Itoa(activityLimit)

	rows, err := h.DB.Query(ctx, query, args.values...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	activity := []reportActivity{}
	for rows.Next() {
		var a reportActivity
		if err := rows.Scan(&a.ID, &a.CreatedAt, &a.Action, &a.Actor, &a.ActorRole,
			&a.OrderID, &a.TableName, &a.Details); err != nil {
			return nil, err
		}
		activity = append(activity, a)
	}
	return activity, rows.Err()
}

type reportSummary struct {
	TotalOrders     int     `json:"total_orders"`
	OnlineOrders    int     `json:"online_orders"`
	CancelledOrders int     `json:"cancelled_orders"`
	OpenOrders      int     `json:"open_orders"`
	TotalRevenue    float64 `json:"total_revenue"`
	DiscountTotal   float64 `json:"discount_total"`
	CashTotal       float64 `json:"cash_total"`
	CardTotal       float64 `json:"card_total"`
	TransferTotal   float64 `json:"transfer_total"`
}

// buildSummary - umumiy raqamlarni allaqachon o'qilgan buyurtmalardan hisoblaydi.
// To'lov turlari bo'yicha summa uchungina qo'shimcha so'rov kerak, chunki bitta
// buyurtma bir necha usulda to'langan bo'lishi mumkin.
func (h *ReportHandler) buildSummary(ctx context.Context, orders []reportOrder) (reportSummary, error) {
	var s reportSummary
	var ids []string
	for _, o := range orders {
		switch o.Status {
		case "paid":
			s.TotalOrders++
			s.TotalRevenue += o.FinalAmount
			s.DiscountTotal += o.DiscountAmount
			if o.TableID == nil {
				s.OnlineOrders++
			}
		case "cancelled":
			s.CancelledOrders++
		default:
			s.OpenOrders++
		}
		ids = append(ids, o.ID)
	}
	if len(ids) == 0 {
		return s, nil
	}

	rows, err := h.DB.Query(ctx,
		`SELECT method::text, COALESCE(SUM(amount),0) FROM payments
		 WHERE order_id = ANY($1) GROUP BY method`, ids)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	for rows.Next() {
		var method string
		var sum float64
		if err := rows.Scan(&method, &sum); err != nil {
			return s, err
		}
		switch method {
		case "cash":
			s.CashTotal = sum
		case "card":
			s.CardTotal = sum
		case "transfer":
			s.TransferTotal = sum
		}
	}
	return s, rows.Err()
}

// ---------------------------------------------------------------------------
// Endpointlar
// ---------------------------------------------------------------------------

// DailySummary - eski, faqat raqamli hisobot (moslik uchun saqlanadi).
func (h *ReportHandler) DailySummary(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	f, err := parseReportFilter(c)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	ctx := context.Background()
	orders, err := h.fetchReportOrders(ctx, businessID, f)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	summary, err := h.buildSummary(ctx, orders)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"from": f.from, "to": f.to,
		"total_orders":   summary.TotalOrders,
		"online_orders":  summary.OnlineOrders,
		"total_revenue":  summary.TotalRevenue,
		"cash_total":     summary.CashTotal,
		"card_total":     summary.CardTotal,
		"transfer_total": summary.TransferTotal,
	})
}

// DetailedReport - to'liq hisobot: umumiy raqamlar + buyurtmalar ro'yxati +
// amallar jurnali ("kim nimani qo'shdi/o'chirdi").
func (h *ReportHandler) DetailedReport(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	f, err := parseReportFilter(c)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	ctx := context.Background()

	orders, err := h.fetchReportOrders(ctx, businessID, f)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	summary, err := h.buildSummary(ctx, orders)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	activity, err := h.fetchActivity(ctx, businessID, f)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"from":     f.from,
		"to":       f.to,
		"summary":  summary,
		"orders":   orders,
		"activity": activity,
	})
}

// ExportExcel - filtrga mos buyurtmalarni .xlsx faylga chiqaradi.
// Sarlavhalar va qiymat matnlari kafe sozlamasidagi tilda bo'ladi.
func (h *ReportHandler) ExportExcel(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	f, err := parseReportFilter(c)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	ctx := context.Background()

	var lang string
	if err := h.DB.QueryRow(ctx, `SELECT language FROM businesses WHERE id=$1`, businessID).Scan(&lang); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	lang = i18n.Normalize(lang)
	tr := func(key string) string { return i18n.T(lang, key) }

	orders, err := h.fetchReportOrders(ctx, businessID, f)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	file := excelize.NewFile()
	sheet := tr("report.sheet")
	file.SetSheetName("Sheet1", sheet)

	headers := []struct{ key string }{
		{"col.datetime"}, {"col.table"}, {"col.orderType"}, {"col.source"}, {"col.status"},
		{"col.items"}, {"col.total"}, {"col.discount"}, {"col.final"},
		{"col.createdBy"}, {"col.paidBy"}, {"col.waiter"}, {"col.paymentMethod"},
		{"col.phone"}, {"col.address"}, {"col.edited"},
	}
	headerStyle, _ := file.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#EEF2FF"}},
	})
	for i, h := range headers {
		cell := cellName(i+1, 1)
		file.SetCellValue(sheet, cell, tr(h.key))
		file.SetCellStyle(sheet, cell, cell, headerStyle)
	}

	rowNum := 2
	for _, o := range orders {
		tableName := tr("value.online")
		if o.TableName != nil {
			tableName = *o.TableName
		}
		itemNames := make([]string, 0, len(o.Items))
		for _, it := range o.Items {
			itemNames = append(itemNames, describeItem(it.ProductName, it.Quantity))
		}
		edited := tr("value.no")
		if o.Edited {
			edited = tr("value.yes")
		}

		values := []any{
			o.CreatedAt.Format("2006-01-02 15:04"),
			tableName,
			tr("type." + o.OrderType),
			tr("source." + o.Source),
			tr("status." + o.Status),
			strings.Join(itemNames, ", "),
			o.TotalAmount,
			o.DiscountAmount,
			o.FinalAmount,
			derefString(o.CreatedBy),
			derefString(o.PaidBy),
			derefString(o.WaiterName),
			translatePaymentMethods(lang, o.PaymentMethods),
			derefString(o.CustomerPhone),
			derefString(o.DeliveryAddress),
			edited,
		}
		for i, v := range values {
			file.SetCellValue(sheet, cellName(i+1, rowNum), v)
		}
		rowNum++
	}

	// Ustun kengliklari: matn ustunlari kengroq, son ustunlari torroq.
	widths := []float64{18, 14, 16, 12, 14, 42, 14, 12, 15, 20, 22, 18, 18, 16, 28, 14}
	for i, w := range widths {
		col, _ := excelize.ColumnNumberToName(i + 1)
		file.SetColWidth(sheet, col, col, w)
	}

	buf, err := file.WriteToBuffer()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	fileName := fmt.Sprintf("%s_%s_%s.xlsx", tr("report.fileName"), f.from, f.to)
	c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set("Content-Disposition", "attachment; filename="+fileName)
	return c.Send(buf.Bytes())
}

// translatePaymentMethods - "card/humo, cash" ko'rinishidagi qiymatni tarjima qiladi.
// Karta turi (humo, uzcard...) tarjima qilinmaydi — bu brend nomi.
func translatePaymentMethods(lang string, raw *string) string {
	if raw == nil || *raw == "" {
		return ""
	}
	parts := strings.Split(*raw, ", ")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		method, card, hasCard := strings.Cut(p, "/")
		translated := i18n.T(lang, "method."+method)
		if hasCard {
			translated += " (" + card + ")"
		}
		out = append(out, translated)
	}
	return strings.Join(out, ", ")
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func cellName(col, row int) string {
	name, _ := excelize.CoordinatesToCellName(col, row)
	return name
}
