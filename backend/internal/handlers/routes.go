package handlers

import (
	"time"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"
	"cafesystem/backend/internal/notify"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Ruxsatlar endi **rolga emas, vakolat kalitiga** bog'langan
// (middleware/permission.go). Rol faqat standart to'plamni beradi, admin esa
// har bir xodimga alohida ruxsat berishi yoki olib qo'yishi mumkin.
//
// Standart to'plam:
//
//	Vakolat            | owner | admin | cashier | waiter
//	-------------------|-------|-------|---------|-------
//	orders.view        |   ✅  |   ✅  |    ✅   |   ✅
//	orders.create/edit |   ✅  |   ✅  |    ✅   |   ✅
//	orders.pay/cancel  |   ✅  |   ✅  |    ✅   |   ❌
//	menu.edit          |   ✅  |   ✅  |    ❌   |   ✅
//	tables.edit        |   ✅  |   ✅  |    ❌   |   ✅
//	staff.manage       |   ✅  |   ✅  |    ❌   |   ❌
//	reports.view       |   ✅  |   ✅  |    ✅   |   ❌
//	settings.edit      |   ✅  |   ✅  |    ❌   |   ❌
//
// MUHIM: frontendda menyuni yashirish faqat qulaylik. Haqiqiy himoya shu
// yerda — endpoint himoyalanmasa, ofitsiant brauzer konsolidan so'rov
// yuborib ma'lumotni baribir olaverardi.
//
// O'qish (GET) huquqi ataylab kengroq: kassir menyuni va stollarni ko'rmasa
// buyurtma kirita olmaydi, har bir xodim esa til sozlamasini o'qishi kerak.
// Cheklov yozish amallariga qo'yiladi.

// RegisterRoutes butun tizimning API yo'llarini belgilaydi.
// Har bir bo'lim (auth, menu, orders, tables, reports...) alohida guruhga bo'lingan,
// bu kodni tartibli va kengaytirish oson qiladi.
func RegisterRoutes(app *fiber.App, db *pgxpool.Pool, rdb *redis.Client, hub *notify.Hub, cfg *config.Config) {
	api := app.Group("/api/v1")

	// ---------- Ochiq (auth talab qilmaydigan) yo'llar ----------
	auth := &AuthHandler{DB: db, Cfg: cfg}
	api.Post("/auth/login", auth.Login)

	// QR-menyu sahifasi uchun ochiq endpoint (mijoz token orqali kiradi, login shart emas)
	qr := &QRHandler{DB: db, RDB: rdb, Hub: hub}
	api.Get("/qr/:table_token/menu", qr.GetMenuByTableToken)
	api.Post("/qr/:table_token/order", qr.CreateOrderFromQR)

	// Telegram bot /start orqali (hali stol tanlanmagan holatda) menyuni ko'rsatish uchun ochiq endpoint
	api.Get("/menu", qr.GetMenuByBusinessCode)

	// Telegram WebApp orqali **stoldan** buyurtma (mijoz Telegram initData bilan
	// autentifikatsiya qilinadi, login shart emas). Menyuni olish uchun yuqoridagi
	// /qr/:table_token/menu qayta ishlatiladi.
	//
	// Telegram orqali uydan (yetkazib berish/olib ketish) buyurtma berish olib
	// tashlandi — u endi quyidagi ochiq veb sahifa orqali amalga oshiriladi.
	telegram := &TelegramHandler{DB: db, RDB: rdb, Hub: hub, Cfg: cfg}
	api.Post("/telegram/:table_token/order", telegram.CreateOrder)

	// ---------- Ochiq veb sahifa (Instagram havolasi) ----------
	// Mijoz uyda o'tirib menyuni ko'radi va buyurtma beradi. Auth yo'q:
	// hisob ochish talab qilinsa mijozlarning katta qismi yo'qoladi.
	//
	// Soxta buyurtmaga qarshi uch qatlam:
	//   1) IP bo'yicha chastota chegarasi (shu yerda),
	//   2) bir telefondan ochiq buyurtma soni (weborder.go),
	//   3) buyurtma 'new' holatida tushadi — kassir tasdiqlamaguncha
	//      oshxonaga ketmaydi.
	web := &WebOrderHandler{DB: db, RDB: rdb, Hub: hub, Cfg: cfg}
	api.Post("/web/order", limiter.New(limiter.Config{
		Max:        5,
		Expiration: time.Minute,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(429).JSON(fiber.Map{
				"error": "Juda ko'p urinish. Bir daqiqadan so'ng qayta urinib ko'ring.",
			})
		},
	}), web.CreateWebOrder)
	api.Get("/web/orders/:token", web.GetWebOrderStatus)

	// Manzilni xaritadagi nuqtadan aniqlash (OpenStreetMap Nominatim proksi).
	geo := &GeoHandler{Cfg: cfg}
	api.Get("/geo/reverse", limiter.New(limiter.Config{
		Max:        30,
		Expiration: time.Minute,
	}), geo.ReverseGeocode)

	// ---------- Real-time bildirishnoma (WebSocket) ----------
	// Token sarlavhada emas, so'rov parametrida keladi (brauzer WebSocket API'si
	// sarlavha qo'sha olmaydi) — shuning uchun oddiy AuthRequired o'rniga
	// alohida tekshiruv ishlatiladi.
	ws := &WSHandler{Hub: hub, Cfg: cfg}
	api.Get("/ws/orders", ws.UpgradeGuard, websocket.New(ws.Orders))

	// ---------- Super-admin (platforma) ----------
	// Alohida guruh, alohida middleware va alohida JWT kalit: kafe xodimining
	// tokeni bu yerda ishlamaydi.
	//
	// MUHIM: bu blok quyidagi `protected` guruhidan **oldin** turishi shart.
	// `api.Group("/", AuthRequired)` /api/v1 ostidagi hamma narsaga tegishli
	// bo'lgani uchun, keyin ro'yxatga olingan platforma yo'llari ham kafe
	// tokenini talab qilib qolardi (platform/login ham kirib bo'lmas edi).
	platform := &PlatformHandler{DB: db, Cfg: cfg}
	api.Post("/platform/login", platform.Login)

	platformGroup := api.Group("/platform", middleware.PlatformAuthRequired(cfg.PlatformJWTSecret))
	platformGroup.Patch("/me", platform.UpdateMe)
	platformGroup.Patch("/businesses/:id/staff/:userId", platform.UpdateStaffCredentials)
	platformGroup.Get("/stats", platform.Stats)
	platformGroup.Get("/businesses", platform.ListBusinesses)
	platformGroup.Post("/businesses", platform.CreateBusiness)
	platformGroup.Patch("/businesses/:id", platform.UpdateBusiness)
	platformGroup.Post("/businesses/:id/subscription", platform.SetSubscription)
	platformGroup.Post("/businesses/:id/features", platform.SetFeature)
	platformGroup.Get("/users", platform.ListUsers)
	platformGroup.Get("/staff", platform.ListStaff)
	platformGroup.Get("/audit-logs", platform.ListAuditLogs)

	// ---------- Himoyalangan yo'llar (kafe tokeni talab qilinadi) ----------
	protected := api.Group("/", middleware.AuthRequired(cfg.JWTSecret))

	// Joriy xodim haqida — frontend menyuni shu javobdagi vakolatlarga qarab
	// chizadi. Alohida endpoint kerak, chunki admin ruxsatni o'zgartirganda
	// login javobidagi ro'yxat eskirib qoladi.
	me := &MeHandler{DB: db}
	protected.Get("/me", me.Me)

	// Menyu boshqaruvi (kategoriya, mahsulot).
	// O'qish barcha rollarga ochiq — kassir menyusiz buyurtma kirita olmaydi.
	menu := &MenuHandler{DB: db}
	menuEdit := middleware.RequirePermission(db, middleware.PermMenuEdit)
	protected.Get("/menu/categories", menu.ListCategories)
	protected.Post("/menu/categories", menuEdit, menu.CreateCategory)
	protected.Patch("/menu/categories/:id", menuEdit, menu.UpdateCategory)
	protected.Delete("/menu/categories/:id", menuEdit, menu.DeleteCategory)
	protected.Get("/menu/products", menu.ListProducts)
	protected.Post("/menu/products", menuEdit, menu.CreateProduct)
	protected.Patch("/menu/products/:id/availability", menuEdit, menu.ToggleProductAvailability)
	protected.Patch("/menu/products/:id", menuEdit, menu.UpdateProduct)
	protected.Delete("/menu/products/:id", menuEdit, menu.DeleteProduct)

	// Rasm yuklash: menyu yoki stol tahrirlay oladigan xodimga ochiq.
	// Ikkalasidan biri yetarli — rasm ikkala bo'limda ham ishlatiladi.
	uploads := &UploadHandler{Cfg: cfg}
	protected.Post("/uploads/image",
		middleware.RequireAnyPermission(db, middleware.PermMenuEdit, middleware.PermTablesEdit),
		uploads.UploadImage)

	// Qavat va stollar
	tables := &TableHandler{DB: db}
	tablesEdit := middleware.RequirePermission(db, middleware.PermTablesEdit)
	protected.Get("/floors", tables.ListFloors)
	protected.Post("/floors", tablesEdit, tables.CreateFloor)
	protected.Patch("/floors/:id", tablesEdit, tables.UpdateFloor)
	protected.Delete("/floors/:id", tablesEdit, tables.DeleteFloor)
	protected.Get("/floors/:floor_id/tables", tables.ListTables)
	protected.Post("/floors/:floor_id/tables", tablesEdit, tables.CreateTable)
	protected.Patch("/tables/:id", tablesEdit, tables.UpdateTable)
	protected.Delete("/tables/:id", tablesEdit, tables.DeleteTable)
	protected.Get("/tables/:id/qr", tables.GetTableQRCode)

	// Buyurtmalar. Ofitsiant endi shu yerga kiradi (avval kira olmasdi), lekin
	// pul bilan bog'liq amallar — to'lov, bekor qilish, chegirma — alohida
	// vakolat talab qiladi va unga standart holda berilmaydi.
	orders := &OrderHandler{DB: db, RDB: rdb, Hub: hub}
	orderGroup := protected.Group("/orders", middleware.RequirePermission(db, middleware.PermOrdersView))
	orderGroup.Get("/", orders.ListActiveOrders)
	orderGroup.Post("/", middleware.RequirePermission(db, middleware.PermOrdersCreate), orders.CreateOrder)

	orderEdit := middleware.RequirePermission(db, middleware.PermOrdersEdit)
	orderGroup.Post("/:id/activate", orderEdit, orders.ActivateOrder)
	orderGroup.Post("/:id/kitchen-status", orderEdit, orders.UpdateKitchenStatus)
	orderGroup.Post("/:id/items", orderEdit, orders.AddItem)
	orderGroup.Patch("/:id/items/:item_id", orderEdit, orders.UpdateOrderItem)
	orderGroup.Delete("/:id/items/:item_id", orderEdit, orders.DeleteOrderItem)

	orderGroup.Post("/:id/pay", middleware.RequirePermission(db, middleware.PermOrdersPay), orders.PayOrder)
	orderGroup.Post("/:id/cancel", middleware.RequirePermission(db, middleware.PermOrdersCancel), orders.CancelOrder)
	orderGroup.Post("/:id/discount", middleware.RequirePermission(db, middleware.PermOrdersDiscount), orders.ApplyDiscount)

	// Chek: chop etish uchun ma'lumot yoki Telegram orqali yuborish (printer bo'lmaganda).
	// Chek chiqarish alohida funksiya sifatida super-admin tomonidan o'chirilishi mumkin.
	receipts := &ReceiptHandler{DB: db, Cfg: cfg}
	receiptGroup := protected.Group("/orders/:id",
		middleware.RequirePermission(db, middleware.PermOrdersPay),
		middleware.RequireFeature(db, middleware.FeatureReceiptPrint))
	receiptGroup.Get("/receipt", receipts.GetReceipt)
	receiptGroup.Post("/receipt-printed", receipts.MarkReceiptPrinted)
	receiptGroup.Post("/send-receipt-telegram", receipts.SendReceiptTelegram)
	protected.Get("/printer/test-receipt",
		middleware.RequirePermission(db, middleware.PermOrdersPay), receipts.TestReceipt)

	// Xodimlar (ofitsiant/kassir boshqaruvi)
	staff := &StaffHandler{DB: db}
	staffManage := middleware.RequirePermission(db, middleware.PermStaffManage)
	protected.Get("/staff", staffManage, staff.ListStaff)
	protected.Post("/staff", staffManage, staff.CreateStaff)
	protected.Get("/staff/:id", staffManage, staff.GetStaff)
	protected.Patch("/staff/:id", staffManage, staff.UpdateStaff)
	protected.Delete("/staff/:id", staffManage, staff.DeleteStaff)
	protected.Get("/staff/:id/permissions", staffManage, staff.GetStaffPermissions)
	protected.Put("/staff/:id/permissions", staffManage, staff.UpdateStaffPermissions)

	// Hisobot — moliyaviy ma'lumot, shuning uchun ofitsiantga berilmaydi.
	reports := &ReportHandler{DB: db}
	reportGroup := protected.Group("/reports", middleware.RequirePermission(db, middleware.PermReportsView))
	reportGroup.Get("/daily", reports.DailySummary)
	reportGroup.Get("/detailed", reports.DetailedReport)
	reportGroup.Get("/export",
		middleware.RequirePermission(db, middleware.PermReportsExport),
		middleware.RequireFeature(db, middleware.FeatureReportExport), reports.ExportExcel)

	// Yopilgan buyurtmani tahrirlash. Kassir hisobotni ko'radi, lekin o'zi
	// yopgan hisobni keyin o'zgartira olmaydi: aks holda nazorat ma'nosini
	// yo'qotardi. Shuning uchun bu yerda staff.manage talab qilinadi —
	// u faqat owner/admin da bor.
	closedEdit := reportGroup.Group("/orders/:id", middleware.RequirePermission(db, middleware.PermStaffManage))
	closedEdit.Patch("/payment", reports.UpdateOrderPayment)
	closedEdit.Post("/items", reports.AddClosedOrderItem)
	closedEdit.Delete("/items/:item_id", reports.DeleteClosedOrderItem)
	closedEdit.Post("/revert", reports.RevertOrder)

	// Sozlamalar. O'qish barchaga ochiq — interfeys tili shu javobdan olinadi.
	//
	// Obunani o'zgartirish yo'li bu yerda **ataylab yo'q**: tarifni faqat
	// super-admin belgilaydi (platformGroup dagi /businesses/:id/subscription).
	// Qarang: settings.go oxiridagi izoh.
	settings := &SettingsHandler{DB: db, Cfg: cfg}
	settingsEdit := middleware.RequirePermission(db, middleware.PermSettingsEdit)
	protected.Get("/settings", settings.GetSettings)
	protected.Patch("/settings", settingsEdit, settings.UpdateSettings)
}
