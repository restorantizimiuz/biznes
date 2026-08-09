package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type StaffHandler struct {
	DB *pgxpool.Pool
}

func (h *StaffHandler) ListStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	rows, err := h.DB.Query(context.Background(),
		`SELECT id, full_name, login, role, is_active FROM users WHERE business_id=$1 ORDER BY full_name`,
		businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type staffDTO struct {
		ID       string `json:"id"`
		FullName string `json:"full_name"`
		Login    string `json:"login"`
		Role     string `json:"role"`
		IsActive bool   `json:"is_active"`
	}
	var staff []staffDTO
	for rows.Next() {
		var s staffDTO
		rows.Scan(&s.ID, &s.FullName, &s.Login, &s.Role, &s.IsActive)
		staff = append(staff, s)
	}
	return c.JSON(staff)
}

// CreateStaff - yangi kassir yoki ofitsiant qo'shish (faqat owner/admin qila oladi)
func (h *StaffHandler) CreateStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	var body struct {
		FullName string `json:"full_name"`
		Login    string `json:"login"`
		Password string `json:"password"`
		Role     string `json:"role"` // cashier yoki waiter
	}
	if err := c.BodyParser(&body); err != nil || body.Login == "" || body.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Ism, login va parol kiritilishi shart"})
	}
	if body.Role != "cashier" && body.Role != "waiter" && body.Role != "admin" {
		body.Role = "cashier"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Parolni shifrlashda xatolik"})
	}

	var id string
	err = h.DB.QueryRow(context.Background(),
		`INSERT INTO users (business_id, full_name, login, password_hash, role)
		 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		businessID, body.FullName, body.Login, string(hash), body.Role,
	).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Bu login band bo'lishi mumkin"})
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}
