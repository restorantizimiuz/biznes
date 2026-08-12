package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"cafesystem/backend/internal/config"

	"github.com/gofiber/fiber/v2"
)

// GeoHandler - koordinatani manzil matniga aylantirish (reverse geocoding).
//
// NEGA PROKSI KERAK: bu OpenStreetMap'ning Nominatim xizmati. Uning
// foydalanish shartlari aniq `User-Agent` va sekundiga 1 tadan ko'p bo'lmagan
// so'rovni talab qiladi. Brauzerdan to'g'ridan-to'g'ri chaqirilsa:
//   - User-Agent'ni boshqarib bo'lmaydi,
//   - har bir mijozning IP'si alohida cheklovga tushadi va bloklanishi mumkin.
//
// Shuning uchun so'rov backend orqali o'tadi: bu yerda User-Agent qo'yiladi,
// chastota ushlab turiladi va natija keshlanadi.
//
// NEGA NOMINATIM: Yandex va Google API kaliti talab qiladi (ro'yxatdan o'tish,
// Google'da to'lov kartasi). Nominatim kalitsiz ishlaydi. Kamchiligi —
// O'zbekistonda uy raqamlari to'liq emas, shuning uchun interfeys manzilni
// **taklif** sifatida ko'rsatadi va mijoz uni qo'lda tahrirlay oladi.
type GeoHandler struct {
	Cfg *config.Config
}

const (
	// Kesh kaliti uchun yaxlitlash: 4 kasr xona ≈ 11 metr. Bir uy atrofidagi
	// bir necha so'rov bitta kesh yozuviga tushadi.
	geoCachePrecision = 4
	geoCacheTTL       = 24 * time.Hour
	// Nominatim shartlari: sekundiga 1 ta so'rov.
	geoMinInterval = 1100 * time.Millisecond
	geoTimeout     = 6 * time.Second
)

type geoCacheEntry struct {
	address   string
	expiresAt time.Time
}

var (
	geoMu       sync.Mutex
	geoCache    = map[string]geoCacheEntry{}
	geoLastCall time.Time
)

// ReverseGeocode - GET /api/v1/geo/reverse?lat=..&lng=..
//
// Xato bo'lsa ham 200 qaytaradi, faqat manzil bo'sh bo'ladi: mijoz manzilni
// baribir qo'lda yozishi mumkin va xarita ishlamagani uchun butun checkout
// to'xtab qolmasligi kerak.
func (h *GeoHandler) ReverseGeocode(c *fiber.Ctx) error {
	lat, errLat := strconv.ParseFloat(c.Query("lat"), 64)
	lng, errLng := strconv.ParseFloat(c.Query("lng"), 64)
	if errLat != nil || errLng != nil || math.Abs(lat) > 90 || math.Abs(lng) > 180 {
		return c.Status(400).JSON(fiber.Map{"error": "lat va lng noto'g'ri"})
	}

	key := fmt.Sprintf("%.*f,%.*f", geoCachePrecision, lat, geoCachePrecision, lng)

	geoMu.Lock()
	if entry, ok := geoCache[key]; ok && time.Now().Before(entry.expiresAt) {
		geoMu.Unlock()
		return c.JSON(fiber.Map{"address": entry.address, "cached": true})
	}
	// Chastota chegarasi kesh tekshiruvidan **keyin** ushlanadi: keshdan
	// javob berish kutishni talab qilmaydi.
	if wait := geoMinInterval - time.Since(geoLastCall); wait > 0 {
		time.Sleep(wait)
	}
	geoLastCall = time.Now()
	geoMu.Unlock()

	address, err := h.fetchAddress(lat, lng)
	if err != nil {
		return c.JSON(fiber.Map{"address": "", "error": "Manzilni aniqlab bo'lmadi"})
	}

	geoMu.Lock()
	geoCache[key] = geoCacheEntry{address: address, expiresAt: time.Now().Add(geoCacheTTL)}
	geoMu.Unlock()

	return c.JSON(fiber.Map{"address": address})
}

func (h *GeoHandler) fetchAddress(lat, lng float64) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), geoTimeout)
	defer cancel()

	endpoint := fmt.Sprintf("%s/reverse?format=jsonv2&lat=%f&lon=%f&zoom=18&accept-language=uz",
		h.Cfg.NominatimURL, lat, lng)
	if _, err := url.Parse(endpoint); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	// Nominatim shartlari aniq ilova nomini talab qiladi — bo'lmasa 403 beradi.
	req.Header.Set("User-Agent", "CafeSystem/1.0 (restoran boshqaruv tizimi)")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("nominatim javobi: %d", resp.StatusCode)
	}

	var body struct {
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	return body.DisplayName, nil
}
