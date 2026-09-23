-- Novos produtos autorizados com uma unidade, sem comprimentos presumidos.
INSERT INTO products(category_id,name,slug,sku,description,price_cents,material,coating,warranty_months,active) VALUES ((SELECT id FROM categories WHERE slug='linha-masculina'),'Corrente Cadeado 2mm Fecho Canhão + Pingente Cruz Palito Amarrada Média','corrente-cadeado-2mm-cruz-palito-amarrada-media','E18-20260923-1','Conjunto composto por corrente Cadeado 2mm com fecho canhão e pingente Cruz Palito Amarrada Média, banhados a Ouro 18K.

Detalhes da peça
• Semijoia banhada a Ouro 18K
• Corrente: Cadeado 2mm com fecho canhão
• Peso da corrente: 6g
• Pingente: Cruz Palito Amarrada Média
• Medidas do pingente: 3,9 cm de altura x 2,3 cm de largura + contra argola
• Matéria-prima: Latão (liga metálica de cobre e zinco)
• Acabamento em verniz cataforético, que proporciona maior durabilidade e qualidade à semijoia

Garantia Elegance 18K
Todas as nossas peças possuem 1 ano de garantia no banho de Ouro 18K, referente à fabricação própria.',21900,'Latão (liga metálica de cobre e zinco)','Ouro 18K',12,1) ON CONFLICT(slug) DO NOTHING;
INSERT INTO product_variants(product_id,name,sku,finish,stock,active) SELECT id,'Padrão','E18-20260923-1-UN','Dourado 18K',1,1 FROM products WHERE slug='corrente-cadeado-2mm-cruz-palito-amarrada-media' ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_images(product_id,url,alt_text,sort_order) SELECT id,'/assets/corrente-cadeado-cruz-palito.jpg','Corrente Cadeado 2mm Fecho Canhão + Pingente Cruz Palito Amarrada Média',0 FROM products p WHERE slug='corrente-cadeado-2mm-cruz-palito-amarrada-media' AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=p.id AND url='/assets/corrente-cadeado-cruz-palito.jpg');
INSERT INTO products(category_id,name,slug,sku,description,price_cents,material,coating,warranty_months,active) VALUES ((SELECT id FROM categories WHERE slug='linha-masculina'),'Corrente Cartier Abaulada 3mm Fecho Canhão + Pingente Cruz Vazada Amarrada','corrente-cartier-abaulada-3mm-cruz-vazada-amarrada','E18-20260923-2','Conjunto composto por corrente Cartier Abaulada 3mm com fecho canhão e pingente Cruz Vazada Amarrada, banhados a Ouro 18K. Detalhes delicados e um significado especial.

Detalhes da peça
• Semijoia banhada a Ouro 18K
• Corrente: Cartier Abaulada 3mm com fecho canhão
• Peso da corrente: 7g
• Pingente: Cruz Vazada Amarrada
• Peso do pingente: 1g
• Medidas do pingente: 2,8 cm de altura x 1,5 cm de largura + contra argola
• Matéria-prima: Latão (liga metálica de cobre e zinco)
• Acabamento em verniz cataforético, que proporciona maior durabilidade e qualidade à semijoia

Garantia Elegance 18K
Todas as nossas peças possuem 1 ano de garantia no banho de Ouro 18K, referente à fabricação própria.',19900,'Latão (liga metálica de cobre e zinco)','Ouro 18K',12,1) ON CONFLICT(slug) DO NOTHING;
INSERT INTO product_variants(product_id,name,sku,finish,stock,active) SELECT id,'Padrão','E18-20260923-2-UN','Dourado 18K',1,1 FROM products WHERE slug='corrente-cartier-abaulada-3mm-cruz-vazada-amarrada' ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_images(product_id,url,alt_text,sort_order) SELECT id,'/assets/corrente-cartier-cruz-vazada-amarrada-1.jpg','Corrente Cartier Abaulada 3mm Fecho Canhão + Pingente Cruz Vazada Amarrada',0 FROM products p WHERE slug='corrente-cartier-abaulada-3mm-cruz-vazada-amarrada' AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=p.id AND url='/assets/corrente-cartier-cruz-vazada-amarrada-1.jpg');
INSERT INTO product_images(product_id,url,alt_text,sort_order) SELECT id,'/assets/corrente-cartier-cruz-vazada-amarrada-2.jpg','Corrente Cartier Abaulada 3mm Fecho Canhão + Pingente Cruz Vazada Amarrada',1 FROM products p WHERE slug='corrente-cartier-abaulada-3mm-cruz-vazada-amarrada' AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=p.id AND url='/assets/corrente-cartier-cruz-vazada-amarrada-2.jpg');
INSERT INTO products(category_id,name,slug,sku,description,price_cents,material,coating,warranty_months,active) VALUES ((SELECT id FROM categories WHERE slug='linha-masculina'),'Corrente Elo Alongado 2,5mm Fecho Canhão','corrente-elo-alongado-25mm-fecho-canhao','E18-20260923-3','Corrente Elo Alongado 2,5mm. O design com elos alongados proporciona um visual moderno e delicado, enquanto o fecho canhão garante praticidade e segurança no uso.

Detalhes da peça
• Semijoia banhada a Ouro 18K
• Corrente: Elo Alongado 2,5mm com fecho canhão
• Peso da corrente: 8g
• Matéria-prima: Latão (liga metálica de cobre e zinco)
• Acabamento em verniz cataforético, que proporciona maior durabilidade e qualidade à semijoia

Garantia Elegance 18K
Todas as nossas peças possuem 1 ano de garantia no banho de Ouro 18K, referente à fabricação própria.',19900,'Latão (liga metálica de cobre e zinco)','Ouro 18K',12,1) ON CONFLICT(slug) DO NOTHING;
INSERT INTO product_variants(product_id,name,sku,finish,stock,active) SELECT id,'Padrão','E18-20260923-3-UN','Dourado 18K',1,1 FROM products WHERE slug='corrente-elo-alongado-25mm-fecho-canhao' ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_images(product_id,url,alt_text,sort_order) SELECT id,'/assets/corrente-elo-alongado.jpg','Corrente Elo Alongado 2,5mm Fecho Canhão',0 FROM products p WHERE slug='corrente-elo-alongado-25mm-fecho-canhao' AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=p.id AND url='/assets/corrente-elo-alongado.jpg');
INSERT INTO products(category_id,name,slug,sku,description,price_cents,material,coating,warranty_months,active) VALUES ((SELECT id FROM categories WHERE slug='linha-masculina'),'Corrente Veneziana Tijolinho 3mm Fecho Gaveta','corrente-veneziana-tijolinho-3mm-fecho-gaveta','E18-20260923-4','Corrente banhada a Ouro 18K.

Detalhes da peça
• Semijoia banhada a Ouro 18K
• Peso da corrente: 15g
• Matéria-prima: Latão (liga metálica de cobre e zinco)
• Acabamento em verniz cataforético, que proporciona maior durabilidade e qualidade à semijoia

Garantia Elegance 18K
Todas as nossas peças possuem 1 ano de garantia no banho de Ouro 18K, referente à fabricação própria.',19900,'Latão (liga metálica de cobre e zinco)','Ouro 18K',12,1) ON CONFLICT(slug) DO NOTHING;
INSERT INTO product_variants(product_id,name,sku,finish,stock,active) SELECT id,'Padrão','E18-20260923-4-UN','Dourado 18K',1,1 FROM products WHERE slug='corrente-veneziana-tijolinho-3mm-fecho-gaveta' ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_images(product_id,url,alt_text,sort_order) SELECT id,'/assets/corrente-veneziana-tijolinho-1.jpg','Corrente Veneziana Tijolinho 3mm Fecho Gaveta',0 FROM products p WHERE slug='corrente-veneziana-tijolinho-3mm-fecho-gaveta' AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=p.id AND url='/assets/corrente-veneziana-tijolinho-1.jpg');
INSERT INTO product_images(product_id,url,alt_text,sort_order) SELECT id,'/assets/corrente-veneziana-tijolinho-2.jpg','Corrente Veneziana Tijolinho 3mm Fecho Gaveta',1 FROM products p WHERE slug='corrente-veneziana-tijolinho-3mm-fecho-gaveta' AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=p.id AND url='/assets/corrente-veneziana-tijolinho-2.jpg');
INSERT INTO product_images(product_id,url,alt_text,sort_order) SELECT id,'/assets/corrente-veneziana-tijolinho-3.jpg','Corrente Veneziana Tijolinho 3mm Fecho Gaveta',2 FROM products p WHERE slug='corrente-veneziana-tijolinho-3mm-fecho-gaveta' AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=p.id AND url='/assets/corrente-veneziana-tijolinho-3.jpg');
