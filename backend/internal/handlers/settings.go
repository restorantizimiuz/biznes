package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SettingsHandler struct {
	DB *pgxpool.Pool
}

func (h *SettingsHandler) GetSettings(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	ctx := context.Background()

	var name, language, themeMode string
	err := h.DB.QueryRow(ctx,
		`SELECT name, language, theme_mode FROM businesses WHERE id=$1`, businessID,
	).Scan(&name, &language, &themeMode)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	var plan, status string
	var endsAt interface{}
	err = h.DB.QueryRow(ctx,
		`SELECT plan, status, ends_at FROM subscriptions
		 WHERE business_id=$1 ORDER BY created_at DESC LIMIT 1`, businessID,
	).Scan(&plan, &status, &endsAt)
	if err != nil {
		plan, status = "basic", "unknown"
	}

	return c.JSON(fiber.Map{
		"name":                 name,
		"language":             language,
		"theme_mode":           themeMode,
		"subscription_plan":    plan,
		"subscription_status":  status,
		"subscription_ends_at": endsAt,
	})
}

func (h *SettingsHandler) UpdateSettings(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	var body struct {
		Language  string `json:"language"`   // uz, ru, en
		ThemeMode string `json:"theme_mode"` // light, dark
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	_, err := h.DB.Exec(context.Background(),
		`UPDATE businesses SET language=COALESCE(NULLIF($1,''),language),
		 theme_mode=COALESCE(NULLIF($2,''),theme_mode) WHERE id=$3`,
		body.Language, body.ThemeMode, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}
