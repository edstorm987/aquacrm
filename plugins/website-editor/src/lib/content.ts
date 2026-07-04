// Client-side content overrides. Adapted from
// `02/src/lib/admin/content.ts`.

import type { ContentValue, SiteContentState } from "../types/content";

const BASE = "/api/portal/website-editor/content";

async function call<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  const json = (await res.json()) as { ok: boolean; error?: string } & Record<string, unknown>;
  if (!json.ok) throw new Error(json.error ?? "request failed");
  return json as T;
}

export async function getContent(siteId: string, mode: "preview" | "public" = "public"): Promise<Record<string, ContentValue>> {
  return (await call<{ values: Record<string, ContentValue> }>("GET", "", undefined, { siteId, mode })).values;
}

export async function setDraft(siteId: string, values: Record<string, ContentValue>): Promise<SiteContentState> {
  return (await call<{ state: SiteContentState }>("POST", "/draft", { siteId, values })).state;
}

export async function publish(siteId: string, reason?: string): Promise<SiteContentState> {
  return (await call<{ state: SiteContentState }>("POST", "/publish", { siteId, reason })).state;
}

export async function discard(siteId: string): Promise<SiteContentState> {
  return (await call<{ state: SiteContentState }>("POST", "/discard", { siteId })).state;
}

export async function revert(siteId: string, snapshotId: string): Promise<SiteContentState> {
  return (await call<{ state: SiteContentState }>("POST", "/revert", { siteId, snapshotId })).state;
}

export async function recordDiscovery(siteId: string, path: string, keys: string[]): Promise<void> {
  await call("POST", "/discovery", { siteId, path, keys });
}

export async function getState(siteId: string): Promise<SiteContentState> {
  return (await call<{ state: SiteContentState }>("GET", "/state", undefined, { siteId })).state;
}
