import "server-only";
// Leads-pipeline plugin foundation registration (T1 R037 closes the
// 5-step "Foundation pending" punch-list T2 R027 left).
//
// Registers tenant + activity + event-bus + pluginInstall ports
// (shared via `_foundationPorts.ts`) plus two plugin-specific ports
// declared in `@/lib/server/leadsPipelinePorts`:
//   • emailEnqueuePort — adapter onto @aqua/plugin-email-sender
//   • pipelinePort     — adapter onto T1 R034 pipelines.ts
//
// Then subscribes the plugin's pipeline event. Anonymous public-funnel rows do
// not enter this adapter through the event bus; the public-funnel promotion
// port calls the explicit bridge below only after trusted authority.

import {
  registerLeadsPipelineFoundation,
  EVENT_SUBSCRIPTIONS,
  promoteFunnelCaptureToLead,
  handlePipelineCardMoved,
  containerFor as leadsContainerFor,
} from "@aqua/plugin-leads-pipeline/server";
import {
  tenantPort,
  activityPort,
  eventBusPort,
  pluginInstallStorePort,
} from "./_foundationPorts";
import {
  emailEnqueuePort,
  personIdentityPort,
  pipelinePort,
} from "@/lib/server/leadsPipelinePorts";
import { subscribeForPlugin } from "@/server/eventBus";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";

// Match the plugin's manifest id (chapter #157 / R037 follow-up):
// the foundation registry validator regex /^[a-z][a-z0-9-]*$/ rejects
// `@aqua/plugin-...`. Manifest id = "leads-pipeline"; npm package name
// = "@aqua/plugin-leads-pipeline" (latter still imported above).
const PLUGIN_ID = "leads-pipeline";

// Seeding a converted client with its pre-client history registers here so
// it is live wherever the leads foundation is.
import "./personClientSeeding";

let registered = false;

export function ensureLeadsPipelineFoundationRegistered(): void {
  if (registered) return;
  registerLeadsPipelineFoundation({
    tenant: tenantPort,
    activity: activityPort,
    events: eventBusPort,
    pluginInstalls: pluginInstallStorePort,
    emailEnqueue: emailEnqueuePort,
    pipeline: pipelinePort,
    personIdentity: personIdentityPort,
  } as unknown as Parameters<typeof registerLeadsPipelineFoundation>[0]);
  registered = true;
}

ensureLeadsPipelineFoundationRegistered();

// ─── EVENT_SUBSCRIPTIONS — bind handlers per agency install ───────────────
//
// The plugin exports a declarative list of event names + matching
// handler functions (chapter #157). For each entry, register a
// tenant-filtered subscriber that builds the per-(agency) container
// then invokes the handler with the appropriate service slice.

interface CardMovedPayload {
  cardId: string;
  cardKind: "lead" | "client" | "deal" | "custom";
  leadId?: string;
  fromColumn: string;
  toColumn: string;
  agencyId: string;
}

// Sanity assert: the plugin's declarative array stays in sync.
const expectedEvents = ["pipelines.card.moved"] as const;
for (const ev of expectedEvents) {
  if (!(EVENT_SUBSCRIPTIONS as readonly string[]).includes(ev)) {
    console.warn(`[leads-pipeline] EVENT_SUBSCRIPTIONS missing expected entry "${ev}"`);
  }
}

function containerForAgency(agencyId: string) {
  const install = getInstall({ agencyId }, PLUGIN_ID);
  if (!install || !install.enabled) return null;
  const storage = makePluginStorage(install.id);
  return leadsContainerFor({ agencyId, storage: storage as never });
}

export async function promoteVerifiedFunnelCapture(input: {
  agencyId: string;
  captureId: string;
  email: string;
  source: string;
  actorUserId: string;
  profile?: { name?: string; phone?: string; company?: string };
}): Promise<{
  leadId: string;
  personId: string;
  prospectId?: string;
  pipelineCardId?: string;
}> {
  const container = containerForAgency(input.agencyId);
  if (!container) throw new Error("leads_pipeline_promotion_unavailable");
  const lineage = await promoteFunnelCaptureToLead(container.leads, {
    agencyId: input.agencyId as never,
    captureId: input.captureId,
    email: input.email,
    source: input.source,
    actorUserId: input.actorUserId as never,
    name: input.profile?.name,
    phone: input.profile?.phone,
    company: input.profile?.company,
  }, container.prospects);
  if (!lineage.personId) throw new Error("funnel_promotion_person_lineage_missing");
  return { ...lineage, personId: lineage.personId };
}

subscribeForPlugin(PLUGIN_ID, "pipelines.card.moved", async (event) => {
  const payload = event.payload as CardMovedPayload;
  const container = containerForAgency(event.agencyId);
  if (!container) return;
  await handlePipelineCardMoved(container.leads, container.contacts, {
    cardId: payload.cardId,
    cardKind: payload.cardKind,
    leadId: payload.leadId,
    fromColumn: payload.fromColumn,
    toColumn: payload.toColumn,
  });
});
