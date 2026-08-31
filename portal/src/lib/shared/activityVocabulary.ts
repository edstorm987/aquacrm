// Shared activity vocabulary (todo:960).
//
// `listActivity()` stores internal engineering wording — "plugin installed",
// `fulfillment.phase.enabled`, category `tenant`. These surfaces render that
// one feed and all source their wording here:
//   • /portal/agency/activity-inbox   (standalone Activity log)
//   • the agency dashboard "Today across the agency" feed
//   • the Master Inbox "Updates" tab
//   • the client workspace "recent movement" panel
// They each used to carry their own copy of the rewrite (or none at all), so
// the same event read "plugin installed" on one surface and "system activated"
// on another. These helpers are the single source of that product wording —
// import them, never re-declare the regexes at a render site.
//
// NOT yet routed through here, and therefore still showing internal wording:
//   • `src/lib/server/clients/clientRecordLedger.ts` and the
//     `clientRecordLedgerEvents` block of the client workspace page, which
//     PERSIST `entry.message` / `entry.category` into ledger rows. Rewriting
//     those changes stored data, not just a render, so it is a separate call.
//   • category CHIP labels come from `categoryStyle()` in
//     `src/lib/chrome/activityCategoryStyle.ts`, a second live map that
//     disagrees with `activityCategory` below (`tenant` → "Business" there vs
//     "client" here). Reconciling the two is an open product-wording decision.
//
// Pure string work only, so both server components and client components can
// use it.

export function activityMessage(message: string): string {
  return message
    .replace(/\bcore plugin install\(s\)/gi, "core systems")
    .replace(/\bFulfillment plugin installed; phase defaults seeded\./gi, "Project pipeline ready; stages seeded.")
    .replace(/\bplugin installed\b/gi, "system activated")
    .replace(/\bplugins installed\b/gi, "systems activated")
    .replace(/\bWill install\b/gi, "Will activate")
    .replace(/\binstall\b/gi, "activate")
    .replace(/\bplugin\b/gi, "system");
}

export function activityCategory(category: string): string {
  if (category === "plugin") return "systems";
  if (category === "fulfillment") return "project work";
  if (category === "tenant") return "client";
  if (category === "telemetry") return "monitoring";
  return category.replace(/-/g, " ");
}

export function activityAction(action: string): string {
  return action
    .replace(/[._-]/g, " ")
    .replace(/\bplugin\b/gi, "system")
    .replace(/\bfulfillment\b/gi, "project work")
    .replace(/\btelemetry\b/gi, "monitoring")
    .replace(/\btenant\b/gi, "client")
    .replace(/\binstalled\b/gi, "activated")
    .replace(/\buninstalled\b/gi, "removed")
    .replace(/\bdisabled\b/gi, "turned off")
    .replace(/\benabled\b/gi, "turned on");
}
