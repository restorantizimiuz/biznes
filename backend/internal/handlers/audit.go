package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
)

// Audit jurnaliga yoziladigan amallar ro'yxati.
// Matn qiymatlari bazada saqlanadi, shuning uchun ular o'zgartirilmaydi —
// frontend shu kalitlar bo'yicha tarjima qiladi.
const (
	AuditOrderCreated         = "order_created"
	AuditOrderActivated       = "order_activated"
	AuditItemAdded            = "item_added"
	AuditItemRemoved          = "item_removed"
	AuditItemQtyChanged       = "item_qty_changed"
	AuditDiscountApplied      = "discount_applied"
	AuditOrderPaid            = "order_paid"
	AuditOrderCancelled       = "order_cancelled"
	AuditKitchenStatusChanged = "kitchen_status_changed"
	AuditEditedAfterClose     = "order_edited_after_close"
	AuditReceiptPrinted       = "receipt_printed"
)

// auditEntry - bitta jurnal yozuvi.
//
// UserID xodim amali uchun to'ldiriladi (ism o'qish paytida users jadvalidan
// olinadi — shunda xodim ismini o'zgartirsa tarix ham to'g'ri qoladi).
// ActorLabel esa mijoz amallari uchun: "Telegram mijoz", "QR mijoz".
type auditEntry struct {
	BusinessID string
	UserID     string
	ActorLabel string
	OrderID    string
	Action     string
	Details    map[string]any
}

// writeAudit - jurnalga yozadi.
//
// MUHIM: bu funksiya hech qachon asosiy amalni to'xtatmaydi. Jurnalga yozib
// bo'lmasa xato log'ga chiqariladi, lekin buyurtma baribir saqlanadi —
// hisobot uchun yordamchi ma'lumot yo'qolgani ish jarayonini to'xtatishga
// asos bo'lmaydi.
//
// Shuningdek u ataylab **tranzaksiyadan tashqarida**, commit'dan keyin
// chaqiriladi: PostgreSQL'da tranzaksiya ichidagi bitta xato butun
// tranzaksiyani bekor qiladi, ya'ni jurnal xatosi buyurtmani ham
// yo'qotib yuborardi.
func writeAudit(ctx context.Context, db dbExecutor, e auditEntry) {
	var details []byte
	if e.Details != nil {
		encoded, err := json.Marshal(e.Details)
		if err != nil {
			log.Printf("audit: tafsilotlarni JSON qilishda xatolik (%s): %v", e.Action, err)
		} else {
			details = encoded
		}
	}

	_, err := db.Exec(ctx,
		`INSERT INTO audit_log (business_id, user_id, actor_label, order_id, action, details)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		e.BusinessID, nullIfEmpty(e.UserID), nullIfEmpty(e.ActorLabel), nullIfEmpty(e.OrderID),
		e.Action, details)
	if err != nil {
		log.Printf("audit: jurnalga yozib bo'lmadi (%s, order=%s): %v", e.Action, e.OrderID, err)
	}
}

// describeItem - jurnalda taomni odam o'qiy oladigan ko'rinishda yozish uchun:
// "Osh ×2". Bir necha taom qo'shilganda ular shu ko'rinishda ro'yxatga yig'iladi,
// shunda hisobotda "Kassir Ali: Osh ×2, Lag'mon ×1 qo'shdi" deb chiqadi.
func describeItem(name string, quantity int) string {
	return fmt.Sprintf("%s ×%d", name, quantity)
}
