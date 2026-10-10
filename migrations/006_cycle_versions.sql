CREATE TABLE cycle_versions(
 cycle_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=1),
 type TEXT NOT NULL CHECK(type IN('followup','training','retail')),
 goal TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN('initial','legacy','employee','external','guardian_report')),
 revision_reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT REFERENCES users(id),
 PRIMARY KEY(cycle_id,version),
 UNIQUE(cycle_id,version,customer_id),
 FOREIGN KEY(cycle_id,customer_id) REFERENCES service_cycles(id,customer_id)
);
INSERT INTO cycle_versions SELECT id,customer_id,1,type,goal,'legacy','升级时保存当前周期需求；此前修订未追溯',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL FROM service_cycles;
CREATE TRIGGER cycle_version_initial AFTER INSERT ON service_cycles BEGIN
 INSERT INTO cycle_versions VALUES (NEW.id,NEW.customer_id,1,NEW.type,NEW.goal,'initial','初始周期需求登记',NEW.created_at,NEW.created_by);
END;
CREATE TRIGGER cycle_versions_no_update BEFORE UPDATE ON cycle_versions BEGIN SELECT RAISE(ABORT,'cycle versions are immutable'); END;
CREATE TRIGGER cycle_versions_no_delete BEFORE DELETE ON cycle_versions BEGIN SELECT RAISE(ABORT,'cycle versions are immutable'); END;
CREATE UNIQUE INDEX visit_cycle_identity ON visit_cycles(visit_id,cycle_id,customer_id);
CREATE TABLE visit_cycle_versions(
 visit_id TEXT NOT NULL,
 cycle_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 version INTEGER,
 basis TEXT NOT NULL CHECK(basis IN('captured','legacy_unknown')),
 PRIMARY KEY(visit_id,cycle_id),
 FOREIGN KEY(visit_id,cycle_id,customer_id) REFERENCES visit_cycles(visit_id,cycle_id,customer_id),
 FOREIGN KEY(cycle_id,version,customer_id) REFERENCES cycle_versions(cycle_id,version,customer_id),
 CHECK((basis='captured' AND version IS NOT NULL) OR (basis='legacy_unknown' AND version IS NULL))
);
INSERT INTO visit_cycle_versions SELECT visit_id,cycle_id,customer_id,NULL,'legacy_unknown' FROM visit_cycles;
CREATE TRIGGER visit_cycle_capture AFTER INSERT ON visit_cycles BEGIN
 INSERT INTO visit_cycle_versions VALUES (NEW.visit_id,NEW.cycle_id,NEW.customer_id,(SELECT max(version) FROM cycle_versions WHERE cycle_id=NEW.cycle_id),'captured');
END;
CREATE TRIGGER visit_cycle_versions_no_update BEFORE UPDATE ON visit_cycle_versions BEGIN SELECT RAISE(ABORT,'visit cycle snapshots are immutable'); END;
CREATE TRIGGER visit_cycle_versions_no_delete BEFORE DELETE ON visit_cycle_versions BEGIN SELECT RAISE(ABORT,'visit cycle snapshots are immutable'); END;
