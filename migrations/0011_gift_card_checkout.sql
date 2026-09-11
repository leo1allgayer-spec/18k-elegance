ALTER TABLE gift_cards ADD COLUMN code TEXT;
CREATE TABLE gift_card_sales (
 id TEXT PRIMARY KEY,
 gift_card_id INTEGER UNIQUE REFERENCES gift_cards(id),
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 5000 AND 200000),
 request_key TEXT NOT NULL,
 checkout_url TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 payment_id TEXT,
 UNIQUE(customer_id,request_key)
);
ALTER TABLE orders ADD COLUMN gift_card_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN gift_checkout_url TEXT;
CREATE TABLE gift_card_uses (
 order_id INTEGER PRIMARY KEY REFERENCES orders(id),
 gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','spent','released'))
);
CREATE TRIGGER gift_card_reserve_check BEFORE INSERT ON gift_card_uses BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM gift_cards WHERE id=NEW.gift_card_id AND status='active' AND balance_cents>=NEW.amount_cents AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)) THEN RAISE(ABORT,'GIFT_BALANCE_UNAVAILABLE') END;
END;
CREATE TRIGGER gift_card_reserve AFTER INSERT ON gift_card_uses BEGIN
 UPDATE gift_cards SET balance_cents=balance_cents-NEW.amount_cents WHERE id=NEW.gift_card_id;
END;
CREATE TRIGGER gift_card_release AFTER UPDATE OF status ON gift_card_uses WHEN NEW.status='released' AND OLD.status!='released' BEGIN
 UPDATE gift_cards SET balance_cents=balance_cents+NEW.amount_cents WHERE id=NEW.gift_card_id;
END;
