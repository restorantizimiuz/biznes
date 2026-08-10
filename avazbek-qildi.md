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

---

## 9-bosqich — Telegram Mini App'ni "premium restoran ilovasi" darajasiga qayta dizayn qilish

**Talab:** Mavjud Telegram WebApp UI'i "oddiy veb-sayt"ga o'xshab qolgan edi. Backend/API/database'ga tegmasdan, faqat `frontend-telegram/` qatlamini professional, premium darajaga olib chiqish kerak edi — aniq dizayn yo'nalishi (iOS/Telegram uslubi, mobile-first, dark mode, katta taom rasmlari va h.k.) bilan.

### 9.1. Avval qilingan tahlil

- **Mavjud komponentlar:** hammasi bitta `App.tsx` faylida — header, kategoriya pill, 2 ustunli grid, tasdiqlash ekrani.
- **Saqlanishi shart bo'lgan business logic:** `api.ts` (menyu olish/buyurtma yuborish), Telegram `initData` autentifikatsiyasi, 8-bosqichda qo'shilgan QR-skaner orqali buyurtmani tasdiqlash oqimi.
- **Aniqlangan UX muammolari:** qidiruv yo'q edi; "Barchasi" tabsiz kategoriya; mahsulot bosilganda hech narsa ochilmasdi (detail sahifa/sheet yo'q); alohida savat ekrani yo'q edi (to'g'ridan-to'g'ri buyurtma); floating cart bar yo'q; skeleton yuklanish o'rniga oddiy matn; Telegram mavzu (theme) o'zgaruvchilaridan deyarli foydalanilmagan edi; kod komponentlarga bo'linmagan edi.

### 9.2. Yangi dizayn tizimi (`src/index.css`)

Qattiq kodlangan ranglar o'rniga CSS o'zgaruvchilari (design tokens) yaratildi:

- `--color-bg`, `--color-surface`, `--color-text`, `--color-text-secondary`, `--color-border` — bularning barchasi `var(--tg-theme-*, fallback)` orqali aniqlanadi. Telegram WebApp skripti bu o'zgaruvchilarni ildiz elementga avtomatik joylashtiradi, shuning uchun ilova **hech qanday qo'shimcha JS'siz** Telegram'ning haqiqiy light/dark mavzusiga moslashadi.
- `--color-accent` (restoran to'q sarig'i, `#FF6A1A`) — Telegram bermaydigan brend rangi, qorong'i rejimda avtomatik yorqinroq tusga o'tadi (`#FF7A33`) kontrast uchun.
- Qorong'i rejim uchun ikki qatlamli himoya: (1) `prefers-color-scheme: dark` — Telegram tashqarisida OS sozlamasiga moslashish uchun zaxira, (2) `[data-tg-scheme="dark"]` — `App.tsx` Telegram'ning o'zi bergan `colorScheme`ni o'qib qo'yadigan aniq belgi (OS sozlamasidan ustun, chunki foydalanuvchi Telegram ichida mavzuni alohida tanlagan bo'lishi mumkin).
- Shrift: tashqi kutubxona ulamasdan (tezlik uchun) `-apple-system, SF Pro, Inter, Segoe UI...` zanjiri — iOS/Telegram'ga tabiiy mos ko'rinadi.
- Yengil, faqat `transform`/`opacity` ishlatuvchi (GPU-friendly, past quvvatli qurilmalarda ham tez) animatsiya kalitlari: `sheet-slide-up`, `overlay-fade-in`, `bar-pop-in`, `qty-pulse`, `shimmer`, `fade-in-up`.

### 9.3. Yangi komponent arxitekturasi

Bitta katta fayl o'rniga toza bo'lingan tuzilma:

| Fayl | Vazifasi |
|---|---|
| `src/hooks/useCart.ts` | Savat holati (miqdorlar, jami summa, mahsulotlar soni) — barcha funksiyalar `useCallback` bilan barqarorlashtirilgan, shunda kartochkalar keraksiz qayta render bo'lmaydi |
| `src/utils/format.ts` | Pul formatlash (`formatMoney`) |
| `components/Header.tsx` | Ixcham sarlavha: biznes nomidan monogram-logotip + nomi + "📍 Stol" belgisi (soxta reyting/logotip **o'ylab topilmadi** — faqat backenddan kelgan haqiqiy ma'lumot) |
| `components/SearchBar.tsx` | Sticky qidiruv paneli — yuklangan menyu ustida frontendda filtrlaydi (backendga qo'shimcha so'rov yubormaydi) |
| `components/CategoryTabs.tsx` | "Barchasi" + kategoriyalar — gorizontal scroll, sticky, faol tab pill uslubida |
| `components/ProductCard.tsx` | Grid kartochka: rasm (yoki barqaror gradient+emoji placeholder), floating dumaloq +/− stepper, nomi, 2 qatorli tavsif, narx. `React.memo` bilan optimallashtirilgan |
| `components/ProductModal.tsx` | Mahsulot bosilganda ochiladigan bottom sheet — katta rasm, to'liq tavsif, mahalliy stepper, dinamik narxli "Savatga qo'shish" tugmasi |
| `components/QuantityControl.tsx` | Qayta ishlatiladigan +/− stepper (kartochka, modal, savatda bir xil) |
| `components/CartBar.tsx` | Savatda mahsulot bo'lsa pastda suzib turuvchi panel ("N ta mahsulot — summa — Savatni ko'rish →") |
| `components/CartScreen.tsx` | Alohida to'liq ekranli savat: stol nomi, mahsulotlar ro'yxati, jami summa, katta "Buyurtma berish" tugmasi |
| `components/CartItem.tsx` | Savatdagi bitta qator (rasm, nomi, narxi, stepper) |
| `components/ConfirmedScreen.tsx` | Buyurtma tasdiqlangandan keyingi ekran |
| `components/SkeletonCard.tsx` | Professional shimmer-skeleton yuklanish holati ("Loading..." matni o'rniga) |
| `components/EmptyState.tsx` | Umumiy bo'sh/xato holat ko'rsatkichi (bo'sh savat, qidiruv natija bermadi, xato) |
| `App.tsx` | Endi faqat orkestratsiya — ekranlar orasida almashtiradi, holatni boshqaradi |
| `telegram.ts` | Kengaytirildi: `BackButton`, `themeParams`, `setHeaderColor`/`setBackgroundColor`, `onEvent('themeChanged', ...)` turlari qo'shildi |

### 9.4. Yangi foydalanuvchi oqimi

1. **Bosh ekran** — ixcham header, qidiruv, kategoriya tablar (scroll-spy bilan — pastga aylantirilganda tegishli tab avtomatik yoritiladi), 2 ustunli mahsulot grid'i
2. Mahsulot bosilsa → **bottom sheet** ochiladi (katta rasm, tavsif, stepper, dinamik narx)
3. "Savatga qo'shish" bosilsa → sheet yopiladi, pastda **floating cart bar** paydo bo'ladi (animatsiya bilan)
4. Cart bar bosilsa → **Savat ekrani** (Telegram `BackButton` bilan orqaga qaytariladi)
5. "Buyurtma berish" bosilsa → (8-bosqichdagi) **QR-skaner tasdiqlovi** → buyurtma yuborish → **tasdiqlash ekrani**

Bu — 2-3 bosishda buyurtma berish talabiga mos keladi.

### 9.5. Qidiruv mantiqi

Qidiruv maydoniga matn kiritilganda kategoriya tablar yashiriladi va barcha kategoriyalar bo'ylab mos keluvchi mahsulotlar (nomi yoki tavsifi bo'yicha, katta-kichik harflarga sezgir emas) yagona grid'da ko'rsatiladi; hech narsa topilmasa "Hech narsa topilmadi" holati chiqadi.

### 9.6. Sinov jarayonida topilgan va tuzatilgan bug

**Muammo:** `ProductCard`ning tashqi elementi `<button>` qilib yozilgan edi, uning ichida esa `QuantityControl` ham `<button>` render qilardi — natijada brauzer konsolida "button ichida button bo'lishi mumkin emas" degan React hydration xatosi chiqardi (noto'g'ri HTML).

**Tuzatish:** Tashqi element `<div role="button" tabIndex={0} onKeyDown={...}>`ga almashtirildi — bosish va klaviatura orqali ochish ishlaydi, lekin ichki tugmalar endi to'g'ri, standart HTML'ga mos joylashgan.

### 9.7. Sinov natijalari

- ✅ `npm run build` (`tsc -b && vite build`) — xatosiz
- ✅ `npx oxlint` — muammo topilmadi
- ✅ Brauzer konsoli — faqat Telegram SDK'ning zararsiz "not supported in version 6.0" ogohlantirishlari (bular skript oddiy brauzerda eski versiyani simulyatsiya qilgani uchun chiqadi; haqiqiy Telegram ilovasida umuman ko'rinmaydi)
- ✅ To'liq foydalanuvchi oqimi qo'lda sinovdan o'tkazildi: menyu → mahsulot modal → savatga qo'shish → cart bar → savat ekrani → "Buyurtma berish" (Telegram autentifikatsiyasi to'g'ri ishlagani, ya'ni business logic buzilmagani tasdiqlandi)
- ✅ Qidiruv funksiyasi sinovdan o'tdi ("osh" deb yozilganda faqat "Osh" qoldi)
- ✅ **Mobil** (375px kenglik — iPhone SE o'lchami): 2 ustunli grid, barcha elementlar mos tushdi
- ✅ **Desktop** (1041px): menyu markazlashtirilgan `max-width` konteynerda, atrofida bo'sh joy chiroyli
- ✅ **Qorong'i rejim** (`data-tg-scheme="dark"` orqali simulyatsiya qilindi): barcha ekranlar (menyu, cart bar, savat) to'g'ri, chiroyli qorong'i ranglarga o'tdi — qattiq kodlangan rang qolmagani tasdiqlandi

### 9.8. Ataylab bajarilmagan narsalar (va sababi)

Dizayn brifida so'ralgan, lekin backend/API'da mos ma'lumot bo'lmagani sabab **qo'shilmadi** (foydalanuvchi aniq "backend/API/databasega tegma" deb so'ragan edi, soxta ma'lumot ko'rsatish esa noto'g'ri bo'lardi):

- Mahsulot detalidagi **"Tarkibi" (ingredientlar) ro'yxati** — bunday maydon `Product`da yo'q
- Buyurtma paytidagi **"Izoh" (comment) maydoni** — backend `POST /telegram/:table_token/order` bunday parametrni qabul qilmaydi
- Header'dagi **"⭐ 4.8" reyting** misoli — bunday ma'lumot backendda yo'q, shuning uchun o'rniga faqat haqiqiy ma'lumotlar (biznes nomi, stol) ko'rsatildi

Bularni qo'shish uchun kelajakda backend'ga kichik qo'shimchalar kerak bo'ladi (masalan `order_comment` ustuni, `ingredients` maydoni).

### 9.9. Yangi/o'zgargan fayllar ro'yxati (to'liq)

```
frontend-telegram/src/
├── App.tsx                        ← to'liq qayta yozildi (orkestrator)
├── index.css                      ← to'liq qayta yozildi (dizayn tokenlari + animatsiya)
├── telegram.ts                    ← kengaytirildi (BackButton, theme, va h.k.)
├── types.ts                       ← o'zgarishsiz
├── api.ts                         ← o'zgarishsiz (business logic buzilmadi)
├── hooks/
│   └── useCart.ts                 ← yangi
├── utils/
│   └── format.ts                  ← yangi
└── components/                    ← barchasi yangi
    ├── Header.tsx
    ├── SearchBar.tsx
    ├── CategoryTabs.tsx
    ├── ProductCard.tsx
    ├── ProductModal.tsx
    ├── QuantityControl.tsx
    ├── CartBar.tsx
    ├── CartItem.tsx
    ├── CartScreen.tsx
    ├── ConfirmedScreen.tsx
    ├── SkeletonCard.tsx
    └── EmptyState.tsx
```

**Tegilmagan qatlamlar:** `backend/`, `telegram-bot/`, `printer-helper/`, `frontend-admin/` — hech biriga o'zgartirish kiritilmadi.
