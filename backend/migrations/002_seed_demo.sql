-- ============================================================
-- TEST UCHUN NAMUNA MA'LUMOTLAR
-- Parol: "demo1234" (bcrypt bilan shifrlangan)
-- Login qilish uchun: server="demo-cafe", login="admin", parol="demo1234"
-- ============================================================

INSERT INTO businesses (id, business_code, name, type, language, theme_mode, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'demo-cafe', 'Demo Cafe', 'cafe', 'uz', 'light', true);

INSERT INTO subscriptions (business_id, plan, status, ends_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'full', 'active', now() + interval '30 days');

-- Parol hash "demo1234" uchun (bcrypt, cost=10)
INSERT INTO users (business_id, full_name, login, password_hash, role)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Admin Foydalanuvchi',
  'admin',
  '$2b$10$oW15nqz19OfX5NnSakdvt.dS5XFzD2yi08MNDLF6dYmMgDzI.kG3y',
  'owner'
);

INSERT INTO floors (id, business_id, name, sort_order)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '1-qavat', 1);

INSERT INTO tables (floor_id, name)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'Stol 1'),
  ('22222222-2222-2222-2222-222222222222', 'Stol 2'),
  ('22222222-2222-2222-2222-222222222222', 'Stol 3');

INSERT INTO categories (id, business_id, name, sort_order)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Issiq taomlar', 1);

INSERT INTO products (category_id, business_id, name, description, price)
VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Lag''mon', 'Qo''l lag''moni, mol go''shti bilan', 35000),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Osh', 'An''anaviy o''zbek oshi', 30000);
