package handlers

import (
	"cafesystem/backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MeHandler - joriy xodim haqidagi ma'lumot.
//
// Nega alohida endpoint kerak: vakolatlar login javobida ham beriladi, lekin
// admin xodimning ruxsatini o'zgartirganda o'sha ro'yxat eskirib qoladi.
// Frontend sahifa ochilganda shu endpointdan qayta o'qiydi va menyuni
// yangilaydi — xodim qayta login qilishi shart emas.
type MeHandler struct {
	DB *pgxpool.Pool
}

func (h *MeHandler) Me(c *fiber.Ctx) error {
	userID, _ := c.Locals("user_id").(string)
	businessID, _ := c.Locals("business_id").(string)
	role, _ := c.Locals("role").(string)

	var fullName, login string
	if err := h.DB.QueryRow(c.Context(),
		`SELECT full_name, login FROM users WHERE id=$1 AND business_id=$2 AND is_active=true`,
		userID, businessID).Scan(&fullName, &login); err != nil {
		// Xodim bloklangan yoki o'chirilgan bo'lsa token hali amal qilsa ham
		// ishlashda davom etmasligi kerak.
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Foydalanuvchi topilmadi yoki bloklangan",
		})
	}

	return c.JSON(fiber.Map{
		"user_id":     userID,
		"business_id": businessID,
		"full_name":   fullName,
		"login":       login,
		"role":        role,
		"permissions": middleware.EffectivePermissions(c.Context(), h.DB, userID, role),
	})
}
