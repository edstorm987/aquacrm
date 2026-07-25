// Tenancy aliases vendored from the portal so the plugin tsc-cleans
// standalone — mirrors the other Aqua plugins.

export type AgencyId = string;
export type ClientId = string;
export type UserId = string;
export type PluginId = string;

export type Role =
  | "agency-owner" | "agency-manager" | "agency-staff"
  | "client-owner" | "client-staff" | "freelancer" | "end-customer";

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

// Mirrors the foundation ActivityCategory union. Activity-inbox does
// not add a new category — it only reads.
export type ActivityCategory =
  | "auth" | "tenant" | "plugin" | "phase"
  | "fulfillment" | "ecommerce" | "settings" | "system"
  | "hr" | "memberships" | "affiliates" | "finance" | "marketing" | "crm"
  | "forms" | "email" | "export" | "kanban" | "sops";

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

export interface UserProfile {
  id: UserId;
  email: string;
  name?: string;
  agencyId: AgencyId;
  clientId?: ClientId;
}
