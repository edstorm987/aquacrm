// Local copy of the Aqua plugin contract.
//
// **TODO** — this file is a vendored copy of the canonical contract that
// T1's foundation will publish at `portal/src/plugins/_types.ts`. It exists
// here so the plugin tsc-clean-checks standalone in autonomous-mesh round 1.
// Once T1 ships, replace this file with:
//
//     export * from '../../../../portal/src/plugins/_types';
//
// Adapted from `02 felicias aqua portal work/src/plugins/_types.ts` and
// extended with the `storefront` field (block contributions) that T2's
// vendored copy omitted. Keep field shapes parallel to T2's
// `plugins/fulfillment/src/lib/aquaPluginTypes.ts` to ease the eventual
// merge.

import type { ComponentType, ReactNode } from "react";

import type { AgencyId, ClientId, PluginInstall, UserId } from "./tenancy";
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

// ─── Plugin identity ───────────────────────────────────────────────────────

export type PluginCategory =
  | "core"
  | "content"
  | "commerce"
  | "marketing"
  | "support"
  | "ops";

export type PluginStatus = "stable" | "beta" | "alpha";

// ─── Runtime context ───────────────────────────────────────────────────────

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
  services: PluginServices;
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
  plans?: ("free" | "starter" | "pro" | "enterprise")[];
}

// ─── Health check ──────────────────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  message?: string;
  components?: Record<string, { ok: boolean; message?: string }>;
}

// ─── Storefront block contributions ────────────────────────────────────────
//
// Each plugin can ship a catalogue of blocks usable in the visual editor.
// The website-editor plugin contributes the canonical 58-block library;
// other plugins (ecommerce, blog, etc.) extend the registry with their own.
//
// At runtime, the editor merges all installed plugins' blocks into a single
// registry keyed by `BlockDescriptor.type`. Conflicts are resolved by
// install order (later plugins override earlier ones — rare, by design).

export interface BlockDescriptor {
  type: string;
  label: string;
  category: BlockCategory;
  description?: string;
  icon?: ReactNode;
  defaultProps?: Record<string, unknown>;
  defaultChildren?: BlockDescriptor[];
  requiresFeature?: string;
  requiresPlugin?: string;
}

export type BlockCategory =
  | "layout"
  | "content"
  | "media"
  | "commerce"
  | "auth"
  | "advanced";

export interface HeadInjection {
  id: string;
  // Returns either a string of HTML (for `<head>`) or a React node tree.
  // Foundation renders these in document head per (clientId, page).
  render: (ctx: { clientId?: ClientId; agencyId: AgencyId }) => string | ReactNode;
  requiresFeature?: string;
}

export interface StorefrontContributions {
  blocks?: BlockDescriptor[];
  headInjections?: HeadInjection[];
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

  storefront?: StorefrontContributions;

  settings: SettingsSchema;

  features: PluginFeature[];

  healthcheck?: (ctx: PluginCtx) => Promise<HealthStatus>;
}
