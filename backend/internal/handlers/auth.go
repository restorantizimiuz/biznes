package handlers

import (
	"context"
	"time"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// LoginRequest - foydalanuvchi kiritadigan 3 ta maydon:
// 1) server (business_code) - qaysi kafe/restoran ekanini bildiradi
// 2) login
// 3) parol
type LoginRequest struct {
	BusinessCode string `json:"business_code"`
	Login        string `json:"login"`
	Password     string `json:"password"`
}

type LoginResponse struct {
	Token      string `json:"token"`
	UserID     string `json:"user_id"`
	FullName   string `json:"full_name"`
	Role       string `json:"role"`
	BusinessID string `json:"business_id"`
	// Permissions - xodimning haqiqiy vakolatlari (rol standarti + shaxsiy
	// o'zgartirishlar). Frontend menyuni shu ro'yxatga qarab chizadi.
	//
	// Token ichiga ataylab qo'yilmadi: admin ruxsatni o'zgartirsa, token
	// muddati tugagunicha eski ro'yxat amal qilib turardi. Shuning uchun u
	// javob tanasida beriladi va GET /api/v1/me orqali qayta o'qiladi.
	Permissions map[string]bool `json:"permissions"`
}

// AuthHandler - autentifikatsiya bilan bog'liq barcha handler'lar shu struct orqali ishlaydi,
// bu unga baza va konfiguratsiyaga kirish imkonini beradi.
type AuthHandler struct {
	DB  *pgxpool.Pool
	Cfg *config.Config
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Noto'g'ri so'rov formati"})
	}

	if req.BusinessCode == "" || req.Login == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Server, login va parol kiritilishi shart"})
	}

	ctx := context.Background()

	// 1. Business (server) topiladi
	var businessID string
	var businessActive bool
	err := h.DB.QueryRow(ctx,
		`SELECT id, is_active FROM businesses WHERE business_code = $1`,
		req.BusinessCode,
	).Scan(&businessID, &businessActive)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Server topilmadi"})
	}
	if !businessActive {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu kafe/restoran akkaunti faol emas"})
	}

	// 2. Shu business ichidan login qidiriladi
	var userID, fullName, passwordHash, role string
	var isActive bool
	err = h.DB.QueryRow(ctx,
		`SELECT id, full_name, password_hash, role, is_active
		 FROM users WHERE business_id = $1 AND login = $2`,
		businessID, req.Login,
	).Scan(&userID, &fullName, &passwordHash, &role, &isActive)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Login yoki parol xato"})
	}
	if !isActive {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Foydalanuvchi bloklangan"})
	}

	// 3. Parolni tekshirish
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Login yoki parol xato"})
	}

	// 4. JWT token yaratish (24 soatga amal qiladi)
	claims := jwt.MapClaims{
		"user_id":     userID,
		"business_id": businessID,
		"role":        role,
		"exp":         time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString([]byte(h.Cfg.JWTSecret))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Token yaratishda xatolik"})
	}

	return c.JSON(LoginResponse{
		Token:       signedToken,
		UserID:      userID,
		FullName:    fullName,
		Role:        role,
		BusinessID:  businessID,
		Permissions: middleware.EffectivePermissions(ctx, h.DB, userID, role),
	})
}
