CREATE TABLE admin_mfa (
 customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
 secret TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 expires_at TEXT NOT NULL,
 last_step INTEGER NOT NULL DEFAULT -1
);
CREATE TABLE admin_recovery_codes (
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 code_hash TEXT NOT NULL,
 PRIMARY KEY(customer_id,code_hash)
);
ALTER TABLE sessions ADD COLUMN mfa_verified INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER revoke_sessions_on_mfa_activation AFTER UPDATE OF enabled ON admin_mfa
WHEN NEW.enabled=1 AND OLD.enabled=0
BEGIN
 DELETE FROM sessions WHERE customer_id=NEW.customer_id;
END;
