ALTER TABLE guardian_links ADD COLUMN relationship TEXT;
ALTER TABLE guardian_links ADD COLUMN updated_at TEXT;
ALTER TABLE guardian_links ADD COLUMN updated_by TEXT REFERENCES users(id);
CREATE UNIQUE INDEX customer_store_identity ON customers(id,store_id);
CREATE UNIQUE INDEX cycle_customer_identity ON service_cycles(id,customer_id);
CREATE TABLE visits(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN('registered','closed')),
  created_at TEXT NOT NULL,
  closed_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id),
  CHECK((status='registered' AND closed_at IS NULL) OR (status='closed' AND closed_at IS NOT NULL)),
  UNIQUE(id,customer_id)
);
CREATE INDEX visits_customer ON visits(customer_id,created_at);
CREATE TABLE visit_cycles(
  visit_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  PRIMARY KEY(visit_id,cycle_id),
  FOREIGN KEY(visit_id,customer_id) REFERENCES visits(id,customer_id),
  FOREIGN KEY(cycle_id,customer_id) REFERENCES service_cycles(id,customer_id)
);
