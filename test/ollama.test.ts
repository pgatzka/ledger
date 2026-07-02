import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Stand-in Ollama server: mimics POST /api/chat, returning schema-constrained
// JSON. Distinguishes the Route call from the Operate call by whether the
// request's `format` schema declares an `operations` property.
let server: http.Server;
let ollama: typeof import("../src/lib/ollama.ts");

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
              { op: "create_section", parent_id: null, title: "Calorie Intake", body_markdown: "chart", position: 0 },
            ],
            rationale: "new feature",
          })
        : JSON.stringify({ decision: "NEW", name: "fitness-tracker", summary: "a fitness app", confidence: 0.95 });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: reqObj.model, message: { role: "assistant", content }, done: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.OLLAMA_URL = `http://127.0.0.1:${port}`;
  process.env.OLLAMA_MODEL = "test-model";
  // Import AFTER OLLAMA_URL is set — the module reads it at load time.
  ollama = await import("../src/lib/ollama.ts");
});

after(() => {
  server.close();
});

describe("ollama provider", () => {
  it("route() parses a NEW-project decision", async () => {
    const r = await ollama.route("thought about fitness", []);
    assert.equal(r.decision, "NEW");
    assert.equal(r.name, "fitness-tracker");
    assert.ok(r.confidence > 0.5);
  });

  it("decideOperations() parses and cleans the operations list", async () => {
    const r = await ollama.decideOperations("add a calorie chart", "fitness-tracker", []);
    assert.equal(r.operations.length, 1);
    assert.equal(r.operations[0].op, "create_section");
    assert.equal(r.rationale, "new feature");
  });

  it("surfaces a clear error when Ollama is unreachable", async () => {
    const prev = process.env.OLLAMA_URL;
    process.env.OLLAMA_URL = "http://127.0.0.1:1"; // nothing listening
    try {
      await assert.rejects(() => ollama.route("x", []), /Could not reach Ollama/);
    } finally {
      process.env.OLLAMA_URL = prev;
    }
  });
});
