import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { saveDevDoc } from "@/lib/server/devDocEdits";
import { ensureHydrated } from "@/server/storage";
import { getUser } from "@/server/users";
import { AGENCY_ROLES } from "@/server/types";

// Save a doc edited in the Dev Team portal. Founder + Dev Mode only — the same
// gate the portal asserts, re-asserted here so the write path can't be reached
// directly in any production-like context.
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();

    let session;
    try {
      session = await requireRole([...AGENCY_ROLES]);
    } catch {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null) as {
      relPath?: string;
      content?: string;
      note?: string;
      expectedMtimeMs?: number;
    } | null;

    if (!body?.relPath || typeof body.content !== "string") {
      return NextResponse.json({ ok: false, error: "Send relPath and content." }, { status: 400 });
    }

    const account = getUser(session.email);
    const result = await saveDevDoc({
      session,
      relPath: body.relPath,
      content: body.content,
      note: typeof body.note === "string" ? body.note : undefined,
      authorName: account?.name,
      expectedMtimeMs: typeof body.expectedMtimeMs === "number" ? body.expectedMtimeMs : undefined,
    });

    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the document.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
