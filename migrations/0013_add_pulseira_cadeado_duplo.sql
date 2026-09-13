INSERT INTO products (
  category_id,name,slug,sku,description,price_cents,pix_price_cents,
  weight_grams,piece_length,material,coating,warranty_months,featured,active
)
SELECT id,
  'Pulseira Cadeado Duplo 5mm Fecho Gaveta Duplo',
  'pulseira-cadeado-duplo-5mm-fecho-gaveta-duplo',
  'PUL-CAD-DUP-5MM',
  'Pulseira banhada a Ouro 18K, desenvolvida para quem busca delicadeza, sofisticação e qualidade em cada detalhe.',
  29500,28025,8,'20 cm, 21 cm ou 22 cm','Latão (liga metálica de cobre e zinco)',
  'Verniz cataforético, que proporciona maior durabilidade e qualidade à semijoia.',12,1,1
FROM categories
WHERE slug='linha-masculina'
  AND NOT EXISTS (SELECT 1 FROM products WHERE slug='pulseira-cadeado-duplo-5mm-fecho-gaveta-duplo');

INSERT INTO product_variants (product_id,name,sku,finish,price_cents,stock,active)
SELECT id,'Padrão','PUL-CAD-DUP-5MM-PADRAO','Dourado 18K',29500,1,1
FROM products
WHERE slug='pulseira-cadeado-duplo-5mm-fecho-gaveta-duplo'
  AND NOT EXISTS (SELECT 1 FROM product_variants WHERE sku='PUL-CAD-DUP-5MM-PADRAO');

INSERT INTO product_images (product_id,url,alt_text,sort_order)
SELECT id,'assets/pulseira-cadeado-duplo-01.jpeg','Pulseira Cadeado Duplo 5mm dourada na embalagem Elegance 18K',0
FROM products WHERE slug='pulseira-cadeado-duplo-5mm-fecho-gaveta-duplo'
  AND NOT EXISTS (SELECT 1 FROM product_images WHERE url='assets/pulseira-cadeado-duplo-01.jpeg');
INSERT INTO product_images (product_id,url,alt_text,sort_order)
SELECT id,'assets/pulseira-cadeado-duplo-02.jpeg','Pulseira Cadeado Duplo 5mm dourada em exposição frontal',1
FROM products WHERE slug='pulseira-cadeado-duplo-5mm-fecho-gaveta-duplo'
  AND NOT EXISTS (SELECT 1 FROM product_images WHERE url='assets/pulseira-cadeado-duplo-02.jpeg');
INSERT INTO product_images (product_id,url,alt_text,sort_order)
SELECT id,'assets/pulseira-cadeado-duplo-03.jpeg','Detalhe da malha da Pulseira Cadeado Duplo 5mm',2
FROM products WHERE slug='pulseira-cadeado-duplo-5mm-fecho-gaveta-duplo'
  AND NOT EXISTS (SELECT 1 FROM product_images WHERE url='assets/pulseira-cadeado-duplo-03.jpeg');
