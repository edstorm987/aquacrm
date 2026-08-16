import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import {
  decideIdentityResolutionReview,
  getIdentityResolutionReview,
  listIdentityResolutionReviews,
} from "@/lib/server/identityResolution";
import { listInboxSnapshot, updateInboxIdentityLinks } from "@/lib/server/inboxStore";
import { synchroniseInboxIdentityResolutions } from "@/lib/server/inboxService";
import {
  listWebsiteEnquiries,
  recordWebsiteEnquiryIdentityResolution,
  synchroniseWebsiteEnquiryIdentities,
  synchroniseWebsiteEnquiryLedgerEvents,
} from "@/lib/server/websiteEnquiries";
import { upsertClientSocialMessageLedgerEvent } from "@/lib/server/clientRecordLedger";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listClients } from "@/server/tenants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    if (session.isDemo) return NextResponse.json({ ok: true, reviews: [], clients: clientOptions(session.agencyId) });
    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status");
    const status = requestedStatus === "all" || requestedStatus === "pending" || requestedStatus === "linked" || requestedStatus === "auto-linked" || requestedStatus === "parked" || requestedStatus === "dismissed"
      ? requestedStatus
      : "pending";
    return NextResponse.json({
      ok: true,
      reviews: listIdentityResolutionReviews(session.agencyId, { status, includeAutoLinked: status === "all" || status === "auto-linked" }),
      clients: clientOptions(session.agencyId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST() {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    if (session.isDemo) return NextResponse.json({ ok: false, error: "Showcase Mode is read-only." }, { status: 403 });
    const [enquiriesResult, socialResult] = await Promise.allSettled([
      listWebsiteEnquiries(500),
      listInboxSnapshot(session.agencyId),
    ]);
    if (enquiriesResult.status === "fulfilled") {
      await synchroniseWebsiteEnquiryIdentities(session.agencyId, enquiriesResult.value);
    }
    if (socialResult.status === "fulfilled") {
      await synchroniseInboxIdentityResolutions(session.agencyId, socialResult.value);
    }
    await flushPendingWrites();
    return NextResponse.json({
      ok: true,
      reviews: listIdentityResolutionReviews(session.agencyId),
      clients: clientOptions(session.agencyId),
      sources: {
        website: enquiriesResult.status === "fulfilled" ? enquiriesResult.value.length : null,
        social: socialResult.status === "fulfilled" ? socialResult.value.conversations.length : null,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    if (session.isDemo) return NextResponse.json({ ok: false, error: "Showcase Mode is read-only." }, { status: 403 });
    const body = await request.json().catch(() => null) as {
      reviewId?: unknown;
      action?: unknown;
      clientId?: unknown;
      note?: unknown;
      parkedUntil?: unknown;
    } | null;
    const reviewId = clean(body?.reviewId, 160);
    const action = body?.action === "link" || body?.action === "park" || body?.action === "dismiss" ? body.action : null;
    if (!reviewId || !action) return NextResponse.json({ ok: false, error: "reviewId and action are required" }, { status: 400 });
    const current = getIdentityResolutionReview(session.agencyId, reviewId);
    if (!current) return NextResponse.json({ ok: false, error: "identity review not found" }, { status: 404 });
    const review = decideIdentityResolutionReview({
      agencyId: session.agencyId,
      reviewId,
      action,
      clientId: clean(body?.clientId, 160),
      note: clean(body?.note, 1_000),
      parkedUntil: typeof body?.parkedUntil === "number" && Number.isFinite(body.parkedUntil) ? body.parkedUntil : undefined,
      actorUserId: session.userId,
    });
    if (!review) return NextResponse.json({ ok: false, error: "identity review not found" }, { status: 404 });

    if (action === "link" && review.selectedClientId) {
      if (review.sourceType === "website-enquiry") {
        const enquiry = (await listWebsiteEnquiries(500)).find(item => item.id === review.sourceId);
        if (enquiry) {
          await recordWebsiteEnquiryIdentityResolution(enquiry.id, review.resolution);
          synchroniseWebsiteEnquiryLedgerEvents(session.agencyId, review.selectedClientId, { ...enquiry, clientId: review.selectedClientId });
        }
      } else if (review.sourceType === "social-inbox") {
        await updateInboxIdentityLinks(session.agencyId, review.sourceId, {
          leadId: review.leadId,
          contactId: review.contactId,
          clientId: review.selectedClientId,
        });
        const snapshot = await listInboxSnapshot(session.agencyId);
        for (const conversation of snapshot.conversations.filter(item => item.identity.id === review.sourceId)) {
          for (const message of conversation.messages.filter(item => item.direction !== "internal")) {
            upsertClientSocialMessageLedgerEvent(session.agencyId, review.selectedClientId, {
              conversationId: conversation.id,
              messageId: message.id,
              channel: conversation.connection.channel,
              accountName: conversation.connection.displayName,
              participantName: conversation.identity.displayName,
              text: message.text,
              attachmentCount: message.attachments.length,
              sentAt: message.sentAt,
              direction: message.direction === "inbound" ? "inbound" : "outbound",
              status: message.status,
            });
          }
        }
      }
    }
    await flushPendingWrites();
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    if (error instanceof Error && !error.message.toLowerCase().includes("auth")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}

function clientOptions(agencyId: string) {
  return listClients(agencyId).map(client => ({
    id: client.id,
    name: client.name,
    ownerEmail: client.ownerEmail,
    stage: client.stage,
    relationshipId: client.relationshipId,
    workspaceLabel: client.workspaceLabel,
  }));
}

function clean(value: unknown, limit: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, limit) || undefined : undefined;
}
