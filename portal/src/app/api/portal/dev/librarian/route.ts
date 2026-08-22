import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { findFiles } from "@/lib/server/dev/fileFinding";
import { ensureHydrated } from "@/server/storage";

// ─── THE LIBRARIAN — find, never edit ────────────────────────────────────────
//
// The one door to the file-finding SKILL (`src/lib/server/dev/fileFinding.ts`)
// for the Librarian's surfaces: the Dev Team drawer and Dev mode in the
// editor. Read-only by contract — the skill retrieves, this route gates, and
// nothing here writes a byte (no `flushPendingWrites`).
//
// ── The gate ─────────────────────────────────────────────────────────────────
//
// The same layered gate as every dev-team surface (`editor-activity`,
// `editor-ai`): role first, then Dev Mode, then origin. The skill itself is
// deliberately gate-free pure retrieval — its header says the PUBLIC surface
// gates, and this is that surface. The tenant boundary is one layer deeper:
// `findFiles` scopes to the agency THIS ROUTE hands it, which is always the
// SESSION's — a `projectId` comes from the browser, an agency id NEVER does —
// and a foreign project id throws the same `project_not_found` an invented one
// does, so a guessed id confirms nothing.
//
// ── POST only. On purpose. ───────────────────────────────────────────────────
//
// A find query names what somebody is working on — client projects, unshipped
// features. A GET puts that in query strings that get logged, cached and
// prefetched; the safest way to keep questions out of logs is for this route
// to have no GET to widen. Same rationale as `editor-ai`.

type Body = {
  query?: string;
  projectId?: string;
  limit?: number;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required." }, { status: 403 });
    }
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Body | null;
    if (!body || typeof body.query !== "string") {
      return NextResponse.json({ ok: false, error: "Ask the Librarian for something." }, { status: 400 });
    }
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";

    try {
      const result = await findFiles({
        // The session's tenancy, never the request body's: nothing the browser
        // sends can widen whose repository answers.
        agencyId: session.agencyId,
        projectId: projectId || undefined,
        query: body.query,
        limit: typeof body.limit === "number" ? body.limit : undefined,
      });
      return NextResponse.json({ ok: true, result }, { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      if (error instanceof Error && error.message === "project_not_found") {
        return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
