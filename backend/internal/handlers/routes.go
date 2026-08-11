package handlers

import (
	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"
	"cafesystem/backend/internal/notify"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Rollar bo'yicha ruxsatlar (kelishilgan jadval):
//
//	Bo'lim                    | owner | admin | cashier | waiter
//	--------------------------|-------|-------|---------|-------
//	Kassa (buyurtma, to'lov)  |   ✅  |   ✅  |    ✅   |   ❌
//	Menyu (o'zgartirish)      |   ✅  |   ✅  |    ❌   |   ✅
//	Stollar (o'zgartirish)    |   ✅  |   ✅  |    ❌   |   ✅
//	Xodimlar                  |   ✅  |   ✅  |    ❌   |   ❌
//	Hisobot                   |   ✅  |   ✅  |    ✅   |   ❌
//	Sozlamalar                |   ✅  |   ✅  |    ❌   |   ❌
//
// MUHIM: frontendda menyuni yashirish faqat qulaylik. Haqiqiy himoya shu
// yerda — endpoint himoyalanmasa, ofitsiant brauzer konsolidan so'rov
// yuborib ma'lumotni baribir olaverardi.
//
// O'qish (GET) huquqi ataylab kengroq: kassir menyuni va stollarni ko'rmasa
// buyurtma kirita olmaydi, har bir xodim esa til sozlamasini o'qishi kerak.
// Cheklov yozish amallariga qo'yiladi.
var (
	rolesManage  = []string{"owner", "admin"}                      // boshqaruv
	rolesCashier = []string{"owner", "admin", "cashier"}            // kassa va hisobot
	rolesMenu    = []string{"owner", "admin", "waiter"}             // menyu va stollarni tahrirlash
)

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

	// Telegram WebApp orqali stoldan buyurtma (mijoz Telegram initData bilan autentifikatsiya qilinadi,
	// login shart emas). Menyuni olish uchun yuqoridagi /qr/:table_token/menu qayta ishlatiladi.
	telegram := &TelegramHandler{DB: db, RDB: rdb, Hub: hub, Cfg: cfg}
	// Diqqat: aniq yo'l (/telegram/order) parametrli yo'ldan (/telegram/:table_token/order)
	// oldin turishi shart emas — ular turli shaklda, lekin tartib aniqlik uchun shunday.
	api.Post("/telegram/order", telegram.CreateOnlineOrder)
	api.Post("/telegram/:table_token/order", telegram.CreateOrder)

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
	platformGroup.Get("/stats", platform.Stats)
	platformGroup.Get("/businesses", platform.ListBusinesses)
	platformGroup.Post("/businesses", platform.CreateBusiness)
	platformGroup.Patch("/businesses/:id", platform.UpdateBusiness)
	platformGroup.Post("/businesses/:id/subscription", platform.SetSubscription)
	platformGroup.Post("/businesses/:id/features", platform.SetFeature)

	// ---------- Himoyalangan yo'llar (kafe tokeni talab qilinadi) ----------
	protected := api.Group("/", middleware.AuthRequired(cfg.JWTSecret))

	// Menyu boshqaruvi (kategoriya, mahsulot).
	// O'qish barcha rollarga ochiq — kassir menyusiz buyurtma kirita olmaydi.
	menu := &MenuHandler{DB: db}
	protected.Get("/menu/categories", menu.ListCategories)
	protected.Post("/menu/categories", middleware.RequireRole(rolesMenu...), menu.CreateCategory)
	protected.Patch("/menu/categories/:id", middleware.RequireRole(rolesMenu...), menu.UpdateCategory)
	protected.Delete("/menu/categories/:id", middleware.RequireRole(rolesMenu...), menu.DeleteCategory)
	protected.Get("/menu/products", menu.ListProducts)
	protected.Post("/menu/products", middleware.RequireRole(rolesMenu...), menu.CreateProduct)
	protected.Patch("/menu/products/:id/availability", middleware.RequireRole(rolesMenu...), menu.ToggleProductAvailability)
	protected.Patch("/menu/products/:id", middleware.RequireRole(rolesMenu...), menu.UpdateProduct)
	protected.Delete("/menu/products/:id", middleware.RequireRole(rolesMenu...), menu.DeleteProduct)

	// Mahsulot rasmlarini yuklash (qurilmadan tanlab, kesib yuboriladi)
	uploads := &UploadHandler{Cfg: cfg}
	protected.Post("/uploads/image", middleware.RequireRole(rolesMenu...), uploads.UploadImage)

	// Qavat va stollar
	tables := &TableHandler{DB: db}
	protected.Get("/floors", tables.ListFloors)
	protected.Post("/floors", middleware.RequireRole(rolesMenu...), tables.CreateFloor)
	protected.Patch("/floors/:id", middleware.RequireRole(rolesMenu...), tables.UpdateFloor)
	protected.Delete("/floors/:id", middleware.RequireRole(rolesMenu...), tables.DeleteFloor)
	protected.Get("/floors/:floor_id/tables", tables.ListTables)
	protected.Post("/floors/:floor_id/tables", middleware.RequireRole(rolesMenu...), tables.CreateTable)
	protected.Patch("/tables/:id", middleware.RequireRole(rolesMenu...), tables.UpdateTable)
	protected.Delete("/tables/:id", middleware.RequireRole(rolesMenu...), tables.DeleteTable)
	protected.Get("/tables/:id/qr", tables.GetTableQRCode)

	// Kassa: buyurtmalar — ofitsiantga ko'rinmaydi.
	orders := &OrderHandler{DB: db, RDB: rdb, Hub: hub}
	cashRegister := protected.Group("/orders", middleware.RequireRole(rolesCashier...))
	cashRegister.Get("/", orders.ListActiveOrders)
	cashRegister.Post("/", orders.CreateOrder)
	cashRegister.Post("/:id/activate", orders.ActivateOrder)
	cashRegister.Post("/:id/kitchen-status", orders.UpdateKitchenStatus)
	cashRegister.Post("/:id/items", orders.AddItem)
	cashRegister.Patch("/:id/items/:item_id", orders.UpdateOrderItem)
	cashRegister.Delete("/:id/items/:item_id", orders.DeleteOrderItem)
	cashRegister.Post("/:id/pay", orders.PayOrder)
	cashRegister.Post("/:id/cancel", orders.CancelOrder)
	cashRegister.Post("/:id/discount", orders.ApplyDiscount)

	// Chek: chop etish uchun ma'lumot yoki Telegram orqali yuborish (printer bo'lmaganda).
	// Chek chiqarish alohida funksiya sifatida super-admin tomonidan o'chirilishi mumkin.
	receipts := &ReceiptHandler{DB: db, Cfg: cfg}
	receiptGroup := protected.Group("/orders/:id", middleware.RequireRole(rolesCashier...),
		middleware.RequireFeature(db, middleware.FeatureReceiptPrint))
	receiptGroup.Get("/receipt", receipts.GetReceipt)
	receiptGroup.Post("/receipt-printed", receipts.MarkReceiptPrinted)
	receiptGroup.Post("/send-receipt-telegram", receipts.SendReceiptTelegram)
	protected.Get("/printer/test-receipt", middleware.RequireRole(rolesCashier...), receipts.TestReceipt)

	// Xodimlar (ofitsiant/kassir boshqaruvi)
	staff := &StaffHandler{DB: db}
	protected.Get("/staff", middleware.RequireRole(rolesManage...), staff.ListStaff)
	protected.Post("/staff", middleware.RequireRole(rolesManage...), staff.CreateStaff)
	protected.Delete("/staff/:id", middleware.RequireRole(rolesManage...), staff.DeleteStaff)

	// Hisobot — moliyaviy ma'lumot, shuning uchun ofitsiantga berilmaydi.
	reports := &ReportHandler{DB: db}
	reportGroup := protected.Group("/reports", middleware.RequireRole(rolesCashier...))
	reportGroup.Get("/daily", reports.DailySummary)
	reportGroup.Get("/detailed", reports.DetailedReport)
	reportGroup.Get("/export", middleware.RequireFeature(db, middleware.FeatureReportExport), reports.ExportExcel)

	// Yopilgan buyurtmani tahrirlash — faqat owner/admin.
	// Kassir hisobotni ko'radi, lekin o'zi yopgan hisobni keyin o'zgartira
	// olmaydi: aks holda nazorat ma'nosini yo'qotardi.
	closedEdit := reportGroup.Group("/orders/:id", middleware.RequireRole(rolesManage...))
	closedEdit.Patch("/payment", reports.UpdateOrderPayment)
	closedEdit.Post("/items", reports.AddClosedOrderItem)
	closedEdit.Delete("/items/:item_id", reports.DeleteClosedOrderItem)
	closedEdit.Post("/revert", reports.RevertOrder)

	// Sozlamalar. O'qish barchaga ochiq — interfeys tili shu javobdan olinadi.
	settings := &SettingsHandler{DB: db}
	protected.Get("/settings", settings.GetSettings)
	protected.Patch("/settings", middleware.RequireRole(rolesManage...), settings.UpdateSettings)
	protected.Post("/settings/subscription", middleware.RequireRole(rolesManage...), settings.UpdateSubscription)
}
