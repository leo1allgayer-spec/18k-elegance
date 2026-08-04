PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sku TEXT UNIQUE,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  pix_price_cents INTEGER CHECK(pix_price_cents >= 0),
  weight_grams INTEGER NOT NULL DEFAULT 0,
  width_cm REAL NOT NULL DEFAULT 0,
  height_cm REAL NOT NULL DEFAULT 0,
  length_cm REAL NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  finish TEXT,
  price_cents INTEGER,
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  birth_date TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT,
  recipient TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  PRIMARY KEY(cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending_payment',
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  shipping_method TEXT NOT NULL,
  shipping_address_json TEXT,
  tracking_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  unit_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL DEFAULT 'mercado_pago',
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  raw_status TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
  value INTEGER NOT NULL,
  minimum_cents INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  expires_at TEXT,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  rewards_issued INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gift_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  purchaser_customer_id INTEGER REFERENCES customers(id),
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  message TEXT,
  initial_cents INTEGER NOT NULL,
  balance_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured, active);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

INSERT OR IGNORE INTO categories(name, slug, sort_order) VALUES
('Elegance Baby', 'elegance-baby', 10),
('Elegance 925', 'elegance-925', 20),
('Personalizados', 'personalizados', 30),
('Fotogravação', 'fotogravacao', 40),
('Brincos', 'brincos', 50),
('Pulseiras', 'pulseiras', 60),
('Pingentes', 'pingentes', 70),
('Gargantilhas', 'gargantilhas', 80),
('Linha masculina', 'linha-masculina', 90),
('Anéis', 'aneis', 100),
('Tornozeleiras', 'tornozeleiras', 110),
('Piercings', 'piercings', 120),
('Essência Materna', 'essencia-materna', 130),
('Empreenda com a Elegance', 'empreenda', 140);
