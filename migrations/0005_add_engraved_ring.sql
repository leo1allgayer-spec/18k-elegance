INSERT INTO products (
  category_id,
  name,
  slug,
  sku,
  description,
  price_cents,
  pix_price_cents,
  weight_grams,
  width_cm,
  height_cm,
  length_cm,
  featured,
  active,
  personalizable
)
SELECT
  categories.id,
  'Anel Personalizado com Gravação',
  'anel-personalizado-com-gravacao',
  'AN-GRAVACAO',
  'Anel dourado personalizável com gravação de nome, data ou frase curta.',
  15900,
  15105,
  20,
  8,
  4,
  8,
  1,
  1,
  1
FROM categories
WHERE categories.slug = 'aneis'
  AND NOT EXISTS (
    SELECT 1 FROM products WHERE sku = 'AN-GRAVACAO'
  );

INSERT INTO product_variants (
  product_id,
  name,
  sku,
  finish,
  price_cents,
  stock,
  active
)
SELECT
  products.id,
  'Dourado 18K',
  'AN-GRAVACAO-D18K',
  'Dourado 18K',
  15900,
  1,
  1
FROM products
WHERE products.sku = 'AN-GRAVACAO'
  AND NOT EXISTS (
    SELECT 1 FROM product_variants WHERE sku = 'AN-GRAVACAO-D18K'
  );

INSERT INTO product_images (
  product_id,
  url,
  alt_text,
  sort_order
)
SELECT
  products.id,
  'assets/anel-personalizado-gravacao.png',
  'Anel dourado personalizado com gravação',
  0
FROM products
WHERE products.sku = 'AN-GRAVACAO'
  AND NOT EXISTS (
    SELECT 1
    FROM product_images
    WHERE product_id = products.id
      AND url = 'assets/anel-personalizado-gravacao.png'
  );
