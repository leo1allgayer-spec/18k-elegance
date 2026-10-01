CREATE TABLE IF NOT EXISTS shipping_origins (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL,
  document TEXT NOT NULL,
  phone TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL
);

INSERT OR IGNORE INTO shipping_origins(id,business_name,document,phone,postal_code,street,number,neighborhood,city,state)
VALUES(1,'ELEGANCE 18K ACESSÓRIOS LTDA','63.668.587/0001-21','51994927676','93230250','José Cazella Mônaco','372','Boa Vista','Sapucaia do Sul','RS');
