// Tenancy aliases vendored from the portal so the plugin tsc-cleans
// standalone. Mirrors the other Aqua plugins.

export type AgencyId = string;
export type ClientId = string;
export type UserId = string;
export type PluginId = string;

export type Role =
  | "agency-owner" | "agency-manager" | "agency-staff"
  | "client-owner" | "client-staff" | "freelancer" | "end-customer"
  // Added 2026-08-28. The canonical `Role` in src/server/types.ts has always
  // had eight members; every module copy had seven, so a plugin could not
  // represent a lead at all — while bos-auth-gate and public-funnel are
  // lead-facing surfaces. Widened: nothing maps Role exhaustively.
  | "lead";

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

export type ActivityCategory =
  | "auth" | "tenant" | "plugin" | "phase"
  | "fulfillment" | "ecommerce" | "settings" | "system"
  | "hr" | "memberships" | "affiliates" | "finance" | "marketing" | "crm"
  | "forms" | "email" | "export" | "kanban" | "sops" | "onboarding"
  | "reports" | "feedback" | "public-funnel" | "bos-auth-gate";

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
