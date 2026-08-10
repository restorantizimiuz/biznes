package handlers

import (
	"context"
	"fmt"

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
	staff := []staffDTO{}
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

	// Tarif limiti: ofitsiant va kassir soni alohida cheklanadi.
	// Admin roli limitga kirmaydi — u kafe boshqaruvi, xizmat ko'rsatuvchi xodim emas.
	if limitKey := map[string]string{"waiter": "max_waiters", "cashier": "max_cashiers"}[body.Role]; limitKey != "" {
		var current, allowed int
		query := fmt.Sprintf(`
			SELECT (SELECT count(*) FROM users u WHERE u.business_id=$1 AND u.role=$2 AND u.is_active),
			       b.%s
			FROM businesses b WHERE b.id=$1`, limitKey)
		if err := h.DB.QueryRow(context.Background(), query, businessID, body.Role).Scan(&current, &allowed); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		if current >= allowed {
			roleName := map[string]string{"waiter": "ofitsiant", "cashier": "kassir"}[body.Role]
			return c.Status(403).JSON(fiber.Map{
				"error": fmt.Sprintf("Tarifingiz bo'yicha maksimal %d ta %s qo'shish mumkin", allowed, roleName),
			})
		}
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

// DeleteStaff - xodimni bloklaydi (is_active=false). Bazadan o'chirilmaydi,
// chunki eski buyurtmalarda "kim qabul qildi / kim to'lovni oldi" ma'lumoti
// shu foydalanuvchiga bog'langan — hisobot tarixi buzilmasligi kerak.
func (h *StaffHandler) DeleteStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	currentUserID := c.Locals("user_id").(string)
	staffID := c.Params("id")

	if staffID == currentUserID {
		return c.Status(400).JSON(fiber.Map{"error": "O'zingizni o'chira olmaysiz"})
	}

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE users SET is_active=false WHERE id=$1 AND business_id=$2 AND role <> 'owner'`,
		staffID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Xodim topilmadi (yoki kafe egasini o'chirib bo'lmaydi)"})
	}
	return c.JSON(fiber.Map{"success": true})
}
