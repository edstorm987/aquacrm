// Aqua plugin platform — type contract.
//
// Lifted from `02 felicias aqua portal work/src/plugins/_types.ts` and
// adapted for the three-level tenancy model in `04-architecture.md`.
// Aligned in Round 2 with T2's local `aquaPluginTypes.ts` so the
// fulfillment plugin (and future first-party plugins) compile against
// one source of truth.
//
// Every feature in the portal (Fulfillment, Website editor, E-commerce,
// Memberships, …) is an `AquaPlugin`. The registry collects them; the
// runtime installs them into a tenant scope (agency-wide or client-
// scoped); the chrome reads installs to assemble the sidebar nav.
//
// New feature workflow:
//   1. mkdir 04-the-final-portal/plugins/<id>/
//   2. Author manifest exporting `default: AquaPlugin`
//   3. Register it in src/plugins/_registry.ts
//   4. Done. Sidebar nav, API routes and pages mount from the manifest.

import type { ComponentType, ReactNode } from "react";
import type { PluginInstall, PluginInstallScope, Role, ServerUser } from "@/server/types";

export type { PluginInstall, PluginInstallScope } from "@/server/types";

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

// ─── Foundation port shapes ──────────────────────────────────────────────
//
// The same interfaces T2 declared at `plugins/fulfillment/src/server/ports.ts`,
// re-published here so plugins land in the registry against one canonical
// surface. Implementations live in `src/plugins/foundation-adapters/`.

export interface CreateClientInput {
  name: string;
  slug?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stage?: import("@/server/types").ClientStage;
  brand?: Partial<import("@/server/types").BrandKit>;
  metadata?: Record<string, unknown>;
}

export interface UpdateClientPatch {
  name?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  brand?: Partial<import("@/server/types").BrandKit>;
  status?: import("@/server/types").AgencyStatus;
  stage?: import("@/server/types").ClientStage;
}

export interface ClientStorePort {
  createClient(agencyId: string, input: CreateClientInput): import("@/server/types").Client | Promise<import("@/server/types").Client>;
  getClient(id: string): import("@/server/types").Client | null | Promise<import("@/server/types").Client | null>;
  getClientForAgency(agencyId: string, clientId: string): import("@/server/types").Client | null | Promise<import("@/server/types").Client | null>;
  listClients(agencyId: string): import("@/server/types").Client[] | Promise<import("@/server/types").Client[]>;
  updateClient(agencyId: string, clientId: string, patch: UpdateClientPatch): import("@/server/types").Client | null | Promise<import("@/server/types").Client | null>;
}

export interface UpsertPluginInstallInput {
  pluginId: string;
  scope: PluginInstallScope;
  enabled: boolean;
  config: Record<string, unknown>;
  features: Record<string, boolean>;
  setupAnswers?: Record<string, string>;
  installedBy?: string;
}

export interface PluginInstallPatch {
  enabled?: boolean;
  config?: Record<string, unknown>;
  features?: Record<string, boolean>;
  setupAnswers?: Record<string, string>;
}

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): PluginInstall | null | Promise<PluginInstall | null>;
  listInstalledFor(scope: PluginInstallScope): PluginInstall[] | Promise<PluginInstall[]>;
  listInstalledForClientOnly(scope: PluginInstallScope): PluginInstall[] | Promise<PluginInstall[]>;
  upsertInstall(input: UpsertPluginInstallInput): PluginInstall | Promise<PluginInstall>;
  patchInstall(scope: PluginInstallScope, pluginId: string, patch: PluginInstallPatch): PluginInstall | null | Promise<PluginInstall | null>;
  deleteInstall(scope: PluginInstallScope, pluginId: string): boolean | Promise<boolean>;
}

export interface PluginRuntimePort {
  installPlugin(args: {
    pluginId: string;
    scope: PluginInstallScope;
    installedBy?: string;
    setupAnswers?: Record<string, string>;
    featureOverrides?: Record<string, boolean>;
    configOverrides?: Record<string, unknown>;
  }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }>;

  setEnabled(args: {
    pluginId: string;
    scope: PluginInstallScope;
    enabled: boolean;
    actor?: string;
  }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }>;

  uninstallPlugin(args: {
    pluginId: string;
    scope: PluginInstallScope;
    actor?: string;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface PluginRegistryEntry {
  id: string;
  name: string;
  version: string;
  status: PluginStatus;
  category: PluginCategory;
  tagline: string;
  description: string;
  core?: boolean;
  requires?: string[];
  conflicts?: string[];
}

export interface PluginRegistryPort {
  listPlugins(): PluginRegistryEntry[];
  listInstallablePlugins(): PluginRegistryEntry[];
  getPlugin(id: string): PluginRegistryEntry | null;
}

export interface LogActivityInput {
  agencyId: string;
  clientId?: string;
  actorUserId?: string;
  actorEmail?: string;
  category: import("@/server/types").ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  agencyId: string;
  clientId?: string;
  limit?: number;
}

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): import("@/server/types").ActivityEntry | Promise<import("@/server/types").ActivityEntry>;
  listActivity(filter: ListActivityFilter): import("@/server/types").ActivityEntry[] | Promise<import("@/server/types").ActivityEntry[]>;
}

export type EventName =
  | "agency.created"
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "client.stage_changed"
  | "user.signed_up"
  | "user.signed_in"
  | "user.password_reset"
  | "plugin.installed"
  | "plugin.uninstalled"
  | "plugin.enabled"
  | "plugin.disabled"
  | "plugin.configured"
  | "phase.advanced"
  | "phase.checklist_item_completed"
  | "brief.created"
  | "deliverable.submitted"
  | "deliverable.approved"
  | "page.published";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: string; clientId?: string },
    name: EventName,
    payload: T,
  ): void;
}

// `PortalRole` is the variant surface — which client-portal page a
// variant belongs to. Distinct from user `Role`. T3 owns canonical at
// `@aqua/plugin-website-editor/types`; mirrored here for now.
//
// T1 R15 widened the union (chapter §15g) — `customer` (end-customer
// landing for storefront tenants), `member` (gated members area),
// `start-here` (post-signup orientation surface), `other` (catch-all
// for tenant-specific custom variants). Existing roles preserved.
export type PortalRole =
  | "login"
  | "affiliates"
  | "orders"
  | "account"
  | "customer"
  | "member"
  | "start-here"
  | "other";

export const PORTAL_ROLES: readonly PortalRole[] = [
  "login", "affiliates", "orders", "account",
  "customer", "member", "start-here", "other",
] as const;

// Runtime validator — throws on unknown PortalRole strings. Used by
// foundation routes that receive a portalRole from request bodies.
export function assertPortalRole(v: unknown): PortalRole {
  if (typeof v === "string" && (PORTAL_ROLES as readonly string[]).includes(v)) {
    return v as PortalRole;
  }
  throw new Error(`Invalid PortalRole: ${JSON.stringify(v)}`);
}

export function isPortalRole(v: unknown): v is PortalRole {
  return typeof v === "string" && (PORTAL_ROLES as readonly string[]).includes(v);
}

export interface PortalVariantPort {
  applyStarterVariant(args: {
    clientId: string;
    agencyId: string;
    role: PortalRole;
    variantId: string;
    actor?: string;
  }): Promise<
    | { ok: true; variantId: string; pageId?: string; siteId?: string }
    | { ok: false; error: string }
  >;
}

export interface PhaseStorePort {
  listPhasesForAgency(agencyId: string): import("@/server/types").PhaseDefinition[] | Promise<import("@/server/types").PhaseDefinition[]>;
  getPhase(id: string): import("@/server/types").PhaseDefinition | null | Promise<import("@/server/types").PhaseDefinition | null>;
  upsertPhase(phase: import("@/server/types").PhaseDefinition): import("@/server/types").PhaseDefinition | Promise<import("@/server/types").PhaseDefinition>;
  deletePhase(id: string): boolean | Promise<boolean>;
}

// ─── PluginServices — the foundation toolbox handed to plugins ────────────

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

// ─── Runtime context handed to plugin lifecycle hooks ─────────────────────

export interface PluginCtx {
  agencyId: string;
  clientId?: string;
  install: PluginInstall;
  storage: PluginStorage;
  services: PluginServices;
  // The user id of whoever triggered the call. Empty string when called
  // by system bootstrap (auto-install of core plugins on agency creation).
  actor: string;
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
  | "tools"
  // End-customer surface (Felicia's shoppers / members / affiliates).
  // Plugins set `panelId: "customer"` on nav items they want to expose
  // under `/portal/customer`. The chrome filters by this in
  // `scope: "customer"` builds.
  | "customer";

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
  // Hierarchical nav: when set, this item nests under the parent (id) in
  // the same panel. T2's fulfillment uses this for "Clients" → "Briefs".
  parent?: string;
  // Roles allowed to see this nav item. Aliases: `roles` (T1 R1) is
  // accepted as a synonym for back-compat.
  visibleToRoles?: Role[];
  roles?: Role[];
  // Permission keys (T1 R7) — when present, the chrome additionally
  // intersects against the user's effective-role permission grid.
  // Founder bypasses regardless. Empty/omitted = no gate.
  requires?: string[];
}

// ─── Admin pages ──────────────────────────────────────────────────────────

export interface PluginPage {
  // Rendered at /portal/clients/[clientId]/<plugin-id>/<path> for client-
  // scoped installs, or /portal/agency/<plugin-id>/<path> for agency-
  // scoped installs. "" = the plugin's index.
  // Path supports parameter segments like ":clientId" — when present, the
  // captured value is exposed via `segments[0]`/etc.
  path: string;
  component: () => Promise<{ default: ComponentType<PluginPageProps> }>;
  requiresFeature?: string;
  title?: string;
  visibleToRoles?: Role[];
  roles?: Role[];
}

export interface PluginPageProps {
  agencyId: string;
  clientId?: string;
  install: PluginInstall;
  // Path captures + remainder beyond the plugin's mount point.
  segments: string[];
  // Search params from Next.js page props (already awaited).
  searchParams: Record<string, string | string[] | undefined>;
  actor: string;
  services: PluginServices;
  storage: PluginStorage;
}

// ─── API routes ───────────────────────────────────────────────────────────

export interface PluginApiRoute {
  path: string;
  methods: ("GET" | "POST" | "PATCH" | "PUT" | "DELETE")[];
  handler: (req: Request, ctx: PluginCtx) => Promise<Response>;
  requiresFeature?: string;
  visibleToRoles?: Role[];
  roles?: Role[];
  // T1 R032: when true, the dispatcher skips the session-required
  // pre-check. Used by public-funnel HC submit, rank-my-website
  // diagnostic run, memberships webhooks, Stripe webhooks, forms
  // public-submit — anything that lands as an anonymous visitor.
  // Plugin-level decision: the route handler still implements its
  // own auth (HMAC, capture handoff, etc) before trusting the body.
  // For per-tenant scope on public routes, the plugin must read the
  // agency/client from the URL or body — `ctx.agencyId` falls back
  // to a default sentinel so the dispatcher can build a PluginCtx.
  public?: boolean;
}

// ─── Storefront contributions (T3-territory; contract lives here) ────────

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

// ─── Install scope policy (optional, defaults to "either") ────────────────

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

  // Optional in Round 2; defaults to "either" when absent. T2's manifest
  // doesn't set it, so the runtime falls back to permissive.
  scopePolicy?: PluginScopePolicy;

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

// ─── Presets ──────────────────────────────────────────────────────────────

export interface AquaPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon?: ReactNode;
  plugins: PresetPluginEntry[];
  brandHints?: { palette?: string[]; fontPair?: [string, string] };
}

export interface PresetPluginEntry {
  pluginId: string;
  features?: Record<string, boolean>;
  config?: Record<string, unknown>;
}

// Helper: resolve allowed roles from either field for a manifest-author-
// agnostic role gate.
export function navItemAllowedRoles(item: NavItem): Role[] | undefined {
  return item.visibleToRoles ?? item.roles;
}

export function pluginPageAllowedRoles(page: PluginPage): Role[] | undefined {
  return page.visibleToRoles ?? page.roles;
}

// `ServerUser` re-exported for convenience.
export type { ServerUser };
