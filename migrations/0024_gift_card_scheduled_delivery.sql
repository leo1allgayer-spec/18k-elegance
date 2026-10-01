ALTER TABLE gift_cards ADD COLUMN delivery_scheduled_for TEXT;
ALTER TABLE gift_cards ADD COLUMN delivery_sent_at TEXT;
ALTER TABLE gift_cards ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_scheduled';
ALTER TABLE gift_cards ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gift_cards ADD COLUMN delivery_last_error TEXT;
CREATE INDEX IF NOT EXISTS idx_gift_cards_scheduled_delivery ON gift_cards(delivery_status, delivery_scheduled_for);
