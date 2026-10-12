CREATE TABLE loyalty_notifications (
 order_id INTEGER PRIMARY KEY REFERENCES orders(id), customer_id INTEGER NOT NULL REFERENCES customers(id),
 purchase_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','skipped')),
 sent_at TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER loyalty_notification_queue AFTER INSERT ON finalized_orders BEGIN
 INSERT OR IGNORE INTO loyalty_notifications(order_id,customer_id,purchase_count)
 SELECT NEW.order_id,o.customer_id,(SELECT COUNT(*) FROM finalized_orders f JOIN orders p ON p.id=f.order_id WHERE p.customer_id=o.customer_id)
 FROM orders o WHERE o.id=NEW.order_id;
END;
