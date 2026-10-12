CREATE TABLE store_notifications (
 order_id INTEGER PRIMARY KEY REFERENCES orders(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain')),
 sent_at TEXT,
 last_error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER queue_store_notification AFTER INSERT ON finalized_orders BEGIN
 INSERT OR IGNORE INTO store_notifications(order_id) VALUES(NEW.order_id);
END;
