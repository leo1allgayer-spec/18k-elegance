UPDATE product_images
SET url = 'assets/anel-personalizado-gravacao.png?v=2'
WHERE product_id = (
  SELECT id FROM products WHERE sku = 'AN-GRAVACAO'
)
AND url = 'assets/anel-personalizado-gravacao.png';
