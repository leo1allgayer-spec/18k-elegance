CREATE TABLE banner_images (
 slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
 variant TEXT NOT NULL CHECK(variant IN ('desktop','mobile')),
 filename TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(slot,variant)
);
