import type { Role } from "@/server/types";

export const AGENCY_SETTINGS_MANAGER_ROLES = ["agency-owner", "agency-manager"] as const satisfies readonly Role[];

export interface AgencySettingsCapabilities {
  manageSettings: boolean;
  manageTeam: boolean;
  viewActivityLog: boolean;
  manageExternalAi: boolean;
}

export function getAgencySettingsCapabilities(role: Role): AgencySettingsCapabilities {
  const canManage = AGENCY_SETTINGS_MANAGER_ROLES.some(allowedRole => allowedRole === role);
  return {
    manageSettings: canManage,
    manageTeam: canManage,
    viewActivityLog: canManage,
    manageExternalAi: canManage,
  };
}

export function canUseAgencySettingsCapability(
  role: Role,
  capability: keyof AgencySettingsCapabilities,
): boolean {
  return getAgencySettingsCapabilities(role)[capability];
}
