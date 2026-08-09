package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// Claims - JWT token ichida saqlanadigan ma'lumotlar
type Claims struct {
	UserID     string `json:"user_id"`
	BusinessID string `json:"business_id"`
	Role       string `json:"role"`
	jwt.RegisteredClaims
}

// AuthRequired - har bir himoyalangan route uchun token tekshiruvchi middleware.
// Token to'g'ri bo'lsa, user_id/business_id/role Fiber context ichiga qo'yiladi,
// shundan keyingi handler'lar shu ma'lumotdan foydalanadi.
func AuthRequired(jwtSecret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Avtorizatsiya talab qilinadi",
			})
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Token yaroqsiz yoki muddati o'tgan",
			})
		}

		// Keyingi handler'lar uchun ma'lumotni saqlab qo'yamiz
		c.Locals("user_id", claims.UserID)
		c.Locals("business_id", claims.BusinessID)
		c.Locals("role", claims.Role)

		return c.Next()
	}
}

// RequireRole - faqat berilgan rollarga ruxsat beradigan middleware
// Masalan: faqat "owner" yoki "admin" kira oladigan sozlamalar sahifasi uchun
func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRole, _ := c.Locals("role").(string)
		for _, r := range roles {
			if userRole == r {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Bu amal uchun ruxsatingiz yo'q",
		})
	}
}
