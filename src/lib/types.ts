// Shared domain types for Thought-to-Docs.

export type ThoughtStatus = "routed" | "inbox" | "needs-clarification";

export interface Project {
  id: string;
  name: string;
  summary: string;
  doc_tree: SectionNode[];
  created_at: string;
}

export interface Thought {
  id: string;
  project_id: string | null;
  raw_text: string;
  status: ThoughtStatus;
  note: string | null;
  created_at: string;
}

/** A node in a project's documentation tree. Stored as JSON on the project. */
export interface SectionNode {
  id: string;
  title: string;
  body_markdown: string;
  position: number;
  source_thought_ids: string[];
  children: SectionNode[];
}

// --- The LLM contract (spec §5) -------------------------------------------

export type Operation =
  | { op: "create_section"; parent_id: string | null; title: string; body_markdown: string; position: number }
  | { op: "append_to_section"; section_id: string; body_markdown: string }
  | { op: "revise_section"; section_id: string; new_body_markdown: string }
  | { op: "move_section"; section_id: string; new_parent_id: string | null; position: number }
  | { op: "flag"; reason: string };

/** Stage 1 — Route. */
export interface RouteResult {
  decision: "MATCH" | "NEW" | "UNSURE";
  project_id?: string; // when decision === "MATCH"
  name?: string; // when decision === "NEW"
  summary?: string; // when decision === "NEW"
  confidence: number;
  rationale?: string;
}

/** Stage 3 — Operate. */
export interface OperateResult {
  operations: Operation[];
  rationale: string;
  /** Optional refreshed one-liner for the project summary (§12.5). */
  updated_summary?: string;
}

/** What the pipeline returns to the API/UI after handling one thought. */
export interface PipelineResult {
  thought: Thought;
  outcome: "applied" | "inbox" | "flagged";
  project_id: string | null;
  project_name?: string;
  operations?: Operation[];
  rationale?: string;
  created_project?: boolean;
}
