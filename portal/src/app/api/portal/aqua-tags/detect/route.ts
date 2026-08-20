import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { ensureAgencyMasterSiteKey } from "@/server/websiteSources";
import { detectAquaTag } from "@/lib/server/aquaTagDetection";
import { AGENCY_ROLES } from "@/server/types";

/**
 * Prove the master tag is live on one of the agency's own domains, and count
 * the forms it would capture. Detection runs against this agency's master key,
 * never a key the caller supplies — the point is to confirm *their* tag, so the
 * key can't be spoofed from the request.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const rawUrl = typeof body?.url === "string" ? body.url : "";
    if (!rawUrl.trim()) {
      return NextResponse.json({ ok: false, error: "Enter a website address to check." }, { status: 400 });
    }

    const masterSiteKey = ensureAgencyMasterSiteKey(session.agencyId);
    await flushPendingWrites();
    const detection = await detectAquaTag({ rawUrl, masterSiteKey });
    return NextResponse.json({ ok: true, detection });
  } catch (error) {
    return authErrorResponse(error);
  }
}
