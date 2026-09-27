ALTER TABLE personalization_uploads ADD COLUMN owner_hash TEXT;
ALTER TABLE checkout_security ADD COLUMN access_token_hash TEXT;

-- Atomically claim an upload with its order item. A second checkout must fail,
-- even if it validated the upload concurrently before the first transaction.
CREATE TRIGGER claim_personalization BEFORE INSERT ON order_items
WHEN json_extract(NEW.personalization_json,'$.image_upload_id') IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM personalization_uploads WHERE id=json_extract(NEW.personalization_json,'$.image_upload_id')
      AND product_id=NEW.product_id AND order_id IS NULL
  ) THEN RAISE(ABORT,'INVALID_PERSONALIZATION_IMAGE') END;
  UPDATE personalization_uploads SET order_id=NEW.order_id
    WHERE id=json_extract(NEW.personalization_json,'$.image_upload_id');
END;
