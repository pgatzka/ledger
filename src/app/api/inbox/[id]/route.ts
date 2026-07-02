import { NextResponse } from "next/server";
import { assignThoughtToProject } from "@/lib/pipeline";
import { getProject, getThought } from "@/lib/repo";

// Manually assign an Inbox thought to a project — re-runs the Operate stage.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project_id } = await req.json();

  const thought = getThought(id);
  if (!thought) return NextResponse.json({ error: "thought not found" }, { status: 404 });

  const project = typeof project_id === "string" ? getProject(project_id) : null;
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  try {
    const result = await assignThoughtToProject(thought.id, thought.raw_text, project);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assignment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
