// Foundation port contracts.
//
// Mirrors T2's `plugins/fulfillment/src/server/ports.ts` — these are the
// interfaces T1's foundation will bind at boot. T3 only **consumes** these
// via `PluginCtx.services`; T3 does NOT implement them. (T3 exports
// `applyStarterVariant` from `./portalVariants.ts` — the foundation
// adapter wraps that into the `PortalVariantPort` shape T2 calls.)
//
// Kept here so `aquaPluginTypes.ts` (which references them in
// `PluginServices`) stays tsc-clean standalone.

import type {
  ActivityEntry,
  ActivityCategory,
  AgencyId,
  Client,
  ClientId,
  ClientStage,
  PhaseDefinition,
  PluginInstall,
  PluginInstallScope,
  Role,
  UserId,
  BrandKit,
  EntityStatus,
} from "../lib/tenancy";

// ─── Client store ──────────────────────────────────────────────────────────

export interface CreateClientInput {
  name: string;
  slug?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stage?: ClientStage;
  brand?: Partial<BrandKit>;
}

export interface UpdateClientPatch {
  name?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  brand?: Partial<BrandKit>;
  status?: EntityStatus;
  stage?: ClientStage;
}

export interface ClientStorePort {
  createClient(agencyId: AgencyId, input: CreateClientInput): Promise<Client> | Client;
  getClient(id: ClientId): Promise<Client | null> | Client | null;
  getClientForAgency(agencyId: AgencyId, clientId: ClientId): Promise<Client | null> | Client | null;
  listClients(agencyId: AgencyId): Promise<Client[]> | Client[];
  updateClient(agencyId: AgencyId, clientId: ClientId, patch: UpdateClientPatch): Promise<Client | null> | Client | null;
}

// ─── Plugin install store ──────────────────────────────────────────────────

export interface UpsertPluginInstallInput {
  pluginId: string;
  scope: PluginInstallScope;
  enabled: boolean;
  config: Record<string, unknown>;
  features: Record<string, boolean>;
  setupAnswers?: Record<string, string>;
  installedBy?: UserId;
}

export interface PluginInstallPatch {
  enabled?: boolean;
  config?: Record<string, unknown>;
  features?: Record<string, boolean>;
  setupAnswers?: Record<string, string>;
}

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
  listInstalledFor(scope: PluginInstallScope): Promise<PluginInstall[]> | PluginInstall[];
  listInstalledForClientOnly(scope: PluginInstallScope): Promise<PluginInstall[]> | PluginInstall[];
  upsertInstall(input: UpsertPluginInstallInput): Promise<PluginInstall> | PluginInstall;
  patchInstall(scope: PluginInstallScope, pluginId: string, patch: PluginInstallPatch): Promise<PluginInstall | null> | PluginInstall | null;
  deleteInstall(scope: PluginInstallScope, pluginId: string): Promise<boolean> | boolean;
}

// ─── Plugin runtime ────────────────────────────────────────────────────────

export interface PluginRuntimePort {
  installPlugin(args: {
    pluginId: string;
    scope: PluginInstallScope;
    installedBy?: UserId;
    setupAnswers?: Record<string, string>;
    featureOverrides?: Record<string, boolean>;
    configOverrides?: Record<string, unknown>;
  }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }>;

  setEnabled(args: {
    pluginId: string;
    scope: PluginInstallScope;
    enabled: boolean;
    actor?: UserId;
  }): Promise<{ ok: true; install: PluginInstall } | { ok: false; error: string }>;

  uninstallPlugin(args: {
    pluginId: string;
    scope: PluginInstallScope;
    actor?: UserId;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
}

// ─── Plugin registry ───────────────────────────────────────────────────────

export interface PluginRegistryEntry {
  id: string;
  name: string;
  version: string;
  status: "stable" | "beta" | "alpha";
  category: "core" | "content" | "commerce" | "marketing" | "support" | "ops";
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

// ─── Activity log ──────────────────────────────────────────────────────────

export interface LogActivityInput {
  agencyId: AgencyId;
  clientId?: ClientId;
  actorUserId?: UserId;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
  limit?: number;
}

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): Promise<ActivityEntry> | ActivityEntry;
  listActivity(filter: ListActivityFilter): Promise<ActivityEntry[]> | ActivityEntry[];
}

// ─── Event bus ─────────────────────────────────────────────────────────────

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
  | "page.published"
  | "page.created"
  | "variant.applied";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: EventName,
    payload: T,
  ): void;
}

// ─── Portal variants ───────────────────────────────────────────────────────
//
// **CONTRACT NOTE**: T2's `plugins/fulfillment/src/server/ports.ts:204`
// types `role: Role` (user role). The semantically correct type is
// `PortalRole` ("login" | "affiliates" | "orders" | "account") — see
// `../lib/portalRole.ts`. T3 implements with PortalRole. The foundation
// adapter narrows accordingly. Commander to nudge T2 to swap their port
// type to `import type { PortalRole } from "@aqua/plugin-website-editor/types"`.

export interface PortalVariantPort {
  applyStarterVariant(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    role: import("../lib/portalRole").PortalRole;
    variantId: string;
    actor?: UserId;
  }): Promise<{ ok: true; variantId: string; pageId: string; siteId: string } | { ok: false; error: string }>;
}

// ─── Phase store ──────────────────────────────────────────────────────────

export interface PhaseStorePort {
  listPhasesForAgency(agencyId: AgencyId): Promise<PhaseDefinition[]> | PhaseDefinition[];
  getPhase(id: string): Promise<PhaseDefinition | null> | PhaseDefinition | null;
  upsertPhase(phase: PhaseDefinition): Promise<PhaseDefinition> | PhaseDefinition;
  deletePhase(id: string): Promise<boolean> | boolean;
}
