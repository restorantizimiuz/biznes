# frontend-superadmin — platforma (super-admin) paneli

Bu **alohida ilova va alohida login**. Kafe xodimlari uni umuman ko'rmaydi.

## Nega alohida

Super-admin barcha kafelarning ma'lumotini ko'radi. Agar u kafe paneli ichida
yana bitta rol bo'lganida, rol tekshiruvidagi bitta xato butun tizimni ochib
qo'yishi mumkin edi. Ajratilganda:

- alohida jadval — `platform_admins` (kafe `users` jadvalidan mustaqil),
- alohida JWT kalit — `PLATFORM_JWT_SECRET` (backend uni `JWT_SECRET` bilan bir
  xil bo'lishiga yo'l qo'ymaydi),
- alohida API guruhi — `/api/v1/platform/*`.

Natijada kafe xodimining tokeni bu API'ga hech qanday yo'l bilan yeta olmaydi
va aksincha.

## Imkoniyatlar

- Barcha kafelar ro'yxati: obunasi, stollar/xodimlar soni, oxirgi faollik, holati.
- Yangi kafe yaratish (biznes + birinchi `owner` hisobi + obuna — bitta tranzaksiyada).
- Obuna turi va muddatini belgilash.
- Kafeni vaqtincha to'xtatish (`is_active=false` → xodimlar login qila olmaydi).
- Funksiyalarni yoqish/o'chirish: QR menyu, online buyurtma, Telegram bot,
  chek chiqarish, Excel eksport.
- Limitlar: nechta stol, nechta ofitsiant, nechta kassir.

## Ishga tushirish

```bash
npm install
npm run dev     # http://localhost:5175
```

Boshlang'ich hisob (007-migratsiyada yaratiladi):


| Login        | Parol       |
| ------------ | ----------- |
| `superadmin` | `super1234` |

> **Productionga chiqarishdan oldin** parolni albatta o'zgartiring va
> `PLATFORM_JWT_SECRET` ni muhit o'zgaruvchisi orqali bering.

## Sozlash

`VITE_API_URL` — backend manzili (standart `http://localhost:8080/api/v1`).



> **men yangi dizayn kiritim va ishga tushurdim**
