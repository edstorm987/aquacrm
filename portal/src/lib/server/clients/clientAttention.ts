import "server-only";

import { buildClientRadarFleet } from "@/engines/data/server/radar/clientRadarService";
import { listClients } from "@/server/tenants";

/**
 * One client that currently needs attention, compact enough for a Command
 * Centre roll-up: who, how bad, the single top reason, and a link into their
 * Fulfilment workspace where the full detail lives.
 */
export interface ClientAttentionItem {
  clientId: string;
  clientName: string;
  state: "risk" | "watch";
  /** The top firing signal — the client radar's primary issue in words. */
  headline: string;
  /** Holistic client health score (0–100), or null while still learning. */
  score: number | null;
  href: string;
}

/**
 * The "clients needing attention" list behind the Command Centre panel — not a
 * bare count, but which clients, how bad, and why. Rides the client-radar fleet
 * (the canonical per-client health rollup, which already folds in the enquiry
 * and traffic factors), so this stays in step with each client's own Radar and
 * needs no second source of truth. Full detail stays in Fulfilment.
 */
export async function listClientsNeedingAttention(agencyId: string, now = Date.now()): Promise<ClientAttentionItem[]> {
  const clients = listClients(agencyId).filter(client => client.status === "active" && client.stage !== "churned");
  if (!clients.length) return [];
  const fleet = await buildClientRadarFleet(agencyId, { now, clients });
  const rank = { risk: 0, watch: 1 } as const;
  return fleet
    .filter((snapshot): snapshot is typeof snapshot & { healthState: "risk" | "watch" } =>
      snapshot.healthState === "risk" || snapshot.healthState === "watch")
    .map(snapshot => ({
      clientId: snapshot.clientId,
      clientName: snapshot.clientName,
      state: snapshot.healthState,
      headline: snapshot.summary,
      score: snapshot.healthScore,
      href: `/portal/clients/${encodeURIComponent(snapshot.clientId)}`,
    }))
    .sort((left, right) =>
      rank[left.state] - rank[right.state]
      || (left.score ?? 101) - (right.score ?? 101)
      || left.clientName.localeCompare(right.clientName));
}
