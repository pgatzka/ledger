import { NextResponse } from "next/server";
import { getProject } from "@/lib/repo";
import { serializeToMarkdown } from "@/lib/tree";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      summary: project.summary,
      created_at: project.created_at,
      doc_tree: project.doc_tree,
      markdown: serializeToMarkdown(project.doc_tree),
    },
  });
}
