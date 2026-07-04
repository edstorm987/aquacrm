// Vendored AquaPlugin contract — same byte-equivalent mirror of T1's
// canonical `portal/src/plugins/_types.ts` that fulfillment, ecommerce,
// and agency-hr ship. Keeping a vendored copy lets the plugin run
// `tsc --noEmit` standalone. Orchestrator unifies in a one-line
// re-export later.

import type { ComponentType, ReactNode } from "react";

import type { AgencyId, ClientId, PluginInstall, UserId } from "./tenancy";

// ─── Plugin identity ───────────────────────────────────────────────────────

export type PluginCategory =
  | "core"
  | "content"
  | "commerce"
  | "marketing"
  | "support"
  | "ops"
  | "growth";

export type PluginStatus = "stable" | "beta" | "alpha";

export type ScopePolicy = "agency" | "client" | "either";

// ─── Runtime context handed to lifecycle hooks + handlers ─────────────────

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

// `PluginServices` mirrors T1's canonical surface with `unknown` for the
// slots memberships doesn't use. Memberships consumes:
//   tenant — getClient for branding on customer pages
//   activity — log status changes
//   events — emit `membership.subscription_changed` etc.
//   user — resolve end-customer email + name (NEW: declared here so
//          T1 wires `users.ts` through; mirrored on PluginServices via
//          a forward-compatible name)
//   stripe — Stripe client per request via injected port (the prompt's
//            preferred default — keeps the plugin decoupled from
//            ecommerce's cross-package surface)
export interface PluginServices {
  clients: unknown;
  pluginInstalls: unknown;
  pluginRuntime: unknown;
  registry: unknown;
  phases: unknown;
  activity: ActivityLogPort;
  events: EventBusPort;
  variants: unknown;
  tenant: TenantPort;
  user: UserPort;
  stripe: StripePort;
}

// ─── Foundation port shapes — concrete imports below ──────────────────────

import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  StripePort,
  TenantPort,
  UserPort,
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
  services: PluginServices;
  storage: PluginStorage;
}

// ─── API routes ────────────────────────────────────────────────────────────

export interface PluginApiRoute {
  path: string;
  methods: ("GET" | "POST" | "PATCH" | "PUT" | "DELETE")[];
  handler: (req: Request, ctx: PluginCtx) => Promise<Response>;
  requiresFeature?: string;
  visibleToRoles?: PluginRoleVisibility[];
  // Public route (no auth required). Used for the Stripe webhook
  // endpoint — Stripe signs the body, the handler verifies via
  // StripePort.verifyWebhookSignature; no Aqua session cookie needed.
  public?: boolean;
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

// ─── Storefront block contributions (delegated render — T3) ───────────────

export interface BlockDescriptor {
  id: string;
  label: string;
  description?: string;
  category?: string;
  defaultProps?: Record<string, unknown>;
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
  scopePolicy?: ScopePolicy;

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

  storefront?: { blocks: BlockDescriptor[] };

  settings: SettingsSchema;

  features: PluginFeature[];

  healthcheck?: (ctx: PluginCtx) => Promise<HealthStatus>;
}
