// `/portal/clients/[clientId]/checklist` — the client-side checklist view.
//
// Visible to roles `client-owner` and `client-staff` (see manifest's
// nav `visibleToRoles`). Renders only the client-tagged checklist tasks
// for the client's current phase.
//
// Routes: foundation passes `clientId` as `props.clientId` (the route is
// `/portal/clients/[clientId]/checklist`, not `/portal/agency/...`).

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { buildFulfillmentContainer } from "../server";
import { ChecklistWidget } from "../components/ChecklistWidget";
import { API_BASE } from "./ClientsPage";

export default async function ChecklistPage(props: PluginPageProps) {
  if (!props.clientId) return <p>Missing client id.</p>;
  const client = await Promise.resolve(
    props.services.clients.getClientForAgency(props.agencyId, props.clientId),
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
  if (!phase) {
    return (
      <section className="fulfillment-client-checklist">
        <h1>Your checklist</h1>
        <p>No phase definition matches your current stage. Your agency has been notified.</p>
      </section>
    );
  }

  const view = await c.checklistService.viewFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    phase,
  });

  return (
    <ChecklistWidget client={client} phase={phase} view={view} apiBase={API_BASE} />
  );
}
