ALTER TABLE work_tasks ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle_status IN('active','blocked','cancelled'));
ALTER TABLE work_tasks ADD COLUMN exception_reason TEXT;
ALTER TABLE work_tasks ADD COLUMN restore_status TEXT CHECK(restore_status IN('active','blocked'));
ALTER TABLE work_tasks ADD COLUMN restore_reason TEXT;
CREATE TABLE task_events_next(
 task_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=1),
 action TEXT NOT NULL CHECK(action IN('assign','claim','accept','start','pause','resume','return','transfer','block','unblock','cancel','restore')),
 from_assignee_id TEXT REFERENCES users(id),
 assignee_id TEXT REFERENCES users(id),
 assignment_status TEXT NOT NULL CHECK(assignment_status IN('queued','awaiting','accepted')),
 execution_status TEXT NOT NULL CHECK(execution_status IN('pending','running','paused')),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),
 candidate_role TEXT CHECK(candidate_role IN('manager','reception','professional')),
 lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle_status IN('active','blocked','cancelled')),
 exception_reason TEXT,
 restore_status TEXT CHECK(restore_status IN('active','blocked')),
 restore_reason TEXT,
 CHECK(((lifecycle_status='active' AND exception_reason IS NULL AND restore_status IS NULL AND restore_reason IS NULL) OR (lifecycle_status='blocked' AND exception_reason IS NOT NULL AND length(trim(exception_reason))>0 AND restore_status IS NULL AND restore_reason IS NULL) OR (lifecycle_status='cancelled' AND exception_reason IS NOT NULL AND length(trim(exception_reason))>0 AND ((restore_status IS 'active' AND restore_reason IS NULL) OR (restore_status IS 'blocked' AND restore_reason IS NOT NULL AND length(trim(restore_reason))>0)))) AND (lifecycle_status='active' OR execution_status<>'running')),
 CHECK((assignment_status='queued' AND assignee_id IS NULL AND candidate_role IS NOT NULL) OR (assignment_status IN('awaiting','accepted') AND assignee_id IS NOT NULL)),
 CHECK(execution_status<>'running' OR assignment_status='accepted'),
 PRIMARY KEY(task_id,revision),
 FOREIGN KEY(task_id,customer_id) REFERENCES work_tasks(id,customer_id)
);
INSERT INTO task_events_next SELECT *,'active',NULL,NULL,NULL FROM task_events;
DROP TABLE task_events;
ALTER TABLE task_events_next RENAME TO task_events;
CREATE TRIGGER task_events_no_update BEFORE UPDATE ON task_events BEGIN SELECT RAISE(ABORT,'task events are immutable'); END;
CREATE TRIGGER task_events_no_delete BEFORE DELETE ON task_events BEGIN SELECT RAISE(ABORT,'task events are immutable'); END;
CREATE TRIGGER task_exception_insert BEFORE INSERT ON work_tasks WHEN NOT (((NEW.lifecycle_status='active' AND NEW.exception_reason IS NULL AND NEW.restore_status IS NULL AND NEW.restore_reason IS NULL) OR (NEW.lifecycle_status='blocked' AND NEW.exception_reason IS NOT NULL AND length(trim(NEW.exception_reason))>0 AND NEW.restore_status IS NULL AND NEW.restore_reason IS NULL) OR (NEW.lifecycle_status='cancelled' AND NEW.exception_reason IS NOT NULL AND length(trim(NEW.exception_reason))>0 AND ((NEW.restore_status IS 'active' AND NEW.restore_reason IS NULL) OR (NEW.restore_status IS 'blocked' AND NEW.restore_reason IS NOT NULL AND length(trim(NEW.restore_reason))>0)))) AND (NEW.lifecycle_status='active' OR NEW.execution_status<>'running')) BEGIN SELECT RAISE(ABORT,'invalid task exception state'); END;
CREATE TRIGGER task_exception_update BEFORE UPDATE ON work_tasks WHEN NOT (((NEW.lifecycle_status='active' AND NEW.exception_reason IS NULL AND NEW.restore_status IS NULL AND NEW.restore_reason IS NULL) OR (NEW.lifecycle_status='blocked' AND NEW.exception_reason IS NOT NULL AND length(trim(NEW.exception_reason))>0 AND NEW.restore_status IS NULL AND NEW.restore_reason IS NULL) OR (NEW.lifecycle_status='cancelled' AND NEW.exception_reason IS NOT NULL AND length(trim(NEW.exception_reason))>0 AND ((NEW.restore_status IS 'active' AND NEW.restore_reason IS NULL) OR (NEW.restore_status IS 'blocked' AND NEW.restore_reason IS NOT NULL AND length(trim(NEW.restore_reason))>0)))) AND (NEW.lifecycle_status='active' OR NEW.execution_status<>'running')) BEGIN SELECT RAISE(ABORT,'invalid task exception state'); END;
CREATE INDEX tasks_lifecycle ON work_tasks(store_id,lifecycle_status,updated_at,id);
