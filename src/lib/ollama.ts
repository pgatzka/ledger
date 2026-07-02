import { serializeMarkdownForPrompt } from "./prompt";
import { OPERATE_GUIDANCE, OPERATE_SCHEMA, ROUTE_SCHEMA } from "./schemas";
import type { OperateResult, Operation, Project, RouteResult, SectionNode } from "./types";

// Local inference via Ollama (https://ollama.com). Uses /api/chat with a JSON
// `format` schema so the model is constrained to the same structured contract
// the Anthropic provider gets from forced tool use — no API key, no credits.
// Env is read per-call so OLLAMA_URL / OLLAMA_MODEL can change without a restart.
const ollamaUrl = () => (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const ollamaModel = () => process.env.OLLAMA_MODEL || "llama3.1:8b";

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

/** One structured, non-streaming chat turn; returns the parsed JSON object. */
async function chatJson<T>(system: string, user: string, schema: unknown): Promise<T> {
  const base = ollamaUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        format: schema, // JSON-schema constrained output
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach Ollama at ${base}. Is it running? (${detail})`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}: ${body || res.statusText}`);
  }

  const data = (await res.json()) as OllamaChatResponse;
  if (data.error) throw new Error(`Ollama error: ${data.error}`);
  const content = data.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Ollama returned no message content.");
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Ollama did not return valid JSON (model may not support structured output): ${content.slice(0, 400)}`);
  }
}

export async function route(rawText: string, projects: Project[]): Promise<RouteResult> {
  const catalog =
    projects.length === 0
      ? "(no projects exist yet)"
      : projects.map((p) => `- id=${p.id} | ${p.name}: ${p.summary || "(no summary)"}`).join("\n");

  const system =
    "You route a captured thought to a project. Respond ONLY with JSON matching the schema. " +
    "decision = MATCH (set project_id to an existing project's id) | NEW (set name + a one-line summary) | UNSURE (ambiguous/low confidence). " +
    "confidence is 0..1.";
  const user = `Existing projects:\n${catalog}\n\nThought:\n"""${rawText}"""`;

  return chatJson<RouteResult>(system, user, ROUTE_SCHEMA);
}

export async function decideOperations(
  rawText: string,
  projectName: string,
  tree: SectionNode[],
): Promise<OperateResult> {
  const doc = tree.length === 0 ? "(the document is empty)" : serializeMarkdownForPrompt(tree);

  const system =
    OPERATE_GUIDANCE +
    "\nRespond ONLY with JSON matching the schema. Operation ops and fields: " +
    "create_section(parent_id|null, title, body_markdown, position), " +
    "append_to_section(section_id, body_markdown), revise_section(section_id, new_body_markdown), " +
    "move_section(section_id, new_parent_id, position), flag(reason).";
  const user = `Project: ${projectName}\n\nCurrent document (section ids in brackets):\n\n${doc}\n\nNew thought to integrate:\n"""${rawText}"""`;

  const result = await chatJson<OperateResult>(system, user, OPERATE_SCHEMA);
  // Defensive: keep only well-formed operations (mirrors the Anthropic provider).
  result.operations = (result.operations || []).filter(
    (o): o is Operation => !!o && typeof (o as Operation).op === "string",
  );
  return result;
}
