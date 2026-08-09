import { NextResponse } from "next/server";

import { INTEGRATION_CATALOG, type IntegrationProvider } from "@/lib/integrations/catalog";
import { authErrorResponse, requireRole } from "@/lib/server/auth";
import {
  integrationVaultAvailable,
  listIntegrationConnections,
  revokeIntegrationConnection,
  saveIntegrationConnection,
  testIntegrationConnection,
} from "@/lib/server/integrationConnections";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";

type Body = {
  action?: "save" | "test" | "revoke";
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
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
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
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Choose an integration action." }, { status: 400 });

    if (body.action === "save") {
      if (!body.provider || !PROVIDERS.has(body.provider)) {
        return NextResponse.json({ ok: false, error: "Choose a supported provider." }, { status: 400 });
      }
      if (body.clientId && !getClientForAgency(session.agencyId, body.clientId)) {
        return NextResponse.json({ ok: false, error: "That client is not in this workspace." }, { status: 400 });
      }
      const connection = saveIntegrationConnection({
        agencyId: session.agencyId,
        connectionId: body.connectionId,
        provider: body.provider,
        label: body.label,
        clientId: body.clientId,
        values: body.values ?? {},
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection, connections: listIntegrationConnections(session.agencyId) });
    }

    if (!body.connectionId) {
      return NextResponse.json({ ok: false, error: "Choose a saved connection." }, { status: 400 });
    }
    if (body.action === "test") {
      const connection = await testIntegrationConnection(session.agencyId, body.connectionId, {
        userId: session.userId,
        email: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection, connections: listIntegrationConnections(session.agencyId) });
    }
    if (body.action === "revoke") {
      const connection = revokeIntegrationConnection({
        agencyId: session.agencyId,
        connectionId: body.connectionId,
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, connection, connections: listIntegrationConnections(session.agencyId) });
    }
    return NextResponse.json({ ok: false, error: "Unsupported integration action." }, { status: 400 });
  } catch (error) {
    const message = managementError(error);
    if (message) return NextResponse.json({ ok: false, error: message }, { status: 400 });
    return authErrorResponse(error);
  }
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
  };
  return messages[code] ?? (code ? code : null);
}
