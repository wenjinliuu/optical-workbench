CREATE TABLE task_conditions(
 task_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 task_revision INTEGER NOT NULL,
 scope TEXT NOT NULL CHECK(scope='generic_record_review'),
 description TEXT NOT NULL CHECK(length(trim(description))>0),
 require_document INTEGER NOT NULL CHECK(require_document IN(0,1)),
 require_attachment INTEGER NOT NULL CHECK(require_attachment IN(0,1)),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(task_id,version),
 UNIQUE(task_id,version,customer_id),
 FOREIGN KEY(task_id,customer_id) REFERENCES work_tasks(id,customer_id),
 FOREIGN KEY(task_id,task_revision) REFERENCES task_events(task_id,revision)
);
CREATE TABLE task_evidence(
 task_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 task_revision INTEGER NOT NULL,
 condition_version INTEGER NOT NULL,
 notes TEXT,
 source TEXT NOT NULL CHECK(source IN('employee','external','guardian_report')),
 reason TEXT NOT NULL,
 references_json TEXT NOT NULL CHECK(json_valid(references_json)),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(task_id,version),
 UNIQUE(task_id,version,customer_id),
 FOREIGN KEY(task_id,customer_id) REFERENCES work_tasks(id,customer_id),
 FOREIGN KEY(task_id,task_revision) REFERENCES task_events(task_id,revision),
 FOREIGN KEY(task_id,condition_version,customer_id) REFERENCES task_conditions(task_id,version,customer_id)
);
CREATE TABLE task_evidence_documents(
 task_id TEXT NOT NULL,
 evidence_version INTEGER NOT NULL,
 customer_id TEXT NOT NULL,
 document_version_id TEXT NOT NULL,
 PRIMARY KEY(task_id,evidence_version,document_version_id),
 FOREIGN KEY(task_id,evidence_version,customer_id) REFERENCES task_evidence(task_id,version,customer_id),
 FOREIGN KEY(document_version_id,customer_id) REFERENCES document_versions(id,customer_id)
);
CREATE TABLE task_evidence_attachments(
 task_id TEXT NOT NULL,
 evidence_version INTEGER NOT NULL,
 customer_id TEXT NOT NULL,
 attachment_id TEXT NOT NULL,
 PRIMARY KEY(task_id,evidence_version,attachment_id),
 FOREIGN KEY(task_id,evidence_version,customer_id) REFERENCES task_evidence(task_id,version,customer_id),
 FOREIGN KEY(attachment_id,customer_id) REFERENCES attachments(id,customer_id)
);
CREATE INDEX conditions_customer ON task_conditions(customer_id,created_at,task_id);
CREATE INDEX evidence_customer ON task_evidence(customer_id,created_at,task_id);
CREATE TRIGGER task_conditions_no_update BEFORE UPDATE ON task_conditions BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
CREATE TRIGGER task_conditions_no_delete BEFORE DELETE ON task_conditions BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
CREATE TRIGGER task_evidence_no_update BEFORE UPDATE ON task_evidence BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
CREATE TRIGGER task_evidence_no_delete BEFORE DELETE ON task_evidence BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
CREATE TRIGGER task_evidence_documents_no_update BEFORE UPDATE ON task_evidence_documents BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
CREATE TRIGGER task_evidence_documents_no_delete BEFORE DELETE ON task_evidence_documents BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
CREATE TRIGGER task_evidence_attachments_no_update BEFORE UPDATE ON task_evidence_attachments BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
CREATE TRIGGER task_evidence_attachments_no_delete BEFORE DELETE ON task_evidence_attachments BEGIN SELECT RAISE(ABORT,'task evidence and conditions are immutable'); END;
