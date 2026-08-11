package main

import (
	"context"
	"log"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/database"
	"cafesystem/backend/internal/handlers"
	"cafesystem/backend/internal/notify"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	// 1. Konfiguratsiyani yuklash (.env fayldan)
	cfg := config.Load()

	// 2. PostgreSQL va Redis bilan ulanish
	db, err := database.NewPostgres(cfg)
	if err != nil {
		log.Fatalf("Bazaga ulanishda xatolik: %v", err)
	}
	defer db.Close()

	rdb := database.NewRedis(cfg)
	defer rdb.Close()

	// 2.1. Migratsiyalar. Bulutda (Railway) bazaga qo'lda ulanib bo'lmaydi,
	// shuning uchun sxema server ishga tushganda avtomatik yangilanadi.
	// Xato bo'lsa ataylab to'xtatamiz: noto'g'ri sxema ustida ishlagan server
	// ma'lumotni buzishi mumkin.
	if err := database.RunMigrations(context.Background(), db, cfg.SeedDemo); err != nil {
		log.Fatalf("Migratsiyalarni qo'llashda xatolik: %v", err)
	}

	// 3. Fiber (web server) yaratish
	app := fiber.New(fiber.Config{
		AppName:      "Cafe System API v1",
		ErrorHandler: handlers.GlobalErrorHandler,
	})

	// 4. Global middleware'lar
	app.Use(recover.New()) // server crash bo'lishining oldini oladi
	app.Use(logger.New())  // har bir so'rovni log qiladi
	// CORS: productionda ALLOWED_ORIGINS orqali aniq domenlar bilan cheklanadi
	// (kassa, Telegram WebApp va super-admin manzillari). Bo'sh qoldirilsa "*"
	// ishlatiladi — bu faqat lokal ishlab chiqish uchun maqbul.
	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.AllowedOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// 5. Health check — server ishlab turganini tekshirish uchun
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Yuklangan mahsulot rasmlari (menyu va Telegram WebApp shu havolalarni ishlatadi)
	app.Static("/uploads", cfg.UploadDir)

	// 6. Bildirishnoma hub'i — kassa paneliga WebSocket orqali yangi buyurtma
	// signalini yuboradi. Redis'siz ishlaydi (qarang: internal/notify).
	hub := notify.NewHub()

	// 7. Barcha route'larni ro'yxatdan o'tkazish
	handlers.RegisterRoutes(app, db, rdb, hub, cfg)

	// 7. Serverni ishga tushirish
	log.Printf("Server %s portda ishga tushdi", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("Serverni ishga tushirishda xatolik: %v", err)
	}
}
