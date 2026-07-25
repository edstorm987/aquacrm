// Tenancy aliases mirrored from `04-the-final-portal/portal/src/server/types.ts`.
// Vendored to keep the plugin tsc-clean standalone.

export type AgencyId = string;
export type ClientId = string;
export type UserId = string;
export type PluginId = string;

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
export type ClientStage = "lead" | "discovery" | "design" | "development" | "onboarding" | "live" | "churned";

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

// "affiliates" added — foundation needs a one-line ActivityCategory
// extension (see chapter §"Foundation pending" item #4).
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
  | "memberships"
  | "affiliates";

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

// Minimal end-customer projection — same shape memberships uses.
export interface EndCustomerProfile {
  id: UserId;
  email: string;
  name?: string;
  agencyId: AgencyId;
  clientId: ClientId;
}
