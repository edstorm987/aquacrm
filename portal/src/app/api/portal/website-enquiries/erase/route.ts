import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureHydrated } from "@/server/storage";
import { logActivity } from "@/server/activity";

/**
 * Permanently delete a website enquiry.
 *
 * Owner-only, and irreversible — the enquiry is removed from the store, not
 * hidden. This is the manual counterpart to a client erasure: a single
 * submission that must be removed for good, whether junk or a data-erasure
 * request. A record of the deletion is kept (naming no personal data) so it
 * can be shown to an auditor.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole("agency-owner");
    const body = await request.json().catch(() => null) as { enquiryId?: unknown } | null;
    const enquiryId = typeof body?.enquiryId === "string" ? body.enquiryId.trim() : "";
    if (!enquiryId) return NextResponse.json({ ok: false, error: "An enquiry is required." }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    // Load first, so a missing one is a clean 404 rather than a silent no-op,
    // and so nothing outside this agency's brands can be reached by id.
    const { data, error } = await supabase
      .from("brand_enquiries")
      .select("id, brand_slug")
      .eq("id", enquiryId)
      .maybeSingle();
    if (error) throw new Error(`Could not load the enquiry: ${error.message}`);
    if (!data) return NextResponse.json({ ok: false, error: "That enquiry was not found." }, { status: 404 });

    const { error: deleteError } = await supabase.from("brand_enquiries").delete().eq("id", enquiryId);
    if (deleteError) throw new Error(`Could not delete the enquiry: ${deleteError.message}`);

    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "website_enquiry.erased",
      message: "Permanently deleted a website enquiry. This cannot be undone.",
      metadata: { enquiryId, brandSlug: (data as { brand_slug?: string }).brand_slug },
    });

    return NextResponse.json({ ok: true, deletedId: enquiryId });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("[website-enquiries] erase failed", error);
      return NextResponse.json({ ok: false, error: "The enquiry could not be deleted." }, { status: 500 });
    }
  }
}
