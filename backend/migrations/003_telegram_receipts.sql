-- ============================================================
-- Telegram orqali chek yuborilganini kuzatish uchun
-- ============================================================

ALTER TABLE orders ADD COLUMN receipt_sent_at TIMESTAMPTZ;
