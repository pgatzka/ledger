import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/repo";
import { serializeToMarkdown } from "@/lib/tree";

export async function GET() {
  const projects = listProjects().map((p) => ({
    id: p.id,
    name: p.name,
    summary: p.summary,
    created_at: p.created_at,
    markdown: serializeToMarkdown(p.doc_tree),
  }));
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const { name, summary } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const project = createProject(name.trim(), typeof summary === "string" ? summary : "");
  return NextResponse.json({ project });
}
