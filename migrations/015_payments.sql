CREATE TABLE payment_events (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, order_version INTEGER NOT NULL, customer_id TEXT NOT NULL, store_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1), action TEXT NOT NULL CHECK(action IN('receive','void')), source_id TEXT REFERENCES payment_events(id),
 amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 1 AND 1000000000000), basis_total_cents INTEGER NOT NULL CHECK(typeof(basis_total_cents)='integer' AND basis_total_cents>=0), currency TEXT NOT NULL CHECK(currency='CNY'),
 method TEXT NOT NULL CHECK(method IN('cash','card','transfer','other')), reference TEXT CHECK(reference IS NULL OR length(trim(reference)) BETWEEN 1 AND 120), received_at TEXT NOT NULL CHECK(length(received_at)=24 AND julianday(received_at) IS NOT NULL),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300), created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(order_id,revision), FOREIGN KEY(order_id,order_version,customer_id,store_id) REFERENCES retail_order_versions(order_id,version,customer_id,store_id),
 CHECK((action='receive' AND source_id IS NULL) OR (action='void' AND source_id IS NOT NULL))
);
CREATE UNIQUE INDEX payment_one_void ON payment_events(source_id) WHERE action='void';
CREATE INDEX payment_reference_lookup ON payment_events(store_id,method,reference) WHERE action='receive' AND reference IS NOT NULL;
CREATE INDEX payment_store_events ON payment_events(store_id,created_at,id);
CREATE INDEX payment_customer_events ON payment_events(customer_id,created_at,id);
CREATE TRIGGER payment_ready BEFORE INSERT ON payment_events BEGIN
 SELECT CASE WHEN NEW.action='receive' AND NEW.reference IS NOT NULL AND EXISTS(SELECT 1 FROM payment_events e WHERE e.store_id=NEW.store_id AND e.method=NEW.method AND e.reference=NEW.reference AND e.action='receive' AND NOT EXISTS(SELECT 1 FROM payment_events v WHERE v.source_id=e.id)) THEN RAISE(ABORT,'payment duplicate active reference') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u LEFT JOIN user_security s ON s.user_id=u.id WHERE u.id=NEW.created_by AND u.store_id=NEW.store_id AND u.active=1 AND COALESCE(s.must_change_password,0)=0 AND (u.role='manager' OR u.role='reception' AND NEW.action='receive')) THEN RAISE(ABORT,'payment actor not allowed') END;
 SELECT CASE WHEN NEW.revision<>COALESCE((SELECT max(revision)+1 FROM payment_events WHERE order_id=NEW.order_id),1) OR NEW.created_at<COALESCE((SELECT max(created_at) FROM payment_events WHERE order_id=NEW.order_id),'') THEN RAISE(ABORT,'payment revision invalid') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM retail_order_versions v WHERE v.order_id=NEW.order_id AND v.version=NEW.order_version AND v.version=(SELECT max(version) FROM retail_order_versions WHERE order_id=v.order_id) AND v.status='draft' AND v.subtotal_cents=NEW.basis_total_cents AND NEW.created_at>=v.created_at) THEN RAISE(ABORT,'payment original order invalid') END;
 SELECT CASE WHEN NEW.received_at>NEW.created_at OR NEW.received_at<'2000-01-01T00:00:00.000Z' THEN RAISE(ABORT,'payment received time invalid') END;
 SELECT CASE WHEN NEW.action='void' AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.id=NEW.source_id AND e.order_id=NEW.order_id AND e.action='receive' AND e.order_version=NEW.order_version AND e.amount_cents=NEW.amount_cents AND e.basis_total_cents=NEW.basis_total_cents AND e.currency=NEW.currency AND e.method=NEW.method AND e.reference IS NEW.reference AND e.received_at=NEW.received_at AND NOT EXISTS(SELECT 1 FROM payment_events v WHERE v.source_id=e.id)) THEN RAISE(ABORT,'payment void source invalid') END;
 SELECT CASE WHEN NEW.action='receive' AND NEW.amount_cents+COALESCE((SELECT sum(e.amount_cents) FROM payment_events e WHERE e.order_id=NEW.order_id AND e.action='receive' AND NOT EXISTS(SELECT 1 FROM payment_events v WHERE v.source_id=e.id)),0)>100000000000000 THEN RAISE(ABORT,'payment amount range exceeded') END;
END;
CREATE TRIGGER payment_order_version_lock BEFORE INSERT ON retail_order_versions WHEN EXISTS(SELECT 1 FROM payment_events e WHERE e.order_id=NEW.order_id AND e.action='receive' AND NOT EXISTS(SELECT 1 FROM payment_events v WHERE v.source_id=e.id)) BEGIN SELECT RAISE(ABORT,'valid receipts lock original order'); END;
CREATE TRIGGER payment_no_update BEFORE UPDATE ON payment_events BEGIN SELECT RAISE(ABORT,'payment history immutable'); END;
CREATE TRIGGER payment_no_delete BEFORE DELETE ON payment_events BEGIN SELECT RAISE(ABORT,'payment history immutable'); END;
