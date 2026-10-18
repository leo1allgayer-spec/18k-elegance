ALTER TABLE products ADD COLUMN available_colors TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN children_models TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN name_count_max INTEGER NOT NULL DEFAULT 6;
UPDATE products SET available_colors='["Azul Marinho","Rosa Pink","Branco","Preto"]' WHERE slug='lip-lance';
UPDATE products SET children_models='["1 Menina","1 Menino","2 Meninas","2 Meninos","1 Menina e 1 Menino","3 Meninas","3 Meninos","2 Meninas e 1 Menino","2 Meninos e 1 Menina","4 Meninas","4 Meninos","2 Meninas e 2 Meninos","3 Meninas e 1 Menino","3 Meninos e 1 Menina"]' WHERE slug='gargantilha-coracao-vazado-veneziana';
UPDATE products SET name_count_max=3 WHERE slug='gargantilha-nuvem-filhos-veneziana';
