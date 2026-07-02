"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ProjectSummary {
  id: string;
  name: string;
  summary: string;
  markdown: string;
}

interface InboxThought {
  id: string;
  raw_text: string;
  status: string;
  note: string | null;
}

interface PipelineResult {
  outcome: "applied" | "inbox" | "flagged";
  project_id: string | null;
  project_name?: string;
  rationale?: string;
  operations?: { op: string }[];
  created_project?: boolean;
  error?: string;
}

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [inbox, setInbox] = useState<InboxThought[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [p, i] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/inbox").then((r) => r.json()),
    ]);
    setProjects(p.projects || []);
    setInbox(i.thoughts || []);
    return (p.projects || []) as ProjectSummary[];
  }, []);

  useEffect(() => {
    refresh().then((ps) => {
      if (ps.length && !selectedId) setSelectedId(ps[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = projects.find((p) => p.id === selectedId) || null;

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/thoughts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result: PipelineResult = await res.json();
      if (!res.ok) {
        setError(result.error || "Something went wrong.");
      } else {
        setBanner(result);
        setText("");
        const ps = await refresh();
        if (result.project_id && ps.some((p) => p.id === result.project_id)) {
          setSelectedId(result.project_id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!banner?.project_id) return;
    setBusy(true);
    try {
      await fetch(`/api/projects/${banner.project_id}/undo`, { method: "POST" });
      setBanner(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function assign(thoughtId: string, projectId: string) {
    if (!projectId) return;
    setBusy(true);
    try {
      await fetch(`/api/inbox/${thoughtId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const ps = await refresh();
      if (ps.some((p) => p.id === projectId)) setSelectedId(projectId);
    } finally {
      setBusy(false);
    }
  }

  async function newProject() {
    const name = window.prompt("New project name?");
    if (!name?.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const { project } = await res.json();
    const ps = await refresh();
    if (project?.id && ps.some((p) => p.id === project.id)) setSelectedId(project.id);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Thought-to-Docs
          <small>brain-dump → living docs</small>
        </div>

        <div>
          <div className="section-label">Projects</div>
          {projects.length === 0 && <div className="hint">None yet. Capture a thought to create one.</div>}
          <ul className="project-list">
            {projects.map((p) => (
              <li
                key={p.id}
                className={`project-item ${p.id === selectedId ? "active" : ""}`}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="name">{p.name}</div>
                {p.summary && <div className="summary">{p.summary}</div>}
              </li>
            ))}
          </ul>
          <button style={{ marginTop: 10, width: "100%" }} onClick={newProject}>
            + New project
          </button>
        </div>

        <div>
          <div className="section-label">Inbox ({inbox.length})</div>
          {inbox.length === 0 && <div className="hint">Empty. Nice.</div>}
          <ul className="inbox-list">
            {inbox.map((t) => (
              <li key={t.id} className="inbox-card">
                <div className="text">{t.raw_text}</div>
                {t.note && <div className="note">{t.note}</div>}
                <div className="assign">
                  <select
                    defaultValue=""
                    onChange={(e) => assign(t.id, e.target.value)}
                    disabled={busy || projects.length === 0}
                  >
                    <option value="" disabled>
                      Assign to…
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="main">
        <div className="capture">
          <textarea
            placeholder="Brain-dump a thought… e.g. “for the fitness tracker it'd be cool to have a diagram of calorie intake over the last 30 days”"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />
          <div className="row">
            <button className="primary" onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "Filing…" : "File it"}
            </button>
            <span className="hint">⌘/Ctrl + Enter</span>
            {error && <span className="error">{error}</span>}
          </div>
        </div>

        {banner && (
          <div className={`banner ${banner.outcome === "applied" ? "" : "inbox"}`}>
            <div>
              <div className="what">
                {banner.outcome === "applied" &&
                  `Applied ${banner.operations?.length ?? 0} change${
                    (banner.operations?.length ?? 0) === 1 ? "" : "s"
                  } to ${banner.project_name}${banner.created_project ? " (new project)" : ""}`}
                {banner.outcome === "inbox" && "Sent to Inbox — routing was uncertain"}
                {banner.outcome === "flagged" && `Flagged for clarification in ${banner.project_name}`}
              </div>
              {banner.rationale && <div className="why">{banner.rationale}</div>}
            </div>
            {banner.outcome === "applied" && (
              <button onClick={undo} disabled={busy}>
                Undo
              </button>
            )}
          </div>
        )}

        {selected ? (
          <article className="doc">
            {selected.markdown.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.markdown}</ReactMarkdown>
            ) : (
              <div className="empty">This project has no documentation yet.</div>
            )}
          </article>
        ) : (
          <div className="empty">Select or create a project to see its docs.</div>
        )}
      </main>
    </div>
  );
}
