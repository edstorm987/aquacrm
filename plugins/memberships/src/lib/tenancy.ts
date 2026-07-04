// Tenancy aliases mirrored from `04-the-final-portal/portal/src/server/types.ts`
// (T1's foundation). Vendored to keep the plugin tsc-clean standalone —
// the orchestrator rewrites this to a re-export once T1 unifies the
// canonical types.

export type AgencyId = string;
export type ClientId = string;
export type UserId = string;
export type PluginId = string;
export type EndCustomerId = string;

export type Role =
  | "agency-owner"
  | "agency-manager"
  | "agency-staff"
  | "client-owner"
  | "client-staff"
  | "freelancer"
  | "end-customer";

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

export type ClientStage =
  | "lead"
  | "discovery"
  | "design"
  | "development"
  | "onboarding"
  | "live"
  | "churned";

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

// `ActivityCategory` includes "memberships" — the foundation's canonical
// enum at `portal/src/server/types.ts` will need a one-line union
// extension when this plugin gets wired in. Same pattern as ecommerce
// (chapter 24) and agency-hr (chapter 28).
export type ActivityCategory =
  | "auth"
  | "tenant"
  | "plugin"
  | "phase"
  | "fulfillment"
  | "ecommerce"
  | "settings"
  | "system"
  | "hr"
  | "memberships";

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

// End-customer user — minimal slice the plugin needs for billing UX.
// The foundation owns the full ServerUser shape; this is the
// memberships-side projection.
export interface EndCustomerProfile {
  id: UserId;
  email: string;
  name?: string;
  agencyId: AgencyId;
  clientId: ClientId;
}
