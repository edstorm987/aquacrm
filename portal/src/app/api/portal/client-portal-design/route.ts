import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  checkpointPortalDesign,
  getPortalDesignRecord,
  publishPortalDesign,
  refreshProductPortalTemplateFromMaster,
  resetClientPortalFromTemplate,
  restorePortalDesignVersion,
  savePortalDesignDraft,
  type ClientPortalDesignScope,
} from "@/server/clientPortalDesigns";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

function cleanScope(value: unknown): ClientPortalDesignScope {
  return value === "client" ? "client" : "template";
}

function cleanText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const url = new URL(request.url);
    const scope = cleanScope(url.searchParams.get("scope"));
    // `scope` in this file has always meant the DESIGN scope; the tenant one
    // is `tenant`.
    const tenant = routeTenantScope(session, { clientId: url.searchParams.get("clientId") });
    const agencyId = tenant.agencyId;
    const templateId = cleanText(url.searchParams.get("templateId"), 220);
    const client = tenant.client;
    if (scope === "client" && !client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    if (scope === "client" && client) {
      await requireCurrentClientWorkspaceElementAccess(client.id, "client.portal", "view");
    }
    const record = getPortalDesignRecord({
      agencyId,
      scope,
      clientId: client?.id,
      actorUserId: session.userId,
      accentColor: typeof client?.metadata?.portalAccentColor === "string" ? client.metadata.portalAccentColor : undefined,
      templateId: scope === "template"
        ? templateId
        : typeof client?.metadata?.portalTemplateId === "string" ? client.metadata.portalTemplateId : undefined,
    });
    if (!record) return NextResponse.json({ ok: false, error: "portal design not found" }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    if (session.role !== "agency-owner" && session.role !== "agency-manager") {
      return NextResponse.json({ ok: false, error: "manager access required" }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as {
      action?: "save-draft" | "publish" | "checkpoint" | "restore" | "refresh-product" | "reset-client";
      scope?: ClientPortalDesignScope;
      recordId?: string;
      clientId?: string;
      templateId?: string;
      versionId?: string;
      label?: string;
      document?: unknown;
    } | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
    const scope = cleanScope(body.scope);
    const tenant = routeTenantScope(session, { clientId: body.clientId });
    const agencyId = tenant.agencyId;
    const templateId = cleanText(body.templateId, 220);
    const client = tenant.client;
    if (scope === "client" && !client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    if (scope === "client" && client) {
      await requireCurrentClientWorkspaceElementAccess(
        client.id,
        "client.portal",
        body.action === "save-draft" || body.action === "checkpoint" ? "use" : "manage",
      );
    }
    const initial = getPortalDesignRecord({
      agencyId,
      scope,
      clientId: client?.id,
      actorUserId: session.userId,
      accentColor: typeof client?.metadata?.portalAccentColor === "string" ? client.metadata.portalAccentColor : undefined,
      templateId: scope === "template"
        ? templateId
        : typeof client?.metadata?.portalTemplateId === "string" ? client.metadata.portalTemplateId : undefined,
    });
    const recordId = cleanText(body.recordId, 180) || initial?.id || "";
    let record = initial;

    if (body.action === "save-draft") {
      record = savePortalDesignDraft({ agencyId, scope, recordId, document: body.document, actorUserId: session.userId });
    } else if (body.action === "publish") {
      record = publishPortalDesign({ agencyId, scope, recordId, actorUserId: session.userId, label: cleanText(body.label, 100) || undefined });
    } else if (body.action === "checkpoint") {
      record = checkpointPortalDesign({ agencyId, scope, recordId, actorUserId: session.userId, label: cleanText(body.label, 100) });
    } else if (body.action === "restore") {
      record = restorePortalDesignVersion({ agencyId, scope, recordId, versionId: cleanText(body.versionId, 180), actorUserId: session.userId });
    } else if (body.action === "refresh-product") {
      if (scope !== "template") return NextResponse.json({ ok: false, error: "product template required" }, { status: 400 });
      record = refreshProductPortalTemplateFromMaster({ agencyId, templateId: recordId, actorUserId: session.userId });
    } else if (body.action === "reset-client") {
      if (scope !== "client" || !client) return NextResponse.json({ ok: false, error: "client portal required" }, { status: 400 });
      record = resetClientPortalFromTemplate({ agencyId, clientId: client.id, actorUserId: session.userId });
    }

    if (!record) return NextResponse.json({ ok: false, error: "portal design could not be updated" }, { status: 404 });
    if (body.action === "publish" && scope === "client" && client && "clientId" in record) {
      updateClient(agencyId, client.id, {
        metadata: {
          portalAccentColor: record.published.theme.accentColor,
          portalTemplateId: record.templateId,
          portalTemplateVersionId: record.templateVersionId,
          portalDesignVersionId: record.publishedVersionId,
          portalShellVersion: "stunning-standard-v1",
          portalAccessUpdatedAt: Date.now(),
        },
      });
    }
    logActivity({
      agencyId,
      clientId: scope === "client" ? client?.id : undefined,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "settings",
      action: `client_portal_design.${body.action}`,
      message: `${body.action.replaceAll("-", " ")} for ${scope === "client" ? client?.name || "client portal" : "name" in record ? record.name : "Stunning Standard"}.`,
      metadata: { scope, recordId: record.id, templateId: scope === "template" ? record.id : undefined },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return authErrorResponse(error);
  }
}
