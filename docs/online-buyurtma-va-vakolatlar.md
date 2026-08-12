# Online buyurtma, xodim vakolatlari va kategoriya tahrirlash

Bu hujjat 2026-08-12 da kiritilgan katta o'zgarishlar to'plamini tushuntiradi.
To'rt qism bor va ular bir-biridan mustaqil:

1. [Online buyurtma Telegram'dan veb sahifaga ko'chirildi](#1-online-buyurtma-endi-veb-sahifada)
2. [Buyurtma holatini mijoz kuzatib turadi](#2-buyurtma-holatini-kuzatish)
3. [Xodim vakolatlari — har bir xodimga alohida](#3-xodim-vakolatlari)
4. [Kategoriyalarni to'liq tahrirlash](#4-kategoriyalarni-tahrirlash)

Oxirida: [migratsiyalar](#migratsiyalar), [muhit o'zgaruvchilari](#yangi-muhit-ozgaruvchilari),
[nima sinalgan va nima yo'q](#nima-sinalgan).

---

## 1. Online buyurtma endi veb sahifada

### Muammo nima edi

Ilgari uydan buyurtma berish **faqat Telegram orqali** ishlardi. Backend'dagi
`POST /api/v1/telegram/order` ikki narsani talab qilardi:

1. `TELEGRAM_BOT_TOKEN` sozlangan bo'lishi,
2. so'rovda Telegram'ning `initData` imzosi bo'lishi.

Natijada:

- Kafe bot ochmaguncha **umuman** online savdo qila olmasdi.
- Mijoz Telegram ichida bo'lishi shart edi — brauzerdan buyurtma bermas edi.
- Kafe Instagram profiliga qo'yadigan oddiy havolasi yo'q edi.

Bu tizimdan foydalanuvchi kafelar uchun jiddiy cheklov edi.

### Endi qanday ishlaydi

Ikki kanal aniq ajratildi:

| Kanal | Kim uchun | Havola |
|---|---|---|
| **Telegram / QR** | Restoranda **stolda o'tirgan** mijoz | `/?table=<token>` |
| **Ochiq veb sahifa** | **Uydan** buyurtma beradigan mijoz | `/menyu/<business_code>` |

Telegram endi faqat stol uchun. Uydan buyurtma esa hech qanday hisob, bot yoki
ro'yxatdan o'tishni talab qilmaydi.

### Kafe Instagram'ga nima qo'yadi

Kassa panelidagi **Sozlamalar** bo'limida yangi blok paydo bo'ldi:
"Online buyurtma havolasi". U yerda:

- to'liq havola matn sifatida (masalan `https://menu.tizim.uz/menyu/demo-cafe`),
- **"Havolani nusxalash"** tugmasi,
- **QR kod** — varaqa, stikerga yoki stol ustidagi ko'rgazmaga chiqarish uchun,
- **"Yetkazib berish uchun eng kam summa"** maydoni (0 = cheklov yo'q).

Havola backendda yig'iladi (`WEB_MENU_BASE_URL` + `/menyu/` + kafe kodi),
chunki frontend o'zining deploy domenini bilmaydi.

### Mijoz oqimi

```
Instagram havolasi
      ↓
/menyu/<kod>        Menyu: kategoriyalar → taomlar → savat
      ↓
Checkout            1. Buyurtma turi: yetkazib berish / olib ketish
                    2. Ism
                    3. Telefon
                    4. Manzil (faqat yetkazib berishda):
                         "📍 Mening joylashuvim" yoki xaritadan tanlash
                         + manzil matni (tahrirlanadi)
                         + mo'ljal: podyezd, qavat, domofon
                    5. To'lov usuli: naqd / karta / o'tkazma
                    6. "Buyurtmani tasdiqlash"
      ↓
/buyurtma/<token>   Holat kuzatuvi (2-bo'limga qarang)
```

Ism va telefon brauzerda saqlanadi — takroriy buyurtmada qayta yozish shart emas.
Kuzatuv havolasi ham saqlanadi (oxirgi 10 tasi), shuning uchun mijoz sahifani
yopib qayta ochsa ham buyurtmasini topa oladi.

### Xarita: nima uchun OpenStreetMap

**Halol tushuntirish.** Yandex Maps ham, Google Maps ham API kalit talab qiladi:
ro'yxatdan o'tish, akkaunt va Google'da to'lov kartasi biriktirilgan billing.
Buni faqat kafe egasi (siz) qila oladi.

Shuning uchun **kalitsiz ishlaydigan** yechim tanlandi:
OpenStreetMap plitalari + Leaflet xaritasi + Nominatim (koordinatadan manzil).

**Cheklovi:** O'zbekistonda OSM manzil bazasi to'liq emas. Ko'p joyda ko'cha
nomi chiqadi, uy raqami chiqmaydi.

**Dizayn shu cheklovga moslangan:**

- Xarita manzilni faqat **taklif qiladi**.
- Manzil matni **doim tahrirlanadi** — mijoz uy raqamini o'zi yozadi.
- Alohida **"mo'ljal"** maydoni bor (podyezd, qavat, domofon).
- Kuryerga baribir **aniq koordinata** boradi — kassir buyurtma kartochkasidagi
  "🗺 Xaritada ochish" havolasini bosib nuqtani ko'radi.

Ya'ni yetkazib berish OSM manzil sifatidan qat'i nazar ishlaydi.

**Yandex'ga o'tish** kerak bo'lsa: kalit olganingizdan keyin faqat bitta fayl
almashtiriladi — `frontend-telegram/src/maps/provider.ts` (plita manzili) va
backend'dagi `NOMINATIM_URL`. Qolgan kod tegilmaydi.

### Nima uchun xarita so'rovi backend orqali o'tadi

Nominatim foydalanish shartlari aniq `User-Agent` va sekundiga 1 tadan ko'p
bo'lmagan so'rovni talab qiladi. Brauzerdan to'g'ridan-to'g'ri chaqirilsa:

- `User-Agent`ni boshqarib bo'lmaydi,
- har bir mijozning IP'si alohida cheklovga tushadi va **bloklanishi mumkin**.

Shuning uchun `GET /api/v1/geo/reverse` proksisi qo'shildi. U `User-Agent`
qo'yadi, sekundiga 1 ta chastotani ushlab turadi va natijani 24 soat keshlaydi
(koordinata ~11 metrgacha yaxlitlanadi, shuning uchun bir uy atrofidagi
so'rovlar bitta kesh yozuviga tushadi).

### Soxta buyurtmadan himoya

Mijoz tasdiqlanmaydi (SMS yo'q — u alohida provayder shartnomasi va har SMS
uchun to'lovni talab qiladi). O'rniga uch qatlam:

| Qatlam | Qayerda | Nima qiladi |
|---|---|---|
| IP chastotasi | `routes.go` limiter | Bir IP'dan daqiqasiga 5 ta buyurtma |
| Telefon | `weborder.go` | Bir raqamdan bir vaqtda 3 tadan ortiq **ochiq** buyurtma bo'lmaydi |
| Kassir tasdig'i | Oqimning o'zi | Buyurtma `new` holatida tushadi — kassir qabul qilmaguncha oshxonaga ketmaydi |

Uchinchisi eng muhimi: soxta buyurtma eng ko'pi bilan kassirning bir daqiqasini
oladi, mahsulot sarflanmaydi.

**Narx himoyasi:** buyurtma summasi **har doim bazadan** hisoblanadi. Mijoz
so'rovga o'z narxini qo'shsa ham e'tiborsiz qoldiriladi — aks holda so'rovni
brauzer konsolidan o'zgartirib taomni 1 so'mga sotib olish mumkin bo'lardi.
Bu sinov bilan tasdiqlangan.

### Telegram tomonida nima o'zgardi

- `CartScreen` dan buyurtma turi tanlovi (stolga / yetkazib berish / olib
  ketish) **olib tashlandi** — mijoz allaqachon stolda o'tiribdi va tokeni
  havolada bor, tanlov faqat chalg'itardi.
- QR skanerlash bosqichi butunlay yo'qoldi (`utils/qrParser.ts` o'chirildi).
- `TelegramHandler.CreateOnlineOrder` va `POST /api/v1/telegram/order`
  **o'chirildi**.
- Bot: `/start table_<token>` avvalgidek WebApp tugmasini yuboradi.
  Oddiy `/start` esa endi **veb menyu havolasini** yuboradi.

`order_source` enum'idagi eski `online_telegram` qiymati **saqlandi** — bazada
o'sha manbadan kelgan eski buyurtma bor va hisobot tarixi buzilmasligi kerak.

---

## 2. Buyurtma holatini kuzatish

Mijoz buyurtma bergandan keyin `/buyurtma/<token>` sahifasiga tushadi va
buyurtmasi qaysi bosqichda ekanini ko'rib turadi. Sahifa har 5 soniyada
avtomatik yangilanadi.

Havola buyurtma ID'siga emas, alohida `public_token` ustuniga qurilgan: ID
boshqa endpointlarda ham ishlatiladi va uni ommaga berish kerak emas.

### Bosqichlar

Yangi holat mashinasi qurilmadi — mavjud ikkita ustun (`status` va
`kitchen_status`) birlashtirilib mijozga bitta bosqich sifatida ko'rsatiladi.

| Mijoz ko'radi | Bazada | Kim o'zgartiradi |
|---|---|---|
| ⏳ Qabul qilinishi kutilmoqda | `status='new'` | — |
| ✅ Qabul qilindi | `status='activated'` | Kassir ("Qabul qilish") |
| 👨‍🍳 Tayyorlanmoqda | `kitchen_status='preparing'` | Kassir |
| 🍽️ Tayyor | `kitchen_status='ready'` | Kassir |
| 🚚 Kuryerga berildi | `kitchen_status='delivering'` | Kassir, **faqat yetkazib berishda** |
| 📦 Yetkazildi | `kitchen_status='delivered'` | Kassir, **faqat yetkazib berishda** |
| 🎉 Yakunlandi | `status='paid'` | Kassir (to'lov) |
| ❌ Bekor qilindi | `status='cancelled'` | Kassir |

Olib ketish buyurtmasida oxirgi ikkita yetkazish bosqichi ko'rsatilmaydi —
u yerda "Olib ketishga tayyor" oxirgi bosqich bo'ladi.

**Backend buni majburlaydi:** `delivering` va `delivered` ni stolga yoki olib
ketishga qo'yishga urinilsa 400 qaytadi. Bu frontendda yashirishga qo'shimcha —
so'rovni konsoldan yuborib ham qilib bo'lmaydi.

### Kassir tomonida

Buyurtma kartochkasida bosqich tugmalari qatori chiqadi (joriy bosqich to'q
rangda). Online buyurtma bo'lsa yuqorida mijoz ma'lumotlari ham ko'rinadi:

```
👤 Ism
📞 Telefon (bosilsa qo'ng'iroq qilinadi)
📍 Manzil
💬 Mo'ljal
💳 Tanlangan to'lov usuli
🗺 Xaritada ochish  ← koordinata bo'yicha
```

To'lov usuli — mijozning **niyati**. Haqiqiy to'lov kassir buyurtmani
yopganda `payments` jadvaliga yoziladi va boshqacha bo'lishi mumkin.

---

## 3. Xodim vakolatlari

### Muammo nima edi

Ruxsat faqat roldan kelib chiqardi va `routes.go` da qat'iy ro'yxatlarda
qotib qolgan edi:

```go
rolesManage  = []string{"owner", "admin"}
rolesCashier = []string{"owner", "admin", "cashier"}
rolesMenu    = []string{"owner", "admin", "waiter"}
```

Uchta oqibat:

1. **Ofitsiant buyurtma bilan umuman ishlay olmasdi** — u `rolesCashier` da
   yo'q edi. Tizimga kirsa stollarni ko'rardi, lekin buyurtma kirita olmasdi.
   Ofitsiant panelining ma'nosi yo'q edi.
2. **Har bir kafening ish tartibi boshqacha**, lekin sozlash imkoni yo'q edi.
   Birida ofitsiant menyuni ham tahrirlaydi, boshqasida unga faqat buyurtma
   kiritish kerak.
3. **Xodimni umuman tahrirlab bo'lmasdi** — faqat qo'shish va bloklash bor edi.
   Rolni o'zgartirish, parolni tiklash, **bloklangan xodimni qaytarish** —
   hech biri yo'q edi.

### Endi qanday

Rol **standart to'plamni** beradi, admin esa alohida xodimga qo'shimcha ruxsat
berishi yoki olib qo'yishi mumkin.

Yangi `user_permissions` jadvali. **Yozuv bo'lmasa — rol standartiga tushiladi.**
Bu `feature_flags` bilan bir xil naqsh: yangi vakolat qo'shilganda mavjud
xodimlarning ishi to'satdan to'xtamaydi.

### 14 ta vakolat va rol standartlari

| Kalit | Nima beradi | owner | admin | cashier | waiter |
|---|---|:---:|:---:|:---:|:---:|
| `orders.view` | Buyurtmalar bo'limini ko'rish | ✅ | ✅ | ✅ | ✅ **yangi** |
| `orders.create` | Buyurtma yaratish | ✅ | ✅ | ✅ | ✅ **yangi** |
| `orders.edit` | Taom qo'shish/o'chirish, bosqich belgilash | ✅ | ✅ | ✅ | ✅ **yangi** |
| `orders.pay` | To'lovni qabul qilish, chek chiqarish | ✅ | ✅ | ✅ | ❌ |
| `orders.cancel` | Buyurtmani bekor qilish | ✅ | ✅ | ✅ | ❌ |
| `orders.discount` | Chegirma berish | ✅ | ✅ | ✅ | ❌ |
| `menu.view` | Menyuni ko'rish | ✅ | ✅ | ✅ | ✅ |
| `menu.edit` | Menyuni tahrirlash | ✅ | ✅ | ❌ | ✅ |
| `tables.view` | Stollarni ko'rish | ✅ | ✅ | ✅ | ✅ |
| `tables.edit` | Stol va qavatlarni tahrirlash | ✅ | ✅ | ❌ | ✅ |
| `staff.manage` | Xodimlarni boshqarish, yopilgan hisobni tuzatish | ✅ | ✅ | ❌ | ❌ |
| `reports.view` | Hisobotni ko'rish | ✅ | ✅ | ✅ | ❌ |
| `reports.export` | Excelga yuklash | ✅ | ✅ | ✅ | ❌ |
| `settings.edit` | Sozlamalarni o'zgartirish | ✅ | ✅ | ❌ | ❌ |

Pul bilan bog'liq amallar ofitsiantga standart holda **berilmaydi**: ofitsiant
buyurtma qabul qiladi, hisob-kitobni kassir yuritadi. Lekin admin xohlasa
alohida yoqib qo'ya oladi.

### Admin buni qanday o'zgartiradi

**Xodimlar** sahifasi → xodim yonidagi **"Tahrirlash"** tugmasi. Ochilgan oynada:

- ism, login, rol, yangi parol (bo'sh qoldirilsa o'zgarmaydi), faollik;
- pastda **vakolatlar paneli** — har bir vakolat uchta holatli tugma bilan:

| Tugma | Ma'nosi |
|---|---|
| **Rol bo'yicha ✓/✕** | Standartga tayanadi (yonidagi belgi standart nima ekanini ko'rsatadi) |
| **Ruxsat** | Shu xodimga aynan ruxsat berilgan |
| **Taqiq** | Shu xodimga aynan taqiqlangan |

Saqlangandan keyin xodim **qayta login qilishi shart emas** — uning brauzeri
`GET /api/v1/me` orqali yangi ro'yxatni oladi va menyu darhol o'zgaradi.

### Himoya qoidalari

- Kafe **egasini** (`owner`) tahrirlab ham, vakolatini cheklab ham bo'lmaydi.
- Admin **o'zidan** `staff.manage` ni olib tashlay olmaydi — aks holda o'zini
  tizimdan qulflab qo'yardi.
- Admin **o'z rolini** o'zgartira olmaydi va **o'zini bloklay** olmaydi.
- Rolni `cashier`/`waiter` ga o'zgartirishda tarif limiti (`max_waiters`,
  `max_cashiers`) qayta tekshiriladi.
- **Bloklangan xodimni qaytarish endi mumkin** — ilgari buning imkoni umuman
  yo'q edi.

### Texnik eslatma

Vakolatlar JWT token ichiga **ataylab qo'yilmadi**: admin ruxsatni
o'zgartirsa, token muddati tugagunicha (24 soat) eski ruxsat amal qilib
turardi. O'rniga backend'da 30 soniyalik xotira keshi ishlatiladi va admin
o'zgartirganda kesh darhol tozalanadi.

**MUHIM:** frontendda menyu yoki tugmani yashirish — himoya emas, faqat
qulaylik. Haqiqiy tekshiruv har bir endpointda (`middleware/permission.go`).
Ofitsiant brauzer konsolidan so'rov yuborsa ham 403 oladi — bu sinov bilan
tasdiqlangan.

### Ofitsiant endi nima qila oladi

Login qilgandan keyin ofitsiant:

- **Buyurtmalar** sahifasini ochadi, barcha qavat va stollarni ko'radi;
- istalgan stolga buyurtma yaratadi va tahrirlaydi;
- taom qo'shadi, "tayyorlanmoqda"/"tayyor" deb belgilaydi;
- **ko'rmaydi:** to'lov tugmasi, chegirma, chek, kunlik daromad, hisobot.

Ofitsiant yaratgan buyurtmaning manbasi avtomatik `waiter` bo'ladi va
`waiter_assignments` jadvaliga yozuv tushadi — hisobotdagi "qaysi ofitsiant"
ustuni shundan to'ldiriladi. Bu jadval sxemada boshidan bor edi, lekin hech
qachon ishlatilmagan edi.

Manba **roldan** aniqlanadi, mijoz yuborgan qiymatdan emas: aks holda ofitsiant
so'rovni o'zgartirib o'z buyurtmasini kassirniki qilib ko'rsatishi mumkin edi.

---

## 4. Kategoriyalarni tahrirlash

Ilgari kategoriyaning faqat nomini `prompt()` oynasi orqali o'zgartirish mumkin
edi. Rasm ham, izoh ham yo'q edi — mahsulotda esa bularning hammasi bor edi.

Endi kategoriya yonidagi ✎ tugmasi to'liq tahrirlash oynasini ochadi:

- **rasm** — qurilmadan tanlanadi va kesiladi (mahsulot bilan bir xil oyna),
- **nom**,
- **izoh** — mijoz menyusida kategoriya ostida ko'rinadi,
- **tartib raqami** — kategoriyalar ketma-ketligi,
- **"Mijozlarga ko'rinsin"** — o'chirilsa kategoriya mijoz menyusidan yo'qoladi,
  lekin kassada qoladi. Mavsumiy taomlarni **o'chirmasdan** vaqtincha yopish
  uchun (o'chirish ichidagi mahsulotlarni ham yo'qotardi).

Mijoz menyusida kategoriya rasmi endi kassada qo'yilgan rasmdan olinadi.
Rasm qo'yilmagan bo'lsa — avvalgidek ichidagi birinchi rasmli taomdan olinadi,
shunda rasm qo'yishga ulgurmagan kafening menyusi ham quruq qolmaydi.

---

## Migratsiyalar

Migratsiyalar server ishga tushganda avtomatik qo'llanadi
(`internal/database/migrate.go`), har biri alohida tranzaksiyada.

| Fayl | Nima qiladi |
|---|---|
| `009_web_order_source.sql` | `order_source` enum'iga `online_web` qiymati |
| `010_web_order_fields.sql` | `orders` ga: `customer_name`, `delivery_lat`, `delivery_lng`, `delivery_note`, `preferred_payment_method`, `public_token`. `kitchen_status` cheklovi `delivering`/`delivered` bilan kengaydi. `businesses` ga `min_order_amount` |
| `011_category_media.sql` | `categories` ga `image_url` va `description` |
| `012_user_permissions.sql` | `user_permissions` jadvali va indeksi |

**Nima uchun 009 alohida fayl:** PostgreSQL'da enum'ga qo'shilgan yangi
qiymatni **o'sha tranzaksiyaning o'zida ishlatib bo'lmaydi**. Shuning uchun
qiymat 009 da qo'shiladi, undan foydalanadigan o'zgarishlar esa 010 da.

Mavjud buyurtmalarning `public_token` ustuni `DEFAULT uuid_generate_v4()`
orqali avtomatik to'ldi — qo'shimcha `UPDATE` kerak bo'lmadi.

---

## Yangi muhit o'zgaruvchilari

**Backend (`backend/.env`)**

| O'zgaruvchi | Standart | Nima uchun |
|---|---|---|
| `WEB_MENU_BASE_URL` | `http://localhost:5174` | Instagram havolasi shu asosda yig'iladi: `<baza>/menyu/<kod>` |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Manzil aniqlash xizmati. O'z serveringizni ko'tarsangiz shu yerda almashtiriladi |

**Telegram bot (`telegram-bot/.env`)**

| O'zgaruvchi | Nima uchun |
|---|---|
| `WEB_MENU_URL` | Bot oddiy `/start` ga shu havolani yuboradi. Bo'sh qoldirilsa `WEBAPP_URL` ishlatiladi |

`VITE_BOT_USERNAME` (mijoz ilovasida) **endi kerak emas** — u QR skanerlashda
botni tekshirish uchun ishlatilardi, u bosqich esa butunlay olib tashlandi.

---

## Lokal ishga tushirish

```
Backend        :8080   cd backend && go run ./cmd/server
Kassa paneli   :5173   cd frontend-admin && npm run dev
Mijoz ilovasi  :5174   cd frontend-telegram && npm run dev
Super-admin    :5175   cd frontend-superadmin && npm run dev
```

Demo kirish: server `demo-cafe`, login `admin`, parol `demo1234`.

Sinov uchun yaratilgan ofitsiant: login `ofitsiant1`, parol `test1234`.

Tekshiriladigan asosiy manzillar:

| Manzil | Nima |
|---|---|
| `http://localhost:5174/menyu/demo-cafe` | Instagram havolasi — ochiq menyu |
| `http://localhost:5174/?table=<token>` | Telegram stol rejimi |
| `http://localhost:5174/buyurtma/<token>` | Buyurtma holati |
| `http://localhost:5173/settings` | Instagram havolasi va QR kod |
| `http://localhost:5173/staff` | Xodim tahrirlash va vakolatlar |

---

## Nima sinalgan

Jami **198 ta tekshiruv**: 114 tasi haqiqiy HTTP so'rovlar bilan, 84 tasi
haqiqiy brauzerda (Chromium, Playwright). Hammasi muvaffaqiyatli.

**Backend — uchma-uch HTTP so'rovlar (114 ta):**

- Veb buyurtma (42 ta): buyurtma yaratildi va `public_token` qaytdi; kuzatuv
  sahifasi ishladi; kassada ism/telefon/manzil/mo'ljal/koordinata ko'rindi;
  holat oqimi to'liq aylandi; olib ketishda `delivering` va `delivered` 400
  bilan rad etildi; **soxta narx e'tiborsiz qoldirildi** (narx bazadan);
  noto'g'ri to'lov usuli, manzilsiz yetkazib berish va noma'lum bosqich rad
  etildi; kategoriya rasmi/izohi ochiq menyuga o'tdi; yashirilgan kategoriya
  mijoz menyusidan yo'qolib, kassada qoldi; `web_menu_url` to'g'ri yig'ildi;
  geo proksi keshi ishladi.
- Vakolatlar (72 ta): ofitsiant buyurtmani ko'radi, yaratadi va bosqich
  belgilaydi; hisobot, eksport, to'lov, chegirma, bekor qilish, chek, xodimlar
  va sozlamalardan 403 oladi; admin `menu.edit` ni taqiqlagach ofitsiant
  menyuga yoza olmaydi (kesh **darhol** tozalandi); `/me` yangi ro'yxatni
  qaytaradi; PUT shaxsiy o'zgartirishlarni to'liq almashtiradi; noma'lum
  vakolat kaliti rad etiladi; kassir standartlari to'g'ri; admin o'zini
  qulflay, o'z rolini o'zgartira va o'zini bloklay olmaydi; **ikkinchi admin
  kafe egasini tahrirlay ham, cheklay ham olmaydi**; bloklangan xodim
  qaytarildi va yana kira oldi; manba roldan aniqlandi va
  `waiter_assignments` ga yozuv tushdi; IP (daqiqasiga 5 ta), telefon
  (3 ta ochiq) va eng kam summa chegaralari ishladi.

**Brauzer — Chromium (84 ta, konsolda birorta xato yo'q):**

- Mijoz sahifalari (32 ta): `/menyu/demo-cafe` ochildi va menyu chizildi;
  savat va checkout ishladi; **Leaflet xaritasi plitalari bilan chizildi**
  (zoom, OSM manba yozuvi, markazdagi nishon); **brauzer geolokatsiyasi**
  so'raldi va Nominatim proksisi manzil taklif qildi; qo'lda yozilgan manzil
  taklif bilan **almashmadi**; buyurtma yuborildi va `/buyurtma/<token>` ga
  o'tdi; bosqich ko'rsatkichi to'g'ri; sahifa 5 soniyada o'zi yangilanib,
  kassir qo'ygan yangi bosqichni ko'rsatdi; bekor qilinganda mijoz buni
  ko'rdi; ism, telefon va kuzatuv havolasi brauzerda saqlandi.
- Kassa paneli (52 ta): Sozlamalarda havola, **QR kod** va nusxalash tugmasi
  chizildi, eng kam summa interfeysdan saqlandi; kategoriya `prompt()` emas,
  to'liq oyna bilan tahrirlandi (rasm, izoh, tartib, ko'rinuvchanlik) va izoh
  mijoz menyusiga o'tdi; online kartochkada ism, telefon (`tel:`), manzil,
  mo'ljal, to'lov niyati va **xarita havolasi aynan shu koordinata bilan**
  ko'rindi; bosqich tugmalari holatni haqiqatan o'zgartirdi; xodim oynasida
  14 ta vakolat uch holatli tugma bilan chizildi va taqiq saqlandi;
  **ofitsiant ko'zi bilan**: Kassa/Menyu/Stollar bor, Hisobot/Sozlamalar/
  Xodimlar yo'q, kunlik daromad yashirin, to'lov-chegirma-chek tugmalari yo'q,
  `/reports` va `/staff` ga URL orqali ham kira olmadi.

**Sinov paytida topilgan va tuzatilgan xato:** mijoz ma'lumotlari bloki
(ism, telefon, manzil, mo'ljal, xarita havolasi) faqat buyurtma `new`
holatida ko'rinardi — kassir "Qabul qilish" ni bosishi bilan yo'qolib
qolardi. Aynan o'sha paytda kuryer jo'natiladi va manzil eng kerak bo'ladi.
Blok endi qabul qilingandan keyingi oynada ham chiqadi
(`OrdersPage.tsx`, `ActiveOrderPanel`).

- `go build`, `go vet`, `gofmt`, `tsc -b`, `npm run build` — toza.

**Hali ham sinalmagan:**

- Telegram WebApp haqiqiy Telegram ichida sinalmagan (bot tokeni yo'q).
  Stol rejimi brauzerda ochiladi, lekin `initData` imzosini faqat haqiqiy
  Telegram beradi.
- Nominatim'ning O'zbekiston bo'yicha manzil sifati — bu kod emas, ma'lumot
  bazasi masalasi (shuning uchun manzil doim qo'lda tahrirlanadi).

---

## Bu rejaga kirmagan narsalar

Ular ataylab qoldirilgan — kerak bo'lsa alohida ish sifatida qilinadi:

1. **Payme/Click to'lovi.** Hozir to'lov usuli faqat *niyat* sifatida
   saqlanadi, haqiqiy onlayn to'lov yo'q.
2. **Kuryer roli va ilovasi.** "Kuryerga berildi" holat sifatida bor, lekin
   kuryerlarni ro'yxatga olish va buyurtma taqsimlash tizimi yo'q.
3. **Masofaga qarab yetkazib berish narxi.** Faqat eng kam summa bor.
4. **SMS tasdiqlash.** Provayder shartnomasi va har SMS uchun to'lov talab
   qiladi.
