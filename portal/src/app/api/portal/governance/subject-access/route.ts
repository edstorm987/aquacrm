import { NextResponse } from "next/server";

import { authErrorResponse, getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { collectSubjectAccessExport, subjectAccessExportJson } from "@/lib/server/compliance/subjectAccessExport";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export const runtime = "nodejs";

/**
 * Subject access and portability — hand a person everything held about them.
 *
 * GDPR Articles 15 and 20. Until now erasure was the only subject right this
 * app could perform: you could delete somebody's data but not give it to them.
 *
 * ── The gate ─────────────────────────────────────────────────────────────
 *
 * Owner or manager, matching the erasure PREVIEW rather than the erasure
 * itself. Fulfilling an access request is not destructive, and restricting it
 * to owners would make the most commonly exercised right the hardest one to
 * service. The agency comes from the SESSION; the body names only a person,
 * and a person belonging to another agency is simply not found.
 *
 * ── Why the fulfilment is logged ─────────────────────────────────────────
 *
 * `compliancePosture` records a second, separate gap: no request log and no
 * response clock, so "if a regulator asked you to evidence a request you
 * handled, you could show the erasure but not the request." An export that
 * leaves no trace repeats that. The activity entry names the subject by ID
 * only — never their email — because activity messages are swept by clientId
 * on erasure and an address in one would outlive the person's own deletion.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const agencyId = getActiveAgencyId(session);

    const body = await request.json().catch(() => null) as { personId?: unknown } | null;
    const personId = typeof body?.personId === "string" ? body.personId.trim() : "";
    if (!personId) {
      return NextResponse.json({ ok: false, error: "person_required" }, { status: 400 });
    }

    const result = collectSubjectAccessExport(agencyId, personId);
    if (!result) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    logActivity({
      agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "subject_access.exported",
      message: "A subject access export was produced and handed over.",
      // Subject by ID only. No email, no name — see the note above.
      metadata: {
        personId,
        recordCount: result.totalRecords,
        collectionsSearched: result.searchedCollections.length,
        unattributableRecords: Object.values(result.unscopedMatches).reduce((sum, n) => sum + n, 0),
      },
    });
    await flushPendingWrites();

    return new NextResponse(subjectAccessExportJson(result), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="subject-access-${personId}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
