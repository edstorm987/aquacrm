import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  cleanClientMarketingService,
  type ClientMarketingApproval,
  type ClientMarketingCampaignStatus,
  type ClientMarketingContentStatus,
  type ClientMarketingService,
  type ClientSocialProfile,
} from "@/lib/clients/clientMarketingService";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES, CLIENT_ROLES, isAgencyRole } from "@/server/types";

type Action =
  | "update-service"
  | "upsert-profile"
  | "remove-profile"
  | "upsert-content"
  | "remove-content"
  | "review-content"
  | "upsert-campaign"
  | "remove-campaign"
  | "review-campaign";

export async function POST(request: Request) {
  await ensureHydrated();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const clientId = cleanText(body?.clientId, 120);
  const action = cleanText(body?.action, 80) as Action | undefined;
  if (!body || !clientId || !action) return NextResponse.json({ ok: false, error: "clientId and action required" }, { status: 400 });

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES], clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  const agencyEditor = isAgencyRole(session.role);
  if (!agencyEditor && action !== "review-content" && action !== "review-campaign") {
    return NextResponse.json({ ok: false, error: "Only agency staff can change marketing delivery records." }, { status: 403 });
  }

  const service = cleanClientMarketingService((client.metadata ?? {}).clientMarketingService);
  const result = applyAction(service, action, body, agencyEditor);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  const next = cleanClientMarketingService({ ...result.service, updatedAt: Date.now() });
  const saved = updateClient(session.agencyId, clientId, { metadata: { clientMarketingService: next } });
  if (!saved) return NextResponse.json({ ok: false, error: "marketing service update failed" }, { status: 500 });

  logActivity({
    agencyId: session.agencyId,
    clientId,
    actorUserId: session.userId,
    actorEmail: session.email,
    category: "tenant",
    action: `client.marketing.${action}`,
    message: `${action.replaceAll("-", " ")} for ${client.name}.`,
  });
  return NextResponse.json({ ok: true, service: next });
}

function applyAction(service: ClientMarketingService, action: Action, body: Record<string, unknown>, agencyEditor: boolean): { ok: true; service: ClientMarketingService } | { ok: false; error: string } {
  const now = Date.now();
  if (action === "update-service") {
    const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? body.patch as Record<string, unknown> : {};
    return { ok: true, service: cleanClientMarketingService({ ...service, ...patch, profiles: service.profiles, content: service.content, campaigns: service.campaigns, updatedAt: now }) };
  }

  const row = body.row && typeof body.row === "object" && !Array.isArray(body.row) ? body.row as Record<string, unknown> : {};
  const id = cleanText(body.id ?? row.id, 100);
  if ((action.startsWith("remove-") || action.startsWith("review-")) && !id) return { ok: false, error: "record id required" };

  if (action === "upsert-profile") {
    const platform = cleanText(row.platform, 80);
    const handle = cleanText(row.handle, 160);
    if (!platform || !handle) return { ok: false, error: "platform and handle required" };
    const status: ClientSocialProfile["status"] = row.status === "connected" || row.status === "attention" || row.status === "archived" ? row.status : "planned";
    const profile: ClientSocialProfile = {
      id: id ?? `profile_${crypto.randomBytes(8).toString("hex")}`,
      platform,
      handle,
      url: cleanText(row.url, 500),
      owner: cleanText(row.owner, 120),
      status,
    };
    return { ok: true, service: { ...service, enabled: true, profiles: upsert(service.profiles, profile) } };
  }
  if (action === "remove-profile") return { ok: true, service: { ...service, profiles: service.profiles.filter(item => item.id !== id) } };

  if (action === "upsert-content") {
    const title = cleanText(row.title, 180);
    if (!title) return { ok: false, error: "content title required" };
    const status = validContentStatus(row.status);
    const content = {
      id: id ?? `content_${crypto.randomBytes(8).toString("hex")}`,
      title,
      platform: cleanText(row.platform, 80) ?? "Instagram",
      format: cleanText(row.format, 80) ?? "Post",
      status,
      approval: service.approvalRequired && status === "review" ? "pending" as const : validApproval(row.approval),
      scheduledAt: cleanTimestamp(row.scheduledAt),
      publishedUrl: cleanText(row.publishedUrl, 500),
      notes: cleanText(row.notes, 4_000),
      clientFeedback: cleanText(row.clientFeedback, 2_000),
      updatedAt: now,
    };
    return { ok: true, service: { ...service, enabled: true, content: upsert(service.content, content) } };
  }
  if (action === "remove-content") return { ok: true, service: { ...service, content: service.content.filter(item => item.id !== id) } };
  if (action === "review-content") {
    const approval = reviewDecision(body.approval);
    if (!approval) return { ok: false, error: "approval decision required" };
    const existing = service.content.find(item => item.id === id);
    if (!existing) return { ok: false, error: "content item not found" };
    const feedback = cleanText(body.feedback, 2_000);
    return { ok: true, service: { ...service, content: service.content.map(item => item.id === id ? { ...item, approval, status: approval === "approved" && item.status === "review" ? "approved" : item.status, clientFeedback: feedback, updatedAt: now } : item) } };
  }

  if (action === "upsert-campaign") {
    const name = cleanText(row.name, 180);
    if (!name) return { ok: false, error: "campaign name required" };
    const status = validCampaignStatus(row.status);
    const campaign = {
      id: id ?? `campaign_${crypto.randomBytes(8).toString("hex")}`,
      name,
      platform: cleanText(row.platform, 80) ?? "Meta Ads",
      objective: cleanText(row.objective, 240) ?? "Generate qualified demand",
      status,
      approval: service.approvalRequired && status === "review" ? "pending" as const : validApproval(row.approval),
      budgetCents: cleanCount(row.budgetCents),
      spendCents: cleanCount(row.spendCents),
      impressions: cleanCount(row.impressions),
      clicks: cleanCount(row.clicks),
      leads: cleanCount(row.leads),
      conversions: cleanCount(row.conversions),
      revenueCents: cleanCount(row.revenueCents),
      startsAt: cleanTimestamp(row.startsAt),
      endsAt: cleanTimestamp(row.endsAt),
      notes: cleanText(row.notes, 4_000),
      clientFeedback: cleanText(row.clientFeedback, 2_000),
      updatedAt: now,
    };
    return { ok: true, service: { ...service, enabled: true, campaigns: upsert(service.campaigns, campaign) } };
  }
  if (action === "remove-campaign") return { ok: true, service: { ...service, campaigns: service.campaigns.filter(item => item.id !== id) } };
  if (action === "review-campaign") {
    const approval = reviewDecision(body.approval);
    if (!approval) return { ok: false, error: "approval decision required" };
    const existing = service.campaigns.find(item => item.id === id);
    if (!existing) return { ok: false, error: "campaign not found" };
    const feedback = cleanText(body.feedback, 2_000);
    return { ok: true, service: { ...service, campaigns: service.campaigns.map(item => item.id === id ? { ...item, approval, status: approval === "approved" && item.status === "review" ? "scheduled" : item.status, clientFeedback: feedback, updatedAt: now } : item) } };
  }

  return agencyEditor ? { ok: false, error: "unsupported action" } : { ok: false, error: "forbidden action" };
}

function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some(item => item.id === row.id) ? rows.map(item => item.id === row.id ? row : item) : [row, ...rows];
}

function cleanText(value: unknown, limit: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : undefined;
}

function cleanCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function cleanTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function validApproval(value: unknown): ClientMarketingApproval {
  return value === "approved" || value === "changes-requested" || value === "not-required" ? value : "pending";
}

function reviewDecision(value: unknown): "approved" | "changes-requested" | null {
  return value === "approved" || value === "changes-requested" ? value : null;
}

function validContentStatus(value: unknown): ClientMarketingContentStatus {
  return value === "draft" || value === "review" || value === "approved" || value === "scheduled" || value === "published" ? value : "idea";
}

function validCampaignStatus(value: unknown): ClientMarketingCampaignStatus {
  return value === "review" || value === "scheduled" || value === "active" || value === "paused" || value === "complete" ? value : "draft";
}
