import { NextResponse } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import type { ClientProperty } from "@/app/api/tenants/client-properties/route";
import { triageWebsiteEnquiry, type WebsiteEnquiryPriority } from "@/lib/server/websiteEnquiries";
import { triggerAutomations } from "@/server/automations";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import { inboxMediaUrl, verifyInboxMediaToken } from "@/lib/server/inboxMedia";
import { cleanClientRequests } from "@/lib/clientRequests";
import { synchroniseClientRequestLedgerEvents } from "@/lib/server/clientRecordLedger";

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
  } catch (error) {
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

export async function PATCH(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as UpdateBody | null;
    const replyInput = body?.reply?.trim().slice(0, 4_000) ?? "";
    const targetId = body?.clientId && body.requestId ? `${body.clientId}:${body.requestId}` : "";
    const attachments = (body?.attachments ?? []).flatMap(item => {
      const token = typeof item?.token === "string" ? item.token : "";
      const payload = token ? verifyInboxMediaToken(token) : null;
      if (!payload || payload.targetKind !== "client" || payload.targetId !== targetId) return [];
      return [{ id: payload.id, name: payload.name, size: payload.size, contentType: payload.contentType, kind: payload.kind, token, url: inboxMediaUrl(new URL(req.url).origin, token) }];
    }).slice(0, 10);
    const reply = replyInput || (attachments.length ? `Sent ${attachments.length === 1 ? "an attachment" : `${attachments.length} attachments`}.` : "");
    if (!body?.clientId || !body.requestId || (!body.status && !reply)) {
      return NextResponse.json({ ok: false, error: "clientId, requestId, and a status or reply are required" }, { status: 400 });
    }
    if (body.status && !["open", "reviewed", "closed"].includes(body.status)) {
      return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });
    }

    const session = await requireRoleForClient(
      reply ? [...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"] : [...AGENCY_ROLES],
      body.clientId,
    );
    const client = getClientForAgency(session.agencyId, body.clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    if (attachments.some(attachment => verifyInboxMediaToken(attachment.token)?.agencyId !== session.agencyId)) return NextResponse.json({ ok: false, error: "An attachment is invalid." }, { status: 400 });

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
        id: makeId().replace(/^req_/, "rep_"),
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
  } catch (error) {
    return authErrorResponse(error);
  }
}
