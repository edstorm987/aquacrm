"use client";

// Split-test admin client. Faithful port of `02/src/lib/admin/splitTests.ts`,
// re-pointed at the plugin's API namespace. The server side of these
// endpoints is a Round-2 TODO — until they land, calls return empty
// lists and the editor's split-test panel renders an empty state.

import type { SplitTestGroup, SplitTestResult, SplitTestStatus } from "../types/block";

const BASE = "/api/portal/website-editor/split-tests";

const EVENT = "lk-split-tests-change";
function notify() { if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT)); }

export async function listGroups(siteId?: string): Promise<SplitTestGroup[]> {
  const url = `${BASE}${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.groups ?? [];
}

export async function createGroup(input: {
  siteId: string;
  name: string;
  description?: string;
  trafficPercent?: number;
  stickyBy?: "visitor" | "session";
  goalEvent?: string;
}): Promise<SplitTestGroup | null> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = await res.json();
  notify();
  return data.group ?? null;
}

export async function patchGroup(
  id: string,
  patch: Partial<Pick<SplitTestGroup, "name" | "description" | "status" | "trafficPercent" | "stickyBy" | "goalEvent" | "endsAt" | "blockRefs">> & { setStatus?: SplitTestStatus },
): Promise<SplitTestGroup | null> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = await res.json();
  notify();
  return data.group ?? null;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.ok) notify();
  return res.ok;
}

export async function getGroupResults(id: string): Promise<{ group: SplitTestGroup | null; results: SplitTestResult[] }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/results`, { cache: "no-store" });
  if (!res.ok) return { group: null, results: [] };
  const data = await res.json();
  return { group: data.group ?? null, results: data.results ?? [] };
}

export function onSplitTestsChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function statusTone(s: SplitTestStatus): string {
  return s === "running"  ? "bg-green-500/15 text-green-400"
       : s === "paused"   ? "bg-brand-amber/15 text-brand-amber"
       : s === "completed"? "bg-cyan-500/15 text-cyan-400"
       :                    "bg-white/5 text-brand-cream/55";
}
