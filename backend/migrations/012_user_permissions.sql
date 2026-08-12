-- ============================================================
-- XODIM VAKOLATLARI
--
-- Ilgari ruxsat faqat roldan kelib chiqardi (owner/admin/cashier/waiter) va
-- routes.go dagi qat'iy ro'yxatlarda qotib qolgan edi. Amalda har bir kafening
-- ish tartibi boshqacha: birida ofitsiant menyuni ham tahrirlaydi, boshqasida
-- unga faqat buyurtma kiritish kerak. Shuning uchun rol **standart** bo'lib
-- qoladi, admin esa alohida xodimga qo'shimcha ruxsat berishi yoki olib
-- qo'yishi mumkin.
--
-- MUHIM: yozuv bo'lmasa — rol standartiga tushiladi (is_allowed NULL emas,
-- shunchaki qator yo'q). Bu feature_flags va middleware.FeatureEnabled bilan
-- bir xil naqsh: yangi vakolat kaliti qo'shilganda mavjud xodimlarning ishi
-- to'satdan to'xtab qolmaydi.
-- ============================================================

CREATE TABLE user_permissions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_key VARCHAR(50) NOT NULL,
    is_allowed     BOOLEAN NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, permission_key)
);

CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
