import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyOperations, findNode, serializeToMarkdown } from "../src/lib/tree.ts";
import type { Operation, SectionNode } from "../src/lib/types.ts";

describe("applyOperations", () => {
  it("creates top-level sections and records provenance", () => {
    const ops: Operation[] = [
      { op: "create_section", parent_id: null, title: "Overview", body_markdown: "What the app is.", position: 0 },
      { op: "create_section", parent_id: null, title: "Features", body_markdown: "Planned features.", position: 1 },
    ];
    const r = applyOperations([], ops, "t_1");
    assert.equal(r.tree.length, 2);
    assert.equal(r.applied.length, 2);
    const features = r.tree.find((n) => n.title === "Features")!;
    assert.ok(features.source_thought_ids.includes("t_1"));
  });

  it("nests a sub-section and does not mutate the input tree", () => {
    const base = applyOperations([], [
      { op: "create_section", parent_id: null, title: "Features", body_markdown: "", position: 0 },
    ], "t_1").tree;
    const featuresId = base[0].id;

    const r = applyOperations(base, [
      { op: "create_section", parent_id: featuresId, title: "Calorie Intake", body_markdown: "chart", position: 0 },
    ], "t_2");

    const features = r.tree.find((n) => n.title === "Features")!;
    assert.equal(features.children.length, 1);
    assert.equal(features.children[0].title, "Calorie Intake");
    // immutability: the tree we passed in is untouched
    assert.equal(base[0].children.length, 0);
  });

  it("appends to a section, concatenating body and accruing provenance", () => {
    let tree: SectionNode[] = applyOperations([], [
      { op: "create_section", parent_id: null, title: "S", body_markdown: "first", position: 0 },
    ], "t_1").tree;
    const id = tree[0].id;

    tree = applyOperations(tree, [{ op: "append_to_section", section_id: id, body_markdown: "second" }], "t_2").tree;
    const node = findNode(tree, id)!;
    assert.match(node.body_markdown, /first/);
    assert.match(node.body_markdown, /second/);
    assert.ok(node.source_thought_ids.includes("t_1"));
    assert.ok(node.source_thought_ids.includes("t_2"));
  });

  it("revises a section body wholesale", () => {
    let tree: SectionNode[] = applyOperations([], [
      { op: "create_section", parent_id: null, title: "S", body_markdown: "old", position: 0 },
    ], "t_1").tree;
    const id = tree[0].id;
    tree = applyOperations(tree, [{ op: "revise_section", section_id: id, new_body_markdown: "new" }], "t_2").tree;
    assert.equal(findNode(tree, id)!.body_markdown, "new");
  });

  it("moves a section to a new parent/position", () => {
    let tree: SectionNode[] = applyOperations([], [
      { op: "create_section", parent_id: null, title: "Features", body_markdown: "", position: 0 },
    ], "t_1").tree;
    const featuresId = tree[0].id;
    tree = applyOperations(tree, [
      { op: "create_section", parent_id: featuresId, title: "Chart", body_markdown: "", position: 0 },
    ], "t_2").tree;
    const chartId = findNode(tree, featuresId)!.children[0].id;

    tree = applyOperations(tree, [{ op: "move_section", section_id: chartId, new_parent_id: null, position: 0 }], "t_3").tree;
    assert.equal(tree[0].id, chartId);
    assert.equal(findNode(tree, featuresId)!.children.length, 0);
  });

  it("skips operations that reference a missing section id (no throw)", () => {
    const r = applyOperations([], [
      { op: "append_to_section", section_id: "nope", body_markdown: "x" },
      { op: "create_section", parent_id: null, title: "Survivor", body_markdown: "", position: 99 },
    ], "t_1");
    assert.equal(r.applied.length, 1);
    assert.ok(r.tree.some((n) => n.title === "Survivor"));
  });

  it("clamps an out-of-range create position to the end", () => {
    let tree: SectionNode[] = applyOperations([], [
      { op: "create_section", parent_id: null, title: "A", body_markdown: "", position: 0 },
    ], "t_1").tree;
    tree = applyOperations(tree, [
      { op: "create_section", parent_id: null, title: "B", body_markdown: "", position: 99 },
    ], "t_2").tree;
    assert.equal(tree[tree.length - 1].title, "B");
    assert.deepEqual(tree.map((n) => n.position), [0, 1]);
  });

  it("treats a flag as no structural change but surfaces the reason", () => {
    const r = applyOperations([], [{ op: "flag", reason: "too vague" }], "t_1");
    assert.equal(r.applied.length, 0);
    assert.deepEqual(r.flags, ["too vague"]);
  });
});

describe("serializeToMarkdown", () => {
  it("scales heading level with tree depth and includes bodies", () => {
    let tree: SectionNode[] = applyOperations([], [
      { op: "create_section", parent_id: null, title: "Root", body_markdown: "root body", position: 0 },
    ], "a").tree;
    tree = applyOperations(tree, [
      { op: "create_section", parent_id: tree[0].id, title: "Child", body_markdown: "child body", position: 0 },
    ], "b").tree;

    const md = serializeToMarkdown(tree);
    assert.match(md, /^# Root/m);
    assert.match(md, /^## Child/m);
    assert.match(md, /root body/);
    assert.match(md, /child body/);
  });
});
