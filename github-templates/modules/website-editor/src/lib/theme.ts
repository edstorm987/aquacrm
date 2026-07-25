"use client";

// Client-side theme editor. Faithful port of `02/src/lib/admin/themes.ts`,
// re-pointed at the plugin-namespaced API (`/api/portal/website-editor/themes`)
// and re-pointed at the plugin's local ThemeRecord/ThemeTokens types.
//
// Both `theme.ts` and the foundation's `themes.ts` export-shape is
// preserved so the lifted ThemesPage admin compiles unchanged. The
// Round-1 lifts of `setDefaultTheme` / `getTheme` / `listThemes` are
// kept as additional helpers callable from the editor.

import type { CreateThemeInput, ThemeRecord, ThemeTokens, UpdateThemePatch } from "../types/theme";

interface ListResponse { ok: boolean; themes: ThemeRecord[] }
interface OneResponse  { ok: boolean; theme?: ThemeRecord; error?: string }

const BASE = "/api/portal/website-editor/themes";
const cache: Record<string, ThemeRecord[]> = {};
const EVENT = "lk-themes-change";

function bust(siteId: string) {
  delete cache[siteId];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { siteId } }));
  }
}

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

// ─── 02 contract (used by lifted admin pages) ─────────────────────────────

export async function loadThemes(siteId: string, force = false): Promise<ThemeRecord[]> {
  if (!force && cache[siteId]) return cache[siteId]!;
  try {
    const data = await call<ListResponse>("GET", "", undefined, { siteId });
    cache[siteId] = data.themes ?? [];
    return cache[siteId]!;
  } catch {
    cache[siteId] = [];
    return [];
  }
}

export function listCachedThemes(siteId: string): ThemeRecord[] {
  return cache[siteId] ?? [];
}

export async function createTheme(
  siteId: string,
  input: { name: string; appearance?: "light" | "dark" | "auto"; tokens?: ThemeTokens },
): Promise<ThemeRecord | null> {
  try {
    const data = await call<OneResponse>("POST", "", { siteId, ...input });
    bust(siteId);
    return data.theme ?? null;
  } catch { return null; }
}

export async function updateTheme(
  siteId: string,
  themeId: string,
  patch: { name?: string; appearance?: "light" | "dark" | "auto"; tokens?: ThemeTokens; setAsDefault?: boolean } | UpdateThemePatch,
): Promise<ThemeRecord | null> {
  try {
    const data = await call<OneResponse>("PATCH", "", { siteId, themeId, patch });
    bust(siteId);
    return data.theme ?? null;
  } catch { return null; }
}

export async function deleteTheme(siteId: string, themeId: string): Promise<boolean> {
  try {
    await call("DELETE", "", { siteId, themeId });
    bust(siteId);
    return true;
  } catch { return false; }
}

export function onThemesChange(cb: (siteId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { siteId?: string } | undefined;
    if (detail?.siteId) cb(detail.siteId);
  };
  window.addEventListener(EVENT, handler as EventListener);
  return () => window.removeEventListener(EVENT, handler as EventListener);
}

// ─── Round-1 helpers preserved ────────────────────────────────────────────

export async function listThemes(siteId: string): Promise<ThemeRecord[]> {
  return loadThemes(siteId, true);
}

export async function getTheme(siteId: string, themeId: string): Promise<ThemeRecord | null> {
  try {
    const data = await call<{ theme: ThemeRecord }>("GET", "/get", undefined, { siteId, themeId });
    return data.theme;
  } catch { return null; }
}

export async function setDefaultTheme(siteId: string, themeId: string): Promise<void> {
  await call("POST", "/default", { siteId, themeId });
  bust(siteId);
}

export type { CreateThemeInput, ThemeRecord, ThemeTokens, UpdateThemePatch };
