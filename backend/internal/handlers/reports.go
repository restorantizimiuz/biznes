package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

type ReportHandler struct {
	DB *pgxpool.Pool
}

// DailySummary - berilgan sana oralig'i uchun umumiy hisobot:
// naqt/karta/o'tkazma bo'yicha summalar, stol va onlayn buyurtmalar soni.
func (h *ReportHandler) DailySummary(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	from := c.Query("from") // masalan 2026-08-01
	to := c.Query("to")     // masalan 2026-08-09
	if from == "" || to == "" {
		return c.Status(400).JSON(fiber.Map{"error": "'from' va 'to' sanalari kiritilishi shart"})
	}

	ctx := context.Background()

	var totalOrders, onlineOrders int
	var totalRevenue, cashTotal, cardTotal, transferTotal float64

	err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(final_amount),0)
		FROM orders
		WHERE business_id=$1 AND status='paid' AND created_at::date BETWEEN $2 AND $3
	`, businessID, from, to).Scan(&totalOrders, &totalRevenue)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	err = h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM orders
		WHERE business_id=$1 AND status='paid' AND source='online_telegram'
		AND created_at::date BETWEEN $2 AND $3
	`, businessID, from, to).Scan(&onlineOrders)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	rows, err := h.DB.Query(ctx, `
		SELECT p.method, COALESCE(SUM(p.amount),0)
		FROM payments p
		JOIN orders o ON o.id = p.order_id
		WHERE o.business_id=$1 AND o.created_at::date BETWEEN $2 AND $3
		GROUP BY p.method
	`, businessID, from, to)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	for rows.Next() {
		var method string
		var sum float64
		rows.Scan(&method, &sum)
		switch method {
		case "cash":
			cashTotal = sum
		case "card":
			cardTotal = sum
		case "transfer":
			transferTotal = sum
		}
	}

	return c.JSON(fiber.Map{
		"from":           from,
		"to":             to,
		"total_orders":   totalOrders,
		"online_orders":  onlineOrders,
		"total_revenue":  totalRevenue,
		"cash_total":     cashTotal,
		"card_total":     cardTotal,
		"transfer_total": transferTotal,
	})
}

// ExportExcel - tanlangan sana oralig'idagi hamma buyurtmalarni .xlsx faylga eksport qiladi
func (h *ReportHandler) ExportExcel(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	from := c.Query("from")
	to := c.Query("to")
	if from == "" || to == "" {
		return c.Status(400).JSON(fiber.Map{"error": "'from' va 'to' sanalari kiritilishi shart"})
	}

	ctx := context.Background()
	rows, err := h.DB.Query(ctx, `
		SELECT o.created_at, COALESCE(t.name, 'Online'), o.source, o.status,
		       o.total_amount, o.discount_amount, o.final_amount
		FROM orders o
		LEFT JOIN tables t ON t.id = o.table_id
		WHERE o.business_id=$1 AND o.created_at::date BETWEEN $2 AND $3
		ORDER BY o.created_at
	`, businessID, from, to)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	f := excelize.NewFile()
	sheet := "Hisobot"
	f.SetSheetName("Sheet1", sheet)

	headers := []string{"Sana/Vaqt", "Stol", "Manba", "Holat", "Summa", "Chegirma", "Yakuniy summa"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	rowNum := 2
	for rows.Next() {
		var createdAt interface{}
		var tableName, source, status string
		var total, discount, final float64
		rows.Scan(&createdAt, &tableName, &source, &status, &total, &discount, &final)

		f.SetCellValue(sheet, cellName(1, rowNum), createdAt)
		f.SetCellValue(sheet, cellName(2, rowNum), tableName)
		f.SetCellValue(sheet, cellName(3, rowNum), source)
		f.SetCellValue(sheet, cellName(4, rowNum), status)
		f.SetCellValue(sheet, cellName(5, rowNum), total)
		f.SetCellValue(sheet, cellName(6, rowNum), discount)
		f.SetCellValue(sheet, cellName(7, rowNum), final)
		rowNum++
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set("Content-Disposition", "attachment; filename=hisobot_"+from+"_"+to+".xlsx")
	return c.Send(buf.Bytes())
}

func cellName(col, row int) string {
	name, _ := excelize.CoordinatesToCellName(col, row)
	return name
}
