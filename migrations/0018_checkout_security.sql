CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS request_limits_expiry ON request_limits(expires_at);

CREATE TABLE IF NOT EXISTS stock_reservations (
  order_id INTEGER NOT NULL REFERENCES orders(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held','spent','released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(order_id,variant_id)
);
CREATE TABLE IF NOT EXISTS checkout_security (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),
  expires_at TEXT NOT NULL,
  checked_at TEXT,
  review_reason TEXT
);
CREATE TRIGGER IF NOT EXISTS reserve_stock BEFORE INSERT ON stock_reservations
BEGIN
  SELECT CASE WHEN NEW.status!='held' OR NOT EXISTS(
    SELECT 1 FROM product_variants v JOIN products p ON p.id=v.product_id
    WHERE v.id=NEW.variant_id AND v.active=1 AND p.active=1 AND v.stock>=NEW.quantity
  ) THEN RAISE(ABORT,'OUT_OF_STOCK') END;
  UPDATE product_variants SET stock=stock-NEW.quantity,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.variant_id;
END;
CREATE TRIGGER IF NOT EXISTS release_stock AFTER UPDATE OF status ON stock_reservations
WHEN OLD.status='held' AND NEW.status='released'
BEGIN
  UPDATE product_variants SET stock=stock+NEW.quantity,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.variant_id;
END;
CREATE TRIGGER IF NOT EXISTS reservation_terminal BEFORE UPDATE OF status ON stock_reservations
WHEN OLD.status IN ('spent','released') AND NEW.status!=OLD.status
BEGIN SELECT RAISE(ABORT,'RESERVATION_TERMINAL'); END;

CREATE TABLE IF NOT EXISTS finalized_orders(order_id INTEGER PRIMARY KEY REFERENCES orders(id));
INSERT OR IGNORE INTO finalized_orders(order_id) SELECT id FROM orders WHERE status IN ('paid','preparing','shipped','delivered','refunded');
CREATE TRIGGER IF NOT EXISTS finalize_order AFTER INSERT ON finalized_orders
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM stock_reservations WHERE order_id=NEW.order_id AND status='released')
    OR EXISTS(SELECT 1 FROM gift_card_uses WHERE order_id=NEW.order_id AND status='released')
    THEN RAISE(ABORT,'RESERVATION_RELEASED') END;
  -- Legacy checkouts without reservations must acquire stock before fulfillment.
  INSERT INTO stock_reservations(order_id,variant_id,quantity)
    SELECT i.order_id,i.variant_id,SUM(i.quantity) FROM order_items i
    WHERE i.order_id=NEW.order_id AND i.variant_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM stock_reservations r WHERE r.order_id=i.order_id AND r.variant_id=i.variant_id)
    GROUP BY i.order_id,i.variant_id;
  UPDATE stock_reservations SET status='spent' WHERE order_id=NEW.order_id AND status='held';
  UPDATE gift_card_uses SET status='spent' WHERE order_id=NEW.order_id AND status='reserved';
  UPDATE orders SET status='paid',updated_at=CURRENT_TIMESTAMP WHERE id=NEW.order_id;
  UPDATE loyalty_accounts SET purchase_count=purchase_count+1,updated_at=CURRENT_TIMESTAMP
    WHERE customer_id=(SELECT customer_id FROM orders WHERE id=NEW.order_id);
  UPDATE coupons SET uses=uses+1 WHERE id=(SELECT coupon_id FROM orders WHERE id=NEW.order_id);
END;
