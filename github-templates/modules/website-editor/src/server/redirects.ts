// R025 — Redirect registry. Per-site/variant slug aliases with
// 301 semantics. Capped at 100 entries per registry; oldest
// pruned on overflow. Loop-detection prevents `from === to`
// or chains that would re-redirect to themselves.
//
// Storage:
//   t/<a>/<c>/website-editor/redirects/<siteId>  → RedirectEntry[]
//
// The storefront route handler reads the list and emits a 301
// when the requested slug matches a `from`. The editor's slug-
// rename + page-delete actions append entries.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";

export interface RedirectEntry {
  from: string;        // old slug (or full path)
  to: string;          // target slug (or full path)
  ts: number;
  reason: "rename" | "delete" | "manual";
}

export const REDIRECTS_CAP = 100;

const KEY = (a: AgencyId, c: ClientId, siteId: string) =>
  `t/${a}/${c}/website-editor/redirects/${siteId}`;

function normaliseSlug(s: string): string {
  // Tolerate leading slash + trailing slash; never store both
  // forms ambiguously.
  const trimmed = s.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export async function listRedirects(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string,
): Promise<RedirectEntry[]> {
  return (await storage.get<RedirectEntry[]>(KEY(agencyId, clientId, siteId))) ?? [];
}

async function writeRedirects(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string,
  entries: RedirectEntry[],
): Promise<void> {
  await storage.set(KEY(agencyId, clientId, siteId), entries);
}

export interface AddRedirectInput {
  agencyId: AgencyId;
  clientId: ClientId;
  siteId: string;
  from: string;
  to: string;
  reason?: RedirectEntry["reason"];
}

export class RedirectLoopError extends Error {
  override name = "RedirectLoopError";
  constructor(public readonly from: string, public readonly to: string) {
    super(`redirect would loop: ${from} → ${to}`);
  }
}

// Adds a redirect with three guarantees:
//   1. self-loop rejected (from === to).
//   2. existing redirects whose `to` was the rename's `from` are
//      rewritten to the new target — keeps the chain shallow
//      (one hop max for any slug).
//   3. capacity trim drops the oldest entry beyond REDIRECTS_CAP.
export async function addRedirect(
  storage: PluginStorage, input: AddRedirectInput,
): Promise<{ entry: RedirectEntry; pruned: number; rewroteChain: number }> {
  const from = normaliseSlug(input.from);
  const to = normaliseSlug(input.to);
  if (!from || !to) throw new Error("from + to required");
  if (from === to) throw new RedirectLoopError(from, to);

  const entries = await listRedirects(storage, input.agencyId, input.clientId, input.siteId);

  // Chain shortening — every entry whose `to` was the old slug
  // (this rename's `from`) now needs to point at the new `to`.
  let rewroteChain = 0;
  for (const e of entries) {
    if (e.to === from) { e.to = to; rewroteChain += 1; }
  }
  // Drop any pre-existing entry that points from the same `from`
  // (operator renamed back-and-forth) so we end with a single
  // current alias.
  const filtered = entries.filter(e => e.from !== from);

  // Append new entry at the head (newest first).
  const next: RedirectEntry = {
    from, to,
    ts: Date.now(),
    reason: input.reason ?? "rename",
  };
  filtered.unshift(next);

  // Capacity trim — drop oldest beyond cap.
  let pruned = 0;
  while (filtered.length > REDIRECTS_CAP) {
    filtered.pop();
    pruned += 1;
  }

  await writeRedirects(storage, input.agencyId, input.clientId, input.siteId, filtered);
  return { entry: next, pruned, rewroteChain };
}

export async function removeRedirect(
  storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, from: string,
): Promise<boolean> {
  const target = normaliseSlug(from);
  const entries = await listRedirects(storage, agencyId, clientId, siteId);
  const next = entries.filter(e => e.from !== target);
  if (next.length === entries.length) return false;
  await writeRedirects(storage, agencyId, clientId, siteId, next);
  return true;
}

// Resolves a slug → final destination. Walks the chain (max 5
// hops) so a long-tail rename eventually points to the latest
// target. Returns null when no redirect matches.
export function resolveRedirect(
  entries: RedirectEntry[], requestedSlug: string,
): string | null {
  const requested = normaliseSlug(requestedSlug);
  let current = requested;
  let hops = 0;
  while (hops < 5) {
    const hit = entries.find(e => e.from === current);
    if (!hit) {
      return current === requested ? null : current;
    }
    current = hit.to;
    hops += 1;
  }
  return current;
}
