CREATE TABLE marketing_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 meta_pixel_id TEXT NOT NULL DEFAULT '',
 google_tag_id TEXT NOT NULL DEFAULT '',
 google_ads_id TEXT NOT NULL DEFAULT '',
 google_ads_label TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO marketing_settings(id,meta_pixel_id) VALUES(1,'1499152092131624');
