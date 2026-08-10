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
		`SELECT id, name, sort_order FROM floors WHERE business_id=$1 ORDER BY sort_order`, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type floorDTO struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	var floors []floorDTO
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
		`SELECT id FROM floors WHERE id=$1 AND business_id=$2`, floorID, businessID).Scan(&floorExists); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Qavat topilmadi"})
	}

	rows, err := h.DB.Query(context.Background(),
		`SELECT id, name, qr_code_token, status FROM tables WHERE floor_id=$1 ORDER BY name`, floorID)
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
	var tables []tableDTO
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

	var floorExists string
	if err := h.DB.QueryRow(context.Background(),
		`SELECT id FROM floors WHERE id=$1 AND business_id=$2`, floorID, businessID).Scan(&floorExists); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Qavat topilmadi"})
	}

	var id, token string
	err := h.DB.QueryRow(context.Background(),
		`INSERT INTO tables (floor_id, name) VALUES ($1,$2) RETURNING id, qr_code_token`,
		floorID, body.Name,
	).Scan(&id, &token)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": id, "qr_code_token": token})
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
		 WHERE t.id=$1 AND f.business_id=$2`, tableID, businessID).Scan(&token)
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
