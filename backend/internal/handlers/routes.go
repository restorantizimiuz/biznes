package handlers

import (
	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// RegisterRoutes butun tizimning API yo'llarini belgilaydi.
// Har bir bo'lim (auth, menu, orders, tables, reports...) alohida guruhga bo'lingan,
// bu kodni tartibli va kengaytirish oson qiladi.
func RegisterRoutes(app *fiber.App, db *pgxpool.Pool, rdb *redis.Client, cfg *config.Config) {
	api := app.Group("/api/v1")

	// ---------- Ochiq (auth talab qilmaydigan) yo'llar ----------
	auth := &AuthHandler{DB: db, Cfg: cfg}
	api.Post("/auth/login", auth.Login)

	// QR-menyu sahifasi uchun ochiq endpoint (mijoz token orqali kiradi, login shart emas)
	qr := &QRHandler{DB: db, RDB: rdb}
	api.Get("/qr/:table_token/menu", qr.GetMenuByTableToken)
	api.Post("/qr/:table_token/order", qr.CreateOrderFromQR)

	// Telegram WebApp orqali stoldan buyurtma (mijoz Telegram initData bilan autentifikatsiya qilinadi,
	// login shart emas). Menyuni olish uchun yuqoridagi /qr/:table_token/menu qayta ishlatiladi.
	telegram := &TelegramHandler{DB: db, RDB: rdb, Cfg: cfg}
	api.Post("/telegram/:table_token/order", telegram.CreateOrder)

	// ---------- Himoyalangan yo'llar (token talab qilinadi) ----------
	protected := api.Group("/", middleware.AuthRequired(cfg.JWTSecret))

	// Menyu boshqaruvi (kategoriya, mahsulot)
	menu := &MenuHandler{DB: db}
	protected.Get("/menu/categories", menu.ListCategories)
	protected.Post("/menu/categories", middleware.RequireRole("owner", "admin"), menu.CreateCategory)
	protected.Get("/menu/products", menu.ListProducts)
	protected.Post("/menu/products", middleware.RequireRole("owner", "admin"), menu.CreateProduct)
	protected.Patch("/menu/products/:id/availability", menu.ToggleProductAvailability)

	// Qavat va stollar
	tables := &TableHandler{DB: db}
	protected.Get("/floors", tables.ListFloors)
	protected.Post("/floors", middleware.RequireRole("owner", "admin"), tables.CreateFloor)
	protected.Get("/floors/:floor_id/tables", tables.ListTables)
	protected.Post("/floors/:floor_id/tables", middleware.RequireRole("owner", "admin"), tables.CreateTable)
	protected.Get("/tables/:id/qr", tables.GetTableQRCode)

	// Kassa: buyurtmalar
	orders := &OrderHandler{DB: db, RDB: rdb}
	protected.Get("/orders", orders.ListActiveOrders)
	protected.Post("/orders", orders.CreateOrder) // kassir yoki ofitsiant qo'lda buyurtma yaratadi
	protected.Post("/orders/:id/activate", orders.ActivateOrder)
	protected.Post("/orders/:id/items", orders.AddItem)
	protected.Post("/orders/:id/pay", orders.PayOrder)
	protected.Post("/orders/:id/cancel", orders.CancelOrder)
	protected.Post("/orders/:id/discount", orders.ApplyDiscount)

	// Chek: chop etish uchun ma'lumot yoki Telegram orqali yuborish (printer bo'lmaganda)
	receipts := &ReceiptHandler{DB: db, Cfg: cfg}
	protected.Get("/orders/:id/receipt", receipts.GetReceipt)
	protected.Post("/orders/:id/send-receipt-telegram", receipts.SendReceiptTelegram)

	// Xodimlar (ofitsiant/kassir boshqaruvi)
	staff := &StaffHandler{DB: db}
	protected.Get("/staff", staff.ListStaff)
	protected.Post("/staff", middleware.RequireRole("owner", "admin"), staff.CreateStaff)

	// Hisobot (buhgalteriya)
	reports := &ReportHandler{DB: db}
	protected.Get("/reports/daily", reports.DailySummary)
	protected.Get("/reports/export", reports.ExportExcel)

	// Sozlamalar
	settings := &SettingsHandler{DB: db}
	protected.Get("/settings", settings.GetSettings)
	protected.Patch("/settings", middleware.RequireRole("owner", "admin"), settings.UpdateSettings)
}
