import type { PortalRole } from "./portalRole";

export type ThemeAppearance = "light" | "dark" | "auto";

const LOGIN_STARTERS = ["login-default", "login-onboarding", "login-design"] as const;

const ROLE_STARTERS: Partial<Record<PortalRole, string>> = {
  login: "login-default",
  affiliates: "affiliates-default",
  orders: "orders-default",
  account: "account-default",
};

/**
 * Resolve the manifest's light/dark/system vocabulary to the theme record's
 * light/dark/auto vocabulary. Invalid legacy config falls back to light, the
 * manifest default, rather than creating a theme with an impossible value.
 */
export function defaultThemeAppearance(config: Record<string, unknown>): ThemeAppearance {
  const configured = config.defaultThemeVariant;
  if (configured === "dark") return "dark";
  if (configured === "system") return "auto";
  return "light";
}

/**
 * Pick the starter used when a portal-variant create request omits both an
 * explicit block tree and an explicit starter. The configurable choice is
 * deliberately login-only because those are the only three options the
 * manifest offers. Other supported portal roles keep their own canonical
 * starter instead of receiving a login tree.
 */
export function defaultPortalStarterId(
  config: Record<string, unknown>,
  role: PortalRole,
): string | null {
  if (role === "login") {
    const configured = config.defaultStarterId;
    if (typeof configured === "string" && (LOGIN_STARTERS as readonly string[]).includes(configured)) {
      return configured;
    }
  }
  return ROLE_STARTERS[role] ?? null;
}
