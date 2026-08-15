-- sessionmem event log schema
-- Storage for terminal commands, file saves, and browser activity

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('terminal', 'file', 'browser')),
  content TEXT NOT NULL,
  project_path TEXT NOT NULL
);

-- Indexes for the query patterns used in M5 (time-windowed retrieval)
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_path);

