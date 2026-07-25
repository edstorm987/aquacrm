// `PortalRole` is the *variant* role — which client-portal surface a page
// belongs to. Distinct from user `Role` ("agency-owner" / "client-owner" /
// ...). T3 owns this type; T2's fulfillment plugin imports it via
// `@aqua/plugin-website-editor/types` (post-integration).
//
// Each `(siteId, role)` may have many EditorPage variants but exactly zero
// or one with `isActivePortal=true` — the customer-facing route renders
// that one.

export type PortalRole = "login" | "affiliates" | "orders" | "account";

export const PORTAL_ROLES: readonly PortalRole[] = [
  "login",
  "affiliates",
  "orders",
  "account",
] as const;

export function isPortalRole(value: unknown): value is PortalRole {
  return (
    typeof value === "string" &&
    (PORTAL_ROLES as readonly string[]).includes(value)
  );
}

export function portalRoleLabel(role: PortalRole): string {
  switch (role) {
    case "login":
      return "Login";
    case "affiliates":
      return "Affiliates";
    case "orders":
      return "Orders";
    case "account":
      return "Account";
  }
}
