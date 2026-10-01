ALTER TABLE products ADD COLUMN engraving_name_count_enabled INTEGER NOT NULL DEFAULT 0;

UPDATE products
SET engraving_text_enabled=1,
    engraving_text_required=1,
    engraving_name_count_enabled=1,
    engraving_text_price_cents=0,
    personalizable=1
WHERE slug='gargantilha-veneziana-filhos-personalizada-com-nome';
