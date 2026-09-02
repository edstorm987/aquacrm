// Settings a module offers that nothing reads back.
//
// ── The measurement ──────────────────────────────────────────────────────
//
// Swept on 2026-08-28: the thirteen modules declare **51 settings fields**, and
// **25 of them are referenced exactly once in the entire repository — by the
// manifest line that declares them.** Nothing reads the saved value. The value
// is collected, validated, stored, and never consulted. (28 as of the two
// 2026-08-30 addenda at the end of this comment.)
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
//
// ── 2026-08-30: two more, uncovered by giving them an editor ──────────────
//
// `affiliates/payoutCadence` and `memberships/defaultTrialDays` were absent
// from the sweep because the modules' read-only Settings pages PRINTED them
// (`{install.config.payoutCadence ?? "monthly"}`). The detector is deliberately
// generous, and a printed value looks exactly like a consulted one to it.
// Replacing those read-only pages with the real editor removed the print, and
// the sweep immediately reported both — correctly. Nothing schedules payouts by
// cadence, and no plan is created with the install's trial length (the new-plan
// modal defaults to 0, `seedDefaults` hardcodes 7/14 days).
//
// They are listed rather than deleted for the reason above, and rather than
// guessed at because both are product decisions: what a cadence should DO with
// no payout scheduler, and whether an install default may silently change the
// trial length of a plan an operator is typing.
//
// ── 2026-08-30 (review): a third, hidden behind an id collision ───────────
//
// `leads-pipeline/fromName` was classified "read" for one reason only: the
// unrelated `lib/integrations/catalog.ts` declares an SMTP credential whose id
// also happens to be `fromName`, and the sweep's host-source check matches a
// quoted id anywhere. The leads-pipeline module contains **zero** occurrences of
// `install.config` or `ctx.install`, so it cannot read any of the three settings
// it declares — `defaultLeadSource` and `newColumnLabel` were already listed
// here, and `fromName` belongs with them.
//
// This mattered beyond the label: the collision was the sole evidence for the
// claim that `campaigns.fromName` is "read for real when a blast is composed",
// which was in turn the sole justification for giving leads-pipeline a row in
// the agency Settings hub. The row is withdrawn in `lib/chrome/settingsModules.ts`
// and the detector no longer counts a declaration catalogue as a reader.
//
// ── 2026-08-30 (review): and a fourth, hidden behind a comment ────────────
//
// `client-crm/customAttributeSchema` was classified "read" only because
// client-CRM's own Settings page carried the phrase `install.config.` + the
// field id in a COMMENT — prose telling the operator to hand-edit storage. No
// code reads it; the manifest's own help text says "v1 freeform; structured
// editor is future". Giving the field an editor (2026-08-30) turned a dead key
// into a live textarea that accepts JSON and ignores it, which is worse than the
// prose was — so it is labelled here.
//
// The sweep's guard-the-guard ("a field the module genuinely reads must not be
// reported unwired") used to be anchored on this field, i.e. on the comment. It
// is now anchored on `affiliates/defaultPayoutMethod`, which is read by real
// code in `affiliates/src/api/handlers.ts` when a payout is created.
//
// ─── 2026-09-01: Marketing becomes a complete settings family ──────────
//
// Agency Marketing now retains only `defaultCurrency`, whose saved value is
// consumed when a campaign omits an explicit currency. Its former
// `defaultLeadAssignee` and `autoSendOnTemplate` declarations were removed:
// neither lead creation nor template delivery read them. The registered
// Website Editor now retains two operational defaults and removes two GitHub
// controls whose publish transport is not implemented. Registered manifests
// now declare 45 fields; 22 are consumed and 23 remain named below.
// Fulfillment then connected its creation-stage default and checklist advance
// gate, and removed two notification toggles because the module has no delivery
// port behind them. Registered manifests now declare 43 fields; 24 are
// consumed and 19 remain named below.

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
  { pluginId: "affiliates", fieldId: "payoutCadence" },
  { pluginId: "agency-finance", fieldId: "expenseApprovalThresholdCents" },
  { pluginId: "agency-hr", fieldId: "leaveAutoRestoreDays" },
  { pluginId: "agency-hr", fieldId: "defaultPtoDaysPerYear" },
  { pluginId: "agency-hr", fieldId: "canStaffEdit" },
  { pluginId: "client-crm", fieldId: "autoCreateOnSignup" },
  { pluginId: "client-crm", fieldId: "customAttributeSchema" },
  { pluginId: "ecommerce", fieldId: "stripePublishableKey" },
  { pluginId: "ecommerce", fieldId: "lowStockThreshold" },
  { pluginId: "leads-pipeline", fieldId: "defaultLeadSource" },
  { pluginId: "leads-pipeline", fieldId: "newColumnLabel" },
  { pluginId: "leads-pipeline", fieldId: "fromName" },
  { pluginId: "memberships", fieldId: "billingPortalReturnUrl" },
  { pluginId: "memberships", fieldId: "defaultTrialDays" },
  { pluginId: "memberships", fieldId: "memberPortalHeading" },
  { pluginId: "memberships", fieldId: "showAnnualToggle" },
  { pluginId: "public-funnel", fieldId: "redirectAfterCapture" },
  { pluginId: "public-funnel", fieldId: "issueSessionCookie" },
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
