// Package notify - kassa paneliga real-time bildirishnoma yuborish uchun
// server ichidagi oddiy "hub" (nashr/obuna).
//
// Nega Redis emas? Redis Publish tashqi xizmatga bog'liq: u o'rnatilmagan yoki
// o'chgan bo'lsa bildirishnoma jimgina yo'qoladi (loyihada aynan shunday bo'lib
// turgan edi — xatolar e'tiborsiz qoldirilardi). Bildirishnoma esa kassir uchun
// asosiy ish vositasi, shuning uchun u tashqi xizmatsiz, server jarayonining
// o'zida ishlaydi.
//
// Redis kelajakda **qo'shimcha** qatlam sifatida kerak bo'ladi: bir nechta
// server nusxasi ishlaganda, boshqa nusxada yaratilgan buyurtmani ham eshitish
// uchun. Bitta nusxa uchun esa shu hub yetarli.
package notify

import "sync"

// Event - kassa paneliga yuboriladigan bildirishnoma.
type Event struct {
	Event     string  `json:"event"` // new_order, order_updated, order_activated, ...
	OrderID   string  `json:"order_id"`
	TableID   string  `json:"table_id,omitempty"`
	TableName string  `json:"table_name,omitempty"`
	Source    string  `json:"source,omitempty"`     // qr, online_telegram, cashier, waiter
	OrderType string  `json:"order_type,omitempty"` // dine_in, delivery, pickup
	Amount    float64 `json:"amount,omitempty"`
	// FromCustomer - buyurtmani mijoz o'zi yuborganmi (QR/Telegram).
	// Faqat shunday hodisalarda kassa panelida ovoz chiqadi: kassir o'zi
	// kiritgan buyurtma uchun signal berish keraksiz shovqin bo'lardi.
	FromCustomer bool `json:"from_customer"`
}

// subscriberBuffer - har bir obunachi kanalining sig'imi. Kichik bufer yetarli:
// bildirishnomalar kichik va tez o'qiladi, to'lib qolsa (mijoz brauzeri qotib
// qolgan bo'lsa) eng eskisi tashlab yuboriladi.
const subscriberBuffer = 16

type Hub struct {
	mu   sync.RWMutex
	subs map[string]map[chan Event]struct{} // business_id -> obunachilar
}

func NewHub() *Hub {
	return &Hub{subs: make(map[string]map[chan Event]struct{})}
}

// Subscribe - berilgan kafe hodisalariga obuna bo'ladi.
// Qaytarilgan funksiya obunani bekor qiladi (WebSocket uzilganda chaqiriladi).
func (h *Hub) Subscribe(businessID string) (<-chan Event, func()) {
	ch := make(chan Event, subscriberBuffer)

	h.mu.Lock()
	if h.subs[businessID] == nil {
		h.subs[businessID] = make(map[chan Event]struct{})
	}
	h.subs[businessID][ch] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			h.mu.Lock()
			if set, ok := h.subs[businessID]; ok {
				delete(set, ch)
				if len(set) == 0 {
					delete(h.subs, businessID)
				}
			}
			h.mu.Unlock()
			close(ch)
		})
	}
	return ch, unsubscribe
}

// Publish - kafening barcha ochiq panellariga hodisani yuboradi.
//
// Yuborish **bloklanmaydi**: obunachining buferi to'la bo'lsa hodisa tashlab
// yuboriladi. Aks holda javob bermayotgan bitta brauzer buyurtma yaratish
// so'rovini butunlay to'xtatib qo'yishi mumkin edi.
func (h *Hub) Publish(businessID string, e Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch := range h.subs[businessID] {
		select {
		case ch <- e:
		default:
		}
	}
}
