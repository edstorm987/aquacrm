// Local copy of the Aqua plugin contract.
//
// **TODO** — this file is a vendored copy of the canonical contract that
// T1's foundation will publish at `portal/src/plugins/_types.ts`. It exists
// here so the plugin tsc-clean-checks standalone in autonomous-mesh round 1.
// Once T1 ships, replace this file with:
//
//     export * from '../../../../portal/src/plugins/_types';
//
// The contract is adapted from `02 felicias aqua portal work/src/plugins/_types.ts`,
// retaining the manifest shape but rewriting `OrgPluginInstall` (org-scoped)
// to `PluginInstall` (agency + optional client scoped) per `04-architecture.md`.

import type { ComponentType, ReactNode } from "react";

import type { AgencyId, ClientId, PluginInstall, UserId } from "./tenancy";

// ─── Plugin identity ───────────────────────────────────────────────────────

export type PluginCategory =
  | "core"
  | "content"
  | "commerce"
  | "marketing"
  | "support"
  | "ops";

export type PluginStatus = "stable" | "beta" | "alpha";

// ─── Runtime context handed to plugin lifecycle hooks + handlers ───────────

export interface PluginCtx {
  agencyId: AgencyId;
  clientId?: ClientId;
  install: PluginInstall;
  storage: PluginStorage;
  services: PluginServices;
  actor: UserId;
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

// `PluginServices` is the foundation surface that any plugin can call.
// T1's foundation binds these at boot; the plugin treats them as a
// dependency-injected toolbox. Each plugin declares which subset it uses
// (here: the fulfillment plugin uses every service).
export interface PluginServices {
  clients: ClientStorePort;
  pluginInstalls: PluginInstallStorePort;
  pluginRuntime: PluginRuntimePort;
  registry: PluginRegistryPort;
  phases: PhaseStorePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  variants: PortalVariantPort;
}

// ─── Foundation port shapes ────────────────────────────────────────────────
//
// These interfaces describe the foundation services the plugin needs.
// T1 implements them; this plugin only sees the interface.

import type {
  ActivityLogPort,
  ClientStorePort,
  EventBusPort,
  PhaseStorePort,
  PluginInstallStorePort,
  PluginRegistryPort,
  PluginRuntimePort,
  PortalVariantPort,
} from "../server/ports";

// ─── Setup wizard ──────────────────────────────────────────────────────────

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

// ─── Sidebar contributions ─────────────────────────────────────────────────

export interface NavGroup {
  id: string;
  label: string;
  order?: number;
}

export type PluginRoleVisibility =
  | "agency-owner"
  | "agency-manager"
  | "agency-staff"
  | "client-owner"
  | "client-staff"
  | "freelancer"
  | "end-customer";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: string | number;
  requiresFeature?: string;
  order?: number;
  panelId?: string;
  groupId?: string;
  parent?: string;
  visibleToRoles?: PluginRoleVisibility[];
}

// ─── Admin pages ───────────────────────────────────────────────────────────

export interface PluginPage {
  path: string;
  component: () => Promise<{ default: ComponentType<PluginPageProps> }>;
  requiresFeature?: string;
  title?: string;
}

export interface PluginPageProps {
  agencyId: AgencyId;
  clientId?: ClientId;
  install: PluginInstall;
  segments: string[];
  searchParams: Record<string, string | string[] | undefined>;
  actor: UserId;
  // Server-rendered plugin pages receive the foundation surface via props
  // rather than importing T1's modules directly. Keeps every plugin
  // tsc-checkable in isolation and makes pages trivially testable.
  services: PluginServices;
  // Per-install scoped storage. Same namespacing rules as `PluginCtx.storage`.
  storage: PluginStorage;
}

// ─── API routes ────────────────────────────────────────────────────────────

export interface PluginApiRoute {
  path: string;
  methods: ("GET" | "POST" | "PATCH" | "PUT" | "DELETE")[];
  handler: (req: Request, ctx: PluginCtx) => Promise<Response>;
  requiresFeature?: string;
}

// ─── Settings schema ───────────────────────────────────────────────────────

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
}

// ─── Feature toggles ───────────────────────────────────────────────────────

export interface PluginFeature {
  id: string;
  label: string;
  description?: string;
  default: boolean;
  requires?: string[];
}

// ─── Health check ──────────────────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  message?: string;
  components?: Record<string, { ok: boolean; message?: string }>;
}

// ─── The plugin manifest ───────────────────────────────────────────────────

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

  settings: SettingsSchema;

  features: PluginFeature[];

  healthcheck?: (ctx: PluginCtx) => Promise<HealthStatus>;
}
