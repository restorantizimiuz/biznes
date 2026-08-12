-- ============================================================
-- Kategoriyaga rasm va izoh.
--
-- Mahsulotda (products) bu ikkalasi boshidan bor edi, kategoriyada esa faqat
-- nom. Natijada mijoz menyusidagi kategoriyalar ro'yxati quruq matn bo'lib
-- qolardi. Ustun nomlari products jadvalidagi bilan **bir xil** atalgan —
-- kod ikkalasini bir xil ishlaydi (resolveImageUrl, ImageCropper).
-- ============================================================

ALTER TABLE categories ADD COLUMN image_url   TEXT;
ALTER TABLE categories ADD COLUMN description TEXT;
