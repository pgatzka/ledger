import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SectionNode } from "../src/lib/types.ts";

// Point the DB at a throwaway file BEFORE importing repo (the connection in
// src/lib/db.ts is lazy, so setting this first is honored). Never touches the
// dev database under ./data.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-test-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

// Dynamic import so the env var above is set before db.ts is first touched.
const repo = await import("../src/lib/repo.ts");

function section(title: string): SectionNode {
  return { id: `s_${title}`, title, body_markdown: "", position: 0, source_thought_ids: [], children: [] };
}

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("projects", () => {
  it("creates, fetches, and lists projects", () => {
    const p = repo.createProject("fitness-tracker", "a fitness app");
    assert.equal(repo.getProject(p.id)?.name, "fitness-tracker");
    assert.ok(repo.listProjects().some((x) => x.id === p.id));
  });
});

describe("thoughts (immutable log)", () => {
  it("starts a captured thought in the Inbox with no project", () => {
    const t = repo.createThought("make it faster");
    assert.equal(t.status, "inbox");
    assert.equal(t.project_id, null);
  });

  it("routing metadata changes but raw_text and id never do", () => {
    const t = repo.createThought("original text");
    const routed = repo.setThoughtRouting(t.id, "p_x", "routed", "filed under Features");
    assert.equal(routed.id, t.id);
    assert.equal(routed.raw_text, "original text"); // log is immutable
    assert.equal(routed.project_id, "p_x");
    assert.equal(routed.status, "routed");
  });
});

describe("versions + undo", () => {
  it("restores the previous snapshot and reports the reverted thought", () => {
    const p = repo.createProject("proj", "");
    const treeA: SectionNode[] = [section("A")];
    const treeB: SectionNode[] = [section("A"), section("B")];

    repo.updateProjectTree(p.id, treeA, "sumA");
    repo.snapshotVersion(p.id, "t_1", treeA, "sumA");
    repo.updateProjectTree(p.id, treeB, "sumB");
    repo.snapshotVersion(p.id, "t_2", treeB, "sumB");

    // First undo → back to treeA, reverting t_2.
    const u1 = repo.undoLast(p.id);
    assert.equal(u1?.revertedThoughtId, "t_2");
    let now = repo.getProject(p.id)!;
    assert.equal(now.doc_tree.length, 1);
    assert.equal(now.summary, "sumA");

    // Second undo → back to empty (no prior snapshot), reverting t_1.
    const u2 = repo.undoLast(p.id);
    assert.equal(u2?.revertedThoughtId, "t_1");
    now = repo.getProject(p.id)!;
    assert.equal(now.doc_tree.length, 0);
    assert.equal(now.summary, "");

    // Nothing left to undo.
    assert.equal(repo.undoLast(p.id), null);
  });
});
