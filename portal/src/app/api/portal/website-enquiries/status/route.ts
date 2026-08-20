import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { createScopedSupabaseClient } from "@/lib/supabase/scoped";
import type { WebsiteEnquiryStatus } from "@/lib/server/websiteEnquiries";
import { ensureHydrated } from "@/server/storage";

const STATUSES: readonly WebsiteEnquiryStatus[] = ["open", "reviewed", "resolved"];

type EnquiryRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

export async function PATCH(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json().catch(() => null) as {
      enquiryId?: unknown;
      status?: unknown;
    } | null;
    const enquiryId = typeof body?.enquiryId === "string" ? body.enquiryId.trim() : "";
    const status = typeof body?.status === "string" ? body.status as WebsiteEnquiryStatus : "";
    if (!enquiryId || !STATUSES.includes(status as WebsiteEnquiryStatus)) {
      return NextResponse.json({ ok: false, error: "Submission ID and a valid status are required." }, { status: 400 });
    }

    const supabase = await createScopedSupabaseClient();
    const { data, error } = await supabase
      .from("brand_enquiries")
      .select("id, metadata")
      .eq("id", enquiryId)
      .maybeSingle();
    if (error) throw new Error(`Could not load website enquiry: ${error.message}`);
    if (!data) return NextResponse.json({ ok: false, error: "Submission not found." }, { status: 404 });

    const enquiry = data as EnquiryRow;
    const now = new Date().toISOString();
    const currentMetadata = enquiry.metadata ?? {};
    const history = Array.isArray(currentMetadata.inboxStatusHistory)
      ? currentMetadata.inboxStatusHistory.slice(-99)
      : [];
    const metadata = {
      ...currentMetadata,
      inboxStatus: status,
      inboxStatusAt: now,
      inboxStatusBy: session.userId,
      inboxStatusHistory: [...history, { status, at: now, by: session.userId }],
      ...((status === "reviewed" || status === "resolved") ? {
        firstReviewedAt: typeof currentMetadata.firstReviewedAt === "string" ? currentMetadata.firstReviewedAt : now,
        lastReviewedAt: now,
        lastReviewedBy: session.userId,
      } : {}),
      ...(status === "resolved" ? {
        firstResolvedAt: typeof currentMetadata.firstResolvedAt === "string" ? currentMetadata.firstResolvedAt : now,
        lastResolvedAt: now,
        lastResolvedBy: session.userId,
      } : {}),
    };
    const { error: updateError } = await supabase
      .from("brand_enquiries")
      .update({ metadata })
      .eq("id", enquiryId);
    if (updateError) throw new Error(`Could not update website enquiry: ${updateError.message}`);

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("[website-enquiries] status update failed", error);
      return NextResponse.json({ ok: false, error: "The submission status could not be updated." }, { status: 500 });
    }
  }
}
