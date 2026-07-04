// Auto-site discovery — receives heartbeats from unknown hosts and
// records them so the agency operator can confirm them as new clients.
// Adapted from `02/src/portal/server/discovery.ts` — host-scoped (NOT
// per-clientId) since by definition we don't know which client/agency
// the host belongs to until it's confirmed.
//
// In 04 we additionally scope by `agencyId` because each agency has its
// own discovery pipeline (so `agency-a.example.com` heartbeating doesn't
// leak into `agency-b`'s confirmation queue).

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId } from "../lib/tenancy";
import { storageKeys } from "./storage-keys";

export interface DiscoveryRecord {
  host: string;
  agencyId: AgencyId;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
  status: "pending" | "confirmed" | "dismissed";
  metadata?: Record<string, unknown>;
}

export async function listDiscoveries(
  storage: PluginStorage,
  agencyId: AgencyId,
): Promise<DiscoveryRecord[]> {
  const hosts = (await storage.get<string[]>(storageKeys.discoveries(agencyId))) ?? [];
  const records = await Promise.all(
    hosts.map((h) => storage.get<DiscoveryRecord>(storageKeys.discovery(agencyId, h))),
  );
  return records.filter((r): r is DiscoveryRecord => Boolean(r));
}

export async function getDiscovery(
  storage: PluginStorage,
  agencyId: AgencyId,
  host: string,
): Promise<DiscoveryRecord | null> {
  return (await storage.get<DiscoveryRecord>(storageKeys.discovery(agencyId, host))) ?? null;
}

export async function recordHeartbeat(
  storage: PluginStorage,
  agencyId: AgencyId,
  host: string,
  metadata?: Record<string, unknown>,
): Promise<DiscoveryRecord> {
  const existing = await getDiscovery(storage, agencyId, host);
  const now = Date.now();
  const record: DiscoveryRecord = existing
    ? {
        ...existing,
        lastSeenAt: now,
        count: existing.count + 1,
        metadata: { ...(existing.metadata ?? {}), ...(metadata ?? {}) },
      }
    : {
        host,
        agencyId,
        firstSeenAt: now,
        lastSeenAt: now,
        count: 1,
        status: "pending",
        metadata,
      };
  await storage.set(storageKeys.discovery(agencyId, host), record);

  if (!existing) {
    const indexKey = storageKeys.discoveries(agencyId);
    const hosts = (await storage.get<string[]>(indexKey)) ?? [];
    if (!hosts.includes(host)) {
      hosts.push(host);
      await storage.set(indexKey, hosts);
    }
  }
  return record;
}

export async function dismissDiscovery(
  storage: PluginStorage,
  agencyId: AgencyId,
  host: string,
): Promise<boolean> {
  const record = await getDiscovery(storage, agencyId, host);
  if (!record) return false;
  await storage.set(storageKeys.discovery(agencyId, host), {
    ...record,
    status: "dismissed",
  });
  return true;
}

export async function confirmDiscovery(
  storage: PluginStorage,
  agencyId: AgencyId,
  host: string,
): Promise<boolean> {
  const record = await getDiscovery(storage, agencyId, host);
  if (!record) return false;
  await storage.set(storageKeys.discovery(agencyId, host), {
    ...record,
    status: "confirmed",
  });
  return true;
}
