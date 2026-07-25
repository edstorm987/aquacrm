// Tenancy aliases — vendored mirror of T1's `04-the-final-portal/portal/src/server/types.ts`.
//
// Same approach as the fulfillment plugin (Round 1): keep the plugin
// tsc-clean standalone by mirroring the types we need. The chief
// commander's planned post-merge refactor swaps these for a single
// `import * from "@/server/types"` once the foundation tsconfig path
// aliases are exposed to plugin builds.

export type AgencyId = string;
export type ClientId = string;
export type EndCustomerId = string;
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

export type ClientStage =
  | "lead"
  | "discovery"
  | "design"
  | "development"
  | "onboarding"
  | "live"
  | "churned";

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

export type ActivityCategory =
  | "auth"
  | "tenant"
  | "plugin"
  | "phase"
  | "fulfillment"
  | "settings"
  | "system"
  | "ecommerce";              // ecommerce-scoped activity entries

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
