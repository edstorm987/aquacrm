import { NextResponse } from "next/server";

import { INTEGRATION_CATALOG, type IntegrationProvider } from "@/lib/integrations/catalog";
import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  activateIntegrationConnection,
  getIntegrationConnection,
  integrationVaultAvailable,
  listIntegrationConnections,
  revokeIntegrationConnection,
  saveIntegrationConnection,
  testIntegrationConnection,
} from "@/lib/server/integrations/integrationConnections";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

type Body = {
  action?: "save" | "test" | "activate" | "revoke";
  connectionId?: string;
  provider?: IntegrationProvider;
  label?: string;
  clientId?: string;
  values?: Record<string, string>;
};

const PROVIDERS = new Set(INTEGRATION_CATALOG.map(item => item.id));

export async function GET() {
  try {
    await ensureHydrated();
    // This is the agency-wide credential catalogue. Exact project grants read
    // only the connection metadata projected by /api/portal/dev/projects;
    // they must never enumerate ids belonging to unrelated projects here.
    const session = await requireRole(["agency-owner", "agency-manager"]);
    return NextResponse.json({
      ok: true,
      vaultAvailable: integrationVaultAvailable(),
      connections: listIntegrationConnections(session.agencyId),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Choose an integration action." }, { status: 400 });
    const existingConnection = body.connectionId
      ? getIntegrationConnection(session.agencyId, body.connectionId)
      : null;
    // Meta is the Inbox's own channel credential. Let a configurable Inbox
    // manager administer only that provider; every unrelated integration keeps
    // the historical owner/manager ceiling.
    const metaInboxOperation = existingConnection
      ? existingConnection.provider === "meta"
      : body.provider === "meta";
    const canReadFullCatalogue = session.role === "agency-owner" || session.role === "agency-manager";
    let agencyId = session.agencyId;
    if (metaInboxOperation) {
      const current = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "manage");
      agencyId = current.actor.resourceAgencyId;
    } else if (!canReadFullCatalogue) {
      throw new AuthError(403, "forbidden");
    }
    if (body.clientId && !getClientForAgency(agencyId, body.clientId)) {
      return NextResponse.json({ ok: false, error: "That client is not in this workspace." }, { status: 400 });
    }
    const clientScopes = [...new Set([existingConnection?.clientId, body.clientId].filter((id): id is string => Boolean(id)))];
    for (const clientId of clientScopes) {
      await requireCurrentClientWorkspaceElementAccess(clientId, "client.systems", "manage");
    }

    if (body.action === "save") {
      if (!body.provider || !PROVIDERS.has(body.provider)) {
        return NextResponse.json({ ok: false, error: "Choose a supported provider." }, { status: 400 });
      }
      const connection = saveIntegrationConnection({
        agencyId,
        connectionId: body.connectionId,
        provider: body.provider,
        label: body.label,
        clientId: body.clientId,
        values: body.values ?? {},
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection, connections: responseConnections(agencyId, canReadFullCatalogue) });
    }

    if (!body.connectionId) {
      return NextResponse.json({ ok: false, error: "Choose a saved connection." }, { status: 400 });
    }
    if (body.action === "test") {
      const connection = await testIntegrationConnection(agencyId, body.connectionId, {
        userId: session.userId,
        email: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection, connections: responseConnections(agencyId, canReadFullCatalogue) });
    }
    if (body.action === "activate") {
      const connection = activateIntegrationConnection({
        agencyId,
        connectionId: body.connectionId,
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection, connections: responseConnections(agencyId, canReadFullCatalogue) });
    }
    if (body.action === "revoke") {
      const connection = revokeIntegrationConnection({
        agencyId,
        connectionId: body.connectionId,
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection, connections: responseConnections(agencyId, canReadFullCatalogue) });
    }
    return NextResponse.json({ ok: false, error: "Unsupported integration action." }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = managementError(error);
    if (message) return NextResponse.json({ ok: false, error: message }, { status: 400 });
    return authErrorResponse(error);
  }
}

function responseConnections(agencyId: string, includeAll: boolean) {
  const connections = listIntegrationConnections(agencyId);
  return includeAll ? connections : connections.filter(connection => connection.provider === "meta");
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function managementError(error: unknown): string | null {
  const code = error instanceof Error ? error.message : "";
  if (code.startsWith("missing_field:")) return `${code.slice("missing_field:".length)} is required.`;
  const messages: Record<string, string> = {
    integration_not_found: "That saved connection could not be found.",
    provider_cannot_change: "Create a new connection to use a different provider.",
    vault_not_configured: "Configure the AquaCRM vault key once before saving provider credentials.",
    integration_secret_invalid: "A saved credential could not be decrypted. Reconnect this provider.",
    integration_scope_unsupported: "That provider only supports a workspace connection.",
    integration_must_pass_test: "Test this connection successfully before making it active.",
  };
  return messages[code] ?? (code ? code : null);
}
