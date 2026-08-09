package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Config butun tizim uchun barcha muhim sozlamalarni saqlaydi
type Config struct {
	Port          string
	DatabaseURL   string
	RedisAddr     string
	RedisPassword string
	JWTSecret     string
	Environment   string // "development" yoki "production"
}

// Load .env fayldan yoki muhit o'zgaruvchilaridan sozlamalarni o'qiydi
func Load() *Config {
	// .env fayl mavjud bo'lmasa ham xato bermaydi (production'da odatda muhit o'zgaruvchilari orqali beriladi)
	if err := godotenv.Load(); err != nil {
		log.Println(".env fayl topilmadi, muhit o'zgaruvchilaridan foydalanilmoqda")
	}

	return &Config{
		Port:          getEnv("PORT", "8080"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/cafesystem?sslmode=disable"),
		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		JWTSecret:     getEnv("JWT_SECRET", "o-zgartiring-bu-maxfiy-kalit"),
		Environment:   getEnv("ENVIRONMENT", "development"),
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
