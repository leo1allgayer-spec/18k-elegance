ALTER TABLE order_items ADD COLUMN personalization_json TEXT;
ALTER TABLE order_items ADD COLUMN personalization_fee_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS personalization_uploads (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  order_id INTEGER REFERENCES orders(id),
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personalization_upload_order ON personalization_uploads(order_id);
