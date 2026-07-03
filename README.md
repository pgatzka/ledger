# Thought-to-Docs

Brain-dump a raw thought into one box; an LLM routes it to the right project and
files it into that project's living documentation for you.

You write *"for the fitness tracker it'd be cool to have a diagram of calorie
intake over the last 30 days"* → it lands in the right project, in the right
section, rewritten as clean docs.

Runs entirely on a **local [Ollama](https://ollama.com) model** — no API key, no credits.

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
- **Ollama** (`src/lib/ollama.ts`) — local inference via `/api/chat` with a JSON-schema
  `format`, so the model is held to a structured operations contract
  (`src/lib/schemas.ts`) that our code then applies deterministically.

## Getting started

You need [Ollama](https://ollama.com) running with a model pulled:

```bash
ollama pull llama3.1:8b          # any instruction-following model with JSON output
```

Then:

```bash
npm install
cp .env.example .env.local       # defaults point at http://localhost:11434
npm run dev                       # http://localhost:3000
```

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server **base** URL — no `/api` path (a trailing `/api/chat` is tolerated). |
| `OLLAMA_MODEL` | `llama3.1:8b` | Model name (must support structured/JSON output). Used for both the Route and Operate stages. |
| `ROUTE_CONFIDENCE_THRESHOLD` | `0.6` | Below this, thoughts go to the Inbox. |
| `DATABASE_PATH` | `./data/ledger.db` | SQLite file location. |

Quality depends on the model — small local models route and structure less reliably, so
expect more Inbox/flag outcomes. A larger local model behaves better.

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
no jest/vitest, no extra dependencies. Requires Node 22. Every test is offline and
deterministic (in-process stand-in servers; no model or secret needed).

- `test/tree.test.ts` — the deterministic operation engine (create/append/revise/
  move/flag, immutability, provenance, missing-id resilience, markdown output).
- `test/repo.test.ts` — SQLite persistence against a temp DB: project CRUD, the
  immutable-log invariant, and version snapshots + undo.
- `test/ollama.test.ts` — the Ollama provider against a stand-in `/api/chat` server:
  `route()` / `decideOperations()` JSON parsing and the unreachable-server error path.
- `test/pipeline.test.ts` — the full capture→route→operate→apply loop against a stand-in
  Ollama server: a thought routes to a new project and the section is applied + persisted.

CI runs on every push and PR (`.github/workflows/ci.yml`): `npm ci` → lint →
test → build, on Node 22. Fully offline, no secrets.

## Deploy (Docker → GHCR)

CD (`.github/workflows/cd.yml`) builds a production Docker image and publishes it to
GitHub Container Registry on push to `main` and on `v*` tags (gated on the test suite
passing). No external account or secret is required — it uses the built-in `GITHUB_TOKEN`.

Image: `ghcr.io/pgatzka/ledger`. Tags: branch name, `sha-<short>`, `latest` (default
branch), and the semver on version tags.

Run it with a mounted volume for the SQLite database, pointed at an Ollama server:

```bash
docker run -p 3000:3000 \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  -e OLLAMA_MODEL=llama3.1:8b \
  -v ledger-data:/app/data \
  ghcr.io/pgatzka/ledger:latest
```

The image is a slim Next.js `standalone` build; the DB lives at `/app/data/ledger.db`
on the volume (`DATABASE_PATH` is preset). The GHCR package is **private by default** —
make it public in the repo's Packages settings if you want unauthenticated pulls.

### Docker Compose (app + Ollama, turnkey)

The included `compose.yaml` brings up the app **and** a local Ollama server, and pulls the
model automatically on first start (no manual `ollama pull`):

```bash
docker compose up --build         # add -d to detach → http://localhost:3000
```

```yaml
services:
  app:
    build: .                        # or: image: ghcr.io/pgatzka/ledger:latest
    ports: ["3000:3000"]
    environment:
      OLLAMA_URL: http://ollama:11434
      OLLAMA_MODEL: llama3.1:8b
    volumes:
      - ledger-data:/app/data       # persists the SQLite DB across restarts
    depends_on: [ollama]
    restart: unless-stopped

  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes:
      - ollama-models:/root/.ollama
    restart: unless-stopped

  ollama-pull:                      # one-shot: pulls the model, then exits
    image: ollama/ollama
    depends_on: [ollama]
    environment: { OLLAMA_HOST: http://ollama:11434 }
    entrypoint: ["/bin/sh", "-c"]
    command: ["until ollama list >/dev/null 2>&1; do sleep 1; done; ollama pull llama3.1:8b"]
    restart: "no"

volumes:
  ledger-data:
  ollama-models:
```

Stop with `docker compose down` (the volumes — your docs and pulled model — persist);
add `-v` only if you want to wipe them.

This publishes a deployable artifact; it doesn't stand up a live URL on its own. A
`deploy` step (Fly.io / Render / SSH to a host with the volume) can be appended to the
CD workflow once a host is chosen.

## Roadmap (not in the MVP)

Outline-first retrieval for large docs, a clarifying-question loop, a provenance
UI, contradiction detection, manual editing with section locking, and cross-
project linking.
