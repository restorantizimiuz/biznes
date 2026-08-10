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
