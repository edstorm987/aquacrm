// ThemeRecord — flat token-based theme.
//
// Faithful port of `02/src/portal/server/types.ts` ThemeTokens + ThemeRecord
// definitions. Tokens are emitted as `--theme-*` CSS variables by the
// EditorThemeInjector; both editor canvas and host PortalPageRenderer
// consume the same variable names so what you see in the canvas matches
// what visitors see live.

import type { AgencyId, ClientId } from "../lib/tenancy";

export interface ThemeTokens {
  // Palette
  primary?: string;
  surface?: string;
  surfaceAlt?: string;
  ink?: string;
  inkSoft?: string;
  border?: string;
  shadow?: string;
  // Typography
  fontHeading?: string;
  fontBody?: string;
  fontMono?: string;
  // Sizing
  radius?: string;
  spacingUnit?: string;
  // Free-form CSS
  customCss?: string;
}

export interface ThemeRecord {
  id: string;
  siteId: string;
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  description?: string;
  appearance?: "light" | "dark" | "auto";
  tokens: ThemeTokens;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateThemeInput {
  siteId: string;
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  description?: string;
  tokens?: ThemeTokens;
  isDefault?: boolean;
}

export interface UpdateThemePatch {
  name?: string;
  description?: string;
  tokens?: Partial<ThemeTokens>;
  isDefault?: boolean;
}
