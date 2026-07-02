import Anthropic from "@anthropic-ai/sdk";
import { serializeMarkdownForPrompt } from "./prompt";
import { OPERATE_GUIDANCE, OPERATE_SCHEMA, ROUTE_SCHEMA } from "./schemas";
import type { OperateResult, Operation, Project, RouteResult, SectionNode } from "./types";

type ToolSchema = Anthropic.Tool["input_schema"];

const ROUTE_MODEL = process.env.ROUTE_MODEL || "claude-haiku-4-5-20251001";
const OPERATE_MODEL = process.env.OPERATE_MODEL || "claude-sonnet-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    // Prefer a Claude subscription OAuth token (mint via `claude setup-token`)
    // so calls draw on subscription usage instead of prepaid API credits. Fall
    // back to a standard API key. See README "Auth" for the trade-offs.
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    if (authToken) {
      // apiKey: null stops the SDK from also reading ANTHROPIC_API_KEY from the
      // env and sending both auth headers (which the API rejects).
      client = new Anthropic({
        apiKey: null,
        authToken,
        defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
      });
    } else if (process.env.ANTHROPIC_API_KEY) {
      client = new Anthropic();
    } else {
      throw new Error(
        "No Anthropic credentials. Set ANTHROPIC_AUTH_TOKEN (a Claude subscription token from `claude setup-token`, to use subscription usage) or ANTHROPIC_API_KEY (uses prepaid API credits). See .env.example.",
      );
    }
  }
  return client;
}

/**
 * Extract the input of a forced tool call. We force `tool_choice`, so the model
 * always responds with exactly one tool_use block whose input matches the schema.
 */
function toolInput<T>(message: Anthropic.Message): T {
  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return the expected structured tool call.");
  }
  return block.input as T;
}

// --- Stage 1: Route --------------------------------------------------------

const ROUTE_TOOL: Anthropic.Tool = {
  name: "route_thought",
  description:
    "Decide which project a captured thought belongs to. Return MATCH with the project_id of an existing project when you are confident; NEW with a proposed name and one-line summary when the thought clearly starts a new project; or UNSURE when routing is ambiguous or low-confidence.",
  input_schema: ROUTE_SCHEMA as unknown as ToolSchema,
};

export async function route(rawText: string, projects: Project[]): Promise<RouteResult> {
  const catalog =
    projects.length === 0
      ? "(no projects exist yet)"
      : projects.map((p) => `- id=${p.id} | ${p.name}: ${p.summary || "(no summary)"}`).join("\n");

  const message = await anthropic().messages.create({
    model: ROUTE_MODEL,
    max_tokens: 1024,
    tools: [ROUTE_TOOL],
    tool_choice: { type: "tool", name: "route_thought" },
    messages: [
      {
        role: "user",
        content: `Existing projects:\n${catalog}\n\nThought:\n"""${rawText}"""\n\nRoute this thought.`,
      },
    ],
  });

  return toolInput<RouteResult>(message);
}

// --- Stage 3: Operate ------------------------------------------------------

const OPERATE_TOOL: Anthropic.Tool = {
  name: "edit_document",
  description: OPERATE_GUIDANCE,
  input_schema: OPERATE_SCHEMA as unknown as ToolSchema,
};

export async function decideOperations(
  rawText: string,
  projectName: string,
  tree: SectionNode[],
): Promise<OperateResult> {
  const doc = tree.length === 0 ? "(the document is empty)" : serializeMarkdownForPrompt(tree);

  const message = await anthropic().messages.create({
    model: OPERATE_MODEL,
    max_tokens: 8000,
    tools: [OPERATE_TOOL],
    tool_choice: { type: "tool", name: "edit_document" },
    messages: [
      {
        role: "user",
        content: `Project: ${projectName}\n\nCurrent document (section ids shown in brackets):\n\n${doc}\n\nNew thought to integrate:\n"""${rawText}"""\n\nReturn the operations that file this thought into the document.`,
      },
    ],
  });

  const result = toolInput<OperateResult>(message);
  // Defensive: ensure operations is an array of well-formed ops.
  result.operations = (result.operations || []).filter(
    (o): o is Operation => !!o && typeof (o as Operation).op === "string",
  );
  return result;
}
