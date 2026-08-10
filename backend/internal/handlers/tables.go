package handlers

import (
	"context"
	"fmt"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TableHandler struct {
	DB *pgxpool.Pool
}

func (h *TableHandler) ListFloors(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	rows, err := h.DB.Query(context.Background(),
		`SELECT id, name, sort_order FROM floors
		 WHERE business_id=$1 AND is_deleted=false ORDER BY sort_order`, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type floorDTO struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	floors := []floorDTO{}
	for rows.Next() {
		var f floorDTO
		rows.Scan(&f.ID, &f.Name, &f.SortOrder)
		floors = append(floors, f)
	}
	return c.JSON(floors)
}

func (h *TableHandler) CreateFloor(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	var body struct {
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Qavat nomi kiritilishi shart"})
	}
	var id string
	err := h.DB.QueryRow(context.Background(),
		`INSERT INTO floors (business_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`,
		businessID, body.Name, body.SortOrder,
	).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *TableHandler) ListTables(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	floorID := c.Params("floor_id")

	var floorExists string
	if err := h.DB.QueryRow(context.Background(),
		`SELECT id FROM floors WHERE id=$1 AND business_id=$2 AND is_deleted=false`, floorID, businessID).Scan(&floorExists); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Qavat topilmadi"})
	}

	rows, err := h.DB.Query(context.Background(),
		`SELECT id, name, qr_code_token, status FROM tables
		 WHERE floor_id=$1 AND is_deleted=false ORDER BY name`, floorID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type tableDTO struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Token  string `json:"qr_code_token"`
		Status string `json:"status"`
	}
	tables := []tableDTO{}
	for rows.Next() {
		var t tableDTO
		rows.Scan(&t.ID, &t.Name, &t.Token, &t.Status)
		tables = append(tables, t)
	}
	return c.JSON(tables)
}

func (h *TableHandler) CreateTable(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	floorID := c.Params("floor_id")
	var body struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Stol nomi kiritilishi shart"})
	}

	ctx := context.Background()
	var floorExists string
	if err := h.DB.QueryRow(ctx,
		`SELECT id FROM floors WHERE id=$1 AND business_id=$2 AND is_deleted=false`, floorID, businessID).Scan(&floorExists); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Qavat topilmadi"})
	}

	// Tarif limiti backendda tekshiriladi: faqat frontendda tekshirish yetarli
	// emas, chunki so'rovni brauzer konsolidan ham yuborish mumkin.
	var current, maxTables int
	if err := h.DB.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM tables t
		          JOIN floors f ON f.id = t.floor_id
		         WHERE f.business_id=$1 AND t.is_deleted=false),
		       b.max_tables
		FROM businesses b WHERE b.id=$1`, businessID).Scan(&current, &maxTables); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if current >= maxTables {
		return c.Status(403).JSON(fiber.Map{
			"error": fmt.Sprintf("Tarifingiz bo'yicha maksimal %d ta stol qo'shish mumkin", maxTables),
		})
	}

	var id, token string
	err := h.DB.QueryRow(ctx,
		`INSERT INTO tables (floor_id, name) VALUES ($1,$2) RETURNING id, qr_code_token`,
		floorID, body.Name,
	).Scan(&id, &token)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": id, "qr_code_token": token})
}

// UpdateFloor - qavat nomini o'zgartirish
func (h *TableHandler) UpdateFloor(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	floorID := c.Params("id")
	var body struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Qavat nomi kiritilishi shart"})
	}

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE floors SET name=$1 WHERE id=$2 AND business_id=$3 AND is_deleted=false`,
		body.Name, floorID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Qavat topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DeleteFloor - qavatni va uning stollarini yashirin o'chiradi.
// Ichida to'lanmagan buyurtmali stol bo'lsa, o'chirishga yo'l qo'yilmaydi —
// aks holda faol hisob kassadan yo'qolib qolardi.
func (h *TableHandler) DeleteFloor(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	floorID := c.Params("id")
	ctx := context.Background()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var activeCount int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM orders o
		 JOIN tables t ON t.id = o.table_id
		 WHERE t.floor_id=$1 AND t.is_deleted=false AND o.status IN ('new','activated')`,
		floorID).Scan(&activeCount); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if activeCount > 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Bu qavatda to'lanmagan buyurtmalar bor — avval ularni yakunlang"})
	}

	cmd, err := tx.Exec(ctx,
		`UPDATE floors SET is_deleted=true WHERE id=$1 AND business_id=$2 AND is_deleted=false`,
		floorID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Qavat topilmadi"})
	}

	if _, err := tx.Exec(ctx, `UPDATE tables SET is_deleted=true WHERE floor_id=$1`, floorID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// UpdateTable - stol nomini o'zgartirish
func (h *TableHandler) UpdateTable(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	tableID := c.Params("id")
	var body struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Stol nomi kiritilishi shart"})
	}

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE tables SET name=$1
		 WHERE id=$2 AND is_deleted=false
		   AND floor_id IN (SELECT id FROM floors WHERE business_id=$3)`,
		body.Name, tableID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DeleteTable - stolni yashirin o'chiradi (to'lanmagan buyurtmasi bo'lmasa)
func (h *TableHandler) DeleteTable(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	tableID := c.Params("id")
	ctx := context.Background()

	var activeCount int
	if err := h.DB.QueryRow(ctx,
		`SELECT count(*) FROM orders WHERE table_id=$1 AND status IN ('new','activated')`,
		tableID).Scan(&activeCount); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if activeCount > 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Bu stolda to'lanmagan buyurtma bor — avval uni yakunlang"})
	}

	cmd, err := h.DB.Exec(ctx,
		`UPDATE tables SET is_deleted=true
		 WHERE id=$1 AND is_deleted=false
		   AND floor_id IN (SELECT id FROM floors WHERE business_id=$2)`,
		tableID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// GetTableQRCode - stol uchun to'liq QR havolasini qaytaradi.
// TELEGRAM_BOT_USERNAME sozlangan bo'lsa, havola Telegram botga chuqur havola (deep link)
// ko'rinishida bo'ladi (?start=table_<token>) — mijoz QR'ni skanerlaganda bot ochiladi va
// WebApp aynan shu stolga bog'langan holda ishga tushadi. Sozlanmagan bo'lsa, eski
// QR_BASE_URL asosidagi oddiy sahifa havolasiga qaytadi (masalan hali bot ulanmagan bosqichda).
func (h *TableHandler) GetTableQRCode(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	tableID := c.Params("id")
	var token string
	err := h.DB.QueryRow(context.Background(),
		`SELECT t.qr_code_token FROM tables t
		 JOIN floors f ON f.id = t.floor_id
		 WHERE t.id=$1 AND f.business_id=$2 AND t.is_deleted=false`, tableID, businessID).Scan(&token)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Stol topilmadi"})
	}

	var qrURL string
	if botUsername := os.Getenv("TELEGRAM_BOT_USERNAME"); botUsername != "" {
		qrURL = fmt.Sprintf("https://t.me/%s?start=table_%s", botUsername, token)
	} else {
		baseURL := os.Getenv("QR_BASE_URL")
		if baseURL == "" {
			baseURL = "https://menu.example.com"
		}
		qrURL = fmt.Sprintf("%s/t/%s", baseURL, token)
	}
	return c.JSON(fiber.Map{"url": qrURL, "token": token})
}
