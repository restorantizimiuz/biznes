package handlers

import (
	"context"
	"encoding/json"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"
	"cafesystem/backend/internal/notify"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

type WSHandler struct {
	Hub *notify.Hub
	Cfg *config.Config
}

// UpgradeGuard - WebSocket'ga o'tishdan oldingi tekshiruv.
//
// Brauzerning WebSocket API'si so'rovga Authorization sarlavhasini qo'sha
// olmaydi (fetch'dan farqli o'laroq), shuning uchun token so'rov parametri
// orqali beriladi: /api/v1/ws/orders?token=<jwt>. Tekshiruv oddiy
// AuthRequired bilan bir xil kalit va bir xil Claims turidan foydalanadi.
func (h *WSHandler) UpgradeGuard(c *fiber.Ctx) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return c.Status(fiber.StatusUpgradeRequired).JSON(fiber.Map{
			"error": "Bu endpoint faqat WebSocket ulanishi uchun",
		})
	}

	claims := &middleware.Claims{}
	token, err := jwt.ParseWithClaims(c.Query("token"), claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(h.Cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Token yaroqsiz yoki muddati o'tgan",
		})
	}

	c.Locals("business_id", claims.BusinessID)
	c.Locals("role", claims.Role)
	return c.Next()
}

// Orders - kassa paneli shu ulanish orqali yangi buyurtma hodisalarini
// darhol (5 soniyalik so'rovni kutmasdan) oladi.
func (h *WSHandler) Orders(c *websocket.Conn) {
	businessID, _ := c.Locals("business_id").(string)
	if businessID == "" {
		c.Close()
		return
	}

	events, unsubscribe := h.Hub.Subscribe(businessID)
	defer unsubscribe()

	// Brauzer oynani yopganda WebSocket uzilganini faqat o'qish urinishi
	// aniqlaydi — shuning uchun alohida goroutine o'qib turadi va uzilish
	// signalini shu kanal orqali beradi.
	closed := make(chan struct{})
	go func() {
		defer close(closed)
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-closed:
			return
		case e, ok := <-events:
			if !ok {
				return
			}
			if err := c.WriteJSON(e); err != nil {
				return
			}
		}
	}
}

// publishOrderEvent - buyurtma hodisasini tarqatadi.
//
// Asosiy yo'l — server ichidagi hub (Redis'siz ham ishlaydi).
// Redis esa ixtiyoriy qo'shimcha: bir nechta server nusxasi ishlaganda kerak
// bo'ladi. U alohida goroutine'da yuboriladi, chunki Redis o'chirilgan bo'lsa
// ulanishga urinish buyurtma yaratish so'rovini sekinlashtirmasligi kerak.
func publishOrderEvent(hub *notify.Hub, rdb *redis.Client, businessID string, e notify.Event) {
	if hub != nil {
		hub.Publish(businessID, e)
	}
	if rdb == nil {
		return
	}
	payload, err := json.Marshal(e)
	if err != nil {
		return
	}
	go rdb.Publish(context.Background(), "orders:"+businessID, payload)
}
