// Tenancy aliases mirrored from `04-the-final-portal/portal/src/server/types.ts`
// (T1's foundation). Vendored to keep the plugin tsc-clean standalone —
// the chief commander rewrites this to a re-export once T1 publishes the
// canonical types from the portal package.

export type AgencyId = string;
export type ClientId = string;
export type UserId = string;
export type PluginId = string;

// Mirrors the user-facing role enum that lives in the foundation. The HR
// staff record carries this so the directory and the agency-side
// permission system speak the same vocabulary.
export type Role =
  | "agency-owner"
  | "agency-manager"
  | "agency-staff"
  | "client-owner"
  | "client-staff"
  | "freelancer"
  | "end-customer";

export const AGENCY_ROLES: readonly Role[] = [
  "agency-owner",
  "agency-manager",
  "agency-staff",
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

// Composite scope used for plugin install records. Same shape as
// fulfillment + ecommerce ports use; HR is `scopePolicy: "agency"` so
// the install never has `clientId`.
export interface PluginInstallScope {
  agencyId: AgencyId;
  clientId?: ClientId;
}

export interface PluginInstall {
  id: string;
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

// ─── Activity log ──────────────────────────────────────────────────────────
//
// `ActivityCategory` is the canonical category the foundation accepts.
// Today's foundation enum is auth | tenant | plugin | phase | fulfillment
// | ecommerce | settings | system. HR writes flow under "system" until
// the foundation extends the enum with "hr" — the chapter calls this
// out as a one-line patch the orchestrator can land.

export type ActivityCategory =
  | "auth"
  | "tenant"
  | "plugin"
  | "phase"
  | "fulfillment"
  | "ecommerce"
  | "settings"
  | "system"
  | "hr";

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
