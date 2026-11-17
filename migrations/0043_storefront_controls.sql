CREATE TABLE storefront_controls (
 id INTEGER PRIMARY KEY CHECK(id=1),
 instagram_handle TEXT NOT NULL DEFAULT 'elegance___18k',
 labels_json TEXT NOT NULL DEFAULT '{}',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO storefront_controls(id) VALUES(1);
