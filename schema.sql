CREATE TABLE IF NOT EXISTS project_index (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT ''
);
