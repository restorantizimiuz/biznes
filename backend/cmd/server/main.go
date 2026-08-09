package main

import (
	"log"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/database"
	"cafesystem/backend/internal/handlers"

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

	// 3. Fiber (web server) yaratish
	app := fiber.New(fiber.Config{
		AppName:      "Cafe System API v1",
		ErrorHandler: handlers.GlobalErrorHandler,
	})

	// 4. Global middleware'lar
	app.Use(recover.New()) // server crash bo'lishining oldini oladi
	app.Use(logger.New())  // har bir so'rovni log qiladi
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*", // productionda aniq domenlar bilan cheklanadi
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// 5. Health check — server ishlab turganini tekshirish uchun
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// 6. Barcha route'larni ro'yxatdan o'tkazish
	handlers.RegisterRoutes(app, db, rdb, cfg)

	// 7. Serverni ishga tushirish
	log.Printf("Server %s portda ishga tushdi", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("Serverni ishga tushirishda xatolik: %v", err)
	}
}
