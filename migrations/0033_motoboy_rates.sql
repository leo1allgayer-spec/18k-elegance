CREATE TABLE motoboy_rates(city TEXT PRIMARY KEY,price_cents INTEGER NOT NULL CHECK(price_cents>=0 AND price_cents<=100000));
INSERT INTO motoboy_rates(city,price_cents) VALUES('canoas',2500),('esteio',2500),('sapucaia do sul',3000);
