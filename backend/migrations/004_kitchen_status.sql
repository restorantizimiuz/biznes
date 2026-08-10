-- ============================================================
-- Oshxona holati: kassir buyurtmani qabul qilgandan keyin uni
-- "tayyorlanmoqda" yoki "tayyor" deb belgilaydi. Bu holat mijozga
-- QR/Telegram sahifasida ko'rinib turadi.
--
-- Mavjud order_status enum'iga tegilmaydi (u to'lov/bekor qilish
-- oqimini bildiradi) — oshxona holati alohida ustunda saqlanadi.
-- ============================================================

ALTER TABLE orders ADD COLUMN kitchen_status VARCHAR(20) NOT NULL DEFAULT 'preparing'
    CHECK (kitchen_status IN ('preparing', 'ready'));
