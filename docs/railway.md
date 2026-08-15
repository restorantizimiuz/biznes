# Railway'ga joylashtirish (deploy)

Bu hujjat Cafe System'ni Railway'da noldan ishga tushirish tartibini beradi.

---

## 1. Nima joylashtiriladi

| Xizmat | Papka | Turi | Domen |
|---|---|---|---|
| PostgreSQL | — | Railway bazasi | ichki |
| `backend` | `backend/` | Dockerfile | ✅ ochiq |
| `frontend-admin` (kassa) | `frontend-admin/` | Nixpacks (Node) | ✅ ochiq |
| `frontend-telegram` | `frontend-telegram/` | Nixpacks (Node) | ✅ ochiq (HTTPS shart) |
| `frontend-superadmin` | `frontend-superadmin/` | Nixpacks (Node) | ✅ ochiq |
| `telegram-bot` | `telegram-bot/` | Dockerfile | ❌ worker (port yo'q) |

**Redis kerak emas.** Bildirishnomalar server ichidagi hub orqali ishlaydi
(`internal/notify`). Redis faqat bir nechta backend nusxasi ishlaganda
qo'shiladi.

### `printer-helper` joylashtirilmaydi

U **kassir kompyuterida** ishlashi shart, chunki vazifasi — USB yoki lokal
tarmoqdagi chek printeriga yozish. Bulutdagi server kassaning printeriga
yeta olmaydi. Kassa paneli unga `http://127.0.0.1:9123` orqali murojaat
qiladi, ya'ni u brauzer ochilgan kompyuterda turishi kerak.

---

## 2. Migratsiyalar avtomatik

Baza sxemasi server ishga tushganda **o'zi yangilanadi**
(`internal/database/migrate.go`):

- migratsiya fayllari binarga qo'shilgan (`go:embed`), shuning uchun
  konteynerda alohida papka kerak emas;
- bajarilganlari `schema_migrations` jadvalida qayd etiladi, ya'ni qayta
  ishga tushirishda takrorlanmaydi;
- har biri alohida tranzaksiyada — biri xato bersa, oldingilari saqlanadi;
- `002_seed_demo.sql` faqat `SEED_DEMO=true` bo'lganda qo'llanadi.

Qo'lda `psql` bilan ishlash **shart emas**.

---

## 3. Qadamlar

### 3.1. Loyiha va baza

```bash
railway login                      # yoki: export RAILWAY_API_TOKEN=...
railway init --name cafe-system
railway add --database postgres
```

### 3.2. Backend

Yangi xizmat, **Root Directory = `backend`**. O'zgaruvchilar:

| O'zgaruvchi | Qiymat |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | uzun tasodifiy satr |
| `PLATFORM_JWT_SECRET` | **boshqa** uzun tasodifiy satr |
| `ENVIRONMENT` | `production` |
| `ALLOWED_ORIGINS` | uchala frontend domeni, vergul bilan |
| `UPLOAD_DIR` | `/data/uploads` |
| `TELEGRAM_BOT_TOKEN` | BotFather bergan token |
| `TELEGRAM_BOT_USERNAME` | bot username'i (`@`siz) |
| `WEB_MENU_BASE_URL` | `frontend-telegram` xizmatining ochiq domeni, `https://` bilan |

> `JWT_SECRET` va `PLATFORM_JWT_SECRET` **bir xil bo'lsa server ishga
> tushmaydi** — bu ataylab qilingan tekshiruv: aks holda kafe xodimining
> tokeni super-admin API'sida ham ishlab ketardi.

#### `WEB_MENU_BASE_URL` nima uchun kerak

Kassa panelidagi **Sozlamalar → Online buyurtma havolasi** shu manzil
asosida yig'iladi: `<baza>/menyu/<kafe-kodi>`. Kafe aynan shu havolani
Instagram profiliga qo'yadi.

O'zgaruvchi ko'rsatilmasa havola `http://localhost:5174/menyu/<kod>` bo'lib
qoladi — mijoz uni ocha olmaydi. Bu bir marta sodir bo'lgan: jadvalda
o'zgaruvchi yo'q edi, shuning uchun deploy paytida o'tkazib yuborilgan.
Endi bunday holatda server logida ogohlantirish chiqadi va Sozlamalar
sahifasi havolani sariq ogohlantirish bilan ko'rsatadi.

Qiymat `frontend-telegram` domeni bo'lishi kerak — kassa (`frontend-admin`)
yoki backend domeni **emas**. Oxirida `/` shart emas.

> Havola backenddan har so'rovda qayta olinadi, shuning uchun bu
> o'zgaruvchini o'zgartirganda **frontendlarni qayta build qilish shart
> emas** — backend qayta ishga tushishi kifoya.

**Volume qo'shish shart:** mount path `/data`. Usiz menyu rasmlari har
deploydan keyin yo'qoladi (konteyner diski vaqtinchalik).

So'ng domen oching (Settings → Networking → Generate Domain).

### 3.3. Frontendlar

Har biri alohida xizmat, Root Directory mos papka. Vite o'zgaruvchilarni
**build vaqtida** JS ichiga yozadi, shuning uchun ular birinchi build'dan
oldin kiritilishi kerak:

| Xizmat | O'zgaruvchilar |
|---|---|
| `frontend-admin` | `VITE_API_URL=https://<backend-domen>/api/v1` |
| `frontend-telegram` | `VITE_API_URL=...`, `VITE_BOT_USERNAME=<bot username>` |
| `frontend-superadmin` | `VITE_API_URL=...` |

> Backend domenini keyin o'zgartirsangiz, frontendlarni **qayta build
> qilish** kerak — eski manzil JS ichida qotib qolgan bo'ladi.

> `frontend-telegram` domenini o'zgartirsangiz (yoki unga o'z domeningizni
> ulasangiz), backenddagi `WEB_MENU_BASE_URL` ni ham yangilang — aks holda
> Sozlamalardagi online buyurtma havolasi eski manzilga ishora qilib
> qoladi.

### 3.4. Telegram bot

Root Directory = `telegram-bot`, domen **berilmaydi**.

| O'zgaruvchi | Qiymat |
|---|---|
| `BOT_TOKEN` | BotFather tokeni |
| `WEBAPP_URL` | `https://<frontend-telegram domeni>` |
| `BUSINESS_CODE` | kafe kodi (masalan `demo-cafe`) |

BotFather'da WebApp domenini ham ro'yxatdan o'tkazing:
`/setdomain` → botni tanlang → `https://<frontend-telegram domeni>`.

### 3.5. Birinchi kafe

Baza bo'sh keladi (demo ma'lumot qo'yilmaydi), lekin super-admin hisobi
`007` migratsiyasida yaratiladi:

| Login | Parol |
|---|---|
| `superadmin` | `super1234` |

1. `https://<superadmin-domen>` ga kiring.
2. **Parolni darhol o'zgartiring** (hozircha bazadan: `platform_admins`).
3. "＋ Yangi kafe" — kafe kodi, nomi va egasining hisobi yaratiladi.
4. Kafe egasi `https://<kassa-domen>` ga o'sha kod bilan kiradi.

---

## 4. Deploydan keyin tekshirish

```bash
curl https://<backend-domen>/health                   # {"status":"ok"}
curl -X POST https://<backend-domen>/api/v1/platform/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"superadmin","password":"<parol>"}'    # token qaytishi kerak
```

Keyin brauzerda: kassa paneliga kirish → menyu qo'shish → stol yaratish →
buyurtma → to'lov → hisobot.

---

## 5. Xavfsizlik ro'yxati

- [ ] `ENVIRONMENT=production`
- [ ] `JWT_SECRET` va `PLATFORM_JWT_SECRET` — uzun, tasodifiy va **har xil**
- [ ] `ALLOWED_ORIGINS` — `*` emas, aniq domenlar
- [ ] `SEED_DEMO` yoqilmagan (demo hisob paroli hammaga ma'lum)
- [ ] `superadmin` paroli o'zgartirilgan
- [ ] `UPLOAD_DIR` volume'ga ko'rsatilgan
- [ ] `WEB_MENU_BASE_URL` — `frontend-telegram` domeni (localhost emas);
      Sozlamalarda sariq ogohlantirish ko'rinmasligi kerak
- [ ] `.env` fayllar repoga tushmagan (`.gitignore` da)
