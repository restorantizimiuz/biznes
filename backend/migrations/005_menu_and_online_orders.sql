-- ============================================================
-- 1) Yashirin o'chirish (soft delete)
--
-- O'chirilgan element shu daqiqadan boshlab barcha ro'yxat va menyulardan
-- butunlay yo'qoladi (hamma SELECT so'rovlar is_deleted=false bilan filtrlanadi),
-- lekin bazadan olib tashlanmaydi — chunki eski buyurtmalar unga bog'langan.
-- Eski cheklar va hisobotlar buzilmaydi: order_items jadvali taom nomi va
-- narxini buyurtma vaqtidagi holida o'z ichida saqlaydi.
-- ============================================================

ALTER TABLE products   ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE categories ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tables     ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE floors     ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2) Online (stolsiz) buyurtmalar
--
-- Mijoz uyda o'tirib yetkazib berish yoki olib ketishga buyurtma berishi mumkin.
-- Bunday buyurtmada table_id NULL bo'ladi, shuning uchun tur va aloqa
-- ma'lumotlari buyurtmaning o'zida saqlanadi.
-- ============================================================

ALTER TABLE orders ADD COLUMN order_type VARCHAR(20) NOT NULL DEFAULT 'dine_in'
    CHECK (order_type IN ('dine_in', 'delivery', 'pickup'));
ALTER TABLE orders ADD COLUMN customer_phone   VARCHAR(30);
ALTER TABLE orders ADD COLUMN delivery_address TEXT;
