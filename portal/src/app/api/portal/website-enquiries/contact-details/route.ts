import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import { loadActorWebsiteEnquiry } from "@/lib/server/access/websiteEnquiryAccess";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { createScopedSupabaseClient } from "@/lib/supabase/scoped";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getEnquiryContactDetails, saveEnquiryContactDetails } from "@/server/enquiryContactDetails";

/**
 * Operator-added contact details for an enquiry (enquiry-detail-card plan,
 * Phase 4). Agency-scoped. Deliberately file-backed — this records what the
 * operator learns by hand, it must never write to the live enquiry row.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "view");
    const enquiryId = request.nextUrl.searchParams.get("enquiryId")?.trim() ?? "";
    const enquiry = enquiryId
      ? await loadActorWebsiteEnquiry(actor, await createScopedSupabaseClient(), { id: enquiryId, required: "view" })
      : null;
    if (!enquiry) return NextResponse.json({ ok: false, error: "Website submission not found." }, { status: 404 });
    return NextResponse.json({ ok: true, details: getEnquiryContactDetails(actor.resourceAgencyId, enquiry.id) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "use");
    const session = actor.session;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const str = (value: unknown) => (typeof value === "string" ? value : undefined);
    const enquiryId = str(body?.enquiryId) ?? "";
    if (!enquiryId) {
      return NextResponse.json({ ok: false, error: "Which enquiry these details belong to is required." }, { status: 400 });
    }
    const customFields: Record<string, string> = {};
    if (body?.customFields && typeof body.customFields === "object") {
      for (const [key, value] of Object.entries(body.customFields as Record<string, unknown>)) {
        if (typeof value === "string") customFields[key] = value;
      }
    }
    try {
      const enquiry = await loadActorWebsiteEnquiry(actor, await createScopedSupabaseClient(), {
        id: enquiryId,
        required: "use",
      });
      if (!enquiry) return NextResponse.json({ ok: false, error: "Website submission not found." }, { status: 404 });
      const details = saveEnquiryContactDetails({
        agencyId: actor.resourceAgencyId,
        enquiryId: enquiry.id,
        company: str(body?.company),
        jobTitle: str(body?.jobTitle),
        notes: str(body?.notes),
        customFields,
        updatedBy: session.userId,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, details });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Those details could not be saved." }, { status: 400 });
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
