INSERT INTO products (
  category_id,name,slug,sku,description,price_cents,pix_price_cents,
  weight_grams,piece_length,material,coating,warranty_months,featured,active
)
SELECT id,
  'Corrente Cartier Abaulada 3mm Fecho Canhão com Pingente Cruz Vazada Detalhada Média',
  'corrente-cartier-abaulada-3mm-pingente-cruz-vazada-detalhada-media',
  'COR-CART-3MM-CRUZ-MED',
  'Conjunto composto por corrente Cartier abaulada e pingente de cruz vazada detalhada, banhados a Ouro 18K. Uma composição marcante e sofisticada, ideal para quem busca uma peça com significado e personalidade.',
  28990,27541,10,'Corrente de 60 cm ou 70 cm; pingente de 3 cm de altura x 2,1 cm de largura + contra argola',
  'Latão (liga metálica de cobre e zinco)',
  'Verniz cataforético, que proporciona maior durabilidade e qualidade à semijoia.',12,1,1
FROM categories
WHERE slug='linha-masculina'
  AND NOT EXISTS (SELECT 1 FROM products WHERE slug='corrente-cartier-abaulada-3mm-pingente-cruz-vazada-detalhada-media');

INSERT INTO product_variants (product_id,name,sku,finish,price_cents,stock,active)
SELECT id,'Padrão','COR-CART-3MM-CRUZ-MED-PADRAO','Dourado 18K',28990,1,1
FROM products
WHERE slug='corrente-cartier-abaulada-3mm-pingente-cruz-vazada-detalhada-media'
  AND NOT EXISTS (SELECT 1 FROM product_variants WHERE sku='COR-CART-3MM-CRUZ-MED-PADRAO');

INSERT INTO product_images (product_id,url,alt_text,sort_order)
SELECT id,'assets/corrente-cartier-cruz-vazada-media.jpg',
  'Corrente Cartier abaulada dourada com pingente de cruz vazada detalhada média',0
FROM products
WHERE slug='corrente-cartier-abaulada-3mm-pingente-cruz-vazada-detalhada-media'
  AND NOT EXISTS (SELECT 1 FROM product_images WHERE url='assets/corrente-cartier-cruz-vazada-media.jpg');
