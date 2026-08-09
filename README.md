# Cafe/Restoran boshqaruv tizimi

Kafe, restoran va shunga o'xshash ovqatlanish joylari uchun to'liq tizim:
menyu boshqaruvi, QR-kod orqali stoldan buyurtma, Telegram bot orqali online
buyurtma, kassa, ofitsiant paneli va buhgalteriya hisobotlari.

## Texnologiyalar

| Qatlam | Texnologiya |
|---|---|
| Backend | Go 1.22 + Fiber |
| Baza | PostgreSQL 16 |
| Cache / Real-time | Redis 7 |
| Frontend (keyingi bosqich) | React + Vite |
| Mobil/Desktop (keyingi bosqich) | Flutter |

## Loyiha tuzilishi

```
cafe-system/
├── backend/
│   ├── cmd/server/          → dastur kirish nuqtasi (main.go)
│   ├── internal/
│   │   ├── config/          → .env sozlamalarini o'qish
│   │   ├── database/        → PostgreSQL va Redis ulanishi
│   │   ├── models/          → ma'lumot strukturalari
│   │   ├── handlers/        → API endpoint'lar (biznes logika)
│   │   └── middleware/      → JWT autentifikatsiya
│   ├── migrations/          → SQL sxema va namuna ma'lumotlar
│   └── Dockerfile
├── frontend-admin/          → kassa/admin panel (keyingi bosqich)
├── frontend-qr/             → mijozlar uchun QR-menyu sahifasi (keyingi bosqich)
├── docs/                    → arxitektura hujjatlari
└── docker-compose.yml
```

## Ishga tushirish (lokal, Docker bilan)

1. Docker va Docker Compose o'rnatilgan bo'lishi kerak
2. Loyiha papkasida:

```bash
docker-compose up --build
```

Bu buyruq PostgreSQL, Redis va backendni birgalikda ishga tushiradi.
Baza birinchi marta ishga tushganda `backend/migrations/` papkasidagi
SQL fayllar avtomatik ishlaydi (sxema + test ma'lumotlar).

3. Server tayyor: `http://localhost:8080/health`

## Test uchun kirish ma'lumotlari (demo)

Migratsiya bilan birga test kafe ham yaratiladi:

- **Server (business_code):** `demo-cafe`
- **Login:** `admin`
- **Parol:** `demo1234`

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"business_code":"demo-cafe","login":"admin","password":"demo1234"}'
```

## Docker'siz, to'g'ridan-to'g'ri ishga tushirish

```bash
cd backend
cp .env.example .env
go mod tidy      # barcha kutubxonalarni yuklab oladi
go run cmd/server/main.go
```

(Bu holatda PostgreSQL va Redis'ni o'zingiz alohida o'rnatishingiz kerak
bo'ladi, yoki faqat ularni Docker orqali ishga tushirib, backendni lokal
ishlatishingiz mumkin: `docker-compose up postgres redis`)

## Hozircha nima tayyor (MVP - 1-bosqich)

- [x] Ma'lumotlar bazasi to'liq sxemasi (multi-tenant)
- [x] Login (server + login + parol → JWT token)
- [x] Menyu (kategoriya, mahsulot, "tugadi" belgisi)
- [x] Qavat va stollar, QR-token generatsiya
- [x] Buyurtma yaratish/faollashtirish/to'lash/bekor qilish/chegirma
- [x] QR orqali mijoz buyurtma berishi (login talab qilmaydi)
- [x] Redis orqali real-time bildirishnoma (yangi buyurtma kelganda)
- [x] Xodimlar (kassir/ofitsiant) qo'shish
- [x] Kunlik hisobot va Excel eksport

## Keyingi bosqichlar

- [ ] Frontend (kassa admin panel) — React
- [ ] QR-menyu mijoz sahifasi — React (yengil versiya)
- [ ] Telegram bot + Mini App integratsiyasi
- [ ] To'lov tizimlari (Payme/Click) — obuna to'lovi uchun
- [ ] Super-admin panel (biz uchun — barcha kafelarni boshqarish)
- [ ] Mobil/Desktop ilova — Flutter
- [ ] WebSocket ulanishi (hozircha Redis pub/sub tayyor, frontend WS orqali tinglashi kerak)

Batafsil arxitektura tavsifi: [`docs/architecture.md`](./docs/architecture.md)
