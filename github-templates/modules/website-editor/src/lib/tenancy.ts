// Tenancy aliases. Mirrors T2's `plugins/fulfillment/src/lib/tenancy.ts`
// which itself mirrors `04-the-final-portal/portal/src/server/types.ts`
// (T1's foundation). When the foundation lands and T2 swaps to canonical
// imports, T3 swaps too in lockstep.

export type AgencyId = string;
export type ClientId = string;
export type EndCustomerId = string;
export type UserId = string;
export type PluginId = string;

export type ClientStage =
  | "lead"
  | "discovery"
  | "design"
  | "development"
  | "onboarding"
  | "live"
  | "churned";

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

  // R011 — extended brand-kit fields per requirements §5. All
  // optional. Foundation `BrandKit` doesn't carry these yet; the
  // website-editor's `extendedBrandToCss` reads them off `Agency.brand`
  // via this vendored type and emits CSS vars when present.
  bg?: string;             // page background
  bgElevated?: string;     // card / panel background
  text?: string;           // body text colour
  textMuted?: string;      // secondary copy / captions
  border?: string;         // hairline border default
  radiusSm?: string;
  radiusMd?: string;       // alias / superset of `borderRadius`
  radiusLg?: string;
  darkMode?: boolean;      // palette hint
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

// `PhaseDefinition` matches T1's foundation type. Stored as data (not
// hardcoded) so agencies can fork phase definitions. Imported here so
// `server/ports.ts` (which mirrors T2's port shapes) stays tsc-clean.
export interface PhaseDefinition {
  id: string;
  agencyId: AgencyId;
  stage: ClientStage;
  label: string;
  description?: string;
  order: number;
  pluginPreset: PluginId[];
  portalVariantId?: string;
  checklist: PhaseChecklistItem[];
}

export interface PhaseChecklistItem {
  id: string;
  label: string;
  visibility: "internal" | "client";
  done?: boolean;
}

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
