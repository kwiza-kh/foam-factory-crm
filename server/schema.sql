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
  custom_columns JSONB NOT NULL DEFAULT '{"products":[],"orders":[],"deliveries":[]}'
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

CREATE TABLE IF NOT EXISTS mobile_users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'employee',
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_customer_idx   ON products(customer_id);
CREATE INDEX IF NOT EXISTS orders_customer_idx     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS deliveries_customer_idx ON deliveries(customer_id);
