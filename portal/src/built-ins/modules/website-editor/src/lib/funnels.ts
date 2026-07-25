"use client";

// Funnels admin client. Faithful port of `02/src/lib/admin/funnels.ts`,
// re-pointed at the plugin's API namespace. The funnel runtime is a
// Round-2 server TODO — until the API lands, calls return empty lists
// so the editor's funnel-stage and outliner show empty state.

export type FunnelStatus = "active" | "paused" | "draft";
export type StepType = "page" | "product" | "checkout" | "external";

export interface FunnelStep {
  id: string;
  name: string;
  type: StepType;
  path: string;
  description?: string;
  reached: number;
  completed: number;
}

export interface Funnel {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  status: FunnelStatus;
  steps: FunnelStep[];
  createdAt: number;
  updatedAt: number;
}

const BASE = "/api/portal/website-editor/funnels";
const CHANGE_EVENT = "lk-funnels-change";
const REFRESH_MS = 30_000;

let cache: Funnel[] = [];
let pending: Promise<Funnel[]> | null = null;
let lastFetched = 0;

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

async function fetchFunnels(force = false): Promise<Funnel[]> {
  if (!force && Date.now() - lastFetched < REFRESH_MS) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(BASE, { cache: "no-store", credentials: "include" });
      if (!res.ok) return cache;
      const data = await res.json() as { funnels?: Funnel[] };
      cache = data.funnels ?? [];
      lastFetched = Date.now();
      notify();
      return cache;
    } catch {
      return cache;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export function listFunnels(): Funnel[] {
  if (Date.now() - lastFetched > REFRESH_MS) void fetchFunnels(false);
  return cache;
}

export function getFunnel(id: string): Funnel | undefined {
  return cache.find(f => f.id === id);
}

export async function refreshFunnels(): Promise<Funnel[]> {
  return fetchFunnels(true);
}

export interface CreateFunnelInput {
  name: string;
  description?: string;
  steps?: Array<Omit<FunnelStep, "id" | "reached" | "completed">>;
}

export async function createFunnel(input: CreateFunnelInput): Promise<Funnel | null> {
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; funnel: Funnel };
    if (!data.ok) return null;
    await refreshFunnels();
    return data.funnel;
  } catch { return null; }
}

export async function saveFunnel(funnel: Funnel): Promise<void> {
  try {
    await fetch(`${BASE}/${funnel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: funnel.name,
        description: funnel.description,
        status: funnel.status,
        steps: funnel.steps,
      }),
      credentials: "include",
    });
  } finally { await refreshFunnels(); }
}

export async function patchFunnel(id: string, patch: Partial<Funnel>): Promise<void> {
  try {
    await fetch(`${BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      credentials: "include",
    });
  } finally { await refreshFunnels(); }
}

export async function deleteFunnel(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/${id}`, { method: "DELETE", credentials: "include" });
  } finally { await refreshFunnels(); }
}

export async function setFunnelStatus(id: string, status: FunnelStatus): Promise<void> {
  return patchFunnel(id, { status });
}

export interface FunnelStats {
  funnelId: string;
  totalSessions: number;
  conversionRate: number;
  steps: Array<{
    stepId: string;
    name: string;
    reached: number;
    completed: number;
    dropoff: number;
    dropoffRate: number;
  }>;
}

export async function fetchFunnelStats(funnelId: string): Promise<FunnelStats | null> {
  try {
    const res = await fetch(`${BASE}/${funnelId}/stats`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; stats?: FunnelStats };
    return data.ok ? data.stats ?? null : null;
  } catch { return null; }
}

export async function resetFunnelStats(funnelId: string): Promise<void> {
  try {
    await fetch(`${BASE}/${funnelId}/stats`, { method: "DELETE", credentials: "include" });
  } finally { await refreshFunnels(); }
}

export function funnelConversionRate(funnel: Funnel): number {
  if (!funnel.steps.length) return 0;
  const first = funnel.steps[0]!.reached;
  const last = funnel.steps[funnel.steps.length - 1]!.reached;
  if (first === 0) return 0;
  return Math.round((last / first) * 100);
}

export function onFunnelsChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
