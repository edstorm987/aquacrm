// Foundation port contracts.
//
// The fulfillment plugin reaches into T1's foundation only via these
// interfaces. T1 binds concrete implementations (`portal/src/server/*`)
// at boot and passes them as `PluginCtx.services` to handlers and as
// `PluginPageProps.services` to pages.
//
// Keeping the surface explicit:
//   - lets the plugin tsc-clean standalone (no foundation import)
//   - makes the integration point obvious for the chief commander
//   - keeps tests trivial (services can be hand-mocked)
//
// Each port mirrors a slice of T1's `04-the-final-portal/portal/src/server/*`.
// The shapes are aligned to what T1 has already shipped (commit 032100c).

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  ClientStage,
  PhaseDefinition,
  PluginInstall,
  PluginInstallScope,
  UserId,
  PortalRole,
  BrandKit,
  EntityStatus,
} from "../lib/tenancy";

// ─── Client store (CRUD on Client rows, agency-scoped) ────────────────────

export interface CreateClientInput {
  name: string;
  slug?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stage?: ClientStage;
  brand?: Partial<BrandKit>;
  metadata?: Record<string, unknown>;
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

// ─── Plugin install store (CRUD on PluginInstall rows) ────────────────────

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

// ─── Plugin runtime (lifecycle hooks) ─────────────────────────────────────
//
// The runtime wraps install / uninstall / enable / disable with the
// plugin's lifecycle hooks (`onInstall`, etc.). T2 calls into this for
// phase transitions so hooks fire correctly.

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

// ─── Plugin registry (build-time list of all plugins) ─────────────────────

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
//
// Aligned with T1's `eventBus.ts` vocabulary. T2 emits a subset
// (`phase.advanced`, `phase.checklist_item_completed`, `client.created`,
//  `client.stage_changed`).

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
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: EventName,
    payload: T,
  ): void;
}

// ─── Portal variants (T3's website-editor plugin) ─────────────────────────
//
// Aligned with T3's `applyStarterVariant` (commit landing alongside this
// one). The success shape includes `pageId` + `siteId` so the foundation
// can hyperlink directly to the editor page that was applied.
//
// **TODO** — swap `PortalRole` import once the chief commander integrates
// the plugins; currently mirrored at `lib/tenancy.ts` to keep tsc-clean
// standalone.

export interface PortalVariantPort {
  applyStarterVariant(args: {
    clientId: ClientId;
    agencyId: AgencyId;
    role: PortalRole;
    variantId: string;
    actor?: UserId;
  }): Promise<
    | { ok: true; variantId: string; pageId?: string; siteId?: string }
    | { ok: false; error: string }
  >;
}

// ─── Phase store (T2 ships, foundation references) ───────────────────────
//
// `PhaseDefinition` rows are managed by this plugin but read by foundation
// chrome (e.g. the topbar showing "Phase: Onboarding"). T1's
// `portal/src/server/phases.ts` exposes read-only helpers that trampoline
// into the storage that T2 owns. Here we declare the shape T2 needs to
// read/write.

export interface PhaseStorePort {
  listPhasesForAgency(agencyId: AgencyId): Promise<PhaseDefinition[]> | PhaseDefinition[];
  getPhase(id: string): Promise<PhaseDefinition | null> | PhaseDefinition | null;
  upsertPhase(phase: PhaseDefinition): Promise<PhaseDefinition> | PhaseDefinition;
  deletePhase(id: string): Promise<boolean> | boolean;
}
