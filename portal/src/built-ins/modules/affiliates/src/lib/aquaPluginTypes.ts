// Vendored AquaPlugin contract — same byte-equivalent mirror that
// fulfillment / ecommerce / agency-hr / memberships ship. Orchestrator
// unifies via a one-line re-export later.

import type { ComponentType, ReactNode } from "react";

import type { AgencyId, ClientId, PluginInstall, UserId } from "./tenancy";

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
// Renamed from `ScopePolicy` 2026-08-28 to match the canonical name in
// src/built-ins/runtime/_types.ts. Ten copies used the short name, one used
// the canonical — and the majority was the divergent side.
export type PluginScopePolicy = "agency" | "client" | "either";

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
  /** Serialize and durably flush a logical operation across application processes. */
  runExclusive?<T>(key: string, operation: () => Promise<T>): Promise<T>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

// Affiliates consumes: tenant, user, activity, events, ecommerceOrders.
// Other slots are unknown.
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
  ecommerceOrders: EcommerceOrdersPort;
}

import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "../server/ports";

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

export type PluginRoleVisibility =
  | "agency-owner" | "agency-manager" | "agency-staff"
  | "client-owner" | "client-staff" | "freelancer" | "end-customer"
  // Added 2026-08-28: the canonical `Role` in src/server/types.ts has always
  // had "lead", and two modules (bos-auth-gate, public-funnel) already listed
  // it. Ten copies did not, so the same union meant two things.
  | "lead";
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

export interface PluginPage {
  path: string;
  component: () => Promise<{ default: ComponentType<PluginPageProps> }>;
  requiresFeature?: string;
  title?: string;
  // ACCESS CONTROL, not decoration. The host reads this through
  // `pluginPageAllowedRoles(page)` and 404s before the component is even
  // imported — so a page left undeclared is reachable by URL to anyone the
  // scope gate lets in, whatever the sidebar shows. Declare it on every page
  // whose nav entry is narrower than the plugin's widest nav entry;
  // `smoke-finance-section-gates.test.ts` fails the build otherwise.
  visibleToRoles?: PluginRoleVisibility[];
  roles?: PluginRoleVisibility[];
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

export interface PluginApiRoute {
  path: string;
  methods: ("GET" | "POST" | "PATCH" | "PUT" | "DELETE")[];
  handler: (req: Request, ctx: PluginCtx) => Promise<Response>;
  requiresFeature?: string;
  visibleToRoles?: PluginRoleVisibility[];
  public?: boolean;
}

export interface SettingsSchema { customPage?: boolean; groups: SettingsGroup[]; }
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
export interface PluginFeature {
  id: string;
  label: string;
  description?: string;
  default: boolean;
  requires?: string[];
}

export interface BlockDescriptor {
  id: string;
  label: string;
  description?: string;
  category?: string;
  defaultProps?: Record<string, unknown>;
}

export interface HealthStatus {
  ok: boolean;
  message?: string;
  components?: Record<string, { ok: boolean; message?: string }>;
}

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
  scopePolicy?: PluginScopePolicy;
  // Erasure disposition — "retain" excludes this plugin's client data from the
  // client-erasure sweep (legal hold). Default "delete". See clientErasure.ts.
  dataDisposition?: "delete" | "retain";
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
  storefront?: { blocks: BlockDescriptor[] };
  settings: SettingsSchema;
  features: PluginFeature[];
  healthcheck?: (ctx: PluginCtx) => Promise<HealthStatus>;
}
