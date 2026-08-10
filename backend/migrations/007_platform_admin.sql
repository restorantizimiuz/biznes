-- ============================================================
-- SUPER-ADMIN (PLATFORMA) DARAJASI
--
-- Platforma egalari kafe xodimlaridan **butunlay ajratilgan**: alohida jadval,
-- alohida login, alohida JWT kalit (PLATFORM_JWT_SECRET). Sabab: super-admin
-- barcha kafelarning ma'lumotini ko'radi — agar u users jadvalida yana bitta
-- rol bo'lganida, rol tekshiruvidagi bitta xato butun tizimni ochib qo'yardi.
-- Ajratilgan holatda kafe tokeni /api/v1/platform/* ga umuman yaramaydi.
-- ============================================================

CREATE TABLE platform_admins (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name     VARCHAR(255) NOT NULL,
    login         VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Har bir kafe uchun limitlar.
--
-- Limit backendda, yaratish endpointlarida majburlanadi (CreateTable,
-- CreateStaff) — faqat frontendda tekshirish yetarli emas, chunki so'rovni
-- brauzer konsolidan ham yuborish mumkin.
-- ============================================================

ALTER TABLE businesses ADD COLUMN max_tables   INT NOT NULL DEFAULT 50  CHECK (max_tables   > 0);
ALTER TABLE businesses ADD COLUMN max_waiters  INT NOT NULL DEFAULT 10  CHECK (max_waiters  > 0);
ALTER TABLE businesses ADD COLUMN max_cashiers INT NOT NULL DEFAULT 3   CHECK (max_cashiers > 0);

-- ============================================================
-- Boshlang'ich super-admin.
-- Login: superadmin, parol: super1234
-- MUHIM: productionga chiqarishdan oldin parol albatta o'zgartirilsin.
-- ============================================================

INSERT INTO platform_admins (full_name, login, password_hash)
VALUES ('Platforma administratori', 'superadmin',
        '$2a$10$lV/QkXZWYmu4ctxSPHPp6.qUSrNwHaEOhWllrbgUP6mueTBGwLJF2');

-- ============================================================
-- Funksiya bayroqlari (feature_flags jadvali 001-migratsiyada yaratilgan,
-- lekin shu paytgacha ishlatilmagan). Mavjud kafelar uchun hamma funksiya
-- yoqilgan holatda boshlanadi — aks holda yangilanishdan keyin ishlayotgan
-- kafening QR menyusi to'satdan o'chib qolardi.
-- ============================================================

INSERT INTO feature_flags (business_id, feature_key, is_enabled)
SELECT b.id, k.feature_key, true
FROM businesses b
CROSS JOIN (VALUES
    ('qr_menu'),
    ('online_order'),
    ('telegram_bot'),
    ('receipt_print'),
    ('reports_export')
) AS k(feature_key)
ON CONFLICT (business_id, feature_key) DO NOTHING;
