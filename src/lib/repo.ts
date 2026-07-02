import { db } from "./db";
import { genId } from "./tree";
import type { Project, SectionNode, Thought, ThoughtStatus } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

// --- Projects --------------------------------------------------------------

interface ProjectRow {
  id: string;
  name: string;
  summary: string;
  doc_tree: string;
  created_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return { ...row, doc_tree: JSON.parse(row.doc_tree) as SectionNode[] };
}

export function listProjects(): Project[] {
  const rows = db.prepare("SELECT * FROM projects ORDER BY created_at ASC").all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project | null {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function createProject(name: string, summary = "", tree: SectionNode[] = []): Project {
  const project: Project = {
    id: genId("p"),
    name,
    summary,
    doc_tree: tree,
    created_at: nowIso(),
  };
  db.prepare(
    "INSERT INTO projects (id, name, summary, doc_tree, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(project.id, project.name, project.summary, JSON.stringify(project.doc_tree), project.created_at);
  return project;
}

export function updateProjectTree(id: string, tree: SectionNode[], summary?: string): void {
  if (summary !== undefined) {
    db.prepare("UPDATE projects SET doc_tree = ?, summary = ? WHERE id = ?").run(
      JSON.stringify(tree),
      summary,
      id,
    );
  } else {
    db.prepare("UPDATE projects SET doc_tree = ? WHERE id = ?").run(JSON.stringify(tree), id);
  }
}

// --- Thoughts (immutable append-only log) ----------------------------------

export function createThought(rawText: string): Thought {
  const thought: Thought = {
    id: genId("t"),
    project_id: null,
    raw_text: rawText,
    status: "inbox",
    note: null,
    created_at: nowIso(),
  };
  db.prepare(
    "INSERT INTO thoughts (id, project_id, raw_text, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(thought.id, thought.project_id, thought.raw_text, thought.status, thought.note, thought.created_at);
  return thought;
}

/**
 * Update only the routing/status *metadata* of a thought. The raw_text and id
 * are never touched — the log stays immutable; this just records where a
 * thought ended up.
 */
export function setThoughtRouting(
  id: string,
  projectId: string | null,
  status: ThoughtStatus,
  note: string | null,
): Thought {
  db.prepare("UPDATE thoughts SET project_id = ?, status = ?, note = ? WHERE id = ?").run(
    projectId,
    status,
    note,
    id,
  );
  return getThought(id)!;
}

export function getThought(id: string): Thought | null {
  const row = db.prepare("SELECT * FROM thoughts WHERE id = ?").get(id) as Thought | undefined;
  return row ?? null;
}

export function listInbox(): Thought[] {
  return db
    .prepare("SELECT * FROM thoughts WHERE status != 'routed' ORDER BY created_at DESC")
    .all() as Thought[];
}

export function listThoughts(): Thought[] {
  return db.prepare("SELECT * FROM thoughts ORDER BY created_at DESC").all() as Thought[];
}

// --- Versions (undo + audit trail) -----------------------------------------

interface VersionRow {
  id: string;
  project_id: string;
  thought_id: string | null;
  tree_json: string;
  summary: string;
  created_at: string;
}

/** Snapshot a project's tree after applying a thought. */
export function snapshotVersion(projectId: string, thoughtId: string | null, tree: SectionNode[], summary: string): void {
  db.prepare(
    "INSERT INTO versions (id, project_id, thought_id, tree_json, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(genId("v"), projectId, thoughtId, JSON.stringify(tree), summary, nowIso());
}

/**
 * Undo the most recent change to a project: restore the previous snapshot (or an
 * empty tree if this was the first change) and return the thought_id that was
 * reverted so the caller can move it back to the Inbox.
 */
export function undoLast(projectId: string): { revertedThoughtId: string | null } | null {
  const versions = db
    .prepare("SELECT * FROM versions WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as VersionRow[];
  if (versions.length === 0) return null;

  const latest = versions[0];
  const previous = versions[1];

  const restoredTree: SectionNode[] = previous ? (JSON.parse(previous.tree_json) as SectionNode[]) : [];
  const restoredSummary = previous ? previous.summary : "";
  updateProjectTree(projectId, restoredTree, restoredSummary);

  db.prepare("DELETE FROM versions WHERE id = ?").run(latest.id);
  return { revertedThoughtId: latest.thought_id };
}
