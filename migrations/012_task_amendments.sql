CREATE UNIQUE INDEX completion_customer ON task_completions(task_id,customer_id);
CREATE TABLE task_completion_corrections (
 task_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=1),
 completion_sha256 TEXT NOT NULL CHECK(length(completion_sha256)=64),
 output_summary TEXT NOT NULL CHECK(length(trim(output_summary)) BETWEEN 1 AND 1000),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(task_id,version),
 UNIQUE(task_id,version,customer_id),
 FOREIGN KEY(task_id,customer_id) REFERENCES task_completions(task_id,customer_id)
);
CREATE TRIGGER task_corrections_ready BEFORE INSERT ON task_completion_corrections BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM task_completions c JOIN work_tasks t ON t.id=c.task_id JOIN users u ON u.id=NEW.created_by
  WHERE c.task_id=NEW.task_id AND c.customer_id=NEW.customer_id AND c.snapshot_sha256=NEW.completion_sha256
  AND u.store_id=t.store_id AND u.active=1 AND u.role IN ('manager','reception','professional')
  AND (u.role='manager' OR u.id=c.completed_by)
  AND COALESCE((SELECT must_change_password FROM user_security WHERE user_id=u.id),0)=0
  AND NEW.created_at>=c.completed_at
  AND NEW.version=COALESCE((SELECT max(version)+1 FROM task_completion_corrections WHERE task_id=c.task_id),1)
  AND NEW.output_summary<>COALESCE((SELECT output_summary FROM task_completion_corrections WHERE task_id=c.task_id ORDER BY version DESC LIMIT 1),c.output_summary)
 ) THEN RAISE(ABORT,'correction not allowed') END;
END;
CREATE TRIGGER task_corrections_no_update BEFORE UPDATE ON task_completion_corrections BEGIN SELECT RAISE(ABORT,'correction immutable'); END;
CREATE TRIGGER task_corrections_no_delete BEFORE DELETE ON task_completion_corrections BEGIN SELECT RAISE(ABORT,'correction immutable'); END;
CREATE TABLE task_followups (
 task_id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL,
 parent_task_id TEXT NOT NULL CHECK(parent_task_id<>task_id),
 source_correction_version INTEGER CHECK(source_correction_version IS NULL OR source_correction_version>=1),
 source_completion_sha256 TEXT NOT NULL CHECK(length(source_completion_sha256)=64),
 source_output_summary TEXT NOT NULL CHECK(length(trim(source_output_summary)) BETWEEN 1 AND 1000),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 FOREIGN KEY(task_id,customer_id) REFERENCES work_tasks(id,customer_id),
 FOREIGN KEY(parent_task_id,customer_id) REFERENCES task_completions(task_id,customer_id),
 FOREIGN KEY(parent_task_id,source_correction_version,customer_id) REFERENCES task_completion_corrections(task_id,version,customer_id)
);
CREATE INDEX followups_parent ON task_followups(parent_task_id,created_at,task_id);
CREATE TRIGGER task_followups_ready BEFORE INSERT ON task_followups BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_tasks child JOIN work_tasks parent ON parent.id=NEW.parent_task_id
  JOIN task_completions c ON c.task_id=parent.id JOIN users u ON u.id=NEW.created_by
  WHERE child.id=NEW.task_id AND child.customer_id=NEW.customer_id AND parent.customer_id=child.customer_id AND parent.store_id=child.store_id
  AND child.cycle_id IS parent.cycle_id AND child.cycle_version IS parent.cycle_version AND child.visit_id IS parent.visit_id AND child.context_basis=parent.context_basis
  AND child.revision=1 AND child.execution_status='pending' AND child.lifecycle_status='active' AND child.assignment_status IN ('queued','awaiting')
  AND child.created_by=u.id AND child.created_at=NEW.created_at AND NEW.created_at>=c.completed_at
  AND u.active=1 AND u.store_id=parent.store_id AND u.role IN ('manager','reception')
  AND COALESCE((SELECT must_change_password FROM user_security WHERE user_id=u.id),0)=0
  AND NEW.source_completion_sha256=c.snapshot_sha256
  AND COALESCE(NEW.source_correction_version,0)=COALESCE((SELECT max(version) FROM task_completion_corrections WHERE task_id=parent.id),0)
  AND NEW.source_output_summary=COALESCE((SELECT output_summary FROM task_completion_corrections WHERE task_id=parent.id ORDER BY version DESC LIMIT 1),c.output_summary)
 ) THEN RAISE(ABORT,'followup not allowed') END;
END;
CREATE TRIGGER task_followups_no_update BEFORE UPDATE ON task_followups BEGIN SELECT RAISE(ABORT,'followup immutable'); END;
CREATE TRIGGER task_followups_no_delete BEFORE DELETE ON task_followups BEGIN SELECT RAISE(ABORT,'followup immutable'); END;
