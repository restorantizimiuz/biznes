package middleware

import (
	"context"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ============================================================
// XODIM VAKOLATLARI
//
// Ilgari ruxsat faqat roldan kelib chiqardi va routes.go dagi qat'iy
// ro'yxatlarda (rolesCashier, rolesMenu, rolesManage) qotib qolgan edi.
// Amalda har bir kafening ish tartibi boshqacha: birida ofitsiant menyuni
// ham tahrirlaydi, boshqasida unga faqat buyurtma kiritish kerak.
//
// Endi rol **standart to'plamni** beradi, admin esa alohida xodimga
// qo'shimcha ruxsat berishi yoki olib qo'yishi mumkin (user_permissions
// jadvali). Yozuv bo'lmasa — rol standartiga tushiladi.
// ============================================================

const (
	PermOrdersView     = "orders.view"
	PermOrdersCreate   = "orders.create"
	PermOrdersEdit     = "orders.edit"
	PermOrdersPay      = "orders.pay"
	PermOrdersCancel   = "orders.cancel"
	PermOrdersDiscount = "orders.discount"
	PermMenuView       = "menu.view"
	PermMenuEdit       = "menu.edit"
	PermTablesView     = "tables.view"
	PermTablesEdit     = "tables.edit"
	PermStaffManage    = "staff.manage"
	PermReportsView    = "reports.view"
	PermReportsExport  = "reports.export"
	PermSettingsEdit   = "settings.edit"
)

// AllPermissions - interfeys shu ro'yxatni ko'rsatadi. Tartib muhim:
// vakolatlar paneli aynan shu ketma-ketlikda chiziladi.
var AllPermissions = []string{
	PermOrdersView, PermOrdersCreate, PermOrdersEdit,
	PermOrdersPay, PermOrdersCancel, PermOrdersDiscount,
	PermMenuView, PermMenuEdit,
	PermTablesView, PermTablesEdit,
	PermStaffManage,
	PermReportsView, PermReportsExport,
	PermSettingsEdit,
}

// roleDefaults - har bir rol uchun standart to'plam.
//
// Pul bilan bog'liq amallar (pay, cancel, discount) ofitsiantga standart
// holda berilmaydi: ofitsiant buyurtma qabul qiladi, hisob-kitobni esa
// kassir yuritadi. Lekin admin xohlasa alohida yoqib qo'ya oladi.
var roleDefaults = map[string]map[string]bool{
	"owner": allTrue(),
	"admin": allTrue(),
	"cashier": {
		PermOrdersView: true, PermOrdersCreate: true, PermOrdersEdit: true,
		PermOrdersPay: true, PermOrdersCancel: true, PermOrdersDiscount: true,
		PermMenuView: true, PermMenuEdit: false,
		PermTablesView: true, PermTablesEdit: false,
		PermStaffManage: false,
		PermReportsView: true, PermReportsExport: true,
		PermSettingsEdit: false,
	},
	"waiter": {
		// Ofitsiant endi buyurtma bilan to'liq ishlaydi — ilgari u
		// buyurtmalar bo'limiga umuman kira olmasdi va panel ma'nosiz edi.
		PermOrdersView: true, PermOrdersCreate: true, PermOrdersEdit: true,
		PermOrdersPay: false, PermOrdersCancel: false, PermOrdersDiscount: false,
		PermMenuView: true, PermMenuEdit: true,
		PermTablesView: true, PermTablesEdit: true,
		PermStaffManage: false,
		PermReportsView: false, PermReportsExport: false,
		PermSettingsEdit: false,
	},
}

func allTrue() map[string]bool {
	m := make(map[string]bool, len(AllPermissions))
	for _, k := range AllPermissions {
		m[k] = true
	}
	return m
}

// RoleDefaults - rol uchun standart to'plamning nusxasi.
// Nusxa qaytariladi: chaqiruvchi o'zgartirsa global jadval buzilmasin.
func RoleDefaults(role string) map[string]bool {
	src, ok := roleDefaults[role]
	if !ok {
		// Notanish rol — hech narsaga ruxsat yo'q. Bu xavfsiz tomon:
		// yangi rol qo'shilib, bu jadval unutilsa, ma'lumot ochilib
		// qolgandan ko'ra kirish yopilgani ma'qul.
		return map[string]bool{}
	}
	out := make(map[string]bool, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

// ============================================================
// Kesh
//
// RequirePermission har bir himoyalangan so'rovda chaqiriladi. Har safar
// bazaga borish kassa panelida sezilarli yuk berardi (bir kassir daqiqasiga
// o'nlab so'rov yuboradi), shuning uchun natija qisqa muddatga saqlanadi.
//
// Vakolatlar JWT ichiga ataylab **qo'yilmadi**: admin xodimning ruxsatini
// o'zgartirsa, token muddati tugagunicha eski ruxsat amal qilib turardi.
// 30 soniyalik kesh esa eng yomon holatda shuncha kechikadi, admin
// o'zgartirganda esa kesh darhol tozalanadi (InvalidatePermissions).
// ============================================================

const permCacheTTL = 30 * time.Second

type permCacheEntry struct {
	perms     map[string]bool
	expiresAt time.Time
}

var (
	permCacheMu sync.RWMutex
	permCache   = map[string]permCacheEntry{}
)

// InvalidatePermissions - xodim tahrirlanganda chaqiriladi.
// Bo'sh userID butun keshni tozalaydi.
func InvalidatePermissions(userID string) {
	permCacheMu.Lock()
	defer permCacheMu.Unlock()
	if userID == "" {
		permCache = map[string]permCacheEntry{}
		return
	}
	delete(permCache, userID)
}

// EffectivePermissions - xodimning haqiqiy vakolatlari:
// rol standarti + user_permissions dagi shaxsiy o'zgartirishlar.
func EffectivePermissions(ctx context.Context, db *pgxpool.Pool, userID, role string) map[string]bool {
	permCacheMu.RLock()
	entry, ok := permCache[userID]
	permCacheMu.RUnlock()
	if ok && time.Now().Before(entry.expiresAt) {
		return entry.perms
	}

	perms := RoleDefaults(role)

	rows, err := db.Query(ctx,
		`SELECT permission_key, is_allowed FROM user_permissions WHERE user_id=$1`, userID)
	if err != nil {
		// Bazaga yetib bo'lmasa rol standartini qaytaramiz. Bu holatda
		// xodim ishlashda davom etadi, lekin shaxsiy o'zgartirishlar
		// (masalan qo'shimcha berilgan ruxsat) vaqtincha hisobga olinmaydi.
		return perms
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var allowed bool
		if err := rows.Scan(&key, &allowed); err != nil {
			continue
		}
		perms[key] = allowed
	}

	permCacheMu.Lock()
	permCache[userID] = permCacheEntry{perms: perms, expiresAt: time.Now().Add(permCacheTTL)}
	permCacheMu.Unlock()

	return perms
}

// RequirePermission - himoyalangan endpoint uchun middleware.
//
// MUHIM: frontendda tugmani yashirish himoya emas — xodim brauzer
// konsolidan so'rov yuborib amalni bajara olardi. Haqiqiy tekshiruv shu yerda.
func RequirePermission(db *pgxpool.Pool, key string) fiber.Handler {
	return RequireAnyPermission(db, key)
}

// RequireAnyPermission - sanab o'tilganlardan **kamida bittasi** bo'lsa yetarli.
// Masalan rasm yuklash: uni menyu tahrirlaydigan ham, stol tahrirlaydigan ham
// ishlatadi, shuning uchun ikkalasidan biri kifoya.
func RequireAnyPermission(db *pgxpool.Pool, keys ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, _ := c.Locals("user_id").(string)
		role, _ := c.Locals("role").(string)
		if userID == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Avtorizatsiya talab qilinadi",
			})
		}
		perms := EffectivePermissions(c.Context(), db, userID, role)
		for _, key := range keys {
			if perms[key] {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Bu amal uchun ruxsatingiz yo'q",
		})
	}
}
