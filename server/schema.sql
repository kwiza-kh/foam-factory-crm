CREATE TABLE IF NOT EXISTS customers (
  id             VARCHAR(191) PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  contact        VARCHAR(255) NOT NULL DEFAULT '',
  phone          VARCHAR(255) NOT NULL DEFAULT '',
  address        VARCHAR(255) NOT NULL DEFAULT '',
  level          VARCHAR(255) NOT NULL DEFAULT '',
  payment_term   VARCHAR(255) NOT NULL DEFAULT '',
  tax_no         VARCHAR(255) NOT NULL DEFAULT '',
  note           VARCHAR(255) NOT NULL DEFAULT '',
  custom_columns JSON NOT NULL DEFAULT ('{"products":[],"orders":[],"deliveries":[],"materialCosts":[],"costEntries":[],"statements":[],"payments":[]}'),
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FULLTEXT INDEX customers_name_ft (name)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id          VARCHAR(191) PRIMARY KEY,
  customer_id VARCHAR(191) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  data        JSON NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX products_customer_idx (customer_id),
  INDEX products_customer_sort_idx (customer_id, sort_order),
  CONSTRAINT products_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id          VARCHAR(191) PRIMARY KEY,
  customer_id VARCHAR(191) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  data        JSON NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX orders_customer_idx (customer_id),
  INDEX orders_customer_sort_idx (customer_id, sort_order),
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deliveries (
  id          VARCHAR(191) PRIMARY KEY,
  customer_id VARCHAR(191) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  data        JSON NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX deliveries_customer_idx (customer_id),
  INDEX deliveries_customer_sort_idx (customer_id, sort_order),
  CONSTRAINT deliveries_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_costs (
  id          VARCHAR(191) PRIMARY KEY,
  customer_id VARCHAR(191) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  data        JSON NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX material_costs_customer_idx (customer_id),
  INDEX material_costs_customer_sort_idx (customer_id, sort_order),
  CONSTRAINT material_costs_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cost_entries (
  id          VARCHAR(191) PRIMARY KEY,
  customer_id VARCHAR(191) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  data        JSON NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX cost_entries_customer_idx (customer_id),
  INDEX cost_entries_customer_sort_idx (customer_id, sort_order),
  CONSTRAINT cost_entries_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS statements (
  id          VARCHAR(191) PRIMARY KEY,
  customer_id VARCHAR(191) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  data        JSON NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX statements_customer_idx (customer_id),
  INDEX statements_customer_sort_idx (customer_id, sort_order),
  CONSTRAINT statements_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id          VARCHAR(191) PRIMARY KEY,
  customer_id VARCHAR(191) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  data        JSON NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX payments_customer_idx (customer_id),
  INDEX payments_customer_sort_idx (customer_id, sort_order),
  CONSTRAINT payments_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mobile_users (
  id               VARCHAR(191) PRIMARY KEY,
  name             VARCHAR(255) NOT NULL DEFAULT '',
  phone            VARCHAR(255) NOT NULL UNIQUE,
  role             VARCHAR(255) NOT NULL DEFAULT 'pending',
  avatar           VARCHAR(255) NOT NULL DEFAULT '',
  password_hash    VARCHAR(255) NOT NULL DEFAULT '',
  token            VARCHAR(255) NOT NULL UNIQUE,
  token_expires_at DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  `key`      VARCHAR(191) PRIMARY KEY,
  data       JSON NOT NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
