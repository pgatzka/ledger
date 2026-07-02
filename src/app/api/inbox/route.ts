import { NextResponse } from "next/server";
import { listInbox } from "@/lib/repo";

export async function GET() {
  return NextResponse.json({ thoughts: listInbox() });
}
