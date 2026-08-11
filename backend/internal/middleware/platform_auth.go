package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// PlatformClaims - super-admin tokeni ichidagi ma'lumot.
//
// Kafe tokenidan (Claims) **butunlay boshqa tur** va **boshqa kalit** bilan
// imzolanadi. Shuning uchun kafe xodimining tokeni bu yerda hech qanday yo'l
// bilan ishlamaydi va aksincha — super-admin tokeni kafe API'siga yaramaydi.
type PlatformClaims struct {
	AdminID string `json:"admin_id"`
	Login   string `json:"login"`
	jwt.RegisteredClaims
}

// PlatformAuthRequired - /api/v1/platform/* yo'llari uchun tekshiruv.
func PlatformAuthRequired(platformSecret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Platforma avtorizatsiyasi talab qilinadi",
			})
		}

		claims := &PlatformClaims{}
		token, err := jwt.ParseWithClaims(strings.TrimPrefix(authHeader, "Bearer "), claims,
			func(t *jwt.Token) (interface{}, error) { return []byte(platformSecret), nil })
		if err != nil || !token.Valid || claims.AdminID == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Token yaroqsiz yoki muddati o'tgan",
			})
		}

		c.Locals("platform_admin_id", claims.AdminID)
		c.Locals("platform_admin_login", claims.Login)
		return c.Next()
	}
}
