// `/portal/agency/fulfillment/[clientId]` — per-client phase workspace.
//
// `props.segments[0]` carries the `clientId`. Server-rendered: looks up
// client + current phase + next phase + checklist progress, hands the
// data to the client component for rendering + interactivity.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { buildFulfillmentContainer } from "../server";
import { PhaseBoard } from "../components/PhaseBoard";
import { API_BASE } from "./ClientsPage";

export default async function PhaseBoardPage(props: PluginPageProps) {
  const clientId = props.segments[0];
  if (!clientId) {
    return <p>Missing client id.</p>;
  }

  const client = await Promise.resolve(
    props.services.clients.getClientForAgency(props.agencyId, clientId),
  );
  if (!client) return <p>Client not found.</p>;

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

  const phases = await c.phaseService.listForAgency(props.agencyId);
  const phase = phases.find(p => p.stage === client.stage);
  if (!phase) return <p>No phase definition for this client's stage.</p>;
  const idx = phases.findIndex(p => p.id === phase.id);
  const nextPhase = idx >= 0 && idx < phases.length - 1 ? phases[idx + 1] ?? null : null;

  const view = await c.checklistService.viewFor({
    agencyId: props.agencyId,
    clientId,
    phase,
  });

  return (
    <PhaseBoard
      client={client}
      phase={phase}
      nextPhase={nextPhase}
      view={view}
      apiBase={API_BASE}
    />
  );
}
