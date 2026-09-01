// Local copy of the AquaPlugin contract.
//
// **TODO** — byte-equivalent mirror of T1's canonical
// `04-the-final-portal/portal/src/plugins/_types.ts` (commit 16bc524).
// Keeps this plugin tsc-clean standalone. The chief commander's planned
// post-merge refactor replaces this file with a single re-export from
// the foundation.

import type { ComponentType, ReactNode } from "react";

// AgencyId/ClientId aligned 2026-08-28: this module typed them as bare `string`
// while twelve others used the branded aliases its own tenancy.ts already
// exports. Same underlying type, but one name per concept.
import type { AgencyId, ClientId, PluginInstall, Role } from "./tenancy";

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
  | "fulfillment"
  | "growth";

export type PluginStatus = "stable" | "beta" | "alpha";
// Aligned 2026-08-28. This module was the only one of the thirteen typing
// plugin visibility as `Role[]` (from ./tenancy) while the other twelve used
// `PluginRoleVisibility[]` — one concept under two names, and ecommerce's copy
// was also missing "lead", which the canonical `Role` in src/server/types.ts
// has always had. Same members as every other copy now.
export type PluginRoleVisibility =
  | "agency-owner"
  | "agency-manager"
  | "agency-staff"
  | "client-owner"
  | "client-staff"
  | "freelancer"
  | "end-customer"
  | "lead";


export type PlanId = "free" | "starter" | "pro" | "enterprise";

// ─── Runtime context handed to plugin lifecycle hooks ─────────────────────
//
// Mirrors T1's canonical `PluginCtx` exactly: `{ agencyId, clientId?,
// install, storage }`. No `services` container — the foundation passes
// its services in via a separate adapter (see `src/server/foundationAdapter.ts`).

export interface PluginCtx {
  agencyId: AgencyId;
  clientId?: ClientId;
  install: PluginInstall;
  storage: PluginStorage;
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  runExclusive?<T>(key: string, operation: () => Promise<T>): Promise<T>;
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
  // `string`, matching the canonical `NavItem` in runtime/_types.ts — NOT the
  // local `PanelId` union.
  //
  // This module was the only one of thirteen narrowing the field to a union,
  // and that union is missing values the system actually uses: "customer" (the
  // end-customer surface) plus the plugin-specific panels the validator knows
  // about ("agency-finance", "agency-hr", "growth", "operations" …). The
  // runtime types this `string` deliberately — `_validate.ts` says so — because
  // plugin panels are still in flight, and it WARNS on an unknown id rather
  // than failing the build.
  //
  // Aligned 2026-08-28. A narrower type here could not express a nav item the
  // rest of the system considers valid.
  panelId?: string;
  groupId?: string;
  roles?: PluginRoleVisibility[];
}

// ─── Admin pages ──────────────────────────────────────────────────────────

export interface PluginPage {
  path: string;
  component: () => Promise<{ default: ComponentType<PluginPageProps> }>;
  requiresFeature?: string;
  title?: string;
  roles?: PluginRoleVisibility[];
}

export interface PluginPageProps {
  agencyId: AgencyId;
  clientId?: ClientId;
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
  roles?: PluginRoleVisibility[];
  /**
   * Anonymous route. The host dispatcher still resolves an exact enabled
   * install from the URL scope; only the session/role gate is skipped.
   * Keep this off admin routes and expose a deliberately narrow storefront
   * facade instead.
   */
  public?: boolean;
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

export interface SettingsFieldVaultTarget {
  // An integrations-catalogue provider id (e.g. "stripe"). Plain string so this
  // vendored copy stays standalone-tsc-clean; the host validates it for real.
  provider: string;
  // The catalogue field id the value is stored under (e.g. "secretKey").
  field: string;
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
  // WHERE a `password` field's value is stored. Required for every password
  // field — `install.config` reaches the browser through page props, so a
  // secret must go to the encrypted integrations vault instead.
  secretVault?: SettingsFieldVaultTarget;
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

/**
 * Who is being erased — supplied to `onEraseClient` so a hook does not have to
 * re-derive it through its own tenant port.
 *
 * Added to this copy 2026-08-28. It was already in the canonical contract and
 * in four other modules; this module's vendored signature took only
 * `(ctx, clientId)`, so its hook could not receive the subject the runtime
 * ALREADY passes (`clientErasure.ts:457`).
 *
 * That mattered beyond tidiness: this module's hook matches rows by
 * `clientId`, and the canonical comment says the subject exists for data that
 * "predates the client existing at all". A row belonging to the same person but
 * not carrying this `clientId` cannot be found by id — and until now the type
 * offered no other way to find it.
 */
export interface ErasureSubject {
  /** Every address the client workspace knows for this person, lowercased. */
  emails: string[];
  /** The client's display name at erasure time (for matching by name). */
  name?: string;
  /** The client record's metadata — leadId / contactId / linkedContacts / … */
  metadata: Record<string, unknown>;
}

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
  // Erasure disposition — "retain" excludes this plugin's client data from the
  // client-erasure sweep (legal hold). Default "delete". See clientErasure.ts.
  dataDisposition?: "delete" | "retain";

  plans?: PlanId[];
  requires?: string[];
  conflicts?: string[];

  onInstall?: (ctx: PluginCtx, setupAnswers: Record<string, string>) => Promise<void>;
  onUninstall?: (ctx: PluginCtx) => Promise<void>;
  // Right-to-be-forgotten. Strips the subject's PII from this plugin's records
  // while keeping the de-identified financial shell (legal hold). Takes
  // precedence over `dataDisposition`. See clientErasure.ts.
  onEraseClient?: (ctx: PluginCtx, clientId: string, subject?: ErasureSubject) => Promise<void>;
  onEnable?: (ctx: PluginCtx) => Promise<void>;
  onDisable?: (ctx: PluginCtx) => Promise<void>;
  onConfigure?: (ctx: PluginCtx) => Promise<void>;

  setup?: SetupStep[];
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
