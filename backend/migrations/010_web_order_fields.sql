-- ============================================================
-- 1) Veb buyurtma uchun mijoz ma'lumotlari
--
-- Online mijozning hisobi yo'q (Telegram initData ham talab qilinmaydi),
-- shuning uchun aloqa ma'lumoti buyurtmaning o'zida saqlanadi — xuddi
-- 005-migratsiyada customer_phone/delivery_address qilingani kabi.
-- ============================================================

ALTER TABLE orders ADD COLUMN customer_name VARCHAR(255);

-- Koordinata manzil matnidan **ustun** turadi: OpenStreetMap O'zbekistonda
-- uy raqamini ko'pincha topa olmaydi, lekin kuryerga aniq nuqta kerak.
-- Shuning uchun mijoz xaritada belgilagan joy alohida saqlanadi va kassir
-- uni xaritada ocha oladi. delivery_note — "mo'ljal" (2-podyezd, 4-qavat).
ALTER TABLE orders ADD COLUMN delivery_lat  DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN delivery_lng  DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN delivery_note TEXT;

-- Mijoz tanlagan to'lov usuli — bu faqat **niyat**. Haqiqiy to'lov kassir
-- buyurtmani yopganda payments jadvaliga yoziladi va boshqacha bo'lishi
-- mumkin (mijoz naqd deb tanlab, karta bilan to'lashi mumkin).
ALTER TABLE orders ADD COLUMN preferred_payment_method VARCHAR(20)
    CHECK (preferred_payment_method IN ('cash', 'card', 'transfer'));

-- Buyurtmani kuzatish havolasi uchun ochiq token.
-- id o'rniga alohida token: id boshqa endpointlarda ham ishlatiladi va uni
-- ommaga berish kerak emas. Token faqat "o'z buyurtmangni ko'rish" uchun.
ALTER TABLE orders ADD COLUMN public_token UUID UNIQUE DEFAULT uuid_generate_v4();

-- ============================================================
-- 2) Buyurtma tayyorlash oqimi kengaytiriladi
--
-- 004-migratsiyada kitchen_status faqat 'preparing'/'ready' edi — stolda
-- o'tirgan mijoz uchun shu yetarli. Yetkazib berishda esa taom tayyor
-- bo'lgandan keyin yana ikki bosqich bor, mijoz ularni ham kuzatishi kerak.
-- Eski ikkala qiymat amal qilaveradi, shuning uchun ma'lumot ko'chirilmaydi.
-- ============================================================

ALTER TABLE orders DROP CONSTRAINT orders_kitchen_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_kitchen_status_check
    CHECK (kitchen_status IN ('preparing', 'ready', 'delivering', 'delivered'));

-- ============================================================
-- 3) Kafe darajasidagi online buyurtma sozlamalari
-- ============================================================

-- 0 = cheklov yo'q. Yetkazib berish arzon buyurtmada zarar keltirmasligi uchun.
ALTER TABLE businesses ADD COLUMN min_order_amount NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (min_order_amount >= 0);

CREATE INDEX idx_orders_public_token ON orders(public_token);
