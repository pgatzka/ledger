// JSON Schemas for the two structured LLM responses (Route and Operate). Ollama
// uses them as the `format` constraint on /api/chat so the model's output is held
// to this exact shape; the pipeline then applies it deterministically.

export const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["MATCH", "NEW", "UNSURE"] },
    project_id: { type: "string", description: "Required when decision is MATCH." },
    name: { type: "string", description: "Proposed project name; required when decision is NEW." },
    summary: { type: "string", description: "One-line project summary; required when decision is NEW." },
    confidence: { type: "number", description: "0..1 confidence in this routing decision." },
    rationale: { type: "string", description: "Brief reason for the decision." },
  },
  required: ["decision", "confidence"],
} as const;

export const OPERATE_SCHEMA = {
  type: "object",
  properties: {
    operations: {
      type: "array",
      description: "Ordered operations to apply to the document tree.",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: ["create_section", "append_to_section", "revise_section", "move_section", "flag"],
          },
          parent_id: {
            type: ["string", "null"],
            description: "create_section/move_section: parent section id, or null for a top-level section.",
          },
          section_id: {
            type: "string",
            description: "append_to_section/revise_section/move_section: id of the target section.",
          },
          title: { type: "string", description: "create_section: heading for the new section." },
          body_markdown: {
            type: "string",
            description: "create_section/append_to_section: markdown body content.",
          },
          new_body_markdown: {
            type: "string",
            description: "revise_section: full replacement markdown body.",
          },
          position: {
            type: "integer",
            description: "create_section/move_section: 0-based index among siblings.",
          },
          reason: { type: "string", description: "flag: the clarifying question or reason to punt." },
        },
        required: ["op"],
      },
    },
    rationale: { type: "string", description: "One or two sentences explaining the changes." },
    updated_summary: {
      type: "string",
      description:
        "Optional refreshed one-line project summary, if this thought materially changed what the project is about.",
    },
  },
  required: ["operations", "rationale"],
} as const;

/** Shared operation-editing guidance, reused across provider prompts. */
export const OPERATE_GUIDANCE = [
  "You maintain a project's living documentation by returning a small list of discrete operations against stable section ids.",
  "You OWN the document structure — create sections, extend or revise them, and occasionally restructure — but express every change as an operation. Do NOT rewrite the whole document.",
  "Prefer the smallest set of operations that cleanly files the thought. Merge into an existing section (append_to_section / revise_section) rather than creating a near-duplicate. Rewrite raw thoughts into clean, well-structured docs; surfacing open questions is encouraged.",
  "If the thought is too vague to act on, or contradicts existing docs in a way you shouldn't silently resolve, return a single `flag` operation with a clarifying question instead of guessing.",
].join("\n");
