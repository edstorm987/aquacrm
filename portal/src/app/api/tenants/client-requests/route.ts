import { NextResponse } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import type { ClientProperty } from "@/app/api/tenants/client-properties/route";
import { triageWebsiteEnquiry, type WebsiteEnquiryPriority } from "@/lib/server/websiteEnquiries";
import { triggerAutomations } from "@/server/automations";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import { inboxMediaUrl, verifyInboxMediaToken } from "@/lib/server/inbox/inboxMedia";
import {
  claimStagedPrivateUploadsForOwnership,
  commitStagedPrivateUploadOwnership,
  privateObjectRequestHash,
  PrivateObjectLifecycleClaimError,
  releaseStagedPrivateUploadOwnershipClaim,
  type StagedPrivateUploadBinding,
} from "@/lib/server/privateObjectLifecycle";
import { cleanClientRequests } from "@/lib/clients/clientRequests";
import { synchroniseClientRequestLedgerEvents } from "@/lib/server/clients/clientRecordLedger";
import { ProductWorkspaceBusyError, withClientMetadataLedgerTransaction } from "@/server/productWorkspaceCoordinator";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export type ClientRequestType = "suggestion" | "design-feedback" | "support-ticket" | "cancel" | "move-provider";

export interface ClientRequestReply {
  id: string;
  message: string;
  from: "customer" | "milesymedia";
  createdAt: number;
  attachments?: InboxOutboundAttachment[];
}

const TYPES: readonly ClientRequestType[] = [
  "suggestion",
  "design-feedback",
  "support-ticket",
  "cancel",
  "move-provider",
];

export interface ClientRequest {
  id: string;
  type: ClientRequestType;
  message: string;
  link?: string;
  propertyId?: string;
  siteLabel?: string;
  siteUrl?: string;
  siteKind?: string;
  priority?: WebsiteEnquiryPriority;
  topic?: string;
  suggestedAction?: string;
  status: "open" | "reviewed" | "closed";
  submittedBy: string;
  submittedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  closedBy?: string;
  closedAt?: number;
  replies?: ClientRequestReply[];
}

interface AddBody {
  clientId: string;
  type: ClientRequestType;
  message: string;
  link?: string;
  propertyId?: string;
}

function makeId(): string {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return `req_${c.randomUUID()}`;
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clientEmailSet(client: { ownerEmail?: string; metadata?: Record<string, unknown> }): Set<string> {
  const metadata = client.metadata ?? {};
  return new Set([client.ownerEmail, metadata.portalLoginEmail, metadata.clientEmail]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(value => value.trim().toLowerCase()));
}

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as AddBody | null;
    if (!body?.clientId || !body.type || !body.message?.trim()) {
      return NextResponse.json({ ok: false, error: "clientId + type + message required" }, { status: 400 });
    }
    if (!TYPES.includes(body.type)) {
      return NextResponse.json({ ok: false, error: "unknown request type" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], body.clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (!getClientForAgency(session.agencyId, body.clientId)) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(body.clientId, "client.communications", "use");
    return await withClientMetadataLedgerTransaction({
      agencyId: session.agencyId,
      clientId: body.clientId,
      ledger: "requests",
    }, async () => {
    const client = getClientForAgency(session.agencyId, body.clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const meta = (client.metadata ?? {}) as { clientRequests?: ClientRequest[]; properties?: ClientProperty[] };
    const requests = cleanClientRequests(meta.clientRequests);
    const properties = Array.isArray(meta.properties) ? meta.properties : [];
    const propertyId = body.propertyId?.trim();
    const property = propertyId ? properties.find(item => item.id === propertyId) : undefined;
    if (propertyId && !property) {
      return NextResponse.json({ ok: false, error: "The selected project could not be found." }, { status: 400 });
    }
    const triage = triageWebsiteEnquiry(body.type === "support-ticket" ? "support" : "form", body.message);
    const siteUrl = property?.liveUrl || property?.previewUrl;
    const item: ClientRequest = {
      id: makeId(),
      type: body.type,
      message: body.message.trim(),
      link: body.link?.trim() || undefined,
      propertyId: property?.id,
      siteLabel: property?.label,
      siteUrl,
      siteKind: property?.kind,
      ...triage,
      status: "open",
      submittedBy: session.email,
      submittedAt: Date.now(),
    };

    requests.unshift(item);
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { clientRequests: requests } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
    synchroniseClientRequestLedgerEvents(session.agencyId, client.id, item, clientEmailSet(client));

    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "support",
      action: `client_request.${body.type}.opened`,
      message: `${client.name} submitted a ${body.type.replaceAll("-", " ")} request.`,
      metadata: {
        requestId: item.id,
        requestType: item.type,
        propertyId: item.propertyId,
        siteLabel: item.siteLabel,
        siteUrl: item.siteUrl,
        priority: item.priority,
        topic: item.topic,
      },
    });

    await triggerAutomations(session.agencyId, "client-request.received", {
      requestId: item.id,
      clientId: client.id,
      clientName: client.name,
      requestType: item.type,
      message: item.message,
      submittedBy: item.submittedBy,
      priority: item.priority ?? "normal",
      topic: item.topic ?? "Client message",
      awaitingResponse: true,
    });
    await flushPendingWrites();

    return NextResponse.json({ ok: true, request: item, requests });
    });
  } catch (error) {
    if (error instanceof PrivateObjectLifecycleClaimError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 409 });
    }
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}

interface UpdateBody {
  clientId?: string;
  requestId?: string;
  status?: "reviewed" | "closed" | "open";
  reply?: string;
  attachments?: Array<{ token?: string }>;
}

interface ClientRequestStagedClaim {
  agencyId: string;
  objectIds: string[];
  expectedBindings: StagedPrivateUploadBinding[];
  claimId: string;
}

async function releaseClientRequestStagedClaim(claim: ClientRequestStagedClaim): Promise<void> {
  await releaseStagedPrivateUploadOwnershipClaim({
    agencyId: claim.agencyId,
    purpose: "inbox-media",
    objectIds: claim.objectIds,
    expectedBindings: claim.expectedBindings,
    claimId: claim.claimId,
  });
}

export async function PATCH(req: Request) {
  let stagedClaim: ClientRequestStagedClaim | null = null;
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as UpdateBody | null;
    const replyInput = body?.reply?.trim().slice(0, 4_000) ?? "";
    const targetId = body?.clientId && body.requestId ? `${body.clientId}:${body.requestId}` : "";
    if (body?.attachments !== undefined && !Array.isArray(body.attachments)) {
      return NextResponse.json({ ok: false, error: "Attachments must be a list." }, { status: 400 });
    }
    const requestedAttachments = Array.isArray(body?.attachments) ? body.attachments : [];
    const attachmentPayloads = requestedAttachments.flatMap(item => {
      const token = typeof item?.token === "string" ? item.token : "";
      const payload = token ? verifyInboxMediaToken(token) : null;
      if (!payload || payload.targetKind !== "client" || payload.targetId !== targetId) return [];
      return [{ payload, token }];
    });
    if (!body?.clientId || !body.requestId) {
      return NextResponse.json({ ok: false, error: "clientId, requestId, and a status or reply are required" }, { status: 400 });
    }
    if (requestedAttachments.length > 10 || attachmentPayloads.length !== requestedAttachments.length) {
      return NextResponse.json({ ok: false, error: "An attachment is invalid or has expired." }, { status: 400 });
    }
    const attachmentIds = attachmentPayloads.map(item => item.payload.id);
    const storageIdentities = attachmentPayloads.map(item => `${item.payload.storageProvider}\u0000${item.payload.storageKey}`);
    if (new Set(attachmentIds).size !== attachmentIds.length || new Set(storageIdentities).size !== storageIdentities.length) {
      return NextResponse.json({ ok: false, error: "Duplicate attachments are not allowed." }, { status: 400 });
    }
    if (body.status && !["open", "reviewed", "closed"].includes(body.status)) {
      return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });
    }
    const reply = replyInput || (attachmentPayloads.length ? `Sent ${attachmentPayloads.length === 1 ? "an attachment" : `${attachmentPayloads.length} attachments`}.` : "");
    if (!body.status && !reply) {
      return NextResponse.json({ ok: false, error: "clientId, requestId, and a status or reply are required" }, { status: 400 });
    }

    const clientId = body.clientId;
    const session = await requireRoleForClient(
      reply ? [...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"] : [...AGENCY_ROLES],
      clientId,
    );
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (!getClientForAgency(session.agencyId, clientId)) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.communications", "use");
    if (attachmentPayloads.some(item => item.payload.agencyId !== session.agencyId)) {
      return NextResponse.json({ ok: false, error: "An attachment is invalid." }, { status: 400 });
    }
    const attachments: InboxOutboundAttachment[] = attachmentPayloads.map(({ payload, token }) => ({
      id: payload.id,
      name: payload.name,
      size: payload.size,
      contentType: payload.contentType,
      kind: payload.kind,
      token,
      url: inboxMediaUrl(new URL(req.url).origin, token),
    }));
    const stagedBindings: StagedPrivateUploadBinding[] = attachmentPayloads.map(({ payload }) => ({
      objectId: payload.id,
      storageProvider: payload.storageProvider,
      storageKey: payload.storageKey,
    }));
    const preflightClient = getClientForAgency(session.agencyId, clientId);
    const preflightMeta = (preflightClient?.metadata ?? {}) as { clientRequests?: ClientRequest[] };
    const preflightRequests = cleanClientRequests(preflightMeta.clientRequests);
    if (!preflightRequests.some(item => item.id === body.requestId)) {
      return NextResponse.json({ ok: false, error: "request not found" }, { status: 404 });
    }
    const replyOwnerId = reply ? makeId().replace(/^req_/, "rep_") : undefined;
    const attachmentOwnerId = replyOwnerId ?? body.requestId;
    const stagedClaimId = attachments.length
      ? privateObjectRequestHash(["client-request-reply-owner", session.agencyId, clientId, body.requestId, attachmentOwnerId])
      : "";
    if (attachments.length) {
      await claimStagedPrivateUploadsForOwnership({
        agencyId: session.agencyId,
        purpose: "inbox-media",
        objectIds: attachmentIds,
        expectedBindings: stagedBindings,
        claimId: stagedClaimId,
      });
      stagedClaim = {
        agencyId: session.agencyId,
        objectIds: attachmentIds,
        expectedBindings: stagedBindings,
        claimId: stagedClaimId,
      };
    }
    const persistRequest = () => withClientMetadataLedgerTransaction({
      agencyId: session.agencyId,
      clientId,
      ledger: "requests",
    }, async () => {
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const meta = (client.metadata ?? {}) as { clientRequests?: ClientRequest[] };
    const requests = cleanClientRequests(meta.clientRequests);
    const existing = requests.find(item => item.id === body.requestId);
    if (!existing) return NextResponse.json({ ok: false, error: "request not found" }, { status: 404 });

    const now = Date.now();
    const fromMilesymedia = AGENCY_ROLES.includes(session.role as (typeof AGENCY_ROLES)[number]);
    const nextStatus = body.status ?? (fromMilesymedia ? "reviewed" : "open");
    const replies = Array.isArray(existing.replies) ? [...existing.replies] : [];
    if (reply) {
      replies.push({
        id: replyOwnerId!,
        message: reply,
        from: fromMilesymedia ? "milesymedia" : "customer",
        createdAt: now,
        attachments,
      });
    }
    const changed: ClientRequest = {
      ...existing,
      status: nextStatus,
      replies,
      ...(nextStatus === "reviewed" ? { reviewedBy: session.email, reviewedAt: now } : {}),
      ...(nextStatus === "closed" ? { closedBy: session.email, closedAt: now } : {}),
    };
    const next = requests.map(item => item.id === changed.id ? changed : item);
    const updated = updateClient(session.agencyId, client.id, { metadata: { clientRequests: next } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
    synchroniseClientRequestLedgerEvents(session.agencyId, client.id, changed, clientEmailSet(client));

    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "support",
      action: reply ? "client_request.replied" : `client_request.${nextStatus}`,
      message: reply
        ? `${fromMilesymedia ? "Milesymedia" : client.name} replied to a ${existing.type.replaceAll("-", " ")} request.`
        : `${session.email} marked ${client.name}'s ${existing.type.replaceAll("-", " ")} request ${nextStatus}.`,
      metadata: { requestId: existing.id, requestType: existing.type },
    });

    await flushPendingWrites();

    return NextResponse.json({ ok: true, request: changed, requests: next });
    });
    if (!attachments.length) return await persistRequest();
    let ownerRefusal: Response | null = null;
    try {
      return await commitStagedPrivateUploadOwnership({
        agencyId: session.agencyId,
        purpose: "inbox-media",
        objectIds: attachmentIds,
        expectedBindings: stagedBindings,
        claimId: stagedClaimId,
        commit: async () => {
          const value = await persistRequest();
          if (!value.ok) {
            ownerRefusal = value;
            throw new Error("client_request_owner_not_committed");
          }
          return { ownerId: attachmentOwnerId, value };
        },
      });
    } catch (error) {
      if (ownerRefusal) {
        try {
          await releaseClientRequestStagedClaim(stagedClaim!);
        } catch (releaseError) {
          console.error("[client-requests] refused owner claim could not be released:", releaseError);
          return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
        }
        return ownerRefusal;
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof PrivateObjectLifecycleClaimError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 409 });
    }
    if (error instanceof ProductWorkspaceBusyError) {
      if (stagedClaim) {
        try {
          // ProductWorkspaceBusyError is raised while acquiring the client
          // ledger lease, before its owner callback can run. This is therefore
          // a definite refusal and only this exact claim is safe to release.
          await releaseClientRequestStagedClaim(stagedClaim);
        } catch (releaseError) {
          console.error("[client-requests] busy owner claim could not be released:", releaseError);
          return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
        }
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
