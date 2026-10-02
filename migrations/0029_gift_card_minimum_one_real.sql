CREATE TABLE gift_card_sales_revised (
 id TEXT PRIMARY KEY,
 gift_card_id INTEGER UNIQUE REFERENCES gift_cards(id),
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 100 AND 200000),
 request_key TEXT NOT NULL,
 checkout_url TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 payment_id TEXT,
 UNIQUE(customer_id,request_key)
);
INSERT INTO gift_card_sales_revised(id,gift_card_id,customer_id,amount_cents,request_key,checkout_url,status,payment_id)
 SELECT id,gift_card_id,customer_id,amount_cents,request_key,checkout_url,status,payment_id FROM gift_card_sales;
DROP TABLE gift_card_sales;
ALTER TABLE gift_card_sales_revised RENAME TO gift_card_sales;
