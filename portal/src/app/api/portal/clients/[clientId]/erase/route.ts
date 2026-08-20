import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { eraseClientCompletely, type LiveScrubClient } from "@/server/clientErasure";

/**
 * Permanently erase a client and all its data.
 *
 * Owner-only: erasure is irreversible, so it is not something a client-scoped
 * user or ordinary staff can trigger. The client's name must be typed back in
 * the body as well — defence in depth, so a mis-wired button or a stray
 * request cannot erase the wrong record. The UI asks for the same thing; this
 * enforces it rather than trusting the page.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    await ensureHydrated();
    const session = await requireRole("agency-owner");
    const { clientId } = await params;

    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "That client was not found." }, { status: 404 });

    const body = await request.json().catch(() => null) as { confirmName?: string } | null;
    const confirmName = typeof body?.confirmName === "string" ? body.confirmName.trim() : "";
    if (confirmName !== client.name) {
      return NextResponse.json({
        ok: false,
        error: "Type the client's exact name to confirm permanent deletion.",
      }, { status: 400 });
    }

    // The admin client scrubs the live `inbox_*` + `brand_enquiries` tables —
    // same live boundary as the website-enquiries hard-delete path.
    const result = await eraseClientCompletely({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      supabase: createSupabaseAdminClient() as unknown as LiveScrubClient,
    });
    if (!result) return NextResponse.json({ ok: false, error: "That client was not found." }, { status: 404 });

    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
