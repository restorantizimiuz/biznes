-- ============================================================
-- TELEGRAM MIJOZ PROFILI
--
-- Mini App'da mijoz endi o'z profilini ko'radi va tahrirlaydi: telefon
-- raqami va yetkazib berish manzili saqlanadi, checkout esa shu ma'lumot
-- bilan avtomatik to'ladi. Ilgari mijoz har buyurtmada ism/telefon/manzilni
-- boshidan yozardi.
--
-- MUHIM: `phone`, `location_lat`, `location_lng` ustunlari
-- 001_init_schema.sql da telegram_customers jadvali bilan birga
-- **allaqachon yaratilgan**, lekin Go kodida bir marta ham ishlatilmagan.
-- Ular aynan shu maqsad uchun qo'yilgan edi, shuning uchun qayta
-- yaratilmaydi — bu yerda faqat yetishmayotgan ikkita matn ustuni
-- qo'shiladi.
--
-- Nega manzil matni koordinatadan alohida: OpenStreetMap O'zbekistonda uy
-- raqamini ko'pincha topa olmaydi (qarang: 010_web_order_fields.sql dagi
-- izoh), shuning uchun mijoz yozgan matn koordinatadan mustaqil saqlanadi.
-- ============================================================

ALTER TABLE telegram_customers ADD COLUMN delivery_address TEXT;

-- Mo'ljal: "2-podyezd, 4-qavat" kabi qo'shimcha izoh. orders.delivery_note
-- bilan bir xil ma'noda — profil buyurtma formasini oldindan to'ldiradi.
ALTER TABLE telegram_customers ADD COLUMN delivery_note TEXT;

-- Profil sahifasi mijozning oxirgi buyurtmalarini shu ustun bo'yicha
-- filtrlab, sana bo'yicha teskari tartibda oladi. Usiz har ochilishda
-- butun orders jadvali skanerlanardi.
CREATE INDEX idx_orders_telegram_customer
    ON orders(telegram_customer_id, created_at DESC);
