import { NextResponse } from "next/server";
import { ingestThought } from "@/lib/pipeline";
import { listProjects } from "@/lib/repo";

export async function POST(req: Request) {
  const { text } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const projects = listProjects();
    const result = await ingestThought(text.trim(), projects);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
