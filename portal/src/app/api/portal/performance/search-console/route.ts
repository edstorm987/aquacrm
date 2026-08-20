import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import type { ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import { fetchGoogleSearchConsoleEvents } from "@/lib/server/integrations/googleSearchConsole";
import { getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  getIntegrationConnection,
  markIntegrationConnectionSynced,
  resolveIntegrationConnectionValues,
} from "@/lib/server/integrations/integrationConnections";
import { logActivity } from "@/server/activity";
import { replaceAgencyWebsiteSearchEvents } from "@/server/agencyWebsite";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";

const ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);
const MAX_SEARCH_EVENTS = 5_000;

interface Body {
  connectionId?: string;
  clientId?: string;
}

export async function POST(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.connectionId) return NextResponse.json({ ok: false, error: "Choose a Search Console connection." }, { status: 400 });

  const connection = getIntegrationConnection(session.agencyId, body.connectionId);
  if (!connection || connection.provider !== "google-search-console") {
    return NextResponse.json({ ok: false, error: "That Search Console connection was not found." }, { status: 404 });
  }
  const isAgency = !body.clientId || body.clientId === "aquaoasis-web";
  if (connection.clientId && (isAgency || connection.clientId !== body.clientId)) {
    return NextResponse.json({ ok: false, error: "That connection belongs to a different client." }, { status: 403 });
  }
  const client = isAgency ? null : getClientForAgency(session.agencyId, body.clientId as string);
  if (!isAgency && !client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

  try {
    const values = resolveIntegrationConnectionValues(session.agencyId, connection.id);
    const endDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const performanceEvents = await fetchGoogleSearchConsoleEvents(values, { startDate, endDate });
    const metric = `search-console:${connection.id}`;
    if (isAgency) {
      replaceAgencyWebsiteSearchEvents(session.agencyId, connection.id, performanceEvents, session.userId);
    } else if (client) {
      const previous = Array.isArray(client.metadata?.searchConsoleEvents)
        ? client.metadata.searchConsoleEvents as ClientTelemetryEvent[]
        : [];
      const imported: ClientTelemetryEvent[] = performanceEvents.map((event, index) => ({
        id: `gsc_${crypto.randomBytes(8).toString("hex")}_${index}`,
        type: "search",
        receivedAt: Date.now(),
        occurredAt: event.occurredAt,
        propertyId: event.propertyId,
        path: event.path,
        query: event.query,
        impressions: event.impressions,
        clicks: event.clicks,
        position: event.position,
        metric,
      }));
      updateClient(session.agencyId, client.id, {
        metadata: {
          searchConsoleEvents: [...imported, ...previous.filter(event => event.metric !== metric)].slice(0, MAX_SEARCH_EVENTS),
        },
      });
    }
    const syncedAt = Date.now();
    const savedConnection = markIntegrationConnectionSynced(session.agencyId, connection.id, syncedAt);
    logActivity({
      agencyId: session.agencyId,
      clientId: client?.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "marketing",
      action: "search_console.synced",
      message: `Synced ${performanceEvents.length} Search Console rows for ${connection.config.siteUrl || connection.label}.`,
      metadata: { connectionId: connection.id, propertyId: connection.config.propertyId, startDate, endDate },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, count: performanceEvents.length, syncedAt, connection: savedConnection });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Search Console could not be synced." }, { status: 400 });
  }
}
