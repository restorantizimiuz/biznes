-- ============================================================
-- Veb (Instagram havolasi) orqali kelgan buyurtmalar uchun yangi manba.
--
-- NEGA ALOHIDA FAYL: PostgreSQL enum'ga qo'shilgan yangi qiymatni **o'sha
-- tranzaksiyaning o'zida** ishlatib bo'lmaydi, RunMigrations esa har bir
-- faylni alohida tranzaksiyada bajaradi (internal/database/migrate.go).
-- Shuning uchun qiymat shu yerda qo'shiladi, undan foydalanadigan
-- o'zgarishlar esa keyingi migratsiyada.
--
-- 'online_telegram' qiymati ataylab saqlanadi: Telegram orqali online
-- buyurtma endi qabul qilinmasa ham, bazadagi eski buyurtmalar shu qiymatga
-- bog'langan va tarix buzilmasligi kerak.
-- ============================================================

ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'online_web';
