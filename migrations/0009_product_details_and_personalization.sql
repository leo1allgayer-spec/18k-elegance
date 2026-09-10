ALTER TABLE products ADD COLUMN piece_length TEXT;
ALTER TABLE products ADD COLUMN material TEXT;
ALTER TABLE products ADD COLUMN coating TEXT;
ALTER TABLE products ADD COLUMN warranty_months INTEGER NOT NULL DEFAULT 12;
ALTER TABLE products ADD COLUMN engraving_text_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN engraving_text_price_cents INTEGER NOT NULL DEFAULT 2990;
ALTER TABLE products ADD COLUMN engraving_image_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN engraving_image_price_cents INTEGER NOT NULL DEFAULT 4990;

UPDATE products
SET engraving_text_enabled = personalizable,
    engraving_image_enabled = personalizable;
