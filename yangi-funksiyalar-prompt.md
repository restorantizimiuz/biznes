# Cafe System — keyingi bosqich uchun to'liq texnik topshiriq

Bu hujjat foydalanuvchi (Amirxon) tomonidan qo'yilgan **12 ta yangi talabni**
to'liq ochib beradi: nima so'ralgan, nega kerak, tizim hozir qanday ishlaydi,
nima qilinishi kerak, qaysi fayllarga tegiladi va qachon "tayyor" deb
hisoblanadi.

Hujjat **prompt** sifatida ishlatiladi: har bir bo'limni alohida topshiriq
sifatida olib, bosqichma-bosqich bajarish mumkin. Kod hali yozilmagan.

> **Ish qoidasi:** har bosqich boshida `git pull origin main`, oxirida
> bajarilgan ish `amirxon-qildi.md` ga yoziladi (boshqa dasturchi
> `avazbek-qildi.md` ga yozadi — aralashtirilmaydi).

---

## 0. Hozirgi holat (qisqacha)

| Qism | Texnologiya | Vazifasi |
|---|---|---|
| `backend/` | Go 1.22 + Fiber, PostgreSQL 16, Redis 7 | API, biznes logika, multi-tenant (`business_id`) |
| `frontend-admin/` | React 19 + Vite + TS + Tailwind | Kassa/admin paneli |
| `frontend-telegram/` | React 19 + Vite + TS | Telegram WebApp — mijoz menyusi |
| `telegram-bot/` | Go (mustaqil modul) | `/start` → WebApp tugmasi |
| `printer-helper/` | Go (mustaqil modul) | Lokal ESC/POS chek printeri (TCP 9100 / USB) |

1–4-bosqichlarda qilingan ishlar `amirxon-qildi.md` da batafsil yozilgan:
xavfsizlik audit va IDOR tuzatishlari, Telegram orqali buyurtma, stol
asosidagi kassa (POS), oshxona holati (`kitchen_status`), menyu boshqaruvi
(rasm yuklash + kesish, tahrir, yashirin o'chirish), buyurtma tahriri,
online (yetkazib berish/olib ketish) buyurtmalar, uch tilli interfeys.

### Suhbatda kelishilgan qarorlar

| Masala | Qaror |
|---|---|
| "SMS xabar tepadan" | Haqiqiy SMS **emas** — ekranda banner + ovozli signal + brauzer bildirishnomasi |
| Super-admin paneli | **Alohida ilova, alohida login** — kafe xodimlariga umuman ko'rinmaydi |
| Yopilgan buyurtmani tahrirlash | Jami to'lov, buyurtmaning o'zi va taom qo'shish/o'chirish — **to'liq tahrir**, har biri jurnalga yoziladi |
| Ofitsiant huquqi | **Faqat Stollar va Menyu** — Kassa va Hisobot ko'rinmaydi |

---

## 1. Kassa interfeysi — rasm, bir bosishda tanlash, o'lcham, moslashuvchanlik

### Nima so'ralgan
> "kasada ham menyudaki taomlarning rasmlari korinib tursin va huddi stolni
> tanlagandek taomlar ham tanlansin bir marta tugma bosilganda"
>
> "sahifani hamma qurilmaga moslab tuzat va stol tanlanganda stolning
> kassasini hajmini kattaroq qil va har doim shu kattalikda qolsin yaniy
> ichimlik yoki boshqa kategoriyaga otganda hajmi ozgamasin"

### Nega kerak
Kassir tez ishlashi kerak. Rasm — taomni matn o'qimasdan tanish imkonini
beradi. Har bir taom uchun "+" tugmasini nishonga olish sekin; butun
kartochka bosiladigan bo'lsa, xuddi stol tanlagandek, bir harakatda qo'shiladi.
Oyna o'lchamining kategoriya almashganda sakrashi esa kassirni chalg'itadi:
tugmalar joyini o'zgartiradi va noto'g'ri bosish ehtimolini oshiradi.

### Hozir qanday
- `frontend-admin/src/pages/OrdersPage.tsx` → `ActiveOrderPanel` da taomlar
  **matnli qator** ko'rinishida, o'ng tomonda `−` / son / `+` tugmalari bilan.
- Rasm umuman ko'rsatilmaydi (garchi `resolveImageUrl()` yordamchisi
  `frontend-admin/src/api/client.ts` da tayyor va Menyu sahifasida
  ishlatilyapti).
- `ModalShell` (`frontend-admin/src/components/ModalShell.tsx`) balandligi
  `max-h-[90vh]` bilan cheklangan, lekin **kontentga qarab o'zgaradi** —
  kategoriyada 2 ta taom bo'lsa oyna kichrayadi, 20 ta bo'lsa kattalashadi.
- Moslashuvchanlik faqat qisman: `lg:flex-row`, `sm:grid-cols-3` kabi
  breakpointlar bor, lekin telefonda modal va stol to'ri sinab ko'rilmagan.

### Nima qilinadi
1. **Taom kartochkalari (grid)**: `ActiveOrderPanel` dagi ro'yxat rasm bilan
   kartochka to'riga aylantiriladi (kvadrat rasm + nom + narx). Rasm yo'q
   bo'lsa — `frontend-telegram/src/components/ProductCard.tsx` dagi kabi
   nomga qarab barqaror gradient + 🍽️ belgisi (shu mantiqni qayta ishlatish
   mumkin).
2. **Bir bosishda qo'shish**: butun kartochka bosilsa miqdor +1 bo'ladi.
   Kartochka burchagida tanlangan soni ko'rsatiladi; sonni kamaytirish uchun
   kichik `−` tugmasi qoladi (aks holda xatoni tuzatib bo'lmaydi).
3. **Barqaror o'lcham**: `ModalShell` ga `size="pos"` (yoki shunga o'xshash)
   varianti qo'shiladi — **aniq balandlik** (masalan `h-[85vh]`) va kengroq
   maksimal kenglik (`max-w-6xl`). Ichki ro'yxat `overflow-y-auto` bilan
   siljiydi, oyna esa hech qachon o'lchamini o'zgartirmaydi.
4. **Moslashuvchanlik**: telefon (< 640px), planshet (640–1024px) va kompyuter
   uchun alohida ishlanadi — telefonda modal butun ekranni egallaydi
   (`inset-0`), taom to'ri 2 ustun, hisob paneli pastda; kompyuterda hozirgi
   ikki ustunli ko'rinish qoladi. Stol to'ri ham telefonda 2 ustun bo'ladi.

### Qaysi fayllar
- `frontend-admin/src/pages/OrdersPage.tsx` (asosiy)
- `frontend-admin/src/components/ModalShell.tsx` (yangi `size` varianti)
- Yangi: `frontend-admin/src/components/ProductPickCard.tsx` (kassа uchun
  rasmli taom kartochkasi)
- `frontend-admin/src/api/client.ts` — `resolveImageUrl()` qayta ishlatiladi

### Qabul mezoni
- Kassada taomlar rasmi bilan ko'rinadi; kartochkani bir marta bosish
  buyurtmaga qo'shadi.
- Kategoriya almashtirilganda oyna balandligi va kengligi **o'zgarmaydi**.
- Telefonda (360×640) kassa sahifasi va stol oynasi gorizontal siljishsiz,
  tugmalar barmoq bilan bosiladigan o'lchamda ishlaydi.

---

## 2. Hisobot — to'liq jurnal, filtrlar, tahrirlash, Excel tili

Bu eng katta va eng ko'p qismli talab, shuning uchun kichik bo'limlarga
ajratilgan.

### Nima so'ralgan
> "hisobotda hamma hisoblar chiqib tursin, qaysi kun tanlansa shu kunning
> hisobotichi chiqib tursin"
>
> "hisobotni korish bosilganda aynan shu kuni kim nimani qoshdi ochirdi va
> toliq hamma hisobot ham oynada korinsin toliq qaysi kaassada kordi kim
> qoshdi hammasi qaysi afitsand qoshdi toliq hisobot korinsin"
>
> "hisobotni excel variantda yuklaganda sozlama qaysi tilda saqlangan bolsa
> excel daki jadval ham shu tilda bolsin va hisobotda tanlash imkoni bolsin
> masalan faqat online buyrtmalarni jadvalini korish yoki yuklash bolsin va
> faqat bitda stolni jadvalini korish va shunga oxshash tanlash orqali korish
> va yuklash imkoni bolsin va hisobotga kirganda oxirgi buyurtmalar korinib
> tursin tanlanmasa ham va shuni tanlab ozgartirish ham kirsin bu biroq vaqt
> otib chalkashlik bolmasliki uchun kimdur xato belgilaganini tog'irlash uchun"

### 2.1. Hozir qanday
`backend/internal/handlers/reports.go`:
- `DailySummary` — `from`/`to` oralig'i uchun **atigi 5 ta raqam** qaytaradi:
  jami buyurtma, online buyurtma, jami tushum, naqd, karta, o'tkazma.
- `ExportExcel` — buyurtmalar ro'yxatini `.xlsx` ga chiqaradi, lekin
  sarlavhalar **qattiq o'zbekcha** (`"Sana/Vaqt", "Stol", "Manba", ...`)
  va hech qanday filtr yo'q.
- `frontend-admin/src/pages/ReportsPage.tsx` — sana tanlanadi, "Hisobotni
  ko'rish" bosiladi, 5 ta raqamli kartochka chiqadi. Sahifaga kirilganda
  hech narsa ko'rinmaydi.

Kim nima qilgani haqida ma'lumot deyarli saqlanmaydi:
- `orders.created_by_user_id` — buyurtmani kim ochgani,
- `payments.received_by` — to'lovni kim qabul qilgani,
- `order_cancellations` — kim va nega bekor qilgani,
- `order_status_history` — holat o'zgarishlari (lekin hozir kod unga
  **yozmaydi**),
- `waiter_assignments` — jadval bor, lekin ishlatilmaydi.

**Taom qo'shilgani/o'chirilgani, miqdor o'zgartirilgani, chegirma berilgani
haqida hech qanday yozuv yo'q.** Talabni bajarish uchun shu bo'shliq
to'ldirilishi kerak.

### 2.2. Audit jurnali (`audit_log`) — poydevor

Yangi jadval, barcha muhim amallarni yozadi:

```sql
CREATE TABLE audit_log (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id),      -- kim (NULL = mijoz o'zi)
    actor_label  VARCHAR(255),                    -- "Telegram mijoz", "QR mijoz" yoki xodim ismi
    order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
    action       VARCHAR(50) NOT NULL,            -- order_created, item_added, item_removed,
                                                  -- item_qty_changed, discount_applied,
                                                  -- order_paid, order_cancelled,
                                                  -- kitchen_status_changed, order_edited_after_close
    details      JSONB,                           -- {"product":"Osh","from":2,"to":5}
    created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_business_date ON audit_log(business_id, created_at);
CREATE INDEX idx_audit_order ON audit_log(order_id);
```

**Nega JSONB?** Har bir amal turi uchun turli maydonlar kerak (taom nomi,
eski/yangi miqdor, summa). Alohida ustunlar qilsak, jadval bo'sh
kataklarga to'lib ketadi; JSONB esa kengaytirishga qulay.

Yozish nuqtalari (mavjud handlerlarga qo'shiladi):
| Fayl | Funksiya | Amal |
|---|---|---|
| `orders.go` | `CreateOrder` | `order_created` |
| `orders.go` | `AddItem` | `item_added` (har bir taom uchun) |
| `orders.go` | `UpdateOrderItem` | `item_qty_changed` |
| `orders.go` | `DeleteOrderItem` | `item_removed` |
| `orders.go` | `ApplyDiscount` | `discount_applied` |
| `orders.go` | `PayOrder` | `order_paid` (usul va summa bilan) |
| `orders.go` | `CancelOrder` | `order_cancelled` (sabab bilan) |
| `orders.go` | `ActivateOrder` / `UpdateKitchenStatus` | `order_activated` / `kitchen_status_changed` |
| `qr.go` / `telegram.go` | mijoz buyurtmalari | `order_created`, `actor_label` = manba |

Yordamchi funksiya yoziladi (masalan `internal/handlers/audit.go` da
`writeAudit(ctx, db, businessID, userID, orderID, action, details)`),
har bir handler shuni chaqiradi. **Muhim:** audit yozuvidagi xato asosiy
amalni buzmasligi kerak — jurnalga yozib bo'lmasa, log'ga chiqariladi, lekin
buyurtma baribir saqlanadi.

### 2.3. To'liq kunlik hisobot

Yangi endpoint: `GET /api/v1/reports/detailed?from&to&table_id&source&payment_method`

Qaytaradi:
- **Umumiy raqamlar** (hozirgi `DailySummary` kabi),
- **Buyurtmalar ro'yxati** — har biri uchun: vaqt, stol yoki online turi,
  manba, holat, tarkibi, summa/chegirma/yakuniy, **kim ochgan**, **kim
  to'lov olgan**, **qaysi ofitsiant**,
- **Amallar jurnali** (`audit_log` dan) — vaqt bo'yicha tartiblangan:
  "14:32 — Kassir Ali: Stol 5 ga Osh ×2 qo'shdi",
  "14:40 — Kassir Ali: Lag'mon ni o'chirdi",
  "15:05 — Admin: Stol 5 to'lovi (karta/humo) 120 000 so'm".

Frontendda `ReportsPage.tsx` uch qismga bo'linadi: **umumiy kartochkalar →
buyurtmalar jadvali → amallar jurnali**. Har bir buyurtma qatori bosilganda
uning to'liq tarkibi va o'sha buyurtmaga tegishli jurnal yozuvlari ochiladi.

### 2.4. Filtrlar va "oxirgi buyurtmalar"

- Sahifaga kirilganda **hech narsa tanlanmasa ham** bugungi kun avtomatik
  yuklanadi va oxirgi buyurtmalar ko'rinadi.
- Filtr tugmalari: **Hammasi / Faqat online / Stol bo'yicha / To'lov turi
  bo'yicha**. Filtr ham ko'rinishga, ham Excel yuklashga bir xil qo'llanadi
  (bir xil query parametrlar `detailed` va `export` endpointlariga
  yuboriladi).

### 2.5. Yopilgan buyurtmani tahrirlash

Kelishilgan hajm: **jami to'lov, buyurtmaning o'zi (bekor qilish), taom
qo'shish va o'chirish**.

Yangi endpointlar (hammasi `owner`/`admin` uchun; kassir faqat o'z smenasidagi
buyurtmani tahrirlay olishi mumkin — bu qaror amalga oshirishda aniqlanadi):
- `PATCH /api/v1/reports/orders/:id/payment` — to'lov turi va summasini
  to'g'rilash,
- `POST /api/v1/reports/orders/:id/items` va
  `DELETE /api/v1/reports/orders/:id/items/:item_id` — yopilgan buyurtmaga
  taom qo'shish/o'chirish (summa `recalcOrderTotals` bilan qayta hisoblanadi —
  bu funksiya `orders.go` da allaqachon bor),
- `POST /api/v1/reports/orders/:id/revert` — buyurtmani bekor qilish
  (qaytarish/vozvrat).

**Har bir tahrir `audit_log` ga `order_edited_after_close` amali bilan,
eski va yangi qiymatlari bilan yoziladi.** Sabab maydoni majburiy — keyin
"nega o'zgardi?" degan savolga javob bo'lishi uchun. Hisobot oynasida
tahrirlangan buyurtmalar alohida belgi (✎) bilan ko'rsatiladi.

### 2.6. Excel — sozlamadagi tilda

`businesses.language` (`uz`/`ru`/`en`) qiymatiga qarab Excel sarlavhalari va
qiymat matnlari (manba, holat, to'lov turi) tarjima qilinadi.

Buning uchun **backend tomonda kichik tarjima lug'ati** kerak — masalan
`backend/internal/i18n/dictionaries.go`, tuzilishi frontenddagi
`frontend-admin/src/i18n/dictionaries.ts` ga o'xshash (o'zbekcha etalon,
qolgan tillar to'ldiriladi). `ExportExcel` avval biznes tilini o'qiydi,
so'ng sarlavhalarni shu lug'atdan oladi.

Excel'ga qo'shimcha ustunlar ham kiradi: **kim ochgan, kim to'lov olgan,
ofitsiant, to'lov turi, tarkibi**.

### Qaysi fayllar
- Yangi migratsiya: `backend/migrations/006_audit_log.sql`
- Yangi: `backend/internal/handlers/audit.go`, `backend/internal/i18n/dictionaries.go`
- `backend/internal/handlers/reports.go` (asosiy o'zgarish)
- `backend/internal/handlers/orders.go`, `qr.go`, `telegram.go` (jurnalga yozish)
- `backend/internal/handlers/routes.go`
- `frontend-admin/src/pages/ReportsPage.tsx` (to'liq qayta yozish)
- `frontend-admin/src/api/endpoints.ts`, `types.ts`, `i18n/dictionaries.ts`

### Qabul mezoni
- Sana tanlanganda o'sha kunning **barcha** buyurtmalari, kim-nima qilgani
  bilan ko'rinadi.
- Filtr (online / stol / to'lov turi) ham ekranda, ham Excel'da ishlaydi.
- Sahifaga kirilganda bugungi oxirgi buyurtmalar avtomatik ko'rinadi.
- Yopilgan buyurtmaning to'lov turi tuzatilganda: summa to'g'ri qayta
  hisoblanadi, o'zgarish jurnalda kim/qachon/nima bilan ko'rinadi.
- Til `ru` qilib qo'yilsa, yuklangan Excel sarlavhalari ruscha bo'ladi.

---

## 3. QR orqali kirgan mijoz — faqat menyu va hisob

### Nima so'ralgan
> "qr kod orqali buyurtma bermoqchi mijozlarga faqat stolning menyusi va
> umumiy hisobi chiqsin va boshqa narsa emas"

### Nega kerak
Stolda o'tirgan mijozga yetkazib berish/olib ketish tanlovi, manzil va
telefon maydonlari keraksiz — ular chalg'itadi va xato buyurtmaga olib
keladi. Unga faqat ikki narsa kerak: **nima buyurtma qilish mumkin** va
**hozir qancha bo'ldi**.

### Hozir qanday
`frontend-telegram/src/App.tsx` bitta ilova bo'lib, `?business=<kod>`
parametri bilan ochiladi va savatda uch xil buyurtma turini
(Stolga / Yetkazib berish / Olib ketish) taklif qiladi. Stol esa faqat
checkout paytida QR skaner orqali aniqlanadi.

Backend tomonda `GET /api/v1/qr/:table_token/menu` allaqachon **aynan
kerakli ma'lumotni** qaytaradi: menyu + `active_order` (stolning joriy
hisobi, tarkibi va holati bilan) — `backend/internal/handlers/qr.go`.

### Nima qilinadi
Ilova **stol rejimida** ochilishi kerak: havolada stol tokeni bo'lsa
(`?table=<token>` yoki bot `/start table_<token>` orqali),
- buyurtma turi tanlovi **umuman ko'rsatilmaydi** (turi doim "stolga"),
- QR skaner bosqichi o'tkazib yuboriladi (stol allaqachon ma'lum),
- yuqorida stol nomi va **"Joriy hisob"** paneli doim ko'rinib turadi
  (`active_order` dan olinadi, 5 soniyada yangilanadi — bu mexanizm
  `App.tsx` da allaqachon bor).

Stol tokeni bo'lmasa (bot orqali oddiy kirish) — hozirgi to'liq ko'rinish
(yetkazib berish/olib ketish) saqlanib qoladi.

### Qaysi fayllar
- `frontend-telegram/src/App.tsx` (rejimni aniqlash)
- `frontend-telegram/src/components/CartScreen.tsx` (`lockedToTable` mantiqi
  allaqachon bor — kengaytiriladi)
- `telegram-bot/main.go` (stol tokenini WebApp havolasiga uzatish)

### Qabul mezoni
- Stol QR kodi orqali kirilganda: faqat menyu + joriy hisob ko'rinadi,
  boshqa hech qanday tanlov yo'q.
- Botdan oddiy kirilganda: hozirgi to'liq oqim ishlaydi.

---

## 4. Sozlamalar — kafe nomi va obuna

### Nima so'ralgan
> "sozlamalarda foydalanuvchilar ozini kafesini nomini ozgartira olsin va
> obunani ham ammo obunani ozgartirish uchun pul tolash talab qilinadi ammo
> xozircha talab qilinmasin"

### Hozir qanday
`backend/internal/handlers/settings.go` → `UpdateSettings` faqat `language`
va `theme_mode` ni yangilaydi. Kafe nomi va obuna faqat **o'qish uchun**
ko'rsatiladi (`frontend-admin/src/pages/SettingsPage.tsx`).

`subscriptions` jadvali sxemada bor: `plan` (`basic`/`qr`/`full`),
`status`, `starts_at`, `ends_at`.

### Nima qilinadi
1. `UpdateSettings` ga **`name`** maydoni qo'shiladi (faqat `owner`/`admin`).
2. Obuna turini o'zgartirish: `POST /api/v1/settings/subscription`
   `{plan: "basic"|"qr"|"full"}`. Interfeysda tariflar taqqoslanadi va
   **"Bu tarif uchun to'lov talab qilinadi"** deb ko'rsatiladi, lekin
   **hozircha to'lov so'ralmaydi** — tanlangan tarif darhol yoziladi
   (`subscriptions` ga yangi qator).
3. Kodda **aniq belgi qo'yiladi** (`// TODO: Payme/Click integratsiyasi`) —
   keyinchalik to'lov qo'shilganda qayerga tushishi ko'rinib tursin.

### Qaysi fayllar
- `backend/internal/handlers/settings.go`, `routes.go`
- `frontend-admin/src/pages/SettingsPage.tsx`, `api/endpoints.ts`, `i18n/dictionaries.ts`

### Qabul mezoni
- Kafe nomi o'zgartirilsa, u chek va Telegram menyusida ham yangilanadi.
- Obuna turi o'zgartirilsa, `subscriptions` da yangi yozuv paydo bo'ladi va
  Sozlamalarda yangi tarif ko'rinadi; to'lov so'ralmaydi.

---

## 5. Rollar va ruxsatlar

### Nima so'ralgan
> "afitsand qoshilsa afitsandga faqat stollar va menyuga ozgartirish kiritsin
> bohsqa narsalar korinmasin"
>
> "hisobot faqat kassaga va kasirga korinsin boshqaga korinishi shart emas"

### Nega kerak
Hisobot — moliyaviy ma'lumot: kunlik tushum, chegirmalar, kim qancha
to'lov olgani. Ofitsiantga bu kerak emas. Bu — ishonch masalasi emas,
oddiy xavfsizlik qoidasi: har kim faqat o'z ishi uchun kerakli ma'lumotni
ko'rishi kerak.

### Ruxsatlar jadvali

| Bo'lim | owner | admin | cashier | waiter |
|---|:--:|:--:|:--:|:--:|
| Kassa (buyurtma, to'lov) | ✅ | ✅ | ✅ | ❌ |
| Menyu | ✅ | ✅ | ❌ | ✅ |
| Stollar | ✅ | ✅ | ❌ | ✅ |
| Xodimlar | ✅ | ✅ | ❌ | ❌ |
| Hisobot | ✅ | ✅ | ✅ | ❌ |
| Sozlamalar | ✅ | ✅ | ❌ | ❌ |

### Nima qilinadi
1. **Backend** — `middleware.RequireRole` (`backend/internal/middleware/auth.go`)
   barcha tegishli endpointlarga qo'llanadi. Hisobot endpointlariga
   `RequireRole("owner","admin","cashier")`.
2. **Frontend** — `frontend-admin/src/components/Layout.tsx` dagi `NAV_ITEMS`
   ro'yxatiga `roles` maydoni qo'shiladi va joriy rol bo'yicha filtrlanadi;
   `ProtectedRoute.tsx` esa to'g'ridan-to'g'ri URL orqali kirishni to'sadi.

> **Muhim:** frontendda menyuni yashirish — bu faqat qulaylik. Haqiqiy
> himoya **backendda**: agar endpoint himoyalanmasa, ofitsiant brauzer
> konsolidan so'rov yuborib ma'lumotni baribir olaverаdi. Shuning uchun
> ikkala tomonda ham qilinadi.

### Qabul mezoni
- Ofitsiant hisobiga kirilganda chap menyuda faqat Stollar va Menyu ko'rinadi.
- Ofitsiant `curl` bilan `/api/v1/reports/daily` ga so'rov yuborsa — `403`.

---

## 6. Super-admin paneli (yangi, alohida ilova)

### Nima so'ralgan
> "shu loyihani boshqarish uchun yana boshqa admin panel tuz bu admin panel
> orqali funksiyalarni ochirish yoqishlar bolsin va restoranlarnii tanlab
> tizimlarida funksiyalarni qoshish va ochirish funksiayalrini ham qosh ...
> nechta kassa bolishi va nechta afitsant va nechta stollar bolishini ham
> belgilab bolsin"

### Nega alohida ilova
Kelishilganidek — **alohida sayt va alohida login**. Sabab: super-admin
barcha kafelarning ma'lumotini ko'radi. Agar u bitta ilovada bo'lsa, bitta
kod xatosi yoki noto'g'ri rol tekshiruvi butun tizimni ochib qo'yishi mumkin.
Alohida ilova + alohida hisoblar + alohida token = kafe xodimi hech qanday
yo'l bilan bu API'ga yeta olmaydi.

### Ma'lumotlar bazasi

```sql
-- Platforma egalari (kafe users jadvalidan butunlay ajratilgan)
CREATE TABLE platform_admins (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name     VARCHAR(255) NOT NULL,
    login         VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- Har bir kafe uchun limitlar
ALTER TABLE businesses ADD COLUMN max_tables   INT DEFAULT 50;
ALTER TABLE businesses ADD COLUMN max_waiters  INT DEFAULT 10;
ALTER TABLE businesses ADD COLUMN max_cashiers INT DEFAULT 3;
```

`feature_flags` jadvali sxemada **allaqachon bor** (`business_id`,
`feature_key`, `is_enabled`) — hozirgacha ishlatilmagan. Endi ishga tushadi:
`qr_menu`, `online_order`, `telegram_bot`, `receipt_print`, `reports_export`
va h.k.

### Imkoniyatlar
- Barcha kafelar ro'yxati (holati, obunasi, stollar/xodimlar soni, oxirgi
  faollik).
- Yangi kafe yaratish (business_code, nom, birinchi `owner` hisobi).
- Obuna turi va muddatini belgilash; kafeni vaqtincha to'xtatish
  (`is_active=false` → login ishlamaydi).
- **Funksiyalarni yoqish/o'chirish** — har bir kafe uchun alohida.
- **Limitlar**: nechta stol, nechta ofitsiant, nechta kassir.

### Limitlar qanday majburlanadi
Backendda, yaratish endpointlarida: `CreateTable` stol sonini `max_tables`
bilan taqqoslaydi, `CreateStaff` rolga qarab `max_waiters`/`max_cashiers`
bilan. Limitdan oshsa — aniq xato: "Tarifingiz bo'yicha maksimal 20 ta stol".
**Faqat frontendda tekshirish yetarli emas.**

Funksiya bayroqlari uchun yangi middleware: `RequireFeature("online_order")`
— o'chirilgan funksiya endpointi `403` qaytaradi.

### Yangi qism
`frontend-superadmin/` — React + Vite + TS (mavjud `frontend-admin` tuzilishi
namuna sifatida olinadi: `api/client.ts`, `auth/AuthContext.tsx`,
`components/Layout.tsx` naqshlari).

Backendda alohida guruh: `/api/v1/platform/*`, alohida middleware
(`PlatformAuthRequired`) va **alohida JWT kaliti** (`PLATFORM_JWT_SECRET`) —
kafe tokeni bu yerda ishlamaydi va aksincha.

### Qaysi fayllar
- Yangi migratsiya: `backend/migrations/007_platform_admin.sql`
- Yangi: `backend/internal/handlers/platform.go`,
  `backend/internal/middleware/platform_auth.go`,
  `backend/internal/middleware/feature.go`
- `backend/internal/handlers/tables.go`, `staff.go` (limit tekshiruvi)
- Yangi ilova: `frontend-superadmin/`

### Qabul mezoni
- Super-admin login qilib, kafe ro'yxatini ko'radi va bittasining
  `online_order` funksiyasini o'chirsa — o'sha kafening Telegram ilovasida
  online buyurtma ishlamay qoladi (`403`).
- `max_tables` 3 qilib qo'yilsa, 4-stol qo'shishga urinish aniq xato beradi.
- Kafe xodimining tokeni bilan `/api/v1/platform/...` ga so'rov — `401`.

---

## 7. Chek chiqarish

### Nima so'ralgan
> "chek chiqarishni ham qosh va har bir stolni chekini chqarishni ham va
> albatda online buyurtmanikini ham va chek aparatlar bilan ishlashni ham qosh"

### Hozir qanday
- Chek **faqat to'lov tasdiqlangandan keyin avtomatik** chiqadi
  (`frontend-admin/src/pages/OrdersPage.tsx` → `PaymentPanel.confirm()`):
  avval lokal printer (`printer.ts` → `http://127.0.0.1:9123/print`),
  ishlamasa Telegram orqali, u ham bo'lmasa kassirga xabar.
- `printer-helper/` — ESC/POS ni to'liq qo'llaydi: `network` (TCP 9100) va
  `file` (`/dev/usb/lp0`) rejimlari, sarlavha, qatorlar, jami, qog'oz kesish.
- Chek ma'lumoti `backend/internal/handlers/receipt.go` → `GetReceipt`.

Ya'ni **poydevor tayyor**, yetishmayotgani — boshqaruv.

### Nima qilinadi
1. **Qo'lda "Chek chiqarish" tugmasi** — har bir stol oynasida va online
   buyurtma oynasida, to'lovdan mustaqil ravishda.
2. **Hisob-faktura (pre-bill)** — to'lovdan **oldin** beriladigan chek
   ("to'lanmagan" deb belgilangan). Restoranda odatiy amaliyot: mijoz avval
   hisobni ko'radi, keyin to'laydi.
3. **Qayta chop etish** — hisobot bo'limidan eski buyurtma chekini qayta
   chiqarish.
4. **Online buyurtma cheki** — hozir `receipt.go` stol nomini kutadi;
   stolsiz buyurtma uchun chekda **buyurtma turi, telefon va manzil**
   ko'rsatiladi (`orders.order_type`, `customer_phone`, `delivery_address`
   — bu ustunlar 5-migratsiyada qo'shilgan).
5. **Printer sozlamalari interfeysda** — Sozlamalar bo'limida printer
   rejimi/manzili kiritiladi va **"Sinov cheki chiqarish"** tugmasi bo'ladi
   (hozir faqat `printer-helper/.env` orqali sozlanadi, bu kassir uchun
   qiyin).
6. **Printer holati** — `printer-helper` da `/health` allaqachon bor;
   kassa paneli uni tekshirib, "printer ulanmagan" degan belgi ko'rsatadi.

### Qaysi fayllar
- `backend/internal/handlers/receipt.go` (online buyurtma va pre-bill)
- `frontend-admin/src/pages/OrdersPage.tsx`, `ReportsPage.tsx`, `SettingsPage.tsx`
- `frontend-admin/src/printer.ts` (holat tekshiruvi, pre-bill)
- `printer-helper/main.go` (sozlamani API orqali qabul qilish, sinov cheki)

### Qabul mezoni
- Stol oynasidan to'lovsiz chek chiqarish mumkin.
- Online buyurtma chekida telefon va manzil ko'rinadi.
- Hisobotdan eski chekni qayta chiqarish ishlaydi.
- Printer ulanmagan bo'lsa, kassa panelida buni aniq ko'rsatadi.

---

## 8. Bildirishnomalar — ovoz, banner, brauzer xabari

### Nima so'ralgan
> "afitsand tomonidan va kassirdan boshqa joydan kelgan buyurtmalarga
> bildirishnoma qosh ovozli va web sayt va tizimdan ovoz kelsin sms habar
> kelsin tepadan"

Kelishuvga ko'ra — **haqiqiy SMS emas**: ekran tepasida xabar + ovoz +
brauzer bildirishnomasi.

### Nega kerak
Mijoz QR yoki Telegram orqali buyurtma bersa, u kassa ekranida jimgina
paydo bo'ladi. Kassir boshqa ish bilan band bo'lsa, buyurtma bir necha
daqiqa e'tiborsiz qolishi mumkin. Ovoz va ko'zga tashlanadigan banner buni
oldini oladi.

### Hozir qanday
Backend Redis'ga `Publish` qiladi (`orders:<business_id>` kanali —
`orders.go: notifyOrderChange`, `qr.go`, `telegram.go`), **lekin hech kim
tinglamaydi**. Kassa paneli har 5 soniyada `listActiveOrders` so'rovini
yuboradi (`refetchInterval: 5000`). Bu ishlaydi, lekin darhol emas va ovoz
chiqarish uchun "yangi buyurtma paydo bo'ldi" hodisasi yo'q.

### Nima qilinadi
1. **WebSocket endpointi**: `GET /api/v1/ws/orders` (token bilan
   himoyalangan). Fiber uchun `gofiber/websocket/v2` ishlatiladi.
2. **Muhim texnik eslatma:** bu mashinada **Redis o'rnatilmagan** va
   `Publish` xatolari jimgina e'tiborsiz qolmoqda. Shuning uchun
   bildirishnoma **Redis'ga bog'liq bo'lmasligi** kerak: server ichida
   oddiy Go kanali (in-process hub) orqali ishlaydigan qilinadi, Redis esa
   **ixtiyoriy** qo'shimcha bo'ladi (bir nechta server nusxasi bo'lganda
   kerak bo'ladi). Shunda tizim Redis'siz ham to'liq ishlaydi.
3. **Faqat mijoz buyurtmalari** uchun signal: `source` `qr` yoki
   `online_telegram` bo'lganda (kassir/ofitsiant o'zi kiritgan buyurtma
   uchun ovoz chiqmaydi — bu talabning aniq sharti).
4. **Frontendda uchta signal**:
   - **Ovoz** — Web Audio API bilan qisqa signal (tashqi fayl shart emas).
     *Eslatma:* brauzerlar foydalanuvchi sahifa bilan aloqa qilmaguncha
     ovozni bloklaydi — birinchi bosishda `AudioContext` ishga tushiriladi.
   - **Banner** — ekran tepasida toast, buyurtma turi va stol/mijoz nomi
     bilan, bosilganda o'sha buyurtma oynasini ochadi.
   - **Brauzer bildirishnomasi** — `Notification` API, ruxsat bir marta
     so'raladi; kassa paneli boshqa oynada bo'lganda ham ko'rinadi.
5. **Sozlamalarda o'chirish imkoni** — ovozni o'chirish tugmasi (tunda yoki
   shovqinli joyda kerak bo'ladi).

### Qaysi fayllar
- Yangi: `backend/internal/handlers/ws.go`, `backend/internal/notify/hub.go`
- `backend/internal/handlers/routes.go`, `orders.go`, `qr.go`, `telegram.go`
- Yangi: `frontend-admin/src/notifications/` (WebSocket hook, ovoz, toast)
- `frontend-admin/src/pages/OrdersPage.tsx`, `components/Layout.tsx`

### Qabul mezoni
- Telegram/QR orqali buyurtma berilganda kassa panelida **1 soniya ichida**
  ovoz chiqadi va tepada banner paydo bo'ladi.
- Kassir o'zi buyurtma kiritganda ovoz **chiqmaydi**.
- Redis o'chirilgan bo'lsa ham bildirishnoma ishlaydi.

---

## 9. Ma'lumotlar bazasi o'zgarishlari (yig'ma)

| Migratsiya | Mazmuni |
|---|---|
| `006_audit_log.sql` | `audit_log` jadvali + indekslar (2-bo'lim) |
| `007_platform_admin.sql` | `platform_admins`, `businesses` ga `max_tables`/`max_waiters`/`max_cashiers` (6-bo'lim) |
| `008_receipt_printing.sql` | `orders.receipt_printed_at`, `businesses` ga printer sozlamalari (7-bo'lim) |

Mavjud, lekin hali ishlatilmayotgan jadvallar ishga tushadi:
`feature_flags` (6-bo'lim), `order_status_history` va `waiter_assignments`
(2-bo'lim).

> **Eslatma:** bu mashinada migratsiyalar qo'lda qo'llanadi:
> `psql -U postgres -h 127.0.0.1 -d cafesystem -f backend/migrations/00X_*.sql`
> (Docker yo'q, `docker-entrypoint-initdb.d` ishlamaydi).

---

## 10. Bosqichlarga bo'lish (tavsiya etilgan tartib)

Talablar bir-biriga bog'liq, shuning uchun ketma-ketlik muhim:

| № | Bosqich | Nega shu tartibda |
|---|---|---|
| 1 | **Rollar va ruxsatlar** (5-bo'lim) | Kichik, lekin xavfsizlikka tegishli — boshqa ishlar ustiga qurilishidan oldin qilinsin |
| 2 | **Kassa UI + moslashuvchanlik** (1-bo'lim) | Mustaqil, tez natija beradi, kundalik ishni yengillashtiradi |
| 3 | **Audit jurnali** (2.2) | Hisobotning poydevori — usiz 2-bo'limning yarmi ishlamaydi |
| 4 | **Hisobot** (2.3–2.6) | Eng katta qism; jurnal tayyor bo'lgach mantiqiy davomi |
| 5 | **Sozlamalar** (4-bo'lim) | Kichik va mustaqil |
| 6 | **Chek chiqarish** (7-bo'lim) | Poydevor tayyor, faqat boshqaruv qo'shiladi |
| 7 | **Bildirishnomalar** (8-bo'lim) | WebSocket — yangi texnologiya, alohida sinov talab qiladi |
| 8 | **QR sodalashtirish** (3-bo'lim) | Kichik, mijoz tomoni |
| 9 | **Super-admin paneli** (6-bo'lim) | Eng katta — butunlay yangi ilova; oxirida, chunki qolganlari nima boshqarilishini aniqlab beradi |

Har bir bosqich alohida sinovdan o'tkaziladi va `amirxon-qildi.md` ga
yoziladi.

---

## 11. Amalga oshirishda hal qilinadigan savollar

1. **Obuna to'lovi** — Payme yoki Click? (hozircha talab qilinmaydi, lekin
   interfeys qaysi provayderga moslanishi kerakligi keyinroq aniqlanadi).
2. **Super-admin ilovasi qayerda joylashadi** — alohida domen/portmi yoki
   asosiy sayt ostidagi maxfiy yo'lmi.
3. **Chek printeri modeli va qog'oz kengligi** — hozir kod 58 mm (32 belgi)
   ga moslangan (`printer-helper/main.go: lineWidth`); 80 mm printer bo'lsa
   sozlanadigan qilinadi.
4. **Yopilgan buyurtmani kassir tahrirlay oladimi**, yoki faqat
   owner/admin? (moliyaviy javobgarlik masalasi).
5. **Redis** — ishlab chiqarish serverida bo'ladimi? Agar yo'q bo'lsa,
   bildirishnoma in-process rejimda qoladi (bitta server nusxasi uchun
   yetarli).

---

## 12. Ish yakunida

Har bir bosqich uchun:
- `cd backend && go build ./... && go vet ./...` — toza bo'lishi shart.
- Ikkala frontendda `npm run build` — xatosiz.
- Backend qayta ishga tushiriladi: `go build -o server.exe cmd/server/main.go`
  so'ng `.\server.exe` (**`go run` bu mashinada Windows Application Control
  tomonidan bloklanadi** — vaqtinchalik papkadagi exe'ni ishga tushirishga
  ruxsat yo'q).
- Asosiy oqimlar `curl` bilan va brauzerda qo'lda sinaladi.
- `amirxon-qildi.md` ga yangi bosqich sifatida yoziladi.
