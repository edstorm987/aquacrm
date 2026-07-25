// `/portal/agency/fulfillment` and `/portal/agency/fulfillment/clients`.
//
// Server-rendered. Pulls the client list, builds card data (current phase
// + checklist progress + last-activity timestamp), and renders the
// interactive client component.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { buildFulfillmentContainer } from "../server";
import { ClientList, type ClientCardData } from "../components/ClientList";

export const API_BASE = "/api/portal/fulfillment";

export default async function ClientsPage(props: PluginPageProps) {
  const c = buildFulfillmentContainer({
    clients: props.services.clients,
    pluginInstalls: props.services.pluginInstalls,
    pluginRuntime: props.services.pluginRuntime,
    registry: props.services.registry,
    phases: props.services.phases,
    activity: props.services.activity,
    events: props.services.events,
    variants: props.services.variants,
    storage: props.storage,
  });

  const [clients, phases, activity] = await Promise.all([
    Promise.resolve(props.services.clients.listClients(props.agencyId)),
    c.phaseService.listForAgency(props.agencyId),
    Promise.resolve(props.services.activity.listActivity({ agencyId: props.agencyId, limit: 200 })),
  ]);

  const phaseByStage = new Map(phases.map(p => [p.stage, p]));
  const lastActivityByClient = new Map<string, number>();
  for (const entry of activity) {
    if (!entry.clientId) continue;
    const ts = lastActivityByClient.get(entry.clientId);
    if (ts === undefined || entry.ts > ts) lastActivityByClient.set(entry.clientId, entry.ts);
  }

  const cards: ClientCardData[] = await Promise.all(clients.map(async client => {
    const phase = phaseByStage.get(client.stage);
    if (!phase) {
      return {
        client,
        phaseLabel: client.stage,
        internalDone: 0,
        internalTotal: 0,
        clientDone: 0,
        clientTotal: 0,
        lastActivityAt: lastActivityByClient.get(client.id),
      };
    }
    const view = await c.checklistService.viewFor({
      agencyId: props.agencyId,
      clientId: client.id,
      phase,
    });
    return {
      client,
      phaseLabel: phase.label,
      internalDone: view.internalDone,
      internalTotal: view.internalTotal,
      clientDone: view.clientDone,
      clientTotal: view.clientTotal,
      lastActivityAt: lastActivityByClient.get(client.id),
    };
  }));

  const phasePresets = phases
    .map(p => ({
      stage: p.stage,
      label: p.label,
      pluginPreset: p.pluginPreset as readonly string[],
    }))
    .sort((a, b) => {
      const orderA = phases.find(p => p.stage === a.stage)?.order ?? 0;
      const orderB = phases.find(p => p.stage === b.stage)?.order ?? 0;
      return orderA - orderB;
    });

  return (
    <ClientList
      cards={cards}
      apiBase={API_BASE}
      agencyClientHrefBase="/portal/agency/fulfillment"
      phasePresets={phasePresets}
    />
  );
}
