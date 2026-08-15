package handlers

import (
	"context"
	"strings"

	"cafesystem/backend/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SettingsHandler struct {
	DB *pgxpool.Pool
	// Cfg - ochiq menyu havolasini yig'ish uchun kerak (WEB_MENU_BASE_URL).
	Cfg *config.Config
}

// Obuna tariflari. Qiymatlar subscription_plan enum'iga mos bo'lishi shart.
var subscriptionPlans = map[string]bool{"basic": true, "qr": true, "full": true}

func (h *SettingsHandler) GetSettings(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	ctx := context.Background()

	var name, businessCode, language, themeMode, printerMode, printerAddress string
	var printerPaperWidth int
	var notifySound bool
	var minOrderAmount float64
	err := h.DB.QueryRow(ctx,
		`SELECT name, business_code, language, theme_mode, printer_mode, printer_address,
		        printer_paper_width, notify_sound, min_order_amount
		 FROM businesses WHERE id=$1`, businessID,
	).Scan(&name, &businessCode, &language, &themeMode, &printerMode, &printerAddress,
		&printerPaperWidth, &notifySound, &minOrderAmount)
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

	// Yoqilgan funksiyalar — interfeys o'chirilgan bo'limlarni ko'rsatmasligi uchun.
	features := map[string]bool{}
	rows, err := h.DB.Query(ctx,
		`SELECT feature_key, is_enabled FROM feature_flags WHERE business_id=$1`, businessID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var key string
			var enabled bool
			if err := rows.Scan(&key, &enabled); err == nil {
				features[key] = enabled
			}
		}
	}

	return c.JSON(fiber.Map{
		"name":                 name,
		"business_code":        businessCode,
		"language":             language,
		"theme_mode":           themeMode,
		"subscription_plan":    plan,
		"subscription_status":  status,
		"subscription_ends_at": endsAt,
		"printer_mode":         printerMode,
		"printer_address":      printerAddress,
		"printer_paper_width":  printerPaperWidth,
		"notify_sound":         notifySound,
		"min_order_amount":     minOrderAmount,
		"features":             features,
		// Kafe shu havolani Instagram profiliga qo'yadi. To'liq manzil
		// backendda yig'iladi: frontend deploy domenini bilmaydi, backend esa
		// uni WEB_MENU_BASE_URL orqali biladi.
		"web_menu_url": strings.TrimSuffix(h.Cfg.WebMenuBaseURL, "/") + "/menyu/" + businessCode,
	})
}

// updateSettingsRequest - printer maydonlari **ko'rsatkich** (pointer),
// chunki ular bo'sh satrga ham o'rnatilishi mumkin (printerni o'chirish).
// Oddiy satr bo'lganda "yuborilmagan" va "bo'sh qilib yuborilgan" holatlarini
// ajratib bo'lmasdi.
type updateSettingsRequest struct {
	Name              string  `json:"name"`
	Language          string  `json:"language"`   // uz, ru, en
	ThemeMode         string  `json:"theme_mode"` // light, dark
	PrinterMode       *string `json:"printer_mode"`
	PrinterAddress    *string `json:"printer_address"`
	PrinterPaperWidth int     `json:"printer_paper_width"`
	NotifySound       *bool   `json:"notify_sound"`
	// MinOrderAmount - yetkazib berish uchun eng kam summa (0 = cheklov yo'q).
	// Faqat veb buyurtmaga tegishli; olib ketishda tekshirilmaydi.
	MinOrderAmount *float64 `json:"min_order_amount"`
}

// UpdateSettings - kafe sozlamalari.
//
// Kafe nomi ham shu yerdan o'zgartiriladi: u chek sarlavhasida va Telegram
// menyusida ko'rinadi, ya'ni bitta joyda o'zgartirilsa hamma joyda yangilanadi
// (chek va menyu nomni har safar businesses jadvalidan o'qiydi).
func (h *SettingsHandler) UpdateSettings(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)

	var body updateSettingsRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	body.Name = strings.TrimSpace(body.Name)
	if len(body.Name) > 255 {
		return c.Status(400).JSON(fiber.Map{"error": "Kafe nomi juda uzun"})
	}
	if body.PrinterMode != nil {
		mode := *body.PrinterMode
		if mode != "" && mode != "network" && mode != "file" {
			return c.Status(400).JSON(fiber.Map{"error": "Printer rejimi noto'g'ri (network, file yoki bo'sh)"})
		}
	}
	if body.PrinterPaperWidth != 0 && (body.PrinterPaperWidth < 24 || body.PrinterPaperWidth > 64) {
		return c.Status(400).JSON(fiber.Map{"error": "Qog'oz kengligi 24–64 belgi oralig'ida bo'lishi kerak"})
	}
	if body.MinOrderAmount != nil && *body.MinOrderAmount < 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Eng kam summa manfiy bo'lishi mumkin emas"})
	}

	_, err := h.DB.Exec(context.Background(), `
		UPDATE businesses SET
			name                = COALESCE(NULLIF($1,''), name),
			language            = COALESCE(NULLIF($2,''), language),
			theme_mode          = COALESCE(NULLIF($3,''), theme_mode),
			printer_mode        = COALESCE($4, printer_mode),
			printer_address     = COALESCE($5, printer_address),
			printer_paper_width = COALESCE(NULLIF($6,0), printer_paper_width),
			notify_sound        = COALESCE($7, notify_sound),
			min_order_amount    = COALESCE($8, min_order_amount),
			updated_at          = now()
		WHERE id=$9`,
		body.Name, body.Language, body.ThemeMode,
		body.PrinterMode, body.PrinterAddress,
		body.PrinterPaperWidth, body.NotifySound, body.MinOrderAmount, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// UpdateSubscription - kafe o'z tarifini o'zgartiradi.
//
// TODO: Payme/Click integratsiyasi. Hozircha to'lov **talab qilinmaydi** —
// tanlangan tarif darhol yoziladi. To'lov qo'shilganda shu funksiya ichida
// avval to'lov yaratiladi (provayder API), muvaffaqiyatli javobdan keyingina
// subscriptions jadvaliga yozuv qo'shiladi.
func (h *SettingsHandler) UpdateSubscription(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)

	var body struct {
		Plan string `json:"plan"`
	}
	if err := c.BodyParser(&body); err != nil || !subscriptionPlans[body.Plan] {
		return c.Status(400).JSON(fiber.Map{"error": "Tarif noto'g'ri (basic, qr yoki full)"})
	}

	ctx := context.Background()

	// Yangi tarif joriy obuna tugash sanasini saqlab qoladi — tarif
	// o'zgartirish muddatni qisqartirmasligi kerak.
	var endsAt interface{}
	if err := h.DB.QueryRow(ctx,
		`SELECT ends_at FROM subscriptions WHERE business_id=$1 ORDER BY created_at DESC LIMIT 1`,
		businessID).Scan(&endsAt); err != nil {
		endsAt = nil
	}

	var id string
	err := h.DB.QueryRow(ctx, `
		INSERT INTO subscriptions (business_id, plan, status, ends_at, created_by_admin)
		VALUES ($1, $2, 'active', COALESCE($3::timestamptz, now() + interval '30 days'), 'self-service')
		RETURNING id`, businessID, body.Plan, endsAt).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "plan": body.Plan, "payment_required": false})
}
