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
	RedisURL      string // to'liq redis:// manzil (Railway/Render kabi hosting'lar shuni beradi)
	RedisAddr     string
	RedisPassword string
	JWTSecret     string
	// PlatformJWTSecret - super-admin (platforma) tokenlari uchun **alohida**
	// kalit. Kafe tokeni platforma API'sida va aksincha ishlamasligi shu
	// ajratishga bog'liq: kalit bir xil bo'lsa, tokenlarni almashtirib
	// ishlatish imkoni paydo bo'lardi.
	PlatformJWTSecret string
	Environment       string // "development" yoki "production"
	TelegramBotToken  string // WebApp initData'ni tekshirish va chek yuborish uchun
	UploadDir         string // mahsulot rasmlari saqlanadigan papka
	// AllowedOrigins - CORS uchun ruxsat etilgan domenlar (vergul bilan).
	// Productionda kassa, Telegram WebApp va super-admin manzillari yoziladi.
	AllowedOrigins string
	// WebMenuBaseURL - kafe Instagram profiliga qo'yadigan ochiq menyu manzili.
	// To'liq havola shu asosda yig'iladi: <baza>/menyu/<business_code>
	WebMenuBaseURL string
	// WebMenuBaseURLSet - WEB_MENU_BASE_URL aniq berilganmi.
	//
	// Berilmasa WebMenuBaseURL localhost'ga tushadi va Sozlamalardagi havola
	// mijoz uchun ochilmaydigan bo'lib qoladi. Bu bir marta sodir bo'lgan:
	// Railway'da o'zgaruvchi qo'yilmagani uchun kafe egasi Sozlamalarda
	// "http://localhost:5174/menyu/<kod>" ni ko'rgan. Shuning uchun holat
	// Sozlamalar javobiga chiqariladi va interfeys buni ogohlantirish bilan
	// ko'rsatadi — xato jimgina o'tib ketmasligi kerak.
	WebMenuBaseURLSet bool
	// NominatimURL - manzilni koordinatadan aniqlash xizmati (OpenStreetMap).
	// Kalit talab qilmaydi. O'z serveringizni ko'tarsangiz shu manzilni
	// almashtirasiz — kod tegilmaydi.
	NominatimURL string
	// SeedDemo - namunaviy "Demo Cafe" ma'lumotlarini qo'yishmi.
	// Ishlab chiqarish bazasida bu **hech qachon** yoqilmasligi kerak:
	// demo hisobning paroli hammaga ma'lum.
	SeedDemo bool
}

// defaultJWTSecret - faqat lokal ishlab chiqish uchun mo'ljallangan namunaviy kalit.
// Productionda bu qiymat bilan qolib ketmasligi kerak.
const defaultJWTSecret = "o-zgartiring-bu-maxfiy-kalit"

const defaultPlatformJWTSecret = "o-zgartiring-bu-platforma-kaliti"

// Load .env fayldan yoki muhit o'zgaruvchilaridan sozlamalarni o'qiydi
func Load() *Config {
	// .env fayl mavjud bo'lmasa ham xato bermaydi (production'da odatda muhit o'zgaruvchilari orqali beriladi)
	if err := godotenv.Load(); err != nil {
		log.Println(".env fayl topilmadi, muhit o'zgaruvchilaridan foydalanilmoqda")
	}

	// Bo'sh satr bilan berilgan WEB_MENU_BASE_URL ham "berilmagan" hisoblanadi:
	// bo'sh baza bilan yig'ilgan havola ("/menyu/<kod>") hech qayerga olib bormaydi.
	webMenuBaseURL, webMenuBaseURLSet := os.LookupEnv("WEB_MENU_BASE_URL")
	if webMenuBaseURL == "" {
		webMenuBaseURL, webMenuBaseURLSet = "http://localhost:5174", false
	}

	cfg := &Config{
		Port:              getEnv("PORT", "8080"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/cafesystem?sslmode=disable"),
		RedisURL:          getEnv("REDIS_URL", ""),
		RedisAddr:         getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:     getEnv("REDIS_PASSWORD", ""),
		JWTSecret:         getEnv("JWT_SECRET", defaultJWTSecret),
		PlatformJWTSecret: getEnv("PLATFORM_JWT_SECRET", defaultPlatformJWTSecret),
		Environment:       getEnv("ENVIRONMENT", "development"),
		TelegramBotToken:  getEnv("TELEGRAM_BOT_TOKEN", ""),
		UploadDir:         getEnv("UPLOAD_DIR", "./uploads"),
		AllowedOrigins:    getEnv("ALLOWED_ORIGINS", "*"),
		WebMenuBaseURL:    webMenuBaseURL,
		WebMenuBaseURLSet: webMenuBaseURLSet,
		NominatimURL:      getEnv("NOMINATIM_URL", "https://nominatim.openstreetmap.org"),
		SeedDemo:          getEnv("SEED_DEMO", "") == "true",
	}

	if cfg.Environment == "production" && cfg.JWTSecret == defaultJWTSecret {
		log.Fatal("JWT_SECRET productionda standart (namunaviy) qiymatda qoldirilishi mumkin emas — uni muhit o'zgaruvchisi orqali o'zgartiring")
	}
	if cfg.Environment == "production" && cfg.PlatformJWTSecret == defaultPlatformJWTSecret {
		log.Fatal("PLATFORM_JWT_SECRET productionda standart qiymatda qoldirilishi mumkin emas — super-admin paneli shu kalit bilan himoyalanadi")
	}
	if cfg.PlatformJWTSecret == cfg.JWTSecret {
		log.Fatal("PLATFORM_JWT_SECRET va JWT_SECRET bir xil bo'lishi mumkin emas — aks holda kafe tokeni super-admin API'sida ham ishlab ketardi")
	}
	if cfg.TelegramBotToken == "" {
		log.Println("OGOHLANTIRISH: TELEGRAM_BOT_TOKEN sozlanmagan — Telegram WebApp orqali buyurtma va chek yuborish ishlamaydi")
	}
	// Server to'xtatilmaydi: havola sozlanmagani butun kassani ishdan
	// chiqarishga arzimaydi. Ammo productionda bu deyarli har doim xato —
	// kafe Sozlamalardan localhost havolasini nusxalab, uni Instagram
	// profiliga qo'yib yuborishi mumkin.
	if cfg.Environment == "production" && !cfg.WebMenuBaseURLSet {
		log.Println("OGOHLANTIRISH: WEB_MENU_BASE_URL sozlanmagan — Sozlamalardagi online buyurtma havolasi " +
			cfg.WebMenuBaseURL + " ga ishora qiladi va mijozlar uni ocha olmaydi. " +
			"Unga mijozlar menyusi (frontend-telegram) ochilgan domenni yozing.")
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
