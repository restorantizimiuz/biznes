package middleware

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Funksiya bayroqlari — super-admin har bir kafe uchun alohida yoqadi/o'chiradi.
// Qiymatlar feature_flags.feature_key ustunida saqlanadi, shuning uchun
// o'zgartirilmaydi.
const (
	FeatureQRMenu       = "qr_menu"
	FeatureOnlineOrder  = "online_order"
	FeatureTelegramBot  = "telegram_bot"
	FeatureReceiptPrint = "receipt_print"
	FeatureReportExport = "reports_export"
)

// ErrFeatureDisabled - funksiya o'chirilganda qaytariladi.
var ErrFeatureDisabled = errors.New("Bu funksiya sizning tarifingizda o'chirilgan")

// FeatureEnabled - kafe uchun funksiya yoqilganmi.
//
// Bayroq yozuvi umuman bo'lmasa **yoqilgan** deb hisoblanadi: yangi funksiya
// qo'shilganda mavjud kafelarning ishi to'satdan to'xtab qolmasligi kerak.
// O'chirish har doim ataylab qilingan amal bo'ladi.
func FeatureEnabled(ctx context.Context, db *pgxpool.Pool, businessID, key string) bool {
	var enabled bool
	err := db.QueryRow(ctx,
		`SELECT is_enabled FROM feature_flags WHERE business_id=$1 AND feature_key=$2`,
		businessID, key).Scan(&enabled)
	if err != nil {
		return true
	}
	return enabled
}

// RequireFeature - himoyalangan endpointlar uchun middleware.
// O'chirilgan funksiya endpointi 403 qaytaradi.
func RequireFeature(db *pgxpool.Pool, key string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		businessID, _ := c.Locals("business_id").(string)
		if businessID == "" || !FeatureEnabled(c.Context(), db, businessID, key) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": ErrFeatureDisabled.Error(),
			})
		}
		return c.Next()
	}
}
