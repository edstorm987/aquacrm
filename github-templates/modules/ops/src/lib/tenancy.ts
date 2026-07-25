// Tenancy aliases mirrored from `04-the-final-portal/portal/src/server/types.ts`
// (T1's foundation). Vendored to keep the plugin tsc-clean standalone —
// the chief commander rewrites this to a re-export once T1 publishes the
// canonical types from the portal package. Same shape as agency-hr.

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

// Activity log — domains writes flow under "settings" until the
// foundation extends ActivityCategory with "domains" (a one-line patch).
export type ActivityCategory =
  | "auth"
  | "tenant"
  | "plugin"
  | "phase"
  | "fulfillment"
  | "ecommerce"
  | "settings"
  | "system"
  | "domains";

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
