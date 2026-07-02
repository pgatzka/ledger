-- Thought-to-Docs schema.
--
-- Event-sourcing model:
--   * thoughts  = the immutable, append-only source of truth. Never edited/deleted.
--   * projects  = top-level containers; each holds its section tree as a JSON blob.
--   * versions  = per-thought snapshots of a project's tree, enabling Undo + audit.

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',   -- LLM-maintained one-liner; drives routing.
  doc_tree   TEXT NOT NULL DEFAULT '[]', -- JSON array of root SectionNodes.
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thoughts (
  id         TEXT PRIMARY KEY,
  project_id TEXT,                        -- NULL until routed.
  raw_text   TEXT NOT NULL,
  status     TEXT NOT NULL,               -- 'routed' | 'inbox' | 'needs-clarification'
  note       TEXT,                        -- flag reason / routing rationale, for the Inbox.
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS versions (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  thought_id TEXT,                        -- the thought that produced this snapshot.
  tree_json  TEXT NOT NULL,               -- project tree AFTER applying the thought.
  summary    TEXT NOT NULL DEFAULT '',    -- project summary at this snapshot.
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thoughts_status  ON thoughts(status);
CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, created_at);
