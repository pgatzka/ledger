import { decideOperations, route } from "./llm";
import {
  createProject,
  createThought,
  getProject,
  setThoughtRouting,
  snapshotVersion,
  updateProjectTree,
} from "./repo";
import { applyOperations } from "./tree";
import type { PipelineResult, Project } from "./types";

const CONFIDENCE_THRESHOLD = Number(process.env.ROUTE_CONFIDENCE_THRESHOLD || "0.6");

/**
 * The core loop (spec §2/§4): capture → route → decide operations → apply
 * deterministically → persist + link provenance → return a result to render.
 *
 * Review model is auto-apply + undo: once a project is confidently chosen the
 * operations are applied without a confirmation step. Ambiguous routing short-
 * circuits to the Inbox instead of guessing.
 */
export async function ingestThought(rawText: string, projects: Project[]): Promise<PipelineResult> {
  const thought = createThought(rawText);

  // Stage 1 — Route.
  const routing = await route(rawText, projects);

  if (routing.decision === "UNSURE" || routing.confidence < CONFIDENCE_THRESHOLD) {
    const note = routing.rationale || "Low routing confidence — please assign a project.";
    const t = setThoughtRouting(thought.id, null, "inbox", note);
    return { thought: t, outcome: "inbox", project_id: null };
  }

  // Resolve (or create) the target project.
  let project: Project;
  let createdProject = false;
  if (routing.decision === "NEW") {
    project = createProject(routing.name || "Untitled Project", routing.summary || "");
    createdProject = true;
  } else {
    const existing = routing.project_id ? getProject(routing.project_id) : null;
    if (!existing) {
      // Routed to a project id that doesn't exist — fall back to the Inbox.
      const t = setThoughtRouting(thought.id, null, "inbox", "Routed to an unknown project.");
      return { thought: t, outcome: "inbox", project_id: null };
    }
    project = existing;
  }

  // Stage 3 — Decide operations against the project's current tree.
  const decision = await decideOperations(rawText, project.name, project.doc_tree);

  // Stage 4 — Apply deterministically (the LLM proposes; we dispose).
  const { tree, applied, flags } = applyOperations(project.doc_tree, decision.operations, thought.id);

  // A pure flag (no structural ops) means the model punted — send to Inbox.
  if (applied.length === 0 && flags.length > 0) {
    const t = setThoughtRouting(thought.id, project.id, "needs-clarification", flags.join(" "));
    return {
      thought: t,
      outcome: "flagged",
      project_id: project.id,
      project_name: project.name,
      rationale: flags.join(" "),
      created_project: createdProject,
    };
  }

  // Stage 5 — Persist the new tree, refresh the summary, link provenance, snapshot for undo.
  const newSummary = decision.updated_summary || project.summary;
  updateProjectTree(project.id, tree, newSummary);
  snapshotVersion(project.id, thought.id, tree, newSummary);
  const t = setThoughtRouting(thought.id, project.id, "routed", decision.rationale);

  return {
    thought: t,
    outcome: "applied",
    project_id: project.id,
    project_name: project.name,
    operations: applied,
    rationale: decision.rationale,
    created_project: createdProject,
  };
}

/**
 * Re-run just the Operate stage for a thought the user has manually assigned to
 * a project from the Inbox.
 */
export async function assignThoughtToProject(thoughtId: string, rawText: string, project: Project): Promise<PipelineResult> {
  const decision = await decideOperations(rawText, project.name, project.doc_tree);
  const { tree, applied, flags } = applyOperations(project.doc_tree, decision.operations, thoughtId);

  if (applied.length === 0 && flags.length > 0) {
    const t = setThoughtRouting(thoughtId, project.id, "needs-clarification", flags.join(" "));
    return { thought: t, outcome: "flagged", project_id: project.id, project_name: project.name, rationale: flags.join(" ") };
  }

  const newSummary = decision.updated_summary || project.summary;
  updateProjectTree(project.id, tree, newSummary);
  snapshotVersion(project.id, thoughtId, tree, newSummary);
  const t = setThoughtRouting(thoughtId, project.id, "routed", decision.rationale);

  return {
    thought: t,
    outcome: "applied",
    project_id: project.id,
    project_name: project.name,
    operations: applied,
    rationale: decision.rationale,
  };
}
