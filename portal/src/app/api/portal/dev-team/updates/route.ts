import { NextResponse } from "next/server";

import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { UpdateInputError, appendUpdateEntry } from "@/lib/server/devTeamUpdates";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Write half of Dev Team → Updates: insert one new entry at the top of
// docs/development/updates.md.
//
// The gate is re-asserted HERE, not inherited from the page: agency role first
// (`requireRole`), then the same founder + Dev Mode predicate the whole Dev Team
// portal hangs off (`devDocsAccessible`). A non-founder — or anyone at all
// outside Dev Mode — gets a 404, so the route is as invisible as the section is.
// All validation/normalisation lives in `appendUpdateEntry`; this handler only
// shapes the JSON body and maps errors to statuses.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  title?: unknown;
  bullets?: unknown;
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body.title !== "string") {
      return NextResponse.json({ ok: false, error: "Give the entry a title." }, { status: 400 });
    }
    const bullets = Array.isArray(body.bullets)
      ? body.bullets.filter((b): b is string => typeof b === "string")
      : [];

    const entry = await appendUpdateEntry({ title: body.title, bullets });
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    if (error instanceof UpdateInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "The updates log could not be written." },
      { status: 500 },
    );
  }
}
