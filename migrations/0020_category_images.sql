ALTER TABLE categories ADD COLUMN image_url TEXT;

-- Reuse real catalog photos only; leave categories without a real photo empty.
UPDATE categories SET image_url='/assets/corrente-cartier-cruz-vazada-amarrada-1.jpg'
WHERE slug='linha-masculina';
UPDATE categories SET image_url='/assets/pulseira-cadeado-duplo-01.jpeg'
WHERE slug='pulseiras';
