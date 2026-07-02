# Thought-to-Docs

Brain-dump a raw thought into one box; an LLM routes it to the right project and
files it into that project's living documentation for you.

You write *"for the fitness tracker it'd be cool to have a diagram of calorie
intake over the last 30 days"* → it lands in the right project, in the right
section, rewritten as clean docs.

## How it works

The system is **event-sourced**: your thoughts are an immutable, append-only log
(the source of truth); the documentation is a projection the LLM maintains.

Each captured thought flows through a pipeline (`src/lib/pipeline.ts`):

1. **Route** — the LLM picks an existing project, proposes a new one, or says it's
   unsure. Low-confidence routing goes to an **Inbox** instead of guessing.
2. **Operate** — the LLM returns a small list of discrete **operations**
   (`create_section`, `append_to_section`, `revise_section`, `move_section`,
   `flag`) against stable section ids — it never rewrites the whole document.
3. **Apply** — our code (not the LLM) deterministically mutates the section tree
   from those operations.
4. **Persist + link** — the new tree is saved, provenance is recorded per
   section, and a version snapshot is taken so any change is **undoable**.

Review model is **auto-apply + undo**: confident changes apply immediately with an
Undo affordance; ambiguous thoughts wait in the Inbox.

## Stack

- **Next.js** (App Router, TypeScript) — capture box, project switcher, rendered
  markdown doc pane (`src/app`).
- **SQLite** via `better-sqlite3` (`db/schema.sql`, `src/lib/db.ts`) — projects,
  the immutable thought log, and version snapshots.
- **Anthropic API** (`src/lib/anthropic.ts`) — structured JSON via forced tool
  use. Haiku for cheap routing, Sonnet for the operations decision.

## Getting started

```bash
npm install
cp .env.example .env.local     # then add your ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Required.** Your Anthropic API key. |
| `ROUTE_MODEL` | `claude-haiku-4-5-20251001` | Cheap routing classification. |
| `OPERATE_MODEL` | `claude-sonnet-5` | The document-editing decision. |
| `ROUTE_CONFIDENCE_THRESHOLD` | `0.6` | Below this, thoughts go to the Inbox. |
| `DATABASE_PATH` | `./data/ledger.db` | SQLite file location. |

## Try it

1. Submit *"for the fitness tracker it'd be cool to have a diagram of calorie
   intake over the last 30 days"* → a `fitness-tracker` project is proposed and a
   "Calorie Intake" section is created.
2. Submit a vague thought like *"make it faster"* → it's flagged / lands in the
   Inbox rather than guessing.
3. Click **Undo** on a change → the doc reverts and the thought returns to the
   Inbox. The raw thought log is never lost.

## Tests & CI

```bash
npm test          # run the suite
npm run test:watch
```

Uses Node's built-in test runner (`node --test`) with TypeScript type-stripping —
no jest/vitest, no extra dependencies. Requires Node 22.

- `test/tree.test.ts` — the deterministic operation engine (create/append/revise/
  move/flag, immutability, provenance, missing-id resilience, markdown output).
- `test/repo.test.ts` — SQLite persistence against a temp DB: project CRUD, the
  immutable-log invariant, and version snapshots + undo.
- `test/pipeline.test.ts` — full capture→route→operate→apply loop. Makes live
  Anthropic calls, so it **auto-skips unless `ANTHROPIC_API_KEY` is set** (runs
  locally with a key; skipped in CI).

CI runs on every push and PR (`.github/workflows/ci.yml`): `npm ci` → lint →
test → build, on Node 22. It's fully offline and needs no secrets. To un-skip the
pipeline integration test in CI, add an `ANTHROPIC_API_KEY` repository secret and
uncomment the `env` block in the workflow.

## Deploy (Docker → GHCR)

CD (`.github/workflows/cd.yml`) builds a production Docker image and publishes it to
GitHub Container Registry on every push to `main`/the working branch and on `v*` tags
(gated on the test suite passing). No external account or secret is required — it uses
the built-in `GITHUB_TOKEN`.

Image: `ghcr.io/pgatzka/ledger`. Tags: branch name, `sha-<short>`, `latest` (default
branch), and the semver on version tags.

Run it with a mounted volume for the SQLite database and your API key:

```bash
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v ledger-data:/app/data \
  ghcr.io/pgatzka/ledger:latest
```

The image is a slim Next.js `standalone` build; the DB lives at `/app/data/ledger.db`
on the volume (`DATABASE_PATH` is preset). The GHCR package is **private by default** —
make it public in the repo's Packages settings if you want unauthenticated pulls.

This publishes a deployable artifact; it doesn't stand up a live URL on its own. A
`deploy` step (Fly.io / Render / SSH to a host with the volume) can be appended to the
CD workflow once a host is chosen.

## Roadmap (not in the MVP)

Outline-first retrieval for large docs, a clarifying-question loop, a provenance
UI, contradiction detection, manual editing with section locking, and cross-
project linking.
