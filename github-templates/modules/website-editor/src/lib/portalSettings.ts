"use client";

// Portal settings client. Faithful port of `02/src/lib/admin/portalSettings.ts`,
// re-pointed at the plugin-namespaced API and trimmed to the surface
// SitesPage actually consumes.
//
// Round-4 status: API endpoint not yet wired by foundation; calls
// silently fall back to in-memory defaults so the SitesPage UI renders.
// When T1 ships `/api/portal/website-editor/settings`, swap the
// fallbacks for real responses (single-file change).

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
  } catch {
    // Optimistic local apply when API unavailable
    cache = mergePatch(cache ?? DEFAULT_SETTINGS, patch);
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
