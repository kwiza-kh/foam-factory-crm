CREATE TABLE IF NOT EXISTS customers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  contact      TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  level        TEXT NOT NULL DEFAULT '',
  payment_term TEXT NOT NULL DEFAULT '',
  tax_no       TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  custom_columns JSONB NOT NULL DEFAULT '{"products":[],"orders":[],"deliveries":[],"materialCosts":[],"costEntries":[],"statements":[],"payments":[]}'
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS deliveries (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS material_costs (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cost_entries (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS statements (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mobile_users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'pending',
  avatar     TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_customer_idx   ON products(customer_id);
CREATE INDEX IF NOT EXISTS orders_customer_idx     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS deliveries_customer_idx ON deliveries(customer_id);
CREATE INDEX IF NOT EXISTS material_costs_customer_idx ON material_costs(customer_id);
CREATE INDEX IF NOT EXISTS cost_entries_customer_idx ON cost_entries(customer_id);
CREATE INDEX IF NOT EXISTS statements_customer_idx ON statements(customer_id);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments(customer_id);
