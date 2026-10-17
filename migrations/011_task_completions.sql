-- Completion is an independent terminal record. Existing execution events remain
-- truthful snapshots of the task before completion, without rewriting history.
CREATE TABLE task_completions (
 task_id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope='generic_record_review'),
 condition_version INTEGER NOT NULL,
 evidence_version INTEGER NOT NULL,
 task_revision INTEGER NOT NULL,
 output_summary TEXT NOT NULL CHECK(length(trim(output_summary)) BETWEEN 1 AND 1000),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 300),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64),
 completed_at TEXT NOT NULL,
 completed_by TEXT NOT NULL REFERENCES users(id),
 FOREIGN KEY(task_id,customer_id) REFERENCES work_tasks(id,customer_id),
 FOREIGN KEY(task_id,condition_version,customer_id) REFERENCES task_conditions(task_id,version,customer_id),
 FOREIGN KEY(task_id,evidence_version,customer_id) REFERENCES task_evidence(task_id,version,customer_id),
 FOREIGN KEY(task_id,task_revision) REFERENCES task_events(task_id,revision)
);
CREATE TRIGGER task_completions_no_update BEFORE UPDATE ON task_completions BEGIN SELECT RAISE(ABORT,'completion immutable'); END;
CREATE TRIGGER task_completions_no_delete BEFORE DELETE ON task_completions BEGIN SELECT RAISE(ABORT,'completion immutable'); END;
CREATE TRIGGER task_completions_ready BEFORE INSERT ON task_completions BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM work_tasks t JOIN users u ON u.id=t.assignee_id
  JOIN task_conditions c ON c.task_id=t.id AND c.version=NEW.condition_version
  JOIN task_evidence d ON d.task_id=t.id AND d.version=NEW.evidence_version
  WHERE t.id=NEW.task_id AND t.customer_id=NEW.customer_id
  AND t.revision=NEW.task_revision AND t.assignee_id=NEW.completed_by
  AND t.assignment_status='accepted' AND t.execution_status='running' AND t.lifecycle_status='active'
  AND u.active=1 AND u.store_id=t.store_id AND u.role IN ('manager','reception','professional')
  AND (t.candidate_role IS NULL OR t.candidate_role=u.role)
  AND COALESCE((SELECT must_change_password FROM user_security WHERE user_id=u.id),0)=0
  AND c.scope=NEW.scope AND d.condition_version=c.version AND d.task_revision=t.revision
  AND c.version=(SELECT max(version) FROM task_conditions WHERE task_id=t.id)
  AND d.version=(SELECT max(version) FROM task_evidence WHERE task_id=t.id)
  AND length(trim(d.notes))>0
  AND (c.require_document=0 OR EXISTS(SELECT 1 FROM task_evidence_documents WHERE task_id=t.id AND evidence_version=d.version))
  AND (c.require_attachment=0 OR EXISTS(SELECT 1 FROM task_evidence_attachments WHERE task_id=t.id AND evidence_version=d.version))
  AND NOT EXISTS(SELECT 1 FROM task_evidence_attachments r JOIN attachments a ON a.id=r.attachment_id WHERE r.task_id=t.id AND r.evidence_version=d.version AND a.revoked_at IS NOT NULL)
 ) THEN RAISE(ABORT,'completion not ready') END;
END;
CREATE TRIGGER completed_task_no_update BEFORE UPDATE ON work_tasks WHEN EXISTS(SELECT 1 FROM task_completions WHERE task_id=OLD.id) BEGIN SELECT RAISE(ABORT,'completed task immutable'); END;
CREATE TRIGGER completed_task_no_event BEFORE INSERT ON task_events WHEN EXISTS(SELECT 1 FROM task_completions WHERE task_id=NEW.task_id) BEGIN SELECT RAISE(ABORT,'completed task immutable'); END;
CREATE TRIGGER completed_task_no_condition BEFORE INSERT ON task_conditions WHEN EXISTS(SELECT 1 FROM task_completions WHERE task_id=NEW.task_id) BEGIN SELECT RAISE(ABORT,'completed task immutable'); END;
CREATE TRIGGER completed_task_no_evidence BEFORE INSERT ON task_evidence WHEN EXISTS(SELECT 1 FROM task_completions WHERE task_id=NEW.task_id) BEGIN SELECT RAISE(ABORT,'completed task immutable'); END;
CREATE TRIGGER completed_task_no_document_ref BEFORE INSERT ON task_evidence_documents WHEN EXISTS(SELECT 1 FROM task_completions WHERE task_id=NEW.task_id) BEGIN SELECT RAISE(ABORT,'completed task immutable'); END;
CREATE TRIGGER completed_task_no_attachment_ref BEFORE INSERT ON task_evidence_attachments WHEN EXISTS(SELECT 1 FROM task_completions WHERE task_id=NEW.task_id) BEGIN SELECT RAISE(ABORT,'completed task immutable'); END;
