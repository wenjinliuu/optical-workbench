CREATE TABLE customer_profile_versions(
  customer_id TEXT NOT NULL REFERENCES customers(id),
  version INTEGER NOT NULL CHECK(version>=1),
  name TEXT NOT NULL,
  birth_date TEXT,
  contact_name TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK(source IN('initial','legacy','employee','external','guardian_report')),
  revision_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  PRIMARY KEY(customer_id,version)
);
INSERT INTO customer_profile_versions
SELECT id,1,name,birth_date,contact_name,phone,'legacy','升级时保存存量档案；此前修改未追溯',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL FROM customers;
CREATE TRIGGER customer_profile_initial AFTER INSERT ON customers BEGIN
  INSERT INTO customer_profile_versions VALUES (NEW.id,1,NEW.name,NEW.birth_date,NEW.contact_name,NEW.phone,'initial','初始建档记录',NEW.created_at,NEW.created_by);
END;
CREATE TRIGGER customer_profile_no_update BEFORE UPDATE ON customer_profile_versions BEGIN SELECT RAISE(ABORT,'customer profiles are immutable'); END;
CREATE TRIGGER customer_profile_no_delete BEFORE DELETE ON customer_profile_versions BEGIN SELECT RAISE(ABORT,'customer profiles are immutable'); END;

CREATE TABLE family_contacts(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT,
  source TEXT NOT NULL CHECK(source IN('employee','external','guardian_report')),
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX family_contacts_customer ON family_contacts(customer_id,active,created_at);
