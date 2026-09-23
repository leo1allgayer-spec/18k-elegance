-- Uma unidade de cada extra, conforme autorizado.
INSERT INTO products(name,slug,sku,description,price_cents,active)
VALUES ('Limpa Ouro','limpa-ouro','EXTRA-LIMPA-OURO','Destinado a ouro e peças banhadas a ouro. Remove oxidação e gordura, ajudando a conservar o brilho da peça. Produto reutilizável.',3500,1),
('Limpa Prata','limpa-prata','EXTRA-LIMPA-PRATA','Destinado principalmente à prata e objetos de prata/cobre. Remove oxidação e gordura, ajudando a recuperar o aspecto original e o brilho da prata. Produto reutilizável.',3500,1),
('Sacola personalizada','sacola-personalizada','EXTRA-SACOLA','Inclui fita em cetim personalizada para um acabamento sofisticado. Tamanho: 16 × 17 cm.',1500,1)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO product_variants(product_id,name,sku,stock,active)
SELECT id,'Unidade',sku || '-UN',1,1 FROM products
WHERE slug IN ('limpa-ouro','limpa-prata','sacola-personalizada')
ON CONFLICT(sku) DO NOTHING;

INSERT INTO product_images(product_id,url,alt_text,sort_order)
SELECT id,CASE slug WHEN 'limpa-ouro' THEN '/assets/limpa-ouro.jpeg' WHEN 'limpa-prata' THEN '/assets/limpa-prata.jpeg' ELSE '/assets/sacola-personalizada.jpg' END,name,0
FROM products p WHERE slug IN ('limpa-ouro','limpa-prata','sacola-personalizada')
AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id=p.id);
