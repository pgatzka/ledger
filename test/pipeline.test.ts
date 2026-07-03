import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Full capture → route → operate → apply loop against a stand-in Ollama server.
// The fake distinguishes the Route call from the Operate call by whether the
// request's `format` schema declares an `operations` property, and returns
// schema-shaped JSON for each. No network, model, or key required.
let server: http.Server;
let pipeline: typeof import("../src/lib/pipeline.ts");
let repo: typeof import("../src/lib/repo.ts");
let tmpDir: string;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const reqObj = JSON.parse(body);
      const isOperate = !!reqObj?.format?.properties?.operations;
      const content = isOperate
        ? JSON.stringify({
            operations: [
              {
                op: "create_section",
                parent_id: null,
                title: "Calorie Intake Trend Chart",
                body_markdown: "Line/area chart of daily calorie intake over a rolling 30-day window.",
                position: 0,
              },
            ],
            rationale: "New feature idea; created a section.",
          })
        : JSON.stringify({ decision: "NEW", name: "fitness-tracker", summary: "A fitness tracking app.", confidence: 0.95 });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: reqObj.model, message: { role: "assistant", content }, done: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.OLLAMA_URL = `http://127.0.0.1:${port}`;
  process.env.OLLAMA_MODEL = "test-model";

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-pipe-"));
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

  // Import AFTER env is set — the DB connection and Ollama URL read it lazily.
  repo = await import("../src/lib/repo.ts");
  pipeline = await import("../src/lib/pipeline.ts");
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ingestThought (Ollama end-to-end)", () => {
  it("routes to a NEW project and applies the operation", async () => {
    const result = await pipeline.ingestThought(
      "for the fitness tracker it'd be cool to have a diagram of calorie intake over the last 30 days",
      repo.listProjects(),
    );

    assert.equal(result.outcome, "applied");
    assert.equal(result.created_project, true);
    assert.ok(result.project_id);
    assert.equal(result.operations?.length, 1);

    // The change was persisted and renders as markdown.
    const project = repo.getProject(result.project_id!)!;
    assert.equal(project.name, "fitness-tracker");
    assert.equal(project.doc_tree.length, 1);
    assert.equal(project.doc_tree[0].title, "Calorie Intake Trend Chart");
  });
});
