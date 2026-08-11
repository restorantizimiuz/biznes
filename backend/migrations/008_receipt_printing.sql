-- ============================================================
-- CHEK CHIQARISH VA BILDIRISHNOMA SOZLAMALARI
--
-- 1) Chek endi faqat to'lovdan keyin avtomatik emas, qo'lda ham chiqariladi
--    (hisob-faktura / qayta chop etish). Oxirgi chop etish vaqti kuzatiladi.
-- 2) Printer sozlamalari .env fayl o'rniga interfeysdan kiritiladi — kassir
--    uchun matn faylini tahrirlash qiyin.
-- 3) Yangi buyurtma ovozi tunda yoki shovqinli joyda keraksiz bo'lishi mumkin.
-- ============================================================

ALTER TABLE orders ADD COLUMN receipt_printed_at TIMESTAMPTZ;

-- Printer rejimi: '' (o'chirilgan), 'network' (TCP 9100), 'file' (USB qurilma fayli)
ALTER TABLE businesses ADD COLUMN printer_mode        VARCHAR(20)  NOT NULL DEFAULT '';
-- network uchun "192.168.1.50:9100", file uchun "/dev/usb/lp0"
ALTER TABLE businesses ADD COLUMN printer_address     VARCHAR(255) NOT NULL DEFAULT '';
-- Qog'oz kengligi belgilarda: 58mm -> 32, 80mm -> 48
ALTER TABLE businesses ADD COLUMN printer_paper_width INT          NOT NULL DEFAULT 32
    CHECK (printer_paper_width BETWEEN 24 AND 64);
-- Mijoz buyurtmasi kelganda kassa panelida ovozli signal chiqsinmi
ALTER TABLE businesses ADD COLUMN notify_sound        BOOLEAN      NOT NULL DEFAULT true;
