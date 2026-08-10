# Cafe System — qilingan ishlar hisoboti

Bu fayl shu suhbat davomida loyiha ustida qilingan barcha ishlarning to'liq, tartibli hisobotidir — nima uchun qilingani, qanday qilingani va qayerda ekanligi bilan birga.

---

## 1-bosqich — Loyihani to'liq tekshirish (kod audit)

Backend (`Go + Fiber`) va frontend (`React + Vite`) kodi to'liq o'qib chiqildi. Asosiy topilmalar:

### 🔴 Kritik — biznes(tenant)lararo izolyatsiya buzilgan (IDOR)
Multi-tenant tizimda har bir so'rov faqat o'z `business_id`si doirasida ishlashi kerak edi, lekin bir nechta joyda bu tekshiruv yo'q edi:

- `orders.go`: `ActivateOrder`, `AddItem`, `PayOrder`, `CancelOrder`, `ApplyDiscount` — buyurtma faqat `id` bo'yicha qidirilardi, `business_id` tekshirilmasdi. Demak, boshqa kafening xodimi (agar buyurtma ID'sini bilsa) sizning buyurtmangizni to'lay olardi, bekor qila olardi.
- `tables.go`: `ListTables`, `CreateTable`, `GetTableQRCode` — `floor_id`/`table id` egaligi tekshirilmasdi.
- `menu.go`: `ToggleProductAvailability` — `product_id` egaligi tekshirilmasdi.
- `orders.go`/`qr.go`: mahsulot narxini olishda `business_id` filtri yo'q edi.

### 🟠 Yuqori darajali
- `JWT_SECRET` standart qiymati (`o-zgartiring-bu-maxfiy-kalit`) production'da tekshirilmasdi — kimdir shu kalit bilan token yasab kira olardi.
- `PayOrder` — to'lov summasi buyurtma summasidan kam bo'lsa ham qabul qilinardi.
- `CreateOrder` — mahsulot miqdori manfiy/nol bo'lishi mumkin edi.
- `ApplyDiscount` — chegirma summasi buyurtma summasidan katta bo'lishi mumkin edi.

### ✅ Yaxshi tomonlar
Parollar bcrypt bilan xeshlangan, barcha SQL so'rovlar parametrlangan (SQL-injection yo'q), rol asosidagi ruxsatlar (`RequireRole`) to'g'ri ishlatilgan.

---

## 2-bosqich — Xavfsizlik va validatsiya tuzatishlari

Quyidagi fayllarga tuzatishlar kiritildi:

| Fayl | Nima tuzatildi |
|---|---|
| `backend/internal/handlers/orders.go` | `ActivateOrder`, `AddItem`, `PayOrder`, `CancelOrder`, `ApplyDiscount` — barchasiga `business_id` filtri qo'shildi. `PayOrder`da to'lov summasi `final_amount`dan kam bo'lsa xato qaytariladi. `CreateOrder`da miqdor musbat bo'lishi tekshiriladi. `ApplyDiscount`da chegirma `total_amount`dan oshib ketmasligi tekshiriladi. |
| `backend/internal/handlers/tables.go` | `ListTables`, `CreateTable`, `GetTableQRCode` — floor/stol egaligi `business_id` orqali tasdiqlanadi. |
| `backend/internal/handlers/menu.go` | `ToggleProductAvailability`ga `business_id` filtri qo'shildi. |
| `backend/internal/config/config.go` | `ENVIRONMENT=production` bo'lganda `JWT_SECRET` standart qiymatda qolsa, server ishga tushmaydi (`log.Fatal`). |

Barcha o'zgarishlar `go build` va `go vet` bilan tekshirilib tasdiqlandi.

---

## 3-bosqich — Lokal muhitda to'liq sinov

**Muammo:** Ishlayotgan kompyuterda Docker ham, Go ham o'rnatilmagan edi, sudo huquqi yo'q edi.

**Yechim (root huquqisiz):**
- **Go 1.22** — rasmiy tarball orqali qo'lda o'rnatildi
- **PostgreSQL 17** va **Redis 8** — `apt-get download` (root shart emas) orqali `.deb` fayllar yuklab olinib, `dpkg -x` bilan mahalliy papkaga ajratildi va qo'lda ishga tushirildi

Shu tarzda backend, frontend-admin, PostgreSQL va Redis to'liq ishga tushirilib, demo login, buyurtma, to'lov va hisobot funksiyalari sinovdan o'tkazildi.

**Yo'l-yo'lakay topilgan bug:** QR-menyu endpointida (`qr.go`) mahsulotning `image_url`si `NULL` bo'lsa, `pgx` kutubxonasi qolgan barcha mahsulotlarni **jimgina** tashlab yuborar edi (chunki scan xatosi tekshirilmagan edi). `COALESCE(image_url, '')` bilan tuzatildi, xatolar endi aniq ko'rinadi.

---

## 4-bosqich — Telegram orqali buyurtma tizimi (asosiy yangi funksiya)

**Talab:** Stoldan buyurtma endi kassa panelidan qo'lda emas, balki mijozning o'zi Telegram bot orqali berishi kerak. Kassa paneli faqat kuzatish va to'lov uchun ishlatiladi.

### 4.1. Backend o'zgarishlari

| Fayl | Vazifasi |
|---|---|
| `backend/migrations/003_telegram_receipts.sql` | `orders.receipt_sent_at` ustuni qo'shildi |
| `backend/internal/handlers/telegram.go` | **Yangi.** Telegram WebApp'dan buyurtma qabul qiluvchi endpoint. `initData`ning HMAC-SHA256 imzosini Telegram algoritmi bo'yicha tekshiradi (soxta so'rovlar rad etiladi). Mijozni `telegram_customers`ga yozadi/yangilaydi. Stolda faol buyurtma bo'lsa — unga qo'shadi, bo'lmasa — yangisini ochadi (bitta stol = bitta faol buyurtma). |
| `backend/internal/handlers/receipt.go` | **Yangi.** Chek ma'lumotini shakllantiradi (`GetReceipt`) va Telegram orqali formatlangan matn sifatida yuboradi (`SendReceiptTelegram`). |
| `backend/internal/handlers/orders.go` | `ListActiveOrders` stol nomi va Telegram mijoz (`@username`/ID) ma'lumotini ham qaytaradigan qilindi. |
| `backend/internal/handlers/qr.go` | Menyu javobiga `business_name` va `table_name` qo'shildi (WebApp sarlavhasi uchun). |
| `backend/internal/handlers/tables.go` | `GetTableQRCode` — `TELEGRAM_BOT_USERNAME` sozlangan bo'lsa, QR havolasi endi `https://t.me/<bot>?start=table_<token>` ko'rinishida bo'ladi. |
| `backend/internal/config/config.go` | `TELEGRAM_BOT_TOKEN` sozlamasi qo'shildi. |
| `backend/internal/handlers/routes.go` | Yangi endpointlar ro'yxatdan o'tkazildi: `POST /api/v1/telegram/:table_token/order`, `GET /api/v1/orders/:id/receipt`, `POST /api/v1/orders/:id/send-receipt-telegram`. |

### 4.2. Telegram bot (`telegram-bot/`)

Alohida Go dasturi (mustaqil `go.mod`, faqat `godotenv` bog'liqligi bilan). Tayyor kutubxonalar (`go-telegram-bot-api`, `gotgbot`) WebApp tugmasini qo'llamagani yoki Go 1.24 talab qilgani sabab, **Telegram Bot API'ga to'g'ridan-to'g'ri `net/http` orqali** murojaat qilinadi.

- `/start` buyrug'ida, agar stol QR kodi orqali kelingan bo'lsa (`?start=table_<token>`) — iliq o'zbekcha salomlashuv matni va "🍽️ Menyuni ochish" WebApp tugmasi yuboriladi.
- Sozlamalar: `BOT_TOKEN`, `WEBAPP_URL` (`.env` orqali).

### 4.3. Telegram WebApp (`frontend-telegram/`)

Yangi React+Vite ilova — Telegram WebApp konteynerida ishlaydi:

- Stol tokeniga mos menyuni ko'rsatadi (kategoriya + mahsulotlar)
- Savatga qo'shish, miqdorni o'zgartirish
- Buyurtma berish, tasdiqlash ekrani
- `Telegram.WebApp.initData` orqali autentifikatsiya (soxtalashtirib bo'lmaydi, backend tekshiradi)

### 4.4. Kassa paneli o'zgarishlari (`frontend-admin/src/pages/OrdersPage.tsx`)

- **"+ Yangi buyurtma"** tugmasi va qo'lda buyurtma yaratish formasi olib tashlandi
- Har bir faol buyurtmada endi **stol nomi** va **Telegram `@username`/ID** ko'rinadi
- To'lov endi **ikki bosqichli tasdiqlash** bilan himoyalangan: 1) ma'lumotni ko'rsatish → 2) "Haqiqatan ham tasdiqlaysizmi?" — xato bilan noto'g'ri stolni to'langan deb belgilashning oldini olish uchun

### 4.5. Chek (receipt) oqimi

To'lov tasdiqlangandan so'ng avtomatik ravishda:
1. Chek ma'lumoti backenddan olinadi
2. **Lokal printerga** yuborishga urinadi (`http://127.0.0.1:9123/print`)
3. Agar printer topilmasa/ishlamasa — chek **Telegram orqali** mijozga yuboriladi
4. Ikkalasi ham ishlamasa — kassirga aniq xabar ko'rsatiladi

### 4.6. Printer yordamchisi (`printer-helper/`)

Kassir kompyuterida alohida ishga tushiriladigan kichik Go dasturi:
- `localhost:9123`da tinglaydi, chek JSON'ini qabul qiladi
- ESC/POS formatga o'giradi (sarlavha, mahsulotlar, jami summa, kesish buyrug'i)
- Ikki rejim: **network** (TCP 9100 — tarmoq printerlari uchun standart) yoki **file** (`/dev/usb/lp0` — USB printer uchun)
- Sozlanmagan bo'lsa, xato qaytaradi — shunda kassa paneli avtomatik Telegram'ga o'tadi

**Sinov:** Soxta TCP "printer" bilan chek to'g'ri ESC/POS formatda yetib borgani tasdiqlandi.

---

## 5-bosqich — Haqiqiy bot bilan jonli sinov

Foydalanuvchi haqiqiy bot tokenini berdi: **@restorantest7_bot**.

- Token `backend/.env` va `telegram-bot/.env` fayllariga yozildi (bular `.gitignore`da, git'ga tushmaydi)
- Backend va WebApp'ni tashqi dunyoga vaqtinchalik ochish uchun `ssh -R` orqali `localhost.run` tunnellari ishlatildi (Docker/hosting yo'qligi sabab)
- Bot haqiqiy Telegram serverlariga ulanib, jonli javob berishi tasdiqlandi
- Haqiqiy buyurtma to'liq oqim bilan sinovdan o'tkazildi: bot → WebApp → menyu → savat → buyurtma → kassa panelida ko'rinishi → to'lov → chek

---

## 6-bosqich — Dizayn yangilanishi (chiroyli ko'rinish + rasmlar)

**Talab:** Menyu rasmlar bilan, zamonaviy va chiroyli dizaynda ko'rinishi kerak.

### Telegram WebApp (`frontend-telegram/src/App.tsx`)
- To'q sariq-amber gradientli sarlavha
- Kategoriyalar uchun gorizontal "pill" navigatsiya + **scroll-spy** (aylantirilganda avtomatik yoritiladi)
- Mahsulot kartochkalari: rasm (yoki rasm bo'lmasa — nomga qarab barqaror gradient + emoji), nomi, tavsifi, narxi, +/− stepper
- Chiroyli tasdiqlash ekrani

### Admin panel (`frontend-admin/src/pages/MenuPage.tsx`)
- Mahsulot qo'shish formasiga **"Rasm havolasi"** va **"Tavsif"** maydonlari qo'shildi (avval umuman yo'q edi!)
- Mahsulotlar ro'yxatida endi kichik rasm (yoki emoji-placeholder) ko'rinadi

### Demo ma'lumotlar
`backend/migrations/002_seed_demo.sql`ga Lag'mon va Osh uchun haqiqiy taom rasmlari (Unsplash) qo'shildi.

---

## 7-bosqich — QR-kod rasmi ko'rinmasligi muammosi tuzatildi

**Muammo:** Kassa panelida "QR havola" bosilganda faqat matn (URL) ko'rsatilar edi — haqiqiy QR-rasm hech qachon generatsiya qilinmagan edi (bu asl kodning kamchiligi edi).

**Yechim (`frontend-admin/src/pages/TablesPage.tsx`):**
- `qrcode` npm kutubxonasi qo'shildi
- Endi bosilganda haqiqiy skanerlanadigan QR-rasm ko'rsatiladi
- **"Rasmni yuklab olish"** tugmasi qo'shildi — stol yoniga chop etib qo'yish uchun

---

## 8-bosqich — Buyurtma berishda QR-skaner tasdiqlovi

**Talab:** Mijoz WebApp'da savatga mahsulot solgach, "Buyurtma berish" tugmasini bosganda — stol QR kodini qayta skanerlashi so'ralsin (mijoz haqiqatan ham stol yonida ekanligini tasdiqlash uchun).

**Amalga oshirildi (`frontend-telegram/src/App.tsx`, `telegram.ts`):**
- Telegram'ning o'zining native QR-skaner popup'i (`Telegram.WebApp.showScanQrPopup`) ishlatiladi
- "Buyurtma berish" bosilganda skaner ochiladi → stol QR kodi skanerlanadi → token QR havoladan ajratib olinadi (`table_<token>` qismidan) → shu token bilan buyurtma yuboriladi
- Noto'g'ri QR kod skanerlansa, skaner ochiq qoladi va xato ko'rsatiladi (faqat kafening stol QR kodi qabul qilinadi)
- **Bonus tuzatish:** Telegram'ning WebApp skripti oddiy brauzerda ham yuklanib, `showScanQrPopup` funksiyasi "mavjud" bo'lib ko'rinar, lekin ishlamas edi. Tekshiruv `initData` mavjudligiga asoslanadigan qilindi — bu orqali "faqat Telegram ichida ishlaganda skaner so'ralsin, tashqarida to'g'ridan-to'g'ri yuborilsin" degan mantiq ishonchli ishlaydigan bo'ldi. Bu tuzatish tufayli tashqi brauzerdagi zaxira "Buyurtma berish" tugmasi ham (avval hech qachon ko'rinmagan, endi) to'g'ri ishlay boshladi.

---

## Loyiha tuzilishidagi yangi qo'shimchalar

```
biznes/
├── backend/                     (mavjud edi, kengaytirildi)
│   ├── internal/handlers/telegram.go   ← yangi
│   ├── internal/handlers/receipt.go    ← yangi
│   └── migrations/003_telegram_receipts.sql  ← yangi
├── frontend-admin/              (mavjud edi, o'zgartirildi)
├── frontend-telegram/           ← YANGI papka — Telegram WebApp (React)
├── telegram-bot/                ← YANGI papka — Telegram bot (Go)
├── printer-helper/              ← YANGI papka — chek printer yordamchisi (Go)
└── avazbek-qildi.md             ← ushbu fayl
```

---

## Ishga tushirish yo'riqnomasi (production/real muhitda)

1. **Backend**: `.env.example`dan `.env` yarating, `TELEGRAM_BOT_TOKEN` va `TELEGRAM_BOT_USERNAME`ni to'ldiring, `go run cmd/server/main.go` (yoki docker-compose)
2. **Telegram bot**: `telegram-bot/.env.example`dan nusxa oling, `BOT_TOKEN` va `WEBAPP_URL` (haqiqiy HTTPS domen) to'ldiring, `go run .`
3. **Telegram WebApp**: `frontend-telegram`ni `npm run build` qilib, HTTPS domenga joylashtiring (Telegram WebApp faqat HTTPS'da ishlaydi)
4. **Kassa paneli**: `frontend-admin`ni odatdagidek deploy qiling
5. **Printer yordamchisi (ixtiyoriy)**: har bir kassir kompyuterida `printer-helper/.env`ni sozlab (`PRINTER_MODE=network` yoki `file`), dasturni fonda ishga tushiring

## Muhim eslatmalar

- Suhbat davomida ishlatilgan `localhost.run` tunnellari **vaqtinchalik** edi — sessiya tugagach ishlamay qoladi, faqat sinov uchun
- Bot tokeni va boshqa maxfiy kalitlar faqat `.env` fayllarida (git'ga tushmaydi)
- Kassa panelidan qo'lda buyurtma yaratish backend'da hali mavjud (`POST /orders`), lekin frontend'dan olib tashlangan — kerak bo'lsa kelajakda zahira variant sifatida qaytarish mumkin
