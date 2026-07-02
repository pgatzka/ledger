import type { SectionNode } from "./types";

/**
 * Render the section tree as markdown for the Operate prompt, annotating each
 * heading with its stable id (e.g. `## Features  [id: s_ab12cd34]`) so the LLM
 * can reference existing sections in append/revise/move operations.
 */
export function serializeMarkdownForPrompt(tree: SectionNode[], depth = 1): string {
  const out: string[] = [];
  for (const node of [...tree].sort((a, b) => a.position - b.position)) {
    const hashes = "#".repeat(Math.min(depth, 6));
    out.push(`${hashes} ${node.title}  [id: ${node.id}]`);
    if (node.body_markdown.trim()) out.push(node.body_markdown.trim());
    if (node.children.length) out.push(serializeMarkdownForPrompt(node.children, depth + 1));
  }
  return out.join("\n\n");
}
