CREATE TABLE loyalty_rewards (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
 kind TEXT NOT NULL CHECK(kind IN ('loyalty','birthday')), cycle INTEGER NOT NULL,
 percent INTEGER NOT NULL, expires_on TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(customer_id,kind,cycle)
);
CREATE TABLE loyalty_reward_uses (
 id INTEGER PRIMARY KEY AUTOINCREMENT, reward_id INTEGER NOT NULL REFERENCES loyalty_rewards(id),
 order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held','spent','released'))
);
CREATE UNIQUE INDEX loyalty_reward_active_use ON loyalty_reward_uses(reward_id) WHERE status IN ('held','spent');
CREATE TRIGGER loyalty_reward_owner BEFORE INSERT ON loyalty_reward_uses BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loyalty_rewards r JOIN orders o ON o.customer_id=r.customer_id WHERE r.id=NEW.reward_id AND o.id=NEW.order_id) THEN RAISE(ABORT,'INVALID_LOYALTY_REWARD') END;
END;
CREATE TRIGGER loyalty_reward_finalize AFTER INSERT ON finalized_orders BEGIN
 UPDATE loyalty_reward_uses SET status='spent' WHERE order_id=NEW.order_id AND status='held';
END;
CREATE TRIGGER loyalty_reward_issue AFTER UPDATE OF purchase_count ON loyalty_accounts WHEN NEW.purchase_count>0 AND NEW.purchase_count%10=0 BEGIN
 INSERT OR IGNORE INTO loyalty_rewards(customer_id,kind,cycle,percent) VALUES(NEW.customer_id,'loyalty',NEW.purchase_count/10,15);
 UPDATE loyalty_accounts SET rewards_issued=(SELECT COUNT(*) FROM loyalty_rewards WHERE customer_id=NEW.customer_id AND kind='loyalty') WHERE customer_id=NEW.customer_id;
END;
WITH RECURSIVE cycles(customer_id,cycle,max_cycle) AS (
 SELECT customer_id,1,purchase_count/10 FROM loyalty_accounts WHERE purchase_count>=10
 UNION ALL SELECT customer_id,cycle+1,max_cycle FROM cycles WHERE cycle<max_cycle
) INSERT OR IGNORE INTO loyalty_rewards(customer_id,kind,cycle,percent) SELECT customer_id,'loyalty',cycle,15 FROM cycles;
UPDATE loyalty_accounts SET rewards_issued=(SELECT COUNT(*) FROM loyalty_rewards WHERE customer_id=loyalty_accounts.customer_id AND kind='loyalty');
