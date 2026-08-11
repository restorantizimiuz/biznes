-- ============================================================
-- AUDIT JURNALI — "kim, qachon, nima qildi"
--
-- Hisobotda "aynan shu kuni kim nimani qo'shdi/o'chirdi" degan savolga javob
-- berish uchun kerak. Ilgari faqat buyurtmaning yakuniy holati saqlanardi:
-- taom qo'shilgani, miqdor o'zgartirilgani yoki chegirma berilgani haqida
-- hech qanday iz qolmasdi.
--
-- Nega JSONB? Har bir amal turi uchun turli maydonlar kerak (taom nomi,
-- eski/yangi miqdor, to'lov summasi). Alohida ustunlar qilinsa jadval bo'sh
-- kataklarga to'lib ketardi; JSONB esa yangi amal turi qo'shilganda
-- migratsiyasiz kengayadi.
-- ============================================================

CREATE TABLE audit_log (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id),      -- kim (NULL = mijozning o'zi)
    actor_label  VARCHAR(255),                   -- "Telegram mijoz", "QR mijoz" yoki xodim ismi
    order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
    action       VARCHAR(50) NOT NULL,           -- order_created, item_added, item_removed,
                                                 -- item_qty_changed, discount_applied,
                                                 -- order_paid, order_cancelled,
                                                 -- kitchen_status_changed, order_activated,
                                                 -- order_edited_after_close, receipt_printed
    details      JSONB,                          -- {"product":"Osh","from":2,"to":5}
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_business_date ON audit_log(business_id, created_at);
CREATE INDEX idx_audit_order ON audit_log(order_id);
