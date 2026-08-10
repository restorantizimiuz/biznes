// printer-helper - kassir kompyuterida fonda ishlaydigan kichik lokal dastur.
//
// Brauzer (kassa paneli) chek ma'lumotini shu dasturga localhost orqali yuboradi,
// dastur esa uni ESC/POS formatga o'girib, ulangan termal chek printeriga jo'natadi.
// Brauzerlar xavfsizlik sabablari bilan USB/tarmoq printerlarga to'g'ridan-to'g'ri
// (dialog'siz, ishonchli tarzda) yoza olmaydi — shuning uchun bu oraliq dastur kerak.
//
// Ikki rejimni qo'llab-quvvatlaydi:
//   - "network": tarmoqqa ulangan termal printer (odatda TCP 9100 port — RAW/JetDirect,
//     aksariyat Ethernet/Wi-Fi chek printerlarining standart usuli)
//   - "file": Linux'da USB printer character device fayliga to'g'ridan-to'g'ri yozish
//     (masalan /dev/usb/lp0)
//
// Sozlanmagan bo'lsa (PRINTER_MODE bo'sh), /print so'roviga xato qaytaradi —
// shunda kassa paneli avtomatik ravishda chekni Telegram orqali yuborishga o'tadi.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type receiptItem struct {
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
	LineTotal float64 `json:"line_total"`
}

// printerSettings - kassa panelidan kelgan sozlama.
//
// Ilgari printer faqat shu dasturning .env fayli orqali sozlanardi — kassir
// uchun matn faylini tahrirlash qiyin. Endi sozlama kafe bazasida turadi va
// chek bilan birga keladi. Kelmasa .env qiymatlari ishlatiladi, shuning uchun
// eski o'rnatmalar buzilmaydi.
type printerSettings struct {
	Mode       string `json:"mode"`
	Address    string `json:"address"`
	PaperWidth int    `json:"paper_width"`
}

type receipt struct {
	OrderID          string           `json:"order_id"`
	BusinessName     string           `json:"business_name"`
	TableName        *string          `json:"table_name"`
	OrderType        string           `json:"order_type"`
	CustomerPhone    *string          `json:"customer_phone"`
	DeliveryAddress  *string          `json:"delivery_address"`
	Items            []receiptItem    `json:"items"`
	TotalAmount      float64          `json:"total_amount"`
	DiscountAmount   float64          `json:"discount_amount"`
	FinalAmount      float64          `json:"final_amount"`
	PaymentMethods   []string         `json:"payment_methods"`
	PaidAt           *time.Time       `json:"paid_at"`
	CreatedAt        *time.Time       `json:"created_at"`
	TelegramUsername *string          `json:"telegram_username"`
	IsPreBill        bool             `json:"is_pre_bill"`
	Printer          *printerSettings `json:"printer"`
}

type printerConfig struct {
	Mode    string // "network", "file" yoki "" (o'chirilgan)
	Address string // network rejimi uchun: "192.168.1.50:9100"
	Device  string // file rejimi uchun: "/dev/usb/lp0"
	// LineWidth - qog'ozga sig'adigan belgilar soni: 58mm -> 32, 80mm -> 48.
	LineWidth int
}

// resolve - chek bilan kelgan sozlama .env qiymatlaridan ustun turadi.
// Kassir sozlamani interfeysdan o'zgartirsa, dasturni qayta ishga tushirish
// shart bo'lmasligi kerak.
func (c printerConfig) resolve(s *printerSettings) printerConfig {
	if s == nil {
		return c
	}
	if s.Mode != "" {
		c.Mode = s.Mode
		// Manzil rejimga qarab turli maydonga tushadi, lekin interfeysda
		// bitta katak — shuning uchun ikkalasiga ham yoziladi.
		if s.Address != "" {
			c.Address = s.Address
			c.Device = s.Address
		}
	}
	if s.PaperWidth >= 24 && s.PaperWidth <= 64 {
		c.LineWidth = s.PaperWidth
	}
	return c
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println(".env fayl topilmadi, muhit o'zgaruvchilaridan foydalanilmoqda")
	}

	cfg := printerConfig{
		Mode:      os.Getenv("PRINTER_MODE"),
		Address:   os.Getenv("PRINTER_ADDRESS"),
		Device:    os.Getenv("PRINTER_DEVICE"),
		LineWidth: defaultLineWidth,
	}
	if raw := os.Getenv("PRINTER_LINE_WIDTH"); raw != "" {
		if width, err := strconv.Atoi(raw); err == nil && width >= 24 && width <= 64 {
			cfg.LineWidth = width
		} else {
			log.Printf("PRINTER_LINE_WIDTH qiymati noto'g'ri (%q) — %d ishlatiladi", raw, defaultLineWidth)
		}
	}
	port := os.Getenv("HELPER_PORT")
	if port == "" {
		port = "9123"
	}

	if cfg.Mode == "" {
		log.Println("Eslatma: PRINTER_MODE sozlanmagan — sozlama kassa panelidagi " +
			"\"Sozlamalar → Chek printeri\" bo'limidan ham kelishi mumkin")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/print", func(w http.ResponseWriter, r *http.Request) {
		handlePrint(w, r, cfg)
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		withCORS(w)
		w.Write([]byte("ok"))
	})

	log.Printf("Printer yordamchi dasturi http://127.0.0.1:%s manzilida ishga tushdi (rejim: %q)", port, cfg.Mode)
	if err := http.ListenAndServe("127.0.0.1:"+port, mux); err != nil {
		log.Fatalf("Serverni ishga tushirishda xatolik: %v", err)
	}
}

func withCORS(w http.ResponseWriter) {
	// Faqat localhost'da tinglaydi va kassir o'zi ataylab ishga tushiradigan
	// ixtiyoriy lokal vosita bo'lgani uchun kelib chiqishni cheklash shart emas.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func handlePrint(w http.ResponseWriter, r *http.Request, cfg printerConfig) {
	withCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "faqat POST qo'llab-quvvatlanadi", http.StatusMethodNotAllowed)
		return
	}

	var rec receipt
	if err := json.NewDecoder(r.Body).Decode(&rec); err != nil {
		http.Error(w, "chek ma'lumoti noto'g'ri formatda", http.StatusBadRequest)
		return
	}

	// Chek bilan kelgan sozlama .env qiymatlaridan ustun turadi.
	cfg = cfg.resolve(rec.Printer)
	data := buildEscPos(rec, cfg.LineWidth)

	if err := sendToPrinter(cfg, data); err != nil {
		log.Printf("Chop etishda xatolik: %v", err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func sendToPrinter(cfg printerConfig, data []byte) error {
	switch cfg.Mode {
	case "network":
		if cfg.Address == "" {
			return fmt.Errorf("PRINTER_ADDRESS sozlanmagan")
		}
		conn, err := net.DialTimeout("tcp", cfg.Address, 5*time.Second)
		if err != nil {
			return fmt.Errorf("printerga ulanib bo'lmadi (%s): %w", cfg.Address, err)
		}
		defer conn.Close()
		_, err = conn.Write(data)
		return err
	case "file":
		if cfg.Device == "" {
			return fmt.Errorf("PRINTER_DEVICE sozlanmagan")
		}
		f, err := os.OpenFile(cfg.Device, os.O_WRONLY, 0)
		if err != nil {
			return fmt.Errorf("printer qurilmasini ochib bo'lmadi (%s): %w", cfg.Device, err)
		}
		defer f.Close()
		_, err = f.Write(data)
		return err
	default:
		return fmt.Errorf("printer sozlanmagan (PRINTER_MODE bo'sh) — .env faylini to'ldiring")
	}
}

// ESC/POS boshqaruv baytlari — aksariyat termal chek printerlar (Xprinter,
// Epson TM, Rongta va h.k.) shu standart buyruqlarni tushunadi.
const (
	escInit        = "\x1b\x40"     // ESC @  - printerni boshlang'ich holatga qaytarish
	escAlignLeft   = "\x1b\x61\x00" // ESC a 0
	escAlignCenter = "\x1b\x61\x01" // ESC a 1
	escBoldOn      = "\x1b\x45\x01" // ESC E 1
	escBoldOff     = "\x1b\x45\x00" // ESC E 0
	gsCut          = "\x1d\x56\x01" // GS V 1 - qog'ozni kesish (partial cut)

	// defaultLineWidth - 58mm qog'oz uchun belgilar soni.
	// 80mm printer uchun 48 bo'ladi; qiymat sozlamadan keladi.
	defaultLineWidth = 32
)

// orderTypeLabel - stolsiz (online) buyurtmada stol nomi o'rniga turi yoziladi.
var orderTypeLabel = map[string]string{
	"dine_in":  "Stolga",
	"delivery": "Yetkazib berish",
	"pickup":   "Olib ketish",
}

func buildEscPos(r receipt, lineWidth int) []byte {
	if lineWidth < 24 {
		lineWidth = defaultLineWidth
	}

	var b strings.Builder
	b.WriteString(escInit)
	b.WriteString(escAlignCenter)
	b.WriteString(escBoldOn)
	b.WriteString(r.BusinessName + "\n")
	// Hisob-faktura to'langan chek bilan adashtirilmasligi uchun aniq belgilanadi.
	if r.IsPreBill {
		b.WriteString("*** HISOB-FAKTURA ***\n")
		b.WriteString("TO'LANMAGAN\n")
	}
	b.WriteString(escBoldOff)

	b.WriteString(escAlignLeft)
	if r.TableName != nil {
		b.WriteString("Stol: " + *r.TableName + "\n")
	} else if label, ok := orderTypeLabel[r.OrderType]; ok {
		b.WriteString("Buyurtma: " + label + "\n")
	}
	// Stolsiz buyurtmada kuryer/kassir uchun aloqa ma'lumoti chekda bo'lishi shart.
	if r.CustomerPhone != nil && *r.CustomerPhone != "" {
		b.WriteString("Tel: " + *r.CustomerPhone + "\n")
	}
	if r.DeliveryAddress != nil && *r.DeliveryAddress != "" {
		b.WriteString("Manzil: " + *r.DeliveryAddress + "\n")
	}

	if when := receiptTime(r); when != nil {
		b.WriteString(when.Format("2006-01-02 15:04") + "\n")
	}
	b.WriteString(strings.Repeat("-", lineWidth) + "\n")

	for _, it := range r.Items {
		name := it.Name
		if len(name) > lineWidth {
			name = name[:lineWidth]
		}
		b.WriteString(name + "\n")
		right := fmt.Sprintf("x%d  %s", it.Quantity, formatMoney(it.LineTotal))
		b.WriteString(padRight(right, lineWidth) + "\n")
	}
	b.WriteString(strings.Repeat("-", lineWidth) + "\n")

	if r.DiscountAmount > 0 {
		b.WriteString(padLine("Jami:", formatMoney(r.TotalAmount), lineWidth) + "\n")
		b.WriteString(padLine("Chegirma:", "-"+formatMoney(r.DiscountAmount), lineWidth) + "\n")
	}
	b.WriteString(escBoldOn)
	totalLabel := "TO'LANDI:"
	if r.IsPreBill {
		totalLabel = "TO'LANADI:"
	}
	b.WriteString(padLine(totalLabel, formatMoney(r.FinalAmount)+" so'm", lineWidth) + "\n")
	b.WriteString(escBoldOff)

	if len(r.PaymentMethods) > 0 {
		b.WriteString("To'lov: " + strings.Join(r.PaymentMethods, ", ") + "\n")
	}
	if r.TelegramUsername != nil {
		b.WriteString("Mijoz: @" + *r.TelegramUsername + "\n")
	}

	b.WriteString(escAlignCenter)
	if r.IsPreBill {
		b.WriteString("\nTo'lov uchun kassirga murojaat qiling\n\n\n")
	} else {
		b.WriteString("\nXaridingiz uchun rahmat!\n\n\n")
	}
	b.WriteString(gsCut)

	return []byte(b.String())
}

// receiptTime - to'langan chekda to'lov vaqti, hisob-fakturada buyurtma vaqti.
func receiptTime(r receipt) *time.Time {
	if r.PaidAt != nil {
		return r.PaidAt
	}
	return r.CreatedAt
}

func padLine(label, value string, lineWidth int) string {
	spaces := lineWidth - len(label) - len(value)
	if spaces < 1 {
		spaces = 1
	}
	return label + strings.Repeat(" ", spaces) + value
}

func padRight(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return strings.Repeat(" ", width-len(s)) + s
}

func formatMoney(amount float64) string {
	s := fmt.Sprintf("%.0f", amount)
	n := len(s)
	if n <= 3 {
		return s
	}
	var parts []string
	for n > 3 {
		parts = append([]string{s[n-3 : n]}, parts...)
		n -= 3
	}
	parts = append([]string{s[:n]}, parts...)
	return strings.Join(parts, " ")
}
