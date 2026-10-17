CREATE TABLE work_tasks(
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL,
 store_id TEXT NOT NULL,
 title TEXT NOT NULL,
 instructions TEXT NOT NULL,
 cycle_id TEXT,
 cycle_version INTEGER,
 visit_id TEXT,
 context_basis TEXT NOT NULL CHECK(context_basis IN('customer','cycle','visit','visit_cycle')),
 assignee_id TEXT NOT NULL REFERENCES users(id),
 assignment_status TEXT NOT NULL CHECK(assignment_status IN('awaiting','accepted')),
 execution_status TEXT NOT NULL DEFAULT 'pending' CHECK(execution_status='pending'),
 revision INTEGER NOT NULL CHECK(revision>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id),
 FOREIGN KEY(cycle_id,cycle_version,customer_id) REFERENCES cycle_versions(cycle_id,version,customer_id),
 FOREIGN KEY(visit_id,customer_id) REFERENCES visits(id,customer_id),
 FOREIGN KEY(visit_id,cycle_id,customer_id) REFERENCES visit_cycles(visit_id,cycle_id,customer_id),
 CHECK((cycle_id IS NULL AND cycle_version IS NULL) OR (cycle_id IS NOT NULL AND cycle_version IS NOT NULL)),
 CHECK(context_basis=CASE WHEN visit_id IS NOT NULL AND cycle_id IS NOT NULL THEN 'visit_cycle' WHEN visit_id IS NOT NULL THEN 'visit' WHEN cycle_id IS NOT NULL THEN 'cycle' ELSE 'customer' END),
 UNIQUE(id,customer_id)
);
CREATE INDEX tasks_store_assignee ON work_tasks(store_id,assignee_id,updated_at,id);
CREATE INDEX tasks_customer ON work_tasks(customer_id,created_at,id);
CREATE TABLE task_events(
 task_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1),
 action TEXT NOT NULL CHECK(action IN('assign','accept','transfer')),
 from_assignee_id TEXT REFERENCES users(id),
 assignee_id TEXT NOT NULL REFERENCES users(id),
 assignment_status TEXT NOT NULL CHECK(assignment_status IN('awaiting','accepted')),
 execution_status TEXT NOT NULL CHECK(execution_status='pending'),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(task_id,revision),
 FOREIGN KEY(task_id,customer_id) REFERENCES work_tasks(id,customer_id)
);
CREATE TRIGGER task_context_no_update BEFORE UPDATE OF id,customer_id,store_id,title,instructions,cycle_id,cycle_version,visit_id,context_basis,created_at,created_by ON work_tasks BEGIN SELECT RAISE(ABORT,'task context is immutable'); END;
CREATE TRIGGER task_no_delete BEFORE DELETE ON work_tasks BEGIN SELECT RAISE(ABORT,'tasks retain history'); END;
CREATE TRIGGER task_events_no_update BEFORE UPDATE ON task_events BEGIN SELECT RAISE(ABORT,'task events are immutable'); END;
CREATE TRIGGER task_events_no_delete BEFORE DELETE ON task_events BEGIN SELECT RAISE(ABORT,'task events are immutable'); END;
