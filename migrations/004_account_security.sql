CREATE TABLE user_security (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1))
);
INSERT INTO user_security(user_id) SELECT id FROM users;
CREATE INDEX sessions_user ON sessions(user_id);
