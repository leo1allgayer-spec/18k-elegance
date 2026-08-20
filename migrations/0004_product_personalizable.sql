ALTER TABLE products ADD COLUMN personalizable INTEGER NOT NULL DEFAULT 0;

-- O produto atualmente cadastrado oferece fotogravação.
UPDATE products SET personalizable = 1 WHERE id = 1;
