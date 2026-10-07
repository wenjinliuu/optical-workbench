CREATE TABLE work_tasks_next(
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL,
 store_id TEXT NOT NULL,
 title TEXT NOT NULL,
 instructions TEXT NOT NULL,
 cycle_id TEXT,
 cycle_version INTEGER,
 visit_id TEXT,
 context_basis TEXT NOT NULL CHECK(context_basis IN('customer','cycle','visit','visit_cycle')),
 assignee_id TEXT REFERENCES users(id),
 assignment_status TEXT NOT NULL CHECK(assignment_status IN('queued','awaiting','accepted')),
 execution_status TEXT NOT NULL DEFAULT 'pending' CHECK(execution_status IN('pending','running','paused')),
 revision INTEGER NOT NULL CHECK(revision>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 candidate_role TEXT CHECK(candidate_role IN('manager','reception','professional')),
 CHECK((assignment_status='queued' AND assignee_id IS NULL AND candidate_role IS NOT NULL) OR (assignment_status IN('awaiting','accepted') AND assignee_id IS NOT NULL)),
 CHECK(execution_status<>'running' OR assignment_status='accepted'),
 FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id),
 FOREIGN KEY(cycle_id,cycle_version,customer_id) REFERENCES cycle_versions(cycle_id,version,customer_id),
 FOREIGN KEY(visit_id,customer_id) REFERENCES visits(id,customer_id),
 FOREIGN KEY(visit_id,cycle_id,customer_id) REFERENCES visit_cycles(visit_id,cycle_id,customer_id),
 CHECK((cycle_id IS NULL AND cycle_version IS NULL) OR (cycle_id IS NOT NULL AND cycle_version IS NOT NULL)),
 CHECK(context_basis=CASE WHEN visit_id IS NOT NULL AND cycle_id IS NOT NULL THEN 'visit_cycle' WHEN visit_id IS NOT NULL THEN 'visit' WHEN cycle_id IS NOT NULL THEN 'cycle' ELSE 'customer' END),
 UNIQUE(id,customer_id)
);
CREATE TABLE task_events_next(
 task_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1),
 action TEXT NOT NULL CHECK(action IN('assign','claim','accept','start','pause','resume','return','transfer')),
 from_assignee_id TEXT REFERENCES users(id),
 assignee_id TEXT REFERENCES users(id),
 assignment_status TEXT NOT NULL CHECK(assignment_status IN('queued','awaiting','accepted')),
 execution_status TEXT NOT NULL CHECK(execution_status IN('pending','running','paused')),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 candidate_role TEXT CHECK(candidate_role IN('manager','reception','professional')),
 CHECK((assignment_status='queued' AND assignee_id IS NULL AND candidate_role IS NOT NULL) OR (assignment_status IN('awaiting','accepted') AND assignee_id IS NOT NULL)),
 CHECK(execution_status<>'running' OR assignment_status='accepted'),
 PRIMARY KEY(task_id,revision),
 FOREIGN KEY(task_id,customer_id) REFERENCES work_tasks_next(id,customer_id)
);
INSERT INTO work_tasks_next SELECT *,NULL FROM work_tasks;
INSERT INTO task_events_next SELECT *,NULL FROM task_events;
DROP TABLE task_events;
DROP TABLE work_tasks;
ALTER TABLE work_tasks_next RENAME TO work_tasks;
ALTER TABLE task_events_next RENAME TO task_events;
CREATE INDEX tasks_store_assignee ON work_tasks(store_id,assignee_id,updated_at,id);
CREATE INDEX tasks_customer ON work_tasks(customer_id,created_at,id);
CREATE INDEX tasks_role_queue ON work_tasks(store_id,candidate_role,assignment_status,updated_at,id);
CREATE TRIGGER task_context_no_update BEFORE UPDATE OF id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,created_at,created_by ON work_tasks BEGIN SELECT RAISE(ABORT,'task context is immutable'); END;
CREATE TRIGGER task_no_delete BEFORE DELETE ON work_tasks BEGIN SELECT RAISE(ABORT,'tasks retain history'); END;
CREATE TRIGGER task_events_no_update BEFORE UPDATE ON task_events BEGIN SELECT RAISE(ABORT,'task events are immutable'); END;
CREATE TRIGGER task_events_no_delete BEFORE DELETE ON task_events BEGIN SELECT RAISE(ABORT,'task events are immutable'); END;
