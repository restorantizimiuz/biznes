// Cafe System Telegram bot.
//
// Mavjud go-telegram-bot-api/v5 kutubxonasi Telegram WebApp tugmasini
// (Bot API 6.0+, 2022) qo'llab-quvvatlamaydi, keyingi avlod kutubxonalari
// (masalan gotgbot/v2) esa Go 1.24 talab qiladi — bu loyihaning qolgan
// qismi (backend) Go 1.22'da yozilgan. Shuning uchun bot Telegram Bot API'ga
// standart kutubxona (net/http) orqali to'g'ridan-to'g'ri murojaat qiladi —
// qo'shimcha bog'liqlik yo'q, versiyalar mos keladi.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const apiBase = "https://api.telegram.org/bot"

type tgChat struct {
	ID int64 `json:"id"`
}

type tgMessage struct {
	Text string `json:"text"`
	Chat tgChat `json:"chat"`
}

type tgUpdate struct {
	UpdateID int64      `json:"update_id"`
	Message  *tgMessage `json:"message"`
}

type tgResponse[T any] struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
	Result      T      `json:"result"`
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println(".env fayl topilmadi, muhit o'zgaruvchilaridan foydalanilmoqda")
	}

	token := os.Getenv("BOT_TOKEN")
	if token == "" {
		log.Fatal("BOT_TOKEN muhit o'zgaruvchisi kiritilishi shart (BotFather'dan olinadi)")
	}
	webAppURL := os.Getenv("WEBAPP_URL")
	if webAppURL == "" {
		log.Fatal("WEBAPP_URL muhit o'zgaruvchisi kiritilishi shart (Telegram WebApp faqat HTTPS manzilda ishlaydi)")
	}
	businessCode := os.Getenv("BUSINESS_CODE")
	if businessCode == "" {
		log.Fatal("BUSINESS_CODE muhit o'zgaruvchisi kiritilishi shart (backend'dagi businesses.business_code bilan bir xil bo'lishi kerak)")
	}

	username, err := getMe(token)
	if err != nil {
		log.Fatalf("Botga ulanishda xatolik: %v", err)
	}
	log.Printf("Bot ishga tushdi: @%s", username)

	client := &http.Client{Timeout: 65 * time.Second}
	var offset int64
	for {
		updates, err := getUpdates(client, token, offset)
		if err != nil {
			log.Printf("Yangilanishlarni olishda xatolik: %v", err)
			time.Sleep(3 * time.Second)
			continue
		}
		for _, u := range updates {
			offset = u.UpdateID + 1
			if u.Message == nil || !strings.HasPrefix(u.Message.Text, "/start") {
				continue
			}
			if err := handleStart(token, webAppURL, businessCode, u.Message.Chat.ID); err != nil {
				log.Printf("Xabar yuborishda xatolik: %v", err)
			}
		}
	}
}

func getMe(token string) (string, error) {
	var resp tgResponse[struct {
		Username string `json:"username"`
	}]
	if err := callTelegramAPI(token, "getMe", nil, &resp); err != nil {
		return "", err
	}
	return resp.Result.Username, nil
}

func getUpdates(client *http.Client, token string, offset int64) ([]tgUpdate, error) {
	body, _ := json.Marshal(map[string]any{
		"offset":  offset,
		"timeout": 60,
	})
	req, err := http.NewRequest(http.MethodPost, apiBase+token+"/getUpdates", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var parsed tgResponse[[]tgUpdate]
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	if !parsed.OK {
		return nil, fmt.Errorf("telegram API xatosi: %s", parsed.Description)
	}
	return parsed.Result, nil
}

// handleStart - /start buyrug'ini qayta ishlaydi (parametrli yoki parametrsiz — farqi yo'q).
//
// Eski oqimda (stol QR kodi to'g'ridan-to'g'ri botni "/start table_<token>" bilan ochgan
// paytlarda) WebApp havolasiga stol tokeni ?table= sifatida qo'shilar edi. Yangi arxitekturada
// stol endi WebApp ochilishida emas, balki foydalanuvchi "Buyurtma berish"ni bosgan paytda
// Telegram'ning o'z QR-skaneri orqali aniqlanadi (frontend-telegram/src/App.tsx, checkout
// bosqichi). Shuning uchun bu yerda stol tokeni butunlay e'tiborga olinmaydi — eski, hali
// jismoniy stollarda osilgan QR-kodlar ham xatosiz ishlayveradi (shunchaki ularning
// "table_..." qismi endi shunchaki e'tiborsiz qoldiriladi), bu — moslik (compatibility)
// xatti-harakati: bot hech qachon eski formatdagi start'ni xato deb hisoblamaydi.
//
// WebApp havolasiga ?business=<BUSINESS_CODE> qo'shiladi — bu "qaysi stol" emas, "qaysi
// restoran" ekanini bildiradi, shunda WebApp ochilgan zahoti (stolsiz) shu restoran menyusini
// ko'rsata oladi (backend: GET /api/v1/menu?business_code=...).
func handleStart(token, webAppURL, businessCode string, chatID int64) error {
	appURL := webAppURL
	if u, err := url.Parse(webAppURL); err == nil {
		q := u.Query()
		q.Set("business", businessCode)
		u.RawQuery = q.Encode()
		appURL = u.String()
	} else {
		log.Printf("WEBAPP_URL'ni tahlil qilib bo'lmadi (%q): %v — business parametri qo'shilmadi", webAppURL, err)
	}

	welcomeText := "Assalomu alaykum! 👋\n\n" +
		"Bizning botga xush kelibsiz! Buyurtma berish uchun menyuni oching."

	return sendMessageWithWebApp(token, chatID, welcomeText, "🍽️ Menyuni ochish", appURL)
}

// sendMessageWithWebApp - Telegram Bot API'ning "web_app" tugma turidan foydalanadi:
// https://core.telegram.org/bots/api#inlinekeyboardbutton
func sendMessageWithWebApp(token string, chatID int64, text, buttonText, webAppURL string) error {
	payload := map[string]any{
		"chat_id": chatID,
		"text":    text,
		"reply_markup": map[string]any{
			"inline_keyboard": [][]map[string]any{
				{
					{
						"text":    buttonText,
						"web_app": map[string]string{"url": webAppURL},
					},
				},
			},
		},
	}
	return callTelegramAPI(token, "sendMessage", payload, nil)
}

func callTelegramAPI(token, method string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}

	req, err := http.NewRequest(http.MethodPost, apiBase+token+"/"+method, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var status struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(raw, &status); err != nil {
		return err
	}
	if !status.OK {
		return fmt.Errorf("telegram API xatosi (%s): %s", method, status.Description)
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}
