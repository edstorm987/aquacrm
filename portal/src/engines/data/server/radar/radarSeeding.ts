import "server-only";

import { on, type AquaEventName } from "@/server/eventBus";
import { invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";

/**
 * Event-driven radar seeding (radar upgrade Stage 6, Part E).
 *
 * Radar coverage is derived at sweep time, so a newly created entity is picked
 * up on the next rebuild — but the 30s Pulse cache can delay that. Subscribing
 * cache-invalidation to entity-lifecycle events makes new coverage register
 * *immediately* (in a `calibrating` state, via the coverage manifest), while the
 * derive-at-sweep path remains the fallback so nothing is missed if an event is
 * dropped.
 *
 * Registration is idempotent and lazy — `ensureRadarSeedingRegistered()` is
 * called at the top of every sweep, so the subscription is always live wherever
 * radar runs without needing a separate bootstrap.
 */

const SEED_EVENTS: AquaEventName[] = [
  "agency.created",
  "client.created",
  "client.updated",
  "client.archived",
  "client.stage_changed",
  "organisation.created",
  "plugin.installed",
  "plugin.enabled",
  "plugin.uninstalled",
  "plugin.disabled",
];

let registered = false;

export function ensureRadarSeedingRegistered(): void {
  if (registered) return;
  registered = true;
  for (const name of SEED_EVENTS) {
    on(name, event => {
      if (event.agencyId) invalidateBusinessIssueRadarCache(event.agencyId);
    });
  }
}
