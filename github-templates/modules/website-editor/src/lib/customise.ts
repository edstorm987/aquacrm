"use client";

// Brand-kit + admin-panel customisation client. Faithful port of
// `02/src/lib/admin/adminConfig.ts` minus the cross-org brand-plugin
// resolver (org-scoped branding is foundation territory; this plugin
// shim only manages the operator-local default).
//
// Round-3 status: localStorage-cached, matches 02's API surface 1:1.
// Round-4 work: when T1 ships a TenantPort brand-kit getter/setter
// and a /api/portal/website-editor/customise PATCH route, swap the
// localStorage reads/writes for the API call. Single-file change —
// callers (CustomisePage) won't notice.
//
// Q-ASSUMED: T1's TenantPort doesn't yet expose a brand-kit setter.
// Round-3 keeps customise state in localStorage (matches 02 1:1) and
// flags the API wiring as a Round-4 follow-up. Logged in outbox.

const BRAND_KEY  = "lk_admin_brand_v1";
const TABS_KEY   = "lk_admin_custom_tabs_v1";
const MODE_KEY_PREFIX = "lk_admin_mode_";
const CHANGE_EVENT = "lk-admin-config-change";

export type AdminMode = "dark" | "light" | "midnight" | "sand" | "custom";

// ─── Branding ─────────────────────────────────────────────────────────────

export interface AdminBranding {
  panelName: string;
  shortName: string;
  logoUrl: string;
  accentColor: string;
  sidebarBg: string;
  sidebarText: string;
  panelBg: string;
  panelText: string;
  customCSS: string;
  githubRepoUrl: string;
}

export const DEFAULT_BRANDING: AdminBranding = {
  panelName: "Aqua",
  shortName: "Admin",
  logoUrl: "",
  accentColor: "#E8621A",
  sidebarBg: "#141414",
  sidebarText: "#FAF5EE",
  panelBg: "#0A0A0A",
  panelText: "#FAF5EE",
  customCSS: "",
  githubRepoUrl: "",
};

export function getBranding(): AdminBranding {
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  try {
    const raw = window.localStorage.getItem(BRAND_KEY);
    if (!raw) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...(JSON.parse(raw) as Partial<AdminBranding>) };
  } catch { return DEFAULT_BRANDING; }
}

export function saveBranding(patch: Partial<AdminBranding>): void {
  if (typeof window === "undefined") return;
  const next = { ...getBranding(), ...patch };
  window.localStorage.setItem(BRAND_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resetBranding(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BRAND_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// ─── Custom sidebar tabs (iframe embeds) ──────────────────────────────────

export interface CustomTab {
  id: string;
  label: string;
  icon: string;
  embedUrl: string;
  group: string;
  order: number;
  openInNewTab: boolean;
  visibleToRoles: string[];
  createdAt: number;
}

export function listCustomTabs(): CustomTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TABS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as CustomTab[]).sort((a, b) => a.order - b.order);
  } catch { return []; }
}

export function getCustomTab(id: string): CustomTab | null {
  return listCustomTabs().find(t => t.id === id) ?? null;
}

export function createCustomTab(input: Omit<CustomTab, "id" | "createdAt" | "order">): CustomTab {
  const tabs = listCustomTabs();
  const tab: CustomTab = {
    ...input,
    id: `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    order: tabs.length,
    createdAt: Date.now(),
  };
  saveTabs([...tabs, tab]);
  return tab;
}

export function updateCustomTab(id: string, patch: Partial<CustomTab>): void {
  saveTabs(listCustomTabs().map(t => t.id === id ? { ...t, ...patch } : t));
}

export function deleteCustomTab(id: string): void {
  saveTabs(listCustomTabs().filter(t => t.id !== id));
}

export function moveCustomTab(id: string, direction: -1 | 1): void {
  const tabs = listCustomTabs();
  const idx = tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
  const j = idx + direction;
  if (j < 0 || j >= tabs.length) return;
  const a = tabs[idx]!;
  const b = tabs[j]!;
  tabs[idx] = b;
  tabs[j] = a;
  tabs.forEach((t, i) => { t.order = i; });
  saveTabs(tabs);
}

function saveTabs(tabs: CustomTab[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// ─── Per-user admin mode ──────────────────────────────────────────────────

export function getAdminMode(userEmail?: string): AdminMode {
  if (typeof window === "undefined") return "dark";
  const key = MODE_KEY_PREFIX + (userEmail ?? "default");
  return (window.localStorage.getItem(key) as AdminMode) || "dark";
}

export function setAdminMode(mode: AdminMode, userEmail?: string): void {
  if (typeof window === "undefined") return;
  const key = MODE_KEY_PREFIX + (userEmail ?? "default");
  window.localStorage.setItem(key, mode);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// ─── Built-in admin modes ─────────────────────────────────────────────────

export interface AdminModeColors {
  panelBg: string;
  panelText: string;
  sidebarBg: string;
  sidebarText: string;
  cardBg: string;
  borderColor: string;
  mutedText: string;
}

export const ADMIN_MODES: Record<AdminMode, AdminModeColors> = {
  dark: {
    panelBg: "#0A0A0A", panelText: "#FAF5EE",
    sidebarBg: "#141414", sidebarText: "#FAF5EE",
    cardBg: "#1A1A1A",
    borderColor: "rgba(255,255,255,0.05)",
    mutedText: "rgba(250,245,238,0.45)",
  },
  light: {
    panelBg: "#FAF5EE", panelText: "#1A1209",
    sidebarBg: "#FFFFFF", sidebarText: "#1A1209",
    cardBg: "#F5EFE6",
    borderColor: "rgba(0,0,0,0.08)",
    mutedText: "rgba(26,18,9,0.55)",
  },
  midnight: {
    panelBg: "#020618", panelText: "#E8EFFF",
    sidebarBg: "#0A0F1F", sidebarText: "#E8EFFF",
    cardBg: "#0F1730",
    borderColor: "rgba(120,140,255,0.08)",
    mutedText: "rgba(232,239,255,0.5)",
  },
  sand: {
    panelBg: "#1A1409", panelText: "#FBF0DF",
    sidebarBg: "#251B0D", sidebarText: "#FBF0DF",
    cardBg: "#2E2211",
    borderColor: "rgba(255,200,150,0.08)",
    mutedText: "rgba(251,240,223,0.5)",
  },
  custom: {
    panelBg: "#0A0A0A", panelText: "#FAF5EE",
    sidebarBg: "#141414", sidebarText: "#FAF5EE",
    cardBg: "#1A1A1A",
    borderColor: "rgba(255,255,255,0.05)",
    mutedText: "rgba(250,245,238,0.45)",
  },
};

// ─── Change listener ──────────────────────────────────────────────────────

export function onAdminConfigChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
