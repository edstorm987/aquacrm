// `/portal/agency/fulfillment/phases` — phase definitions settings.
//
// Lists the current phase definitions for the agency. Lets the operator
// edit / reorder / archive / add phases. The list is a client component
// so the editor modal stays interactive.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { PhaseService } from "../server";
import { PhasesSettingsList } from "../components/PhasesSettingsList";
import { API_BASE } from "./ClientsPage";

export default async function PhasesPage(props: PluginPageProps) {
  const phaseService = new PhaseService(props.services.phases);
  // Idempotent — first load on a fresh agency seeds the six defaults.
  await phaseService.seedDefaultPhases(props.agencyId);
  const phases = await phaseService.listForAgency(props.agencyId);

  return <PhasesSettingsList phases={phases} apiBase={API_BASE} />;
}
