ALTER TABLE products ADD COLUMN available_sizes TEXT;
UPDATE products SET available_sizes=CASE WHEN name LIKE '%ulseira%' THEN '["20 cm","21 cm","22 cm"]' ELSE '["60 cm","70 cm"]' END WHERE category_id IN (SELECT id FROM categories WHERE slug='linha-masculina');
