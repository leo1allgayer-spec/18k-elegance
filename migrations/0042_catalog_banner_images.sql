CREATE TABLE catalog_banner_images (
 variant TEXT PRIMARY KEY CHECK(variant IN ('desktop','mobile')),
 filename TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
