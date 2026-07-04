import "server-only";
// Public-funnel plugin foundation registration. Closes Gap #1 from
// the chapter #161 HC→leads-pipeline integration verification —
// without this side-effect import, `/api/portal/public-funnel/hc-complete`
// returns 404 in prod because the plugin isn't in the runtime registry.
//
// Mirrors `leadsPipelineFoundation.ts` shape:
//   • shared ports (activity + events) from `_foundationPorts.ts`
//   • plugin-specific ports (leadUserPort + sessionPort) from
//     `./leadFunnelPorts.ts` (T1 R032 chapter #150)
//   • idempotent `registered` flag — boot side-effect import calls
//     `ensurePublicFunnelFoundationRegistered()` once

import { registerFunnelFoundation } from "@aqua/plugin-public-funnel/server";
import {
  activityPort,
  eventBusPort,
  tenantPort,
} from "./_foundationPorts";
import { leadUserPort, sessionPort } from "./leadFunnelPorts";

let registered = false;

export function ensurePublicFunnelFoundationRegistered(): void {
  if (registered) return;
  registerFunnelFoundation({
    activity: activityPort,
    events: eventBusPort,
    leadUsers: leadUserPort,
    sessions: sessionPort,
    tenant: tenantPort,
  } as unknown as Parameters<typeof registerFunnelFoundation>[0]);
  registered = true;
}

ensurePublicFunnelFoundationRegistered();
