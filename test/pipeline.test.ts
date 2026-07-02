import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Full-loop integration test. Requires a real ANTHROPIC_API_KEY (it makes live
// routing + operate calls), so it is skipped in CI where no secret is set. Run
// locally with the key present to exercise capture → route → operate → apply.
const hasKey = !!process.env.ANTHROPIC_API_KEY;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-pipe-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ingestThought (live LLM)", () => {
  it("files the canonical thought without throwing", { skip: !hasKey }, async () => {
    const { ingestThought } = await import("../src/lib/pipeline.ts");
    const { listProjects } = await import("../src/lib/repo.ts");

    const result = await ingestThought(
      "for the fitness tracker it'd be cool to have a diagram of calorie intake over the last 30 days",
      listProjects(),
    );

    // Auto-apply + Inbox model: it either applied ops to a project or parked the
    // thought for review — but it always resolves to a valid outcome.
    assert.ok(["applied", "inbox", "flagged"].includes(result.outcome));
    if (result.outcome === "applied") {
      assert.ok(result.project_id);
      assert.ok((result.operations?.length ?? 0) > 0);
    }
  });
});
