package database

import (
	"context"
	"log"

	"cafesystem/backend/internal/config"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// NewPostgres PostgreSQL uchun connection pool yaratadi.
// Pool ishlatilishi muhim: har bir so'rov uchun yangi ulanish ochilmaydi,
// bu ko'p so'rov kelganda bazaning "cho'kib" qolishining oldini oladi.
func NewPostgres(cfg *config.Config) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	// Pool sozlamalari — yuqori yuklama ostida barqarorlik uchun
	poolConfig.MaxConns = 25
	poolConfig.MinConns = 5

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		return nil, err
	}

	// Ulanishni tekshirish
	if err := pool.Ping(context.Background()); err != nil {
		return nil, err
	}

	return pool, nil
}

// NewRedis Redis clientini yaratadi (cache va real-time bildirishnomalar uchun).
// REDIS_URL sozlangan bo'lsa (masalan Railway/Render kabi hosting'lar shu ko'rinishda
// beradi: redis://default:parol@host:port) shu ishlatiladi; aks holda REDIS_ADDR +
// REDIS_PASSWORD (lokal ishlab chiqish uchun qulayroq) ishlatiladi.
func NewRedis(cfg *config.Config) *redis.Client {
	if cfg.RedisURL != "" {
		opts, err := redis.ParseURL(cfg.RedisURL)
		if err == nil {
			return redis.NewClient(opts)
		}
		log.Printf("REDIS_URL'ni o'qishda xatolik, REDIS_ADDR'ga qaytilmoqda: %v", err)
	}
	return redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       0,
	})
}
