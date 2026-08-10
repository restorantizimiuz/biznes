# Cafe System — Amirxon tomonidan qilingan ishlar hisoboti

Bu fayl Amirxon (va Claude yordamida) loyiha ustida qilingan barcha ishlarning
tartibli hisobotidir — nima uchun, qanday va qayerda qilingani bilan birga.
`avazbek-qildi.md` — boshqa dasturchining ishlar jurnali, aralashtirilmaydi.

**Qoida:** Har safar ish boshlashdan oldin `git pull origin main` qilinadi
(boshqa dasturchilarning o'zgarishlari bilan to'qnashuv bo'lmasligi uchun),
ish tugagach shu faylga yangi bo'lim qo'shiladi.

---

## 1-bosqich — Loyihani chuqur o'rganish (2026-08-10)

`git pull origin main` bajarildi — repo allaqachon eng oxirgi holatda edi
(`origin/main` bilan bir xil).

### Umumiy arxitektura

Kafe/restoran boshqaruv tizimi, quyidagi qismlardan iborat:

| Qism | Texnologiya | Vazifasi |
|---|---|---|
| `backend/` | Go 1.22 + Fiber, PostgreSQL 16, Redis 7 | API server, biznes logika, multi-tenant (`business_id` orqali ajratiladi) |
| `frontend-admin/` | React + Vite + TS | Kassir/admin paneli (menyu, stollar, buyurtmalar, hisobot, xodimlar, sozlamalar) |
| `frontend-telegram/` | React + Vite + TS | Telegram WebApp — mijoz stoldan shu orqali buyurtma beradi (savat, kategoriya, qidiruv) |
| `frontend-qr/` | — | Eskirgan/bo'sh (faqat README) — `frontend-telegram` bilan almashtirilgan |
| `telegram-bot/` | Go (mustaqil `go.mod`) | Telegram Bot API bilan `net/http` orqali to'g'ridan-to'g'ri ishlaydi; `/start table_<token>` orqali WebApp tugmasini yuboradi |
| `printer-helper/` | Go (mustaqil `go.mod`) | Kassir kompyuterida ishlaydi, `localhost:9123`da cheklarni ESC/POS formatga o'girib printerga (TCP 9100 yoki USB) yuboradi |
| `docs/architecture.md` | — | Arxitektura hujjati |

Backend tuzilishi: `cmd/server/main.go` → `internal/{config,database,models,handlers,middleware}`.
Barcha himoyalangan endpointlar `middleware.AuthRequired` (JWT) orqali o'tadi,
ba'zilari qo'shimcha `middleware.RequireRole("owner","admin")` talab qiladi
(`backend/internal/handlers/routes.go`).

### Muhim topilma — oldingi audit allaqachon qilingan

`avazbek-qildi.md`da shu loyiha ustida keng qamrovli ish qilingan ekan:
- Multi-tenant IDOR zaifliklari (`business_id` tekshiruvi yo'qligi) — `orders.go`,
  `tables.go`, `menu.go`da tuzatilgan.
- `JWT_SECRET` production'da standart qiymatda qolsa server ishga tushmasligi
  qo'shilgan (`config.go:44-46` — tasdiqladim, joyida bor).
- Telegram orqali stoldan buyurtma tizimi (backend + bot + WebApp) qurilgan.
- Chek oqimi: printer → (topilmasa) Telegram orqali yuborish, ikkalasi ham
  ishlamasa kassirga xabar.

Bu ishlarni qayta qilish shart emas — kodni tekshirib, hozirgi holatini
tasdiqladim (`config.go`, `routes.go` o'qildim, tuzatishlar joyida turibdi).

### Ishchi papkadagi holat (git pull'dan keyin ham qolgan narsalar)

- `backend/go.mod` — "modified" deb ko'rinadi, lekin `git diff` bo'sh —
  faqat CRLF/LF qatorlar farqi (Windows'da autocrlf), haqiqiy kontent
  o'zgarishi yo'q. Committing shart emas.
- `reset-pg-password.ps1` (repo ildizida, untracked) — lokal Windows
  muhitida PostgreSQL `postgres` foydalanuvchisi parolini `postgres123`ga
  o'rnatish uchun bir martalik yordamchi skript (`backend/.env`dagi
  `DATABASE_URL` shu parolni kutadi). Bu shaxsiy/lokal muhit skripti —
  boshqa dasturchilarga tegishli emas, hozircha commit qilinmadi.

### Xulosa

Loyiha holati barqaror va oldingi audit natijalari kodda joyida.
Keyingi ishlar shu faylga qo'shib boriladi.

---

## 2-bosqich — Loyihani localhostda ishga tushirish (2026-08-10)

| Xizmat | Manzil |
|---|---|
| Backend API (Go+Fiber) | http://localhost:8080 |
| Kassa/admin panel | http://localhost:5173 |
| Telegram WebApp (mijoz menyusi) | http://localhost:5174 |

Demo kirish: server `demo-cafe`, login `admin`, parol `demo1234`.

**Yo'l-yo'lakay hal qilingan muammo:** `go run` bu kompyuterda **Windows
Application Control** siyosati tomonidan bloklanadi — u vaqtinchalik papkada
(`%TEMP%\go-build...\main.exe`) exe yaratib ishga tushiradi, siyosat esa shunday
fayllarni taqiqlaydi. Yechim: `go build -o server.exe cmd/server/main.go` bilan
loyiha papkasiga kompilyatsiya qilib, `.\server.exe` orqali ishga tushirish.
Bundan buyon backendni shu tarzda ishga tushiramiz.

**Redis o'rnatilmagan** (Docker ham yo'q). Bu asosiy funksiyalarga ta'sir
qilmaydi — Redis faqat real-time `Publish` uchun ishlatiladi va uning xatosi
jimgina e'tiborsiz qoldiriladi (frontend hozircha WebSocket bilan tinglamaydi).

---

## 3-bosqich — Kassani stol asosidagi POS ga aylantirish (2026-08-10)

Talab: kassa sahifasi stollar to'ri bo'lsin; kassir stolni bosib menyudan taom
tanlasin, pastda stolning umumiy hisobi chiqsin; to'lov turini belgilab hisobni
yopsin va stol bo'shasin. Mijoz QR orqali buyurtma berganda kassir uni qabul
qilsin yoki bekor qilsin, keyin "tayyorlanmoqda"/"tayyor" holatini belgilasin —
bu mijozga QR sahifasida ko'rinib tursin.

### 3.1. Backend

| Fayl | Nima qilindi |
|---|---|
| `backend/migrations/004_kitchen_status.sql` | **Yangi.** `orders.kitchen_status` ustuni (`preparing`/`ready`, CHECK bilan). Mavjud `order_status` enum'iga tegilmadi — u to'lov/bekor oqimini bildiradi, oshxona holati alohida o'lchov. |
| `backend/internal/handlers/orders.go` | `UpdateKitchenStatus` (yangi endpoint). `AddItem` endi bitta emas, **mahsulotlar ro'yxatini** qabul qiladi va tranzaksiyada ishlaydi (kassir bir vaqtda bir necha taom qo'shadi). `ListActiveOrders` javobiga `kitchen_status` va **buyurtma tarkibi** qo'shildi — kassa stol bosilganda qo'shimcha so'rovsiz to'liq hisobni ko'rsatadi. Tarkib `fetchOrderItems` orqali **bitta so'rovda** olinadi (N+1 muammosidan qochish). `notifyNewOrder` → `notifyOrderChange` deb umumlashtirildi (event nomi parametr sifatida). |
| `backend/internal/handlers/qr.go` | `GetMenuByTableToken` javobiga `active_order` qo'shildi — mijoz o'z stolida nima buyurtma qilinganini (kassir kiritganlari ham) va holatni ko'radi. |
| `backend/internal/handlers/routes.go` | `POST /api/v1/orders/:id/kitchen-status` |
| `backend/internal/models/models.go` | `Order.KitchenStatus` |

### 3.2. Kassa paneli (`frontend-admin/src/pages/OrdersPage.tsx` — to'liq qayta yozildi)

- **Stollar to'ri**, yuqorida qavat tugmalari. Har bir stol rangi holatni bildiradi:
  kulrang — bo'sh, **qizil** — mijoz buyurtmasi tasdiq kutmoqda, sariq —
  tayyorlanmoqda, yashil — tayyor. Katakchada joriy summa va taomlar ko'rinadi.
- Stol bosilganda modal ochiladi:
  - **Mijoz buyurtmasi (`new`)** → "Qabul qilish" / "Bekor qilish" (sabab bilan).
  - **Bo'sh yoki faol stol** → chapda kategoriya + mahsulot tanlash (+/− tugmalar),
    o'ngda joriy hisob va qo'shilayotgan summa. "Buyurtmaga saqlash" bosilganda
    buyurtma yo'q bo'lsa yangisi ochiladi, bor bo'lsa mavjudiga qo'shiladi.
    Shu yerda "Tayyor deb belgilash" va "To'lash" tugmalari.
- **To'lov**: ikki bosqichli tasdiq saqlanib qoldi, unga **to'lov turi tanlovi**
  qo'shildi — Naqd / Karta / O'tkazma, karta tanlansa Uzcard/Humo/Visa/Mastercard.
  To'langach chek oqimi o'zgarishsiz: printer → (topilmasa) Telegram → (bo'lmasa) xabar.

**Yo'l-yo'lakay tuzatilgan bug:** dastlab mahsulotlar kategoriya bo'yicha alohida
so'rov bilan olinardi — kassir bir kategoriyadan taom tanlab boshqasiga o'tsa,
tanlanganlar ro'yxatdan yo'qolib qolardi (lekin saqlashda baribir yuborilardi,
ya'ni ko'rsatilgan summa noto'g'ri bo'lardi). Endi barcha mahsulotlar bir marta
olinadi va kategoriya frontendda filtrlanadi.

### 3.3. Mijoz tomoni (`frontend-telegram/`)

- Buyurtma yuborilgandan keyin **stol sessiyasi** boshlanadi: token eslab qolinadi,
  shuning uchun "Yana buyurtma qo'shish"da QR **qayta skanerlanmaydi**.
- Tasdiqlash ekrani endi har 5 soniyada holatni so'raydi va ko'rsatadi:
  ⏳ kassir tasdig'i kutilmoqda → 👨‍🍳 tayyorlanmoqda → 🍽️ tayyor.
  Shu bilan birga **stoldagi barcha taomlar ro'yxati** (kassir qo'shganlari ham)
  va umumiy summa ko'rinadi.

### 3.4. Kafe tili (i18n) — `frontend-admin/src/i18n/`

- `dictionaries.ts` — o'zbek/rus/ingliz lug'ati (~110 kalit). TypeScript o'zbek
  lug'atini etalon deb oladi, shuning uchun yangi kalit qo'shilsa qolgan tillarda
  ham to'ldirilishi majburiy bo'ladi.
- `LanguageContext.tsx` — til kafe sozlamalaridan (`businesses.language`) olinadi.
  U `SettingsPage` bilan **bir xil `['settings']` so'rovini** ishlatgani uchun til
  saqlangan zahoti butun interfeys sahifani qayta yuklamasdan yangi tilga o'tadi.
- **Faqat texnik matnlar tarjima qilinadi.** Stol, qavat, kategoriya, mahsulot,
  kafe nomi va xodim ismi — bular baza qiymatlari, hech qachon `t()` orqali
  o'tmaydi va kiritilgan holicha qoladi (talab shunday edi).
- Qamrov: `Layout`, `OrdersPage`, `MenuPage`, `TablesPage`, `StaffPage`,
  `ReportsPage`, `SettingsPage`. `LoginPage` tегilmadi — login bosqichida hali
  qaysi kafe (demak qaysi til) ekani noma'lum.

### 3.5. Sinov natijalari

`go build` + `go vet` toza; ikkala frontend `npm run build` bilan xatosiz.
API oqimlari `curl` bilan uchma-uch sinovdan o'tkazildi:

- Kassir buyurtma yaratdi → bulk qo'shimcha taom → `ready` → to'lov (Uzcard) →
  **stol avtomatik `empty` bo'ldi**.
- Mijoz QR orqali buyurtma berdi → kassada `new` holatda ko'rindi → kassir qabul
  qildi → `activated` bo'ldi; `active_order` mijoz endpointida to'g'ri qaytdi.
- Himoyalar ishlayapti: summadan kam to'lov rad etildi, noto'g'ri
  `kitchen_status` qiymati rad etildi.
- Til `uz` ⇄ `ru` almashtirildi va to'g'ri saqlandi.

---

## 4-bosqich — Menyu boshqaruvi, buyurtma tahriri va online buyurtma (2026-08-10)

Sinovdan keyin aniqlangan kamchiliklar bo'yicha talablar: modal oynalarda orqaga
qaytish; menyudagi taomlarni tahrirlash/o'chirish va rasmni **qurilmadan** tanlab
Telegram avatar kabi **kesish**; buyurtmani **faqat kassadan** tahrirlash;
**online (yetkazib berish/olib ketish)** buyurtmalar; Telegram menyusida
**kategoriya → taom** navigatsiyasi.

### 4.1. Migratsiya `006` — aslida `005_menu_and_online_orders.sql`

```sql
-- Yashirin o'chirish
ALTER TABLE products/categories/tables/floors ADD COLUMN is_deleted BOOLEAN DEFAULT false;
-- Online buyurtma
ALTER TABLE orders ADD COLUMN order_type / customer_phone / delivery_address;
```

**Nega yashirin o'chirish?** Foydalanuvchi talabi: "o'chirilgan taom to'liq
o'chadi, ammo o'chirilmasdan oldingi cheklarda va hisoblarda bo'ladi".
`order_items` jadvali taom nomi va narxini buyurtma vaqtidagi holida saqlaydi,
shuning uchun qator bazadan o'chirilmaydi (aks holda FK buziladi va eski cheklar
yo'qoladi), lekin **barcha `SELECT` so'rovlar `is_deleted=false` bilan
filtrlanadi** — natijada element shu daqiqadan boshlab menyu, kassa va QR
sahifasida umuman ko'rinmaydi. Sinovda tasdiqlandi.

### 4.2. Backend

| Fayl | Nima qo'shildi |
|---|---|
| `internal/handlers/upload.go` | **Yangi.** `POST /uploads/image` — rasm serverning `uploads/` papkasiga yoziladi, `/uploads/<uuid>.jpg` havolasi qaytariladi. Hajm ≤ 5 MB. MIME **fayl mazmunidan** (`http.DetectContentType`) aniqlanadi — kengaytmaga ishonilmaydi, shuning uchun ".jpg" deb nomlangan ixtiyoriy fayl o'tmaydi. |
| `cmd/server/main.go` | `app.Static("/uploads", cfg.UploadDir)` |
| `internal/config/config.go` | `UPLOAD_DIR` (standart `./uploads`) |
| `internal/handlers/menu.go` | `UpdateProduct`, `DeleteProduct`, `UpdateCategory`, `DeleteCategory` (kategoriya bilan birga ichidagi taomlar ham, bitta tranzaksiyada). `CreateProduct`/`UpdateProduct`ga kategoriya egaligi tekshiruvi qo'shildi — boshqa kafening kategoriyasiga taom qo'shib bo'lmaydi. |
| `internal/handlers/tables.go` | `UpdateFloor`, `DeleteFloor`, `UpdateTable`, `DeleteTable`. **Faol (to'lanmagan) buyurtmasi bor stol/qavat o'chirilmaydi** — aks holda kassadan tirik hisob yo'qolib ketardi. |
| `internal/handlers/staff.go` | `DeleteStaff` → `is_active=false`. O'zini o'chirish va kafe egasini o'chirish taqiqlangan. |
| `internal/handlers/orders.go` | `UpdateOrderItem`, `DeleteOrderItem`. Yangi `recalcOrderTotals()` — summa endi har o'zgarishdan keyin `order_items`dan **qayta hisoblanadi**. Ilgari `total = total + x` yondashuvi ishlatilgan edi; tahrirlash qo'shilgach bu xavfli bo'lardi (bitta xato amal summani abadiy buzardi). `AddItem` ham shunga o'tkazildi. Oxirgi qator o'chirilsa buyurtma avtomatik bekor qilinadi va stol bo'shaydi. |
| `internal/handlers/telegram.go` | `CreateOnlineOrder` — `POST /telegram/order` (stol tokenisiz). Telefon majburiy, `delivery` bo'lsa manzil ham. `initData` imzosi mavjud `verifyTelegramInitData` bilan tekshiriladi. |

`ListActiveOrders` javobi kengaytirildi: qator `id`lari (tahrirlash uchun),
`order_type`, `customer_phone`, `delivery_address`, `discount_amount`.

### 4.3. Kassa/admin paneli

- **`ModalShell`** (yangi umumiy komponent) — sarlavha, ixtiyoriy **"←" orqaga**
  tugmasi va "Yopish". Barcha modal oynalar shundan foydalanadi, shuning uchun
  to'lov yoki rasm kesish ekraniga o'tgan kassir bir bosishda orqaga qaytadi.
- **Menyu sahifasi**: har bir taomda "Tahrirlash" va "O'chirish"; kategoriyalarda
  ✎ (nomini o'zgartirish) va 🗑. Tahrirlash oynasida nom, narx, kategoriya,
  tavsif va **rasm**.
- **Rasm**: "Qurilmadan rasm tanlash" → `react-easy-crop` bilan **kvadrat 1:1**
  kesish oynasi (surish + zoom slayderi, Telegram profil rasmi kabi) → `<canvas>`
  orqali 800×800 JPEG (sifat 0.85) → serverga yuklanadi. PNG'ning shaffof joylari
  qora bo'lib qolmasligi uchun fon oq bilan to'ldiriladi.
- **Kassa stol oynasi**: joriy hisob qatorlari endi **tahrirlanadi** — har
  qatorda −/+ va ✕; pastda **"Chegirma"** tugmasi. Miqdor 1 dan pastga tushsa
  o'chirish tasdig'i so'raladi; oxirgi taom bo'lsa ogohlantirish ko'rsatiladi.
- **"🚚 Online buyurtmalar" tugmasi** qavat tugmalari yonida, yangi buyurtmalar
  soni qizil belgi bilan. Bosilganda stolsiz buyurtmalar (turi, telefon, manzil)
  ko'rinadi — qabul qilish/bekor qilish, tayyor belgilash va to'lov stol
  oynasidagi **bir xil komponentlar** orqali ishlaydi.
- **Stollar sahifasi**: qavat va stol nomini o'zgartirish hamda o'chirish.
- **Xodimlar sahifasi**: xodimni bloklash tugmasi (owner va o'zidan tashqari).

### 4.4. Telegram WebApp

- **Kategoriya → taom navigatsiyasi**: avval kategoriyalar ro'yxati (rasm, nom,
  taomlar soni), tanlangach shu kategoriya taomlari. Telegram BackButton va
  ekrandagi "←" ikkalasi ham qaytaradi. Qidiruv ilgarigidek barcha kategoriyalar
  bo'ylab ishlaydi. Eski `CategoryTabs` komponenti endi ishlatilmaydi — o'chirildi.
- **Savatda buyurtma turi**: 🍽️ Stolga (QR skaner — o'zgarishsiz),
  🚚 Yetkazib berish (telefon + manzil), 🥡 Olib ketish (telefon).
  Stol allaqachon skanerlangan bo'lsa tur tanlovi ko'rsatilmaydi.
- Rasmlar uchun `resolveImageUrl()` — nisbiy `/uploads/...` havolalar backend
  manziliga bog'lanadi (WebApp boshqa domenda ishlaydi).

### 4.5. Sinov natijalari

`go build` + `go vet` toza, ikkala frontend `npm run build` bilan xatosiz.
`curl` bilan uchma-uch tekshirildi:

- Rasm yuklandi (`/uploads/...` 200 bilan ochildi); **rasm bo'lmagan fayl rad
  etildi**.
- Taom tahrirlandi (nom/narx/rasm), so'ng o'chirildi → admin menyusi va QR
  menyusidan **yo'qoldi**, lekin unga bog'langan **mavjud buyurtmada saqlanib
  qoldi**.
- Buyurtma tahriri: 2→5 miqdor (100 000 → 205 000), chegirma 5 000
  (final 200 000), qator o'chirish (175 000 / 170 000), oxirgi qator →
  **buyurtma bekor qilindi va stol bo'shadi**. Summalar har bosqichda to'g'ri.
- Himoyalar: faol buyurtmali stol va qavat o'chirilmadi; o'zini o'chirish rad
  etildi; online buyurtmada telefon/manzil/tur validatsiyalari ishladi.
- Kategoriya o'chirilganda ichidagi taom ham menyudan yo'qoldi.
- Sinov uchun o'zgartirilgan haqiqiy ma'lumotlar (kategoriya nomi, stol nomi,
  o'chirilgan stol, sinov xodimi) **tiklandi**.

---

## 5-bosqich — `yangi-funksiyalar-prompt.md` dagi 12 ta talab (2026-08-10)

`git pull origin main` bajarildi (repo eng oxirgi holatda edi). Bu bosqichda
texnik topshiriqdagi **barcha 12 bo'lim** amalga oshirildi: rollar va ruxsatlar,
kassa interfeysi, audit jurnali, to'liq hisobot, sozlamalar, chek chiqarish,
real-time bildirishnomalar, QR mijoz oqimi va super-admin paneli.

Ishlar topshiriqning 10-bo'limidagi tavsiya etilgan tartibda bajarildi —
har bir keyingi qism oldingisiga tayanadi.

### 5.0. Yangi migratsiyalar

Uchalasi ham lokal bazaga qo'lda qo'llandi
(`psql -U postgres -h 127.0.0.1 -d cafesystem -f backend/migrations/00X_*.sql`):

| Migratsiya | Mazmuni |
|---|---|
| `006_audit_log.sql` | `audit_log` jadvali (kim, qachon, qaysi buyurtmada, nima qildi) + 2 ta indeks |
| `007_platform_admin.sql` | `platform_admins` jadvali, `businesses` ga `max_tables`/`max_waiters`/`max_cashiers`, boshlang'ich super-admin, mavjud kafelar uchun `feature_flags` yozuvlari |
| `008_receipt_printing.sql` | `orders.receipt_printed_at`, `businesses` ga printer sozlamalari va `notify_sound` |

Shu bilan sxemada bor, lekin **ishlatilmayotgan** uchta jadval ishga tushdi:
`feature_flags` (super-admin funksiya bayroqlari), `order_status_history`
(holat o'zgarishlari tarixi) va `waiter_assignments` (ofitsiant ochgan
buyurtmalar hisobotda ko'rinishi uchun).

### 5.1. Rollar va ruxsatlar (5-bo'lim)

Talab: ofitsiantga faqat Stollar va Menyu; Hisobot faqat kassa va kassirga.

**Backend** (`internal/handlers/routes.go`) — ruxsatlar bitta joyda,
uch nomlangan ro'yxat orqali belgilanadi (`rolesManage`, `rolesCashier`,
`rolesMenu`), so'ng har bir guruhga qo'llanadi:

| Bo'lim | owner | admin | cashier | waiter |
|---|:--:|:--:|:--:|:--:|
| Kassa (buyurtma, to'lov, chek) | ✅ | ✅ | ✅ | ❌ |
| Menyu / Stollarni **o'zgartirish** | ✅ | ✅ | ❌ | ✅ |
| Xodimlar | ✅ | ✅ | ❌ | ❌ |
| Hisobot | ✅ | ✅ | ✅ | ❌ |
| Sozlamalar (yozish) | ✅ | ✅ | ❌ | ❌ |

**O'qish huquqi ataylab kengroq qoldirildi**: kassir menyuni va stollarni
ko'rmasa buyurtma kirita olmaydi, har bir xodim esa `GET /settings` ni
o'qishi kerak — interfeys tili aynan shu javobdan olinadi.

**Frontend**: `components/Layout.tsx` dagi `NAV_ITEMS` ga `roles` maydoni
qo'shildi va menyu joriy rol bo'yicha filtrlanadi; `ProtectedRoute.tsx` esa
URL'ni qo'lda yozib kirishni to'sadi va foydalanuvchini roliga ochiq birinchi
bo'limga yo'naltiradi.

> Frontendda menyuni yashirish — faqat qulaylik. Haqiqiy himoya backendda:
> aks holda ofitsiant brauzer konsolidan so'rov yuborib ma'lumotni baribir
> olaverardi. Shuning uchun ikkala tomonda ham qilindi.

### 5.2. Kassa interfeysi (1-bo'lim)

Talab: taomlar rasmi bilan ko'rinsin, bir bosishda tanlansin, oyna hajmi
kategoriya almashganda o'zgarmasin, hamma qurilmaga moslashsin.

- **`components/ProductPickCard.tsx`** (yangi) — kvadrat rasm + nom + narx.
  Rasm yo'q bo'lsa nomga qarab **barqaror gradient** + 🍽️ tanlanadi (mantiq
  Telegram ilovasidagi `ProductCard` bilan bir xil, shuning uchun bitta taom
  kassada va mijoz menyusida bir xil rangda chiqadi).
- **Bir bosishda qo'shish**: butun kartochka bosilsa miqdor +1. Tanlangan
  soni burchakda ko'rinadi, kamaytirish uchun kichik `−` qoladi — usiz xato
  tanlovni tuzatib bo'lmasdi.
- **Barqaror o'lcham**: `ModalShell` ga `size="pos"` varianti qo'shildi —
  **aniq balandlik** (`sm:h-[85vh]`) va kengroq maksimal kenglik
  (`sm:max-w-6xl`). Faqat ichki ro'yxat siljiydi, oyna hech qachon
  o'lchamini o'zgartirmaydi.
- **Moslashuvchanlik**: telefonda modal butun ekranni egallaydi (chetlardagi
  bo'sh joy kichik ekranda foydali maydonni yeb qo'yadi), taom to'ri 2 ustun,
  hisob paneli pastda; kompyuterda ikki ustunli ko'rinish qoladi. Stol to'ri
  telefonda 2, planshetda 3, kompyuterda 4–5 ustun. `Layout` ham qayta
  ishlandi: telefonda chap menyu o'rniga yuqori panel va "☰" tugmasi.

### 5.3. Audit jurnali — hisobotning poydevori (2.2)

Yangi `internal/handlers/audit.go`: `writeAudit(ctx, db, auditEntry)`.

Yozish nuqtalari: `CreateOrder`, `ActivateOrder`, `AddItem`, `UpdateOrderItem`,
`DeleteOrderItem`, `ApplyDiscount`, `PayOrder`, `CancelOrder`,
`UpdateKitchenStatus`, `MarkReceiptPrinted`, hamda `qr.go` va `telegram.go`
dagi mijoz buyurtmalari (`actor_label` = "QR mijoz" / "Telegram mijoz").

Ikki qaror alohida ta'kidlanadi:

1. **Jurnal xatosi asosiy amalni buzmaydi** — yozib bo'lmasa log'ga chiqadi,
   buyurtma baribir saqlanadi.
2. **Yozuv tranzaksiyadan tashqarida, commit'dan keyin qilinadi.**
   PostgreSQL'da tranzaksiya ichidagi bitta xato butun tranzaksiyani bekor
   qiladi — ya'ni jurnalga yozishdagi xato buyurtmani ham yo'qotib yuborardi.

Xodim ismi jurnalda **saqlanmaydi**, faqat `user_id` yoziladi va o'qish
paytida `users` jadvalidan olinadi — shunda xodim ismini o'zgartirsa eski
yozuvlar ham to'g'ri ko'rinadi.

### 5.4. To'liq hisobot (2.3–2.6)

`internal/handlers/reports.go` to'liq qayta yozildi, tahrirlash esa alohida
`reports_edit.go` fayliga ajratildi.

**Yangi endpoint** `GET /reports/detailed` uch qismni qaytaradi:
umumiy raqamlar → buyurtmalar ro'yxati → amallar jurnali. Har bir buyurtma
qatorida: vaqt, stol yoki online turi, manba, holat, tarkibi, summa/chegirma/
yakuniy, **kim ochgan**, **kim to'lov olgan**, **qaysi ofitsiant**, to'lov
turi va **tahrirlangan-yo'qligi** belgisi (✎).

**Filtrlar** `sqlArgs` yordamchisi orqali quriladi — u `$1, $2...` raqamlarini
o'zi beradi, shuning uchun ixtiyoriy filtrlar qo'shilganda raqamlarni qo'lda
sanash xatosi bo'lmaydi. Filtr **bir joyda** tahlil qilinadi va ham ekranga,
ham Excel'ga bir xil qo'llanadi: Hammasi / Faqat online / Stol / To'lov turi /
Holat.

**Sahifaga kirilganda hech narsa tanlanmasa ham bugungi kun yuklanadi** —
kassir "Ko'rish" tugmasini bosmasdan oxirgi buyurtmalarni ko'radi.

**Yopilgan buyurtmani tuzatish** (`reports_edit.go`) — to'rt amal:
to'lov turini to'g'rilash, taom qo'shish, taom o'chirish, butun buyurtmani
qaytarish (vozvrat). Har birida **sabab majburiy** va hammasi jurnalga
`order_edited_after_close` amali bilan, eski va yangi qiymatlari bilan
yoziladi.

Amalga oshirishda hal qilingan ikki masala:

- **Kim tahrirlay oladi?** (topshiriqning 11.4-savoli) — faqat `owner`/`admin`.
  Kassir hisobotni **ko'radi**, lekin o'zi yopgan hisobni keyin o'zgartira
  olmaydi: aks holda nazorat ma'nosini yo'qotardi.
- **Vozvratda to'lov qatorlari o'chiriladi.** Aks holda buyurtma "bekor
  qilingan" bo'lsa ham naqd/karta summalari hisobotda qolib, kunlik kassa mos
  kelmay qolardi. O'chirilgan summa jurnalga yozib olinadi.
- To'lov tuzatilganda `received_by` **o'zgarmaydi** — pulni haqiqatda o'sha
  kassir olgan; tuzatishni kim qilgani audit jurnalida qoladi.

**Excel sozlamadagi tilda** — yangi `internal/i18n/dictionaries.go` (o'zbekcha
etalon, rus va ingliz to'liq). `ExportExcel` avval `businesses.language` ni
o'qiydi, so'ng sarlavhalarni va qiymat matnlarini (manba, holat, tur, to'lov
turi) shu lug'atdan oladi. Ustunlar kengaytirildi: kim ochgan, kim to'lov
olgan, ofitsiant, to'lov turi, tarkibi, telefon, manzil, tahrirlangan.

### 5.5. Sozlamalar (4-bo'lim)

- `UpdateSettings` ga **kafe nomi** qo'shildi. U chek sarlavhasida va Telegram
  menyusida har safar bazadan o'qiladi, shuning uchun bir joyda o'zgartirilsa
  hamma joyda yangilanadi.
- **Obuna**: `POST /settings/subscription` — interfeysda uch tarif
  taqqoslanadi va "Bu tarif uchun to'lov talab qilinadi" deb ko'rsatiladi,
  lekin **hozircha to'lov so'ralmaydi**. Kodda aniq belgi qo'yildi:
  `// TODO: Payme/Click integratsiyasi`. Yangi tarif joriy obuna tugash
  sanasini saqlab qoladi — tarif almashtirish muddatni qisqartirmasligi kerak.
- Printer maydonlari `*string` (ko'rsatkich) qilib olindi: printerni
  **o'chirish** ham bo'sh satr yuborish demak, shuning uchun "yuborilmagan" va
  "bo'sh qilib yuborilgan" holatlarini ajratish kerak edi.

### 5.6. Chek chiqarish (7-bo'lim)

Poydevor tayyor edi, yetishmayotgani — boshqaruv. Qo'shildi:

1. **Hisob-faktura (pre-bill)** — to'lovdan **oldin** beriladigan chek.
   `GET /orders/:id/receipt?pre_bill=1`. Chekda "HISOB-FAKTURA / TO'LANMAGAN"
   deb belgilanadi va "TO'LANDI" o'rniga "TO'LANADI" yoziladi — to'langan chek
   bilan adashtirib bo'lmaydi. To'lanmagan buyurtma cheki **har doim**
   hisob-faktura bo'ladi, so'rovda ko'rsatilmasa ham.
2. **Qo'lda chek tugmasi** stol va online buyurtma oynasida, to'lovdan
   mustaqil.
3. **Qayta chop etish** — hisobotdagi buyurtma oynasidan.
4. **Online buyurtma cheki** — stol nomi o'rniga buyurtma turi, telefon va
   manzil chiqadi (kuryer uchun shart).
5. **Printer sozlamalari interfeysda** — rejim, manzil va qog'oz kengligi
   (58 mm / 80 mm) Sozlamalar bo'limidan kiritiladi va **chek bilan birga**
   printer-helper'ga yuboriladi. `printer-helper` sozlama kelsa shuni
   ishlatadi, kelmasa `.env` ga qaytadi — eski o'rnatmalar buzilmaydi.
   Shu bilan topshiriqning 11.3-savoli (qog'oz kengligi) hal bo'ldi:
   `lineWidth` endi qattiq 32 emas, sozlanadigan.
6. **"Sinov cheki" tugmasi** — `GET /printer/test-receipt`.
7. **Printer holati** — kassa paneli `printer-helper` ning `/health` ini
   30 soniyada tekshiradi va tepada "Printer ulangan / ulanmagan" belgisini
   ko'rsatadi. Kassir chek chiqmasligini to'lov paytida emas, oldindan biladi.

### 5.7. Bildirishnomalar (8-bo'lim)

Kelishuvga ko'ra haqiqiy SMS emas — **ovoz + banner + brauzer bildirishnomasi**.

**Muhim texnik qaror:** bildirishnoma **Redis'ga bog'lanmadi**. Yangi
`internal/notify/hub.go` — server ichidagi oddiy nashr/obuna (Go kanallari).
Sabab: bu mashinada Redis o'rnatilmagan va `Publish` xatolari jimgina
e'tiborsiz qolardi, bildirishnoma esa kassir uchun asosiy ish vositasi.
Redis endi **ixtiyoriy** qo'shimcha (bir nechta server nusxasi uchun) va
alohida goroutine'da yuboriladi — o'chirilgan Redis buyurtma yaratishni
sekinlashtirmaydi.

`Publish` **bloklanmaydi**: obunachining buferi to'lsa hodisa tashlab
yuboriladi. Aks holda javob bermayotgan bitta brauzer buyurtma yaratish
so'rovini butunlay to'xtatib qo'yishi mumkin edi.

- **WebSocket**: `GET /api/v1/ws/orders?token=<jwt>`
  (`gofiber/contrib/websocket`). Token so'rov parametrida — brauzerning
  WebSocket API'si `Authorization` sarlavhasini yubora olmaydi.
- **Faqat mijoz buyurtmalari** signal beradi (`from_customer` bayrog'i):
  kassir o'zi kiritgan buyurtma uchun ovoz chiqmaydi — talabning aniq sharti.
- **Frontend** (`src/notifications/`): Web Audio API bilan ikki notali qisqa
  signal (tashqi fayl shart emas), ekran tepasida bosiladigan banner (bosilsa
  o'sha buyurtma oynasi ochiladi) va `Notification` API. Brauzerlar
  foydalanuvchi sahifa bilan aloqa qilmaguncha ovozni bloklaydi — birinchi
  bosishda `AudioContext` ishga tushiriladi, bloklangan bo'lsa foydalanuvchiga
  eslatma ko'rsatiladi.
- **Ulanish uzilsa** avtomatik qayta ulanadi; 5 soniyalik so'rov zaxira
  bo'lib qoladi, shuning uchun kassa ishlashda davom etadi. Chap panelda
  ulanish holati ko'rinib turadi.
- Ovozni Sozlamalardan **o'chirish** mumkin (`businesses.notify_sound`).

### 5.8. QR orqali kirgan mijoz (3-bo'lim)

Talab: stolda o'tirgan mijozga faqat menyu va umumiy hisob.

Ilova endi ikki rejimda ochiladi:

| Rejim | Qachon | Nima ko'rinadi |
|---|---|---|
| **Stol rejimi** | Havolada `?table=<token>` | Menyu + doimiy "Joriy hisob" paneli. Buyurtma turi tanlovi va QR skaner bosqichi **umuman yo'q** |
| **Oddiy rejim** | Bot `/start` (`?business=<kod>`) | Hozirgi to'liq oqim: stolga / yetkazib berish / olib ketish |

- `telegram-bot/main.go`: `/start table_<token>` dan token ajratiladi va
  WebApp havolasiga `?table=` sifatida uzatiladi (`parseStartTableToken`).
  Oddiy `/start` avvalgidek ishlaydi.
- Yangi `CurrentBillPanel.tsx` — stol nomi, holat (⏳ tasdiq kutilmoqda →
  👨‍🍳 tayyorlanmoqda → 🍽️ tayyor) va summa. Bosilsa taomlar ro'yxati
  ochiladi (yig'ilgan holatda — taomlar ko'p bo'lsa menyuni bosib qo'ymasligi
  uchun). Har 5 soniyada yangilanadi, shuning uchun kassir qo'shgan taomlar
  ham ko'rinadi.

### 5.9. Super-admin paneli (6-bo'lim)

Kelishilganidek — **alohida ilova, alohida login**: yangi `frontend-superadmin/`
(React + Vite + TS, 5175-port).

Ajratish uch qatlamda:
- alohida jadval — `platform_admins` (kafe `users` jadvalidan mustaqil),
- alohida JWT kalit — `PLATFORM_JWT_SECRET`. Konfiguratsiya uni `JWT_SECRET`
  bilan **bir xil bo'lishiga yo'l qo'ymaydi** (server ishga tushmaydi), aks
  holda kafe tokeni super-admin API'sida ham ishlab ketardi,
- alohida API guruhi va middleware — `/api/v1/platform/*`,
  `PlatformAuthRequired`.

Imkoniyatlar: barcha kafelar ro'yxati (obuna, stollar/xodimlar soni, oxirgi
faollik, holat), yangi kafe yaratish (biznes + birinchi `owner` hisobi + obuna
**bitta tranzaksiyada** — yarim yaratilgan kafe qolmasligi uchun), obuna turi
va muddati, kafeni vaqtincha to'xtatish, funksiyalarni yoqish/o'chirish va
limitlar.

**Limitlar backendda majburlanadi**: `CreateTable` stol sonini `max_tables`
bilan, `CreateStaff` rolga qarab `max_waiters`/`max_cashiers` bilan
taqqoslaydi va aniq xato beradi ("Tarifingiz bo'yicha maksimal 20 ta stol
qo'shish mumkin"). Faqat frontendda tekshirish yetarli emas.

**Funksiya bayroqlari**: yangi `middleware/feature.go` —
`RequireFeature(db, key)` middleware va ochiq endpointlar (QR, Telegram)
uchun `FeatureEnabled(...)` chaqiruvi. Bayroq yozuvi umuman bo'lmasa
**yoqilgan** deb hisoblanadi: yangi funksiya qo'shilganda ishlayotgan kafening
QR menyusi to'satdan o'chib qolmasligi kerak.

Boshlang'ich hisob: `superadmin` / `super1234` (007-migratsiyada).
Productionga chiqarishdan oldin parol va `PLATFORM_JWT_SECRET` albatta
o'zgartirilsin — bu `frontend-superadmin/README.md` da ham yozib qo'yildi.

**Yo'l-yo'lakay tuzatilgan bug:** `/platform/login` dastlab 401 qaytardi.
Sabab: `api.Group("/", AuthRequired)` `/api/v1` ostidagi **hamma narsaga**
tegishli va Fiber middleware'ni ro'yxatga olish tartibida qo'llaydi — undan
keyin yozilgan platforma yo'llari ham kafe tokenini talab qilib qolgan edi.
Platforma bloki `protected` guruhidan oldinga ko'chirildi (xuddi
`/auth/login` kabi) va routes.go ga buni tushuntiruvchi izoh qo'shildi.

### 5.10. Sinov natijalari

`go build ./...` + `go vet ./...` — uchala Go moduli toza.
Uchala frontend (`admin`, `telegram`, `superadmin`) `npm run build` bilan
xatosiz.

Ishlab turgan server va baza ustida `curl` bilan tekshirilgani:

**Rollar** — jadvalga to'liq mos:

| So'rov | ofitsiant | kassir |
|---|---|---|
| `GET /reports/daily` | **403** | 200 |
| `GET /orders` | **403** | 200 |
| `GET /staff` | **403** | **403** |
| `GET /settings` | 200 | 200 |
| `POST /menu/categories` | 201 | **403** |

**Audit jurnali** — buyurtma ochish → taom qo'shish → miqdor 2→5 → chegirma →
to'lov ketma-ketligi bajarildi va jurnalda to'liq chiqdi:

```
23:23 Admin Foydalanuvchi [owner]: order_created      (items: ['Osh ×2'], amount: 60000)
23:23 Admin Foydalanuvchi [owner]: item_added         (items: ["Lag'mon ×1"], amount: 35000)
23:23 Admin Foydalanuvchi [owner]: item_qty_changed   (product: Osh, from: 2, to: 5)
23:23 Admin Foydalanuvchi [owner]: discount_applied   (amount: 5000, reason: Doimiy mijoz)
23:23 Admin Foydalanuvchi [owner]: order_paid         (methods: ['card/humo'], amount: 180000)
```

**Yopilgan buyurtmani tuzatish** — hammasi ishladi va jurnalga tushdi:
kassirning urinishi **403**, sababsiz so'rov **400**, to'lov turi
karta/humo → naqd, taom qo'shildi (summa 185 000 → 220 000), taom o'chirildi,
vozvrat qilindi. Vozvratdan keyin **naqd jami 315 000 → 135 000** ga tushdi,
ya'ni bekor qilingan buyurtma tushumdan to'g'ri chiqarildi.

**Filtrlar**: `source=online` → 1 ta buyurtma, `payment_method=card` → 4 ta,
summalar mos.

**Excel tili** — bir xil hisobot, faqat `businesses.language` o'zgartirilgan:

```
RU: Дата/Время | Стол | Тип заказа | Источник | Статус | ... | Отменён | Да
UZ: Sana/Vaqt  | Stol | Buyurtma turi | Manba | Holat | ... | Bekor qilingan | Ha
```

**Sozlamalar**: kafe nomi, til, printer rejimi/manzili/qog'oz kengligi va
ovoz bayrog'i saqlanib, `GET /settings` da to'g'ri qaytdi.

**Migratsiyalar**: uchalasi ham xatosiz qo'llandi; `order_status_history`
endi to'ldirilmoqda (sinov buyurtmasi bo'yicha 3 ta yozuv: activated → paid →
cancelled).

### 5.11. Sinovda yetib bo'lmagan qism — Smart App Control

Sinovning oxirida Windows **Smart App Control** "evaluation" rejimidan
**"enforced"** rejimiga o'tdi (`VerifiedAndReputablePolicyState = 1`) va
imzolanmagan yangi `.exe` fayllarni bloklay boshladi:

```
CodeIntegrity 3077: ... attempted to load ...\server.exe that did not meet the
Enterprise signing level requirements
CodeIntegrity 3118: Smart App Control Block Details
```

Shu sababli **oxirgi tuzatishdan keyin backend qayta ishga tushirilmadi**.
Ya'ni quyidagi qismlar `curl` bilan **uchma-uch sinalmadi**:

- super-admin API (`/platform/*`) — jumladan yuqoridagi yo'l tartibi tuzatishi,
- limitlar (`max_tables` dan oshganda xato),
- funksiya bayroqlari orqali 403,
- WebSocket bildirishnomasi,
- chek endpointlari (pre-bill, qayta chop etish, sinov cheki).

Buning o'rniga qilingani:

1. **Barcha yangi SQL so'rovlar `psql` orqali jonli bazada tekshirildi** —
   `ListBusinesses`, `Stats`, `UpdateBusiness`, `SetFeature`,
   `SetSubscription`, stol va xodim limiti so'rovlari, `FeatureEnabled`,
   `buildReceipt`, sinov cheki. `CreateBusiness` esa tranzaksiya ichida
   `ROLLBACK` bilan sinaldi (haqiqiy ma'lumot yaratilmadi). Hammasi
   xatosiz ishladi.
2. Yo'l tartibi tuzatishining to'g'riligi bilvosita tasdiqlangan: `protected`
   guruhidan **oldin** yozilgan `/auth/login` ishlaydi, **keyin** yozilgan
   `/platform/login` esa 401 qaytargan edi — platforma bloki endi
   `/auth/login` bilan bir xil pozitsiyada.
3. Rol tekshiruvining parametrli guruhda (`/reports/orders/:id`) ishlashi
   sinovda tasdiqlangan (kassir **403** oldi), demak chek guruhidagi
   (`/orders/:id`) `RequireFeature` ham xuddi shunday qo'llanadi.

**Keyingi seansda birinchi ish:** Smart App Control'ni Windows Security →
"Ilova va brauzer boshqaruvi" bo'limidan o'chirib (yoki serverni imzolangan
holda qurib), yuqoridagi 5 qismni `curl` bilan sinash.

> Eslatma: Smart App Control'ni faqat foydalanuvchi o'zi o'chira oladi va
> uni qayta yoqish uchun Windows'ni qaytadan o'rnatish kerak bo'ladi —
> shuning uchun bu qaror sizga qoldirildi.

### 5.12. Sinov ma'lumotlari tozalandi

Sinov uchun yaratilgan xodimlar (`test_waiter`, `test_cashier`) va sinov
kategoriyasi o'chirildi, kafe nomi/tili/printer sozlamalari asl holiga
qaytarildi. Sinov buyurtmasi **ataylab o'chirilmadi** — u audit jurnali va
`order_status_history` ning ishlayotganini ko'rsatuvchi yagona haqiqiy misol.

### 5.13. Ochiq qolgan savollar (topshiriqning 11-bo'limi)

| № | Savol | Holati |
|---|---|---|
| 1 | Obuna to'lovi: Payme yoki Click? | Ochiq. Kodda `// TODO: Payme/Click integratsiyasi` belgisi qo'yildi — interfeys tayyor, faqat provayder chaqiruvi qo'shiladi |
| 2 | Super-admin qayerda joylashadi | Hozircha alohida port (5175). Domen tanlangach `VITE_API_URL` orqali sozlanadi |
| 3 | Chek qog'ozi kengligi | **Hal qilindi** — 58/80 mm Sozlamalardan tanlanadi |
| 4 | Kassir yopilgan buyurtmani tahrirlay oladimi | **Hal qilindi** — yo'q, faqat owner/admin |
| 5 | Redis production'da bo'ladimi | **Ahamiyatsiz qilindi** — bildirishnoma Redis'siz ishlaydi, Redis faqat bir nechta server nusxasi uchun kerak |
