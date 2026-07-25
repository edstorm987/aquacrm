// Tenancy aliases. Mirrors `04-the-final-portal/portal/src/server/types.ts`
// (T1's foundation). When the foundation lands, swap to importing the
// canonical types directly.

export type AgencyId = string;
export type ClientId = string;
export type EndCustomerId = string;
export type UserId = string;
export type PluginId = string;

// Pre-Aqua stages kept for back-compat; the six "aqua-*" entries are
// the canonical Aqua Incubator 3.0 progression (chapter #59 §5).
export type ClientStage =
  | "lead"
  | "discovery"
  | "design"
  | "development"
  | "onboarding"
  | "live"
  | "churned"
  | "aqua-epic-intro"
  | "aqua-blueprint"
  | "aqua-diagnostics"
  | "aqua-brand-builder"
  | "aqua-traffic"
  | "aqua-mastery";

export type Role =
  | "agency-owner"
  | "agency-manager"
  | "agency-staff"
  | "client-owner"
  | "client-staff"
  | "freelancer"
  | "end-customer";

// `PortalRole` is the **variant surface** — which client-portal page a
// variant belongs to. Distinct from user `Role`. T3 owns the canonical
// definition at `@aqua/plugin-website-editor/lib/portalRole.ts`; this
// local mirror keeps the plugin tsc-clean standalone.
//
// **TODO** — replace with `import type { PortalRole } from "@aqua/plugin-website-editor/types"`
// once the chief commander wires the integration.
export type PortalRole = "login" | "affiliates" | "orders" | "account";

export const PORTAL_ROLES: readonly PortalRole[] = [
  "login",
  "affiliates",
  "orders",
  "account",
] as const;

export interface BrandKit {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
  borderRadius?: string;
  customCSS?: string;
}

export type EntityStatus = "active" | "suspended" | "archived";

export interface Agency {
  id: AgencyId;
  name: string;
  slug: string;
  brand: BrandKit;
  ownerEmail?: string;
  status: EntityStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Client {
  id: ClientId;
  agencyId: AgencyId;
  name: string;
  slug: string;
  brand: BrandKit;
  stage: ClientStage;
  ownerEmail?: string;
  websiteUrl?: string;
  status: EntityStatus;
  createdAt: number;
  updatedAt: number;
}

// Composite scope used for plugin install records.
//
// `clientId === undefined` means the install is agency-wide. Most plugins
// (E-commerce, Website Editor) install per-client; agency-wide installs
// (Fulfillment, agency-internal HR) live at the agency scope.
export interface PluginInstallScope {
  agencyId: AgencyId;
  clientId?: ClientId;
}

export interface PluginInstall {
  id: string;                    // `${agencyId}|${clientId ?? "_agency"}|${pluginId}`
  pluginId: PluginId;
  agencyId: AgencyId;
  clientId?: ClientId;
  enabled: boolean;
  config: Record<string, unknown>;
  features: Record<string, boolean>;
  setupAnswers?: Record<string, string>;
  installedAt: number;
  installedBy?: UserId;
  health?: { ok: boolean; message?: string };
  healthCheckedAt?: number;
}

// `PhaseDefinition` matches T1's foundation type exactly so manifests
// land cleanly. Stored as data — agencies can fork phase definitions.
export interface PhaseDefinition {
  id: string;
  agencyId: AgencyId;
  stage: ClientStage;
  label: string;
  description?: string;
  order: number;
  pluginPreset: PluginId[];
  portalVariantId?: string;       // T3-owned variant id (block tree lives in website-editor plugin)
  checklist: PhaseChecklistItem[];
}

export interface PhaseChecklistItem {
  id: string;
  label: string;
  visibility: "internal" | "client";
  done?: boolean;                 // template-default; canonical state lives in ChecklistProgress
}

// ─── Activity log ──────────────────────────────────────────────────────────

export type ActivityCategory =
  | "auth"
  | "tenant"
  | "plugin"
  | "phase"
  | "fulfillment"
  | "settings"
  | "system";

export interface ActivityEntry {
  id: string;
  ts: number;
  agencyId: AgencyId;
  clientId?: ClientId;
  actorUserId?: UserId;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}
