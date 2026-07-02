import { NextResponse } from "next/server";
import { getProject, setThoughtRouting, undoLast } from "@/lib/repo";
import { serializeToMarkdown } from "@/lib/tree";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const undone = undoLast(id);
  if (!undone) {
    return NextResponse.json({ error: "nothing to undo" }, { status: 400 });
  }

  // Send the reverted thought back to the Inbox. The thought log itself is
  // never mutated — only its routing metadata.
  if (undone.revertedThoughtId) {
    setThoughtRouting(undone.revertedThoughtId, null, "inbox", "Reverted by undo — re-file if you like.");
  }

  const refreshed = getProject(id)!;
  return NextResponse.json({
    project: {
      id: refreshed.id,
      name: refreshed.name,
      summary: refreshed.summary,
      markdown: serializeToMarkdown(refreshed.doc_tree),
    },
    reverted_thought_id: undone.revertedThoughtId,
  });
}
