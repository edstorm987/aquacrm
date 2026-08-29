// Settings a module offers that nothing reads back.
//
// ── The measurement ──────────────────────────────────────────────────────
//
// Swept on 2026-08-28: the thirteen modules declare **51 settings fields**, and
// **25 of them are referenced exactly once in the entire repository — by the
// manifest line that declares them.** Nothing reads the saved value. The value
// is collected, validated, stored, and never consulted.
//
// That is the "no masks" failure in its purest form. Every other gap this
// codebase has labelled — funnels with no API, palette blocks with no renderer,
// an editor's fake `verifyDomain` — at least LOOKED inert. A settings field
// does the opposite: it accepts your input, saves without error, and shows your
// value back to you on reload. There is no way to tell it apart from one that
// works, and two of these are shaped like safety controls:
//
//   • `public-funnel / issueSessionCookie` (default **true**) reads as "do not
//     issue a session on lead capture". Turning it off changes nothing.
//   • `agency-hr / canStaffEdit` (default false) reads as an edit permission.
//     The REAL permission is enforced by the access kernel, so nothing is
//     actually open — but an operator reading this panel would reasonably
//     believe they had just changed something, and they had not.
//
// ── Why label rather than delete or implement ────────────────────────────
//
// Deleting 25 fields would throw away the record of what each module intended
// to be configurable. Implementing them is 25 separate product decisions —
// what SHOULD `advanceRequiresAllTasks` do when a task is optional? — and
// guessing at any of them re-creates the mask one layer down.
//
// So the panel says so, at the field, in the place the promise is made. This is
// the same answer `FEATURE_BACKEND_GAPS` and `blockBackends.ts` already give,
// applied to settings. Shrink the list by wiring a field, never by hiding it.
//
// Pinned by `scripts/smoke-unwired-settings.test.ts`, which re-derives the set
// from source and fails when this list and the code disagree in EITHER
// direction — a newly-unwired field, or one that is now read and should have
// been removed from here.

export interface UnwiredSetting {
  pluginId: string;
  fieldId: string;
}

/** Key used by the lookup, and by the test that re-derives this set. */
export const unwiredKey = (pluginId: string, fieldId: string): string => `${pluginId}/${fieldId}`;

/**
 * Every declared settings field whose saved value nothing reads.
 *
 * Ordered by module, then by the order they appear in that manifest, so a diff
 * against a fresh sweep reads cleanly.
 */
export const UNWIRED_SETTINGS: readonly UnwiredSetting[] = [
  { pluginId: "affiliates", fieldId: "autoApproveAfterDays" },
  { pluginId: "agency-finance", fieldId: "expenseApprovalThresholdCents" },
  { pluginId: "agency-hr", fieldId: "leaveAutoRestoreDays" },
  { pluginId: "agency-hr", fieldId: "defaultPtoDaysPerYear" },
  { pluginId: "agency-hr", fieldId: "canStaffEdit" },
  { pluginId: "agency-marketing", fieldId: "defaultLeadAssignee" },
  { pluginId: "agency-marketing", fieldId: "autoSendOnTemplate" },
  { pluginId: "client-crm", fieldId: "autoCreateOnSignup" },
  { pluginId: "ecommerce", fieldId: "stripePublishableKey" },
  { pluginId: "ecommerce", fieldId: "lowStockThreshold" },
  { pluginId: "fulfillment", fieldId: "defaultStage" },
  { pluginId: "fulfillment", fieldId: "advanceRequiresAllTasks" },
  { pluginId: "fulfillment", fieldId: "notifyOnAdvance" },
  { pluginId: "fulfillment", fieldId: "notifyClientOnAdvance" },
  { pluginId: "leads-pipeline", fieldId: "defaultLeadSource" },
  { pluginId: "leads-pipeline", fieldId: "newColumnLabel" },
  { pluginId: "memberships", fieldId: "billingPortalReturnUrl" },
  { pluginId: "memberships", fieldId: "memberPortalHeading" },
  { pluginId: "memberships", fieldId: "showAnnualToggle" },
  { pluginId: "public-funnel", fieldId: "redirectAfterCapture" },
  { pluginId: "public-funnel", fieldId: "issueSessionCookie" },
  { pluginId: "website-editor", fieldId: "githubRepo" },
  { pluginId: "website-editor", fieldId: "githubBranch" },
  { pluginId: "website-editor", fieldId: "defaultThemeVariant" },
  { pluginId: "website-editor", fieldId: "defaultStarterId" },
];

const LOOKUP = new Set(UNWIRED_SETTINGS.map(entry => unwiredKey(entry.pluginId, entry.fieldId)));

/** Does this field save a value nothing will ever read? */
export function isSettingUnwired(pluginId: string, fieldId: string): boolean {
  return LOOKUP.has(unwiredKey(pluginId, fieldId));
}

/**
 * What the panel says. Deliberately plain, and deliberately not an apology:
 * the operator needs to know their input will not take effect, and nothing
 * else.
 */
export const UNWIRED_SETTING_NOTICE =
  "Saved, but not yet connected — nothing reads this value, so changing it will not affect anything.";
