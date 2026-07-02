import { randomUUID } from "node:crypto";
import type { Operation, SectionNode } from "./types";

export function genId(prefix = "s"): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

/** Depth-first search for a node by id. Returns null if not found. */
export function findNode(tree: SectionNode[], id: string): SectionNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Remove a node by id, returning it (detached) plus mutating the tree in place. */
function detachNode(tree: SectionNode[], id: string): SectionNode | null {
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].id === id) {
      const [removed] = tree.splice(i, 1);
      return removed;
    }
    const hit = detachNode(tree[i].children, id);
    if (hit) return hit;
  }
  return null;
}

/** Insert `node` into `siblings` at `position`, clamped, then renumber positions. */
function insertAt(siblings: SectionNode[], node: SectionNode, position: number): void {
  const idx = Math.max(0, Math.min(position, siblings.length));
  siblings.splice(idx, 0, node);
  siblings.forEach((s, i) => (s.position = i));
}

/** Record provenance: append the thought id to a node if not already present. */
function touch(node: SectionNode, thoughtId: string): void {
  if (!node.source_thought_ids.includes(thoughtId)) {
    node.source_thought_ids.push(thoughtId);
  }
}

export interface ApplyOutcome {
  tree: SectionNode[];
  applied: Operation[];
  /** flag reasons, if the LLM punted instead of editing. */
  flags: string[];
}

/**
 * Deterministically apply a list of LLM-proposed operations to a section tree.
 * The LLM proposes; this function disposes (spec §4, stage 4). Operations that
 * reference a missing section id are skipped rather than throwing, so one bad
 * op can't abort the batch.
 */
export function applyOperations(
  inputTree: SectionNode[],
  operations: Operation[],
  thoughtId: string,
): ApplyOutcome {
  // Work on a deep clone so callers keep the pre-change tree for versioning.
  const tree: SectionNode[] = structuredClone(inputTree);
  const applied: Operation[] = [];
  const flags: string[] = [];

  for (const op of operations) {
    switch (op.op) {
      case "create_section": {
        const node: SectionNode = {
          id: genId(),
          title: op.title,
          body_markdown: op.body_markdown,
          position: op.position,
          source_thought_ids: [thoughtId],
          children: [],
        };
        const siblings = op.parent_id ? findNode(tree, op.parent_id)?.children : tree;
        if (!siblings) break; // parent not found → skip
        insertAt(siblings, node, op.position);
        applied.push(op);
        break;
      }
      case "append_to_section": {
        const node = findNode(tree, op.section_id);
        if (!node) break;
        node.body_markdown = `${node.body_markdown.trimEnd()}\n\n${op.body_markdown}`.trim();
        touch(node, thoughtId);
        applied.push(op);
        break;
      }
      case "revise_section": {
        const node = findNode(tree, op.section_id);
        if (!node) break;
        node.body_markdown = op.new_body_markdown;
        touch(node, thoughtId);
        applied.push(op);
        break;
      }
      case "move_section": {
        const node = detachNode(tree, op.section_id);
        if (!node) break;
        const siblings = op.new_parent_id ? findNode(tree, op.new_parent_id)?.children : tree;
        if (!siblings) {
          // target parent vanished (e.g. it was the moved node's own subtree) → skip
          break;
        }
        insertAt(siblings, node, op.position);
        touch(node, thoughtId);
        applied.push(op);
        break;
      }
      case "flag": {
        flags.push(op.reason);
        break;
      }
    }
  }

  // Normalise sibling positions everywhere for stable rendering.
  renumber(tree);
  return { tree, applied, flags };
}

function renumber(siblings: SectionNode[]): void {
  siblings.forEach((s, i) => {
    s.position = i;
    renumber(s.children);
  });
}

/** Render the tree as a single markdown document (headings scale with depth). */
export function serializeToMarkdown(tree: SectionNode[], depth = 1): string {
  const out: string[] = [];
  for (const node of [...tree].sort((a, b) => a.position - b.position)) {
    const hashes = "#".repeat(Math.min(depth, 6));
    out.push(`${hashes} ${node.title}`);
    if (node.body_markdown.trim()) out.push(node.body_markdown.trim());
    if (node.children.length) out.push(serializeToMarkdown(node.children, depth + 1));
  }
  return out.join("\n\n");
}

/** Compact outline (id + title only) — used in prompts and could feed retrieval later. */
export function serializeOutline(tree: SectionNode[], depth = 0): string {
  const out: string[] = [];
  for (const node of [...tree].sort((a, b) => a.position - b.position)) {
    out.push(`${"  ".repeat(depth)}- ${node.id} "${node.title}"`);
    if (node.children.length) out.push(serializeOutline(node.children, depth + 1));
  }
  return out.join("\n");
}
