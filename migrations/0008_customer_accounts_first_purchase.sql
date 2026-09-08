ALTER TABLE customers ADD COLUMN account_claimed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN coupon_id INTEGER REFERENCES coupons(id);

INSERT INTO coupons(code,type,value,minimum_cents,starts_at,expires_at,max_uses,uses,active)
SELECT 'PRIMEIRAELEGANCE','percent',10,0,NULL,NULL,NULL,0,1
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE code='PRIMEIRAELEGANCE' COLLATE NOCASE);
