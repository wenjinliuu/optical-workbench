CREATE TABLE attachment_blobs(
  sha256 TEXT PRIMARY KEY,
  bytes BLOB NOT NULL,
  size INTEGER NOT NULL CHECK(size>0 AND size<=1048576 AND length(bytes)=size)
);
CREATE TABLE attachments(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  blob_sha256 TEXT NOT NULL REFERENCES attachment_blobs(sha256),
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  revoked_at TEXT,
  revoked_by TEXT REFERENCES users(id),
  revocation_reason TEXT,
  UNIQUE(id,customer_id)
);
CREATE INDEX attachments_customer ON attachments(customer_id,created_at);
CREATE TABLE document_records(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  UNIQUE(id,customer_id)
);
CREATE TABLE document_versions(
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN('employee','external','guardian_report')),
  revision_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  FOREIGN KEY(record_id,customer_id) REFERENCES document_records(id,customer_id),
  UNIQUE(record_id,version),
  UNIQUE(id,customer_id)
);
CREATE TABLE version_attachments(
  version_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  PRIMARY KEY(version_id,attachment_id),
  FOREIGN KEY(version_id,customer_id) REFERENCES document_versions(id,customer_id),
  FOREIGN KEY(attachment_id,customer_id) REFERENCES attachments(id,customer_id)
);
CREATE TRIGGER document_version_no_update BEFORE UPDATE ON document_versions BEGIN SELECT RAISE(ABORT,'document versions are immutable'); END;
CREATE TRIGGER document_version_no_delete BEFORE DELETE ON document_versions BEGIN SELECT RAISE(ABORT,'document versions are immutable'); END;
CREATE TRIGGER version_attachment_no_update BEFORE UPDATE ON version_attachments BEGIN SELECT RAISE(ABORT,'version attachment references are immutable'); END;
CREATE TRIGGER version_attachment_no_delete BEFORE DELETE ON version_attachments BEGIN SELECT RAISE(ABORT,'version attachment references are immutable'); END;
CREATE TRIGGER blob_no_update BEFORE UPDATE ON attachment_blobs BEGIN SELECT RAISE(ABORT,'attachment bytes are immutable'); END;
CREATE TRIGGER blob_no_delete BEFORE DELETE ON attachment_blobs BEGIN SELECT RAISE(ABORT,'attachment bytes are immutable'); END;
