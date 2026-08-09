package handlers

import "github.com/gofiber/fiber/v2"

// GlobalErrorHandler - kutilmagan xatoliklarni ushlaydi, server crash bo'lishini oldini oladi
// va foydalanuvchiga tushunarli JSON javob qaytaradi.
func GlobalErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}

	return c.Status(code).JSON(fiber.Map{
		"error": err.Error(),
	})
}
