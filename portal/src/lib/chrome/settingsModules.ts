// Which modules can be configured from the agency Settings hub.
//
// Ed, 2026-08-29: *"bring it all into settings rather than taking us out of
// settings, so I can do it all inside."*
//
// ── Why this is a list and not "every installed module" ───────────────────
//
// Four of the eight modules that declare `settings.groups` are
// `scopePolicy: "client"` — `client-crm`, `affiliates`, `ecommerce` and
// `memberships`. Their settings belong to a CLIENT: that client's own Stripe
// keys, their own segments, their own membership tiers. There is no single
// agency-level value to edit.
//
// Rendering them here would show one client's credentials under a heading that
// says "your settings", or — worse — write agency-scoped values that the
// client-scoped read path never looks at, so the form would save successfully
// and change nothing. That is the exact "declared, never consumed" shape this
// codebase keeps finding, and it would be holding Stripe keys.
//
// So: agency-scoped modules are edited here. Client-scoped ones are edited in
// the client workspace, where the scope is unambiguous.

/**
 * Agency-scoped modules that declare `settings.groups`, each with the label it
 * should wear in the settings rail.
 *
 * Ed, 2026-08-29: *"I don't want to see things like finance stuff not in
 * finance."* Stacking all four under one "Modules" heading made Agency Finance
 * settings something you found by scrolling a page called something else. Each
 * gets its own row, named for the thing it configures — so looking for finance
 * settings means clicking "Finance".
 */
export const AGENCY_SCOPED_SETTINGS_MODULES = [
  { pluginId: "agency-finance", label: "Finance" },
  { pluginId: "agency-hr", label: "Staff & HR" },
  { pluginId: "agency-marketing", label: "Marketing" },
  { pluginId: "email-sender", label: "Email sending" },
] as const;

/** Just the ids, for the server read. */
export const AGENCY_SCOPED_SETTINGS_MODULE_IDS =
  AGENCY_SCOPED_SETTINGS_MODULES.map(entry => entry.pluginId);

/** Client-scoped modules, named so the hub can say where they ARE edited. */
export const CLIENT_SCOPED_SETTINGS_MODULES = [
  "client-crm",
  "affiliates",
  "ecommerce",
  "memberships",
] as const;
