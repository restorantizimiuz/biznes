-- ============================================================
-- CAFE SYSTEM - Asosiy ma'lumotlar bazasi sxemasi
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. SUPER ADMIN (biz - loyiha egalari) darajasi
-- ============================================================

-- Obuna turlari: 1=oddiy, 2=QR bilan, 3=to'liq (online+telegram)
CREATE TYPE subscription_plan AS ENUM ('basic', 'qr', 'full');
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'suspended');

CREATE TABLE businesses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_code   VARCHAR(50) UNIQUE NOT NULL,     -- login vaqtida "server" sifatida kiritiladigan unikal kod
    name            VARCHAR(255) NOT NULL,          -- kafe/restoran nomi
    type            VARCHAR(50) DEFAULT 'cafe',      -- 'cafe' yoki 'restaurant'
    phone           VARCHAR(20),
    address         TEXT,
    language        VARCHAR(5) DEFAULT 'uz',         -- uz, ru, en
    theme_mode      VARCHAR(10) DEFAULT 'light',     -- light, dark
    telegram_bot_token VARCHAR(255),                 -- ushbu kafega tegishli bot tokeni
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan            subscription_plan NOT NULL DEFAULT 'basic',
    status          subscription_status NOT NULL DEFAULT 'active',
    starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at         TIMESTAMPTZ NOT NULL,
    created_by_admin VARCHAR(255),                   -- qaysi super-admin qo'lda kiritgani
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Har bir biznes uchun qaysi funksiyalar yoqilgan/o'chirilganini belgilaydi
CREATE TABLE feature_flags (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    feature_key     VARCHAR(100) NOT NULL,   -- masalan: 'qr_menu', 'online_order', 'telegram_bot'
    is_enabled      BOOLEAN DEFAULT false,
    UNIQUE(business_id, feature_key)
);

-- ============================================================
-- 2. FOYDALANUVCHILAR VA ROLLAR
-- ============================================================

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'cashier', 'waiter');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    full_name       VARCHAR(255) NOT NULL,
    login           VARCHAR(100) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'cashier',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(business_id, login)   -- login biznes ichida unikal (bir xil login boshqa kafeda bo'lishi mumkin)
);

-- ============================================================
-- 3. KASSALAR VA SMENALAR
-- ============================================================

CREATE TABLE cash_registers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL DEFAULT '1-kassa',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cash_shifts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cash_register_id    UUID NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
    opened_by           UUID REFERENCES users(id),
    closed_by           UUID REFERENCES users(id),
    opening_balance      NUMERIC(14,2) DEFAULT 0,
    closing_balance      NUMERIC(14,2),
    opened_at           TIMESTAMPTZ DEFAULT now(),
    closed_at            TIMESTAMPTZ
);

-- ============================================================
-- 4. JOYLASHUV: QAVATLAR VA STOLLAR
-- ============================================================

CREATE TYPE table_status AS ENUM ('empty', 'occupied', 'pending_payment');

CREATE TABLE floors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,  -- masalan "1-qavat", "Yozgi terassa"
    sort_order      INT DEFAULT 0
);

CREATE TABLE tables (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    floor_id        UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,     -- masalan "Stol 5"
    qr_code_token   VARCHAR(100) UNIQUE NOT NULL DEFAULT uuid_generate_v4()::text, -- QR link uchun unikal token
    status          table_status NOT NULL DEFAULT 'empty',
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. XODIMLAR (Ofitsiantlar)
-- ============================================================
-- Eslatma: ofitsiantlar ham users jadvalida role='waiter' bilan saqlanadi,
-- alohida jadval shart emas - kod soddaligi uchun.

-- ============================================================
-- 6. MENYU: KATEGORIYA VA MAHSULOTLAR
-- ============================================================

CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    sort_order      INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT true
);

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    price           NUMERIC(14,2) NOT NULL,
    image_url       TEXT,
    is_available    BOOLEAN DEFAULT true,   -- "tugadi" bo'lsa false qilinadi, menyudan yashiriladi
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. TELEGRAM MIJOZLARI (online buyurtma uchun)
-- ============================================================

CREATE TABLE telegram_customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    telegram_id     BIGINT NOT NULL,
    telegram_username VARCHAR(255),
    full_name       VARCHAR(255),
    phone           VARCHAR(20),
    location_lat    DOUBLE PRECISION,
    location_lng    DOUBLE PRECISION,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(business_id, telegram_id)
);

-- ============================================================
-- 8. BUYURTMALAR
-- ============================================================

CREATE TYPE order_source AS ENUM ('cashier', 'qr', 'online_telegram', 'waiter');
CREATE TYPE order_status AS ENUM ('new', 'activated', 'paid', 'cancelled');

CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    table_id            UUID REFERENCES tables(id),              -- online buyurtmada NULL bo'lishi mumkin
    cash_shift_id       UUID REFERENCES cash_shifts(id),
    source              order_source NOT NULL,
    status              order_status NOT NULL DEFAULT 'new',
    created_by_user_id  UUID REFERENCES users(id),                -- kassir yoki ofitsiant
    telegram_customer_id UUID REFERENCES telegram_customers(id),  -- faqat online buyurtma uchun
    total_amount        NUMERIC(14,2) DEFAULT 0,
    discount_amount      NUMERIC(14,2) DEFAULT 0,
    discount_reason      TEXT,
    final_amount         NUMERIC(14,2) DEFAULT 0,   -- total - discount
    created_at           TIMESTAMPTZ DEFAULT now(),
    activated_at          TIMESTAMPTZ,
    paid_at               TIMESTAMPTZ
);

CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    product_name    VARCHAR(255) NOT NULL,  -- buyurtma vaqtidagi nom (mahsulot keyin o'zgarsa ham tarix saqlanadi)
    unit_price      NUMERIC(14,2) NOT NULL, -- buyurtma vaqtidagi narx
    quantity        INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Buyurtma holati o'zgarishlari tarixi (hisobot uchun: "soat nechida nima bo'lgan")
CREATE TABLE order_status_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status          order_status NOT NULL,
    changed_by      UUID REFERENCES users(id),
    changed_at      TIMESTAMPTZ DEFAULT now()
);

-- Buyurtma bekor qilinganda sababi bilan qayd etiladi
CREATE TABLE order_cancellations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    reason          TEXT NOT NULL,
    cancelled_by    UUID REFERENCES users(id),
    cancelled_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. OFITSIANT XIZMATI (qaysi ofitsiant qaysi stolga xizmat ko'rsatgan)
-- ============================================================

CREATE TABLE waiter_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    waiter_id       UUID NOT NULL REFERENCES users(id),
    assigned_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. TO'LOVLAR
-- ============================================================

CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'card');
CREATE TYPE card_type AS ENUM ('uzcard', 'humo', 'visa', 'mastercard');

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method          payment_method NOT NULL,
    card_type       card_type,                  -- faqat method='card' bo'lsa to'ldiriladi
    amount          NUMERIC(14,2) NOT NULL,      -- bitta to'lov qismi (bo'lib to'lash uchun bir nechta qator bo'lishi mumkin)
    received_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEKSLAR (tezlik uchun)
-- ============================================================

CREATE INDEX idx_orders_business_created ON orders(business_id, created_at);
CREATE INDEX idx_orders_status ON orders(business_id, status);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_business ON products(business_id, is_available);
CREATE INDEX idx_tables_floor ON tables(floor_id);
CREATE INDEX idx_users_business_login ON users(business_id, login);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_telegram_customers_business ON telegram_customers(business_id, telegram_id);
