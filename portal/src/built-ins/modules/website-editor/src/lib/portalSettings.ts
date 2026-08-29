"use client";

// Portal settings client. Faithful port of `02/src/lib/admin/portalSettings.ts`,
// re-pointed at the plugin-namespaced API and trimmed to the surface
// SitesPage actually consumes.
//
// Round-4 status: `/api/portal/website-editor/settings` is NOT among the
// routes this plugin declares (see `src/api/routes.ts`), so every call here
// 404s.
//
// ── READS fall back; WRITES must not (2026-08-28 audit) ──────────────────
//
// `loadSettings` returning defaults is fine and is what SitesPage relies on:
// it renders, and `githubReady` correctly computes false because the default
// repo URL is empty. Nothing is claimed that is not true.
//
// `saveSettings` used to do something else entirely. On the 404 it caught the
// error and did an "optimistic local apply" — merged the patch into the
// in-memory cache, notified listeners, and returned the merged object. The
// caller could not tell a real save from a failed one. Since the shape it
// saves includes `github.token` and `github.pat`, that meant somebody could
// enter a personal access token, watch it "save", and have it live only in a
// client-side variable until the next reload.
//
// It has no caller today — SitesPage imports only the read side — so this was
// never reachable. It is fixed rather than deleted because dead code with a
// pretend-success path in it is a trap for whoever wires the endpoint up.

export type DatabaseBackend = "file" | "memory" | "kv";

export interface PortalSettings {
  github: {
    repoUrl: string;
    defaultBranch: string;
    token?: string;
    appId?: string;
    pat?: string;
  };
  database: { backend: DatabaseBackend; connection?: string };
  deployment: {
    vercelToken?: string;
    vercelProjectId?: string;
    vercelTeamId?: string;
    previewBaseUrl?: string;
  };
}

export type PortalSettingsPatch = {
  github?: Partial<PortalSettings["github"]>;
  database?: Partial<PortalSettings["database"]>;
  deployment?: Partial<PortalSettings["deployment"]>;
};

export const SECRET_PLACEHOLDER = "__portal_secret_set__";

export const DEFAULT_SETTINGS: PortalSettings = {
  github: { repoUrl: "", defaultBranch: "main" },
  database: { backend: "file" },
  deployment: {},
};

const BASE = "/api/portal/website-editor/settings";

let cache: PortalSettings | null = null;
let pending: Promise<PortalSettings> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* listener error is its own problem */ }
  }
}

async function fetchOnce(): Promise<PortalSettings> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(BASE, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json() as { settings: PortalSettings };
      cache = data.settings;
      return cache;
    } catch {
      cache = DEFAULT_SETTINGS;
      return cache;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export async function loadSettings(): Promise<PortalSettings> {
  return fetchOnce();
}

export function getSettings(): PortalSettings {
  return cache ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: PortalSettingsPatch): Promise<PortalSettings> {
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const data = await res.json() as { settings: PortalSettings };
    cache = data.settings;
  } catch (cause) {
    // Deliberately NOT an optimistic local apply. A save that reports success
    // without persisting is worse than one that fails: the operator believes a
    // credential is stored. Fail loudly and let the caller say so.
    throw new Error(
      "Portal settings cannot be saved: this plugin declares no /settings route, so there is nowhere to store them. "
      + `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
  notify();
  return cache;
}

function mergePatch(cur: PortalSettings, patch: PortalSettingsPatch): PortalSettings {
  return {
    github:     { ...cur.github,     ...(patch.github     ?? {}) },
    database:   { ...cur.database,   ...(patch.database   ?? {}) },
    deployment: { ...cur.deployment, ...(patch.deployment ?? {}) },
  };
}

export async function resetSettings(): Promise<PortalSettings> {
  try {
    const res = await fetch(BASE, { method: "DELETE" });
    if (!res.ok) throw new Error(`reset failed: ${res.status}`);
    const data = await res.json() as { settings: PortalSettings };
    cache = data.settings;
  } catch {
    // Unlike `saveSettings`, this one is honest as-is. Nothing is persisted
    // anywhere, so the in-memory cache IS the whole of the state — clearing it
    // to defaults is a complete and truthful reset, not a pretence.
    cache = DEFAULT_SETTINGS;
  }
  notify();
  return cache;
}

export function onSettingsChange(handler: () => void): () => void {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}

export function hasSecret(value: string | undefined): boolean {
  return value === SECRET_PLACEHOLDER;
}
