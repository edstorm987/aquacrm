// Local copy of the AquaPlugin contract.
//
// **TODO** — byte-equivalent mirror of T1's canonical
// `04-the-final-portal/portal/src/plugins/_types.ts` (commit 16bc524).
// Keeps this plugin tsc-clean standalone. The chief commander's planned
// post-merge refactor replaces this file with a single re-export from
// the foundation.

import type { ComponentType, ReactNode } from "react";

import type { PluginInstall, Role } from "./tenancy";

// Re-export PluginInstall so plugin-internal code can `import { PluginInstall }`
// from this module just like the foundation does.
export type { PluginInstall } from "./tenancy";

// ─── Plugin identity ──────────────────────────────────────────────────────

export type PluginCategory =
  | "core"
  | "content"
  | "commerce"
  | "marketing"
  | "support"
  | "ops"
  | "fulfillment";

export type PluginStatus = "stable" | "beta" | "alpha";

export type PlanId = "free" | "starter" | "pro" | "enterprise";

// ─── Runtime context handed to plugin lifecycle hooks ─────────────────────
//
// Mirrors T1's canonical `PluginCtx` exactly: `{ agencyId, clientId?,
// install, storage }`. No `services` container — the foundation passes
// its services in via a separate adapter (see `src/server/foundationAdapter.ts`).

export interface PluginCtx {
  agencyId: string;
  clientId?: string;
  install: PluginInstall;
  storage: PluginStorage;
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

// ─── Setup wizard ─────────────────────────────────────────────────────────

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  fields: SetupField[];
  validate?(values: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }>;
  optional?: boolean;
}

export interface SetupField {
  id: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "select" | "boolean" | "textarea";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
}

// ─── Sidebar contributions ────────────────────────────────────────────────

export interface NavGroup {
  id: string;
  label: string;
  order?: number;
}

export type PanelId =
  | "main"
  | "fulfillment"
  | "store"
  | "content"
  | "marketing"
  | "settings"
  | "ops"
  | "tools";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: string | number;
  requiresFeature?: string;
  order?: number;
  panelId?: PanelId;
  groupId?: string;
  roles?: Role[];
}

// ─── Admin pages ──────────────────────────────────────────────────────────

export interface PluginPage {
  path: string;
  component: () => Promise<{ default: ComponentType<PluginPageProps> }>;
  requiresFeature?: string;
  title?: string;
  roles?: Role[];
}

export interface PluginPageProps {
  agencyId: string;
  clientId?: string;
  install: PluginInstall;
  segments: string[];
  // Per-install storage handed in by the foundation. T1's canonical
  // PluginPageProps only carries (agencyId, clientId?, install, segments)
  // today; the chief commander's planned tweak adds `storage` so plugin
  // server components can read+write without a separate hook. Vendoring
  // the extension here keeps the plugin tsc-clean standalone.
  storage: PluginStorage;
}

// ─── API routes ───────────────────────────────────────────────────────────

export interface PluginApiRoute {
  path: string;
  methods: ("GET" | "POST" | "PATCH" | "PUT" | "DELETE")[];
  handler: (req: Request, ctx: PluginCtx) => Promise<Response>;
  requiresFeature?: string;
  roles?: Role[];
}

// ─── Storefront contributions ─────────────────────────────────────────────

export interface BlockDescriptor {
  type: string;
  name: string;
  category: "layout" | "content" | "commerce" | "form" | "media" | "marketing";
  defaultProps: Record<string, unknown>;
  render: () => Promise<{ default: ComponentType<{ block: unknown }> }>;
  requiresFeature?: string;
}

export interface StorefrontRoute {
  path: string;
  component: () => Promise<{ default: ComponentType<{ params: Record<string, string> }> }>;
  requiresFeature?: string;
}

export interface HeadInjection {
  id: string;
  render: (install: PluginInstall) => string | null;
  position: "head" | "body-end";
  requiresFeature?: string;
}

// ─── Settings schema ──────────────────────────────────────────────────────

export interface SettingsSchema {
  customPage?: boolean;
  groups: SettingsGroup[];
}

export interface SettingsGroup {
  id: string;
  label: string;
  description?: string;
  fields: SettingsField[];
}

export interface SettingsField {
  id: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "number" | "select" | "boolean" | "textarea" | "color";
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
  placeholder?: string;
  plans?: PlanId[];
}

// ─── Feature toggles ──────────────────────────────────────────────────────

export interface PluginFeature {
  id: string;
  label: string;
  description?: string;
  default: boolean;
  plans?: PlanId[];
  requires?: string[];
}

// ─── Health check ─────────────────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  message?: string;
  components?: Record<string, { ok: boolean; message?: string }>;
}

// ─── Install scope policy ─────────────────────────────────────────────────

export type PluginScopePolicy = "client" | "agency" | "either";

// ─── The plugin manifest ──────────────────────────────────────────────────

export interface AquaPlugin {
  id: string;
  name: string;
  version: string;
  status: PluginStatus;
  category: PluginCategory;
  tagline: string;
  description: string;
  icon?: ReactNode;

  core?: boolean;

  scopePolicy: PluginScopePolicy;

  plans?: PlanId[];
  requires?: string[];
  conflicts?: string[];

  onInstall?: (ctx: PluginCtx, setupAnswers: Record<string, string>) => Promise<void>;
  onUninstall?: (ctx: PluginCtx) => Promise<void>;
  onEnable?: (ctx: PluginCtx) => Promise<void>;
  onDisable?: (ctx: PluginCtx) => Promise<void>;
  onConfigure?: (ctx: PluginCtx) => Promise<void>;

  setup?: SetupStep[];

  navGroup?: NavGroup;
  navItems: NavItem[];
  pages: PluginPage[];
  api: PluginApiRoute[];

  storefront?: {
    blocks?: BlockDescriptor[];
    routes?: StorefrontRoute[];
    headInjections?: HeadInjection[];
  };

  settings: SettingsSchema;
  features: PluginFeature[];
  healthcheck?: (ctx: PluginCtx) => Promise<HealthStatus>;
}
