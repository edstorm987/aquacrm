/**
 * What to show when there is nothing to press.
 *
 * Plenty of alerts cannot be resolved on screen: chasing a client for a
 * decision, renewing insurance, waiting for somebody to sign in. Pointing a
 * ring at a control that does not exist is worse than saying nothing, and
 * "complete the action on this page" is a lie when the action happens
 * off-system.
 *
 * So for those, give the operator what they actually need to act: why it
 * fired, what the evidence is, and — most importantly — the observable thing
 * that will make it stop firing. Without that last part an alert with no
 * button reads as broken, and gets dismissed rather than dealt with.
 */

export interface ResolutionRecordLink {
  label: string;
  href: string;
}

/**
 * How this alert can actually be dealt with. The distinction matters because
 * the wrong promise wastes the operator's time:
 *
 * - `in-app`      there is a control on a screen that resolves it;
 * - `off-system`  the real work happens elsewhere (a call, a renewal, a
 *                 payment landing) and Aqua only records the outcome;
 * - `judgement`   there is no fix, only a business decision. "Income is low"
 *                 does not clear because you pressed something; it clears
 *                 because the business changed.
 *
 * Marking a judgement call as if it had a clearance condition is the most
 * misleading of the three: the operator hunts for a control that cannot exist.
 */
export type ResolutionKind = "in-app" | "off-system" | "judgement";

export interface ResolutionExplain {
  alertId: string;
  title: string;
  detail: string;
  /** Facts that support acting, especially away from the screen. */
  evidence: string[];
  kind: ResolutionKind;
  /** The observable condition that clears this alert. Absent for judgement. */
  clearsWhen?: string;
  /**
   * Plain English for an alert whose own wording is statistics or jargon.
   * "99 robust deviations from its retained median" means nothing to somebody
   * who did not write the check.
   */
  plainMeaning?: string;
  /** Whether the numbers behind it are too thin to trust. */
  weakEvidence?: string;
  /** Where the underlying records live. */
  records: ResolutionRecordLink[];
}

/**
 * What makes each alert family stop firing, and whether the work is on-screen.
 *
 * Written per family rather than per alert: the condition is a property of the
 * check, not of the individual record that tripped it.
 */
const CLEARS_WHEN: Array<[string, { clearsWhen: string; kind: ResolutionKind }]> = [
  ["source-unavailable:website-enquiries", {
    clearsWhen: "The website-enquiry source completes a successful read again.",
    kind: "off-system",
  }],
  ["enquiry-classification:", {
    clearsWhen: "This person is classified as something other than unclassified.",
    kind: "in-app",
  }],
  ["person-organisation:", {
    clearsWhen: "You confirm or reject the suggested company on their card.",
    kind: "in-app",
  }],
  ["invoice:", {
    clearsWhen: "The invoice is marked paid, voided, or a follow-up is recorded against it.",
    kind: "off-system",
  }],
  ["payment-plan:", {
    clearsWhen: "The instalment is recorded as paid, or its due date is amended.",
    kind: "off-system",
  }],
  ["contract-awaiting:", {
    clearsWhen: "The contract is recorded as accepted or declined.",
    kind: "off-system",
  }],
  ["compliance-expired:", {
    clearsWhen: "The record's expiry date is updated, or its status is changed from active.",
    kind: "off-system",
  }],
  ["compliance-reminder:", {
    clearsWhen: "The reminder date passes review, or the record's status is updated.",
    kind: "off-system",
  }],
  ["compliance-due:", {
    clearsWhen: "The renewal is completed and the new expiry date recorded.",
    kind: "off-system",
  }],
  ["portal-access:", {
    clearsWhen: "The client signs in to their portal for the first time.",
    kind: "off-system",
  }],
  ["contact:", {
    clearsWhen: "A contact with this client is recorded — a call, message or meeting.",
    kind: "off-system",
  }],
  // Client Health telemetry alerts (enquiry flow / site traffic vs the evolving
  // baseline). Nothing in-app fixes them; you investigate the site and its Aqua
  // tag off-screen and they clear when the metric recovers.
  ["client-health-", {
    clearsWhen: "The site's enquiries or traffic return to the client's evolving baseline.",
    kind: "off-system",
  }],
  ["meeting:", {
    clearsWhen: "The meeting is confirmed, rescheduled, or its outcome is recorded.",
    kind: "off-system",
  }],
  ["prospect-follow-up:", {
    clearsWhen: "A follow-up attempt is recorded against the prospect.",
    kind: "off-system",
  }],
  ["campaign-budget:", {
    clearsWhen: "Spend falls back inside budget, or the budget is raised.",
    kind: "off-system",
  }],
  ["campaign-target:", {
    clearsWhen: "The campaign attributes at least one lead, or is paused.",
    kind: "off-system",
  }],
  ["finance:budget-", {
    clearsWhen: "The pot is funded, the allocation amended, or the commitment reduced.",
    kind: "in-app",
  }],
  ["external-proposal:", {
    clearsWhen: "You accept, park or reject the proposal.",
    kind: "in-app",
  }],
  ["task:", {
    clearsWhen: "The task is completed, rescheduled, or reassigned.",
    kind: "in-app",
  }],
  ["outage:", {
    clearsWhen: "The monitored service reports healthy again.",
    kind: "off-system",
  }],
  ["development:errors:", {
    clearsWhen: "The error stops recurring in the monitored window.",
    kind: "off-system",
  }],
  ["request:", {
    clearsWhen: "The request is answered and its status updated.",
    kind: "in-app",
  }],
  ["enquiry:", {
    clearsWhen: "The enquiry is answered and its status updated.",
    kind: "in-app",
  }],
  ["website-message:", {
    clearsWhen: "The message is replied to and marked handled.",
    kind: "in-app",
  }],
  ["calendar-reminder:", {
    clearsWhen: "The commitment, reminder, goal or target is updated.",
    kind: "in-app",
  }],
  ["compliance-action:", {
    clearsWhen: "The record's status is changed from action-required.",
    kind: "in-app",
  }],
  ["client-marketing-approvals:", {
    clearsWhen: "The pending creative or campaign is approved or rejected.",
    kind: "in-app",
  }],
  ["client-marketing-access:", {
    // The client has to grant it; nothing in Aqua can.
    clearsWhen: "The client grants access and the connection reports healthy.",
    kind: "off-system",
  }],
  ["client-marketing-budget:", {
    clearsWhen: "Spend falls back inside budget, or the budget is amended.",
    kind: "off-system",
  }],
  ["client-marketing-no-leads:", {
    // No button makes a campaign work. Keep or kill is a decision.
    kind: "judgement",
    clearsWhen: "The campaign attributes a lead, or you pause it.",
  }],
  ["finance:overdue-invoices", {
    clearsWhen: "The invoice is paid, voided, or a follow-up is recorded.",
    kind: "off-system",
  }],
  ["finance:expense-evidence", {
    clearsWhen: "A receipt or supporting document is attached to the expense.",
    kind: "in-app",
  }],
  ["finance:expense-review", {
    clearsWhen: "The expense is approved or rejected.",
    kind: "in-app",
  }],
  ["finance:recurring-expenses", {
    clearsWhen: "The recurring charge is confirmed, amended or cancelled.",
    kind: "in-app",
  }],
  ["finance:obligations-overdue", {
    clearsWhen: "The obligation is settled and the payment recorded.",
    kind: "off-system",
  }],
  ["finance:obligations-upcoming", {
    clearsWhen: "The obligation is paid, or its due date is amended.",
    kind: "off-system",
  }],
  ["finance:people-payments-due", {
    clearsWhen: "The payment is made and recorded against the person.",
    kind: "off-system",
  }],
  ["development:monitoring-stale", {
    clearsWhen: "The monitored source reports a fresh reading.",
    kind: "off-system",
  }],
  ["people:", {
    clearsWhen: "The missing record is completed, or the decision is made.",
    kind: "in-app",
  }],
];

/**
 * The declared classification of an alert, falling back to the id table.
 *
 * Prefer this over `clearanceFor` everywhere an alert object is in hand: a
 * check that states its own kind cannot be misread by a prefix that happens
 * not to match, which is precisely how radar items were being mis-typed.
 */
export function resolutionKindOf(alert: {
  id: string;
  kind?: ResolutionKind;
  clearsWhen?: string;
}): { clearsWhen?: string; kind: ResolutionKind } {
  if (alert.kind) return { kind: alert.kind, clearsWhen: alert.clearsWhen ?? clearanceFor(alert.id).clearsWhen };
  return clearanceFor(alert.id);
}

/**
 * Fallback classification by id prefix.
 *
 * Kept for alerts that predate the declared field, and as the default the
 * central stamper fills in. New checks should set `kind` explicitly instead of
 * relying on their id happening to start with the right thing.
 */
export function clearanceFor(alertId: string): { clearsWhen?: string; kind: ResolutionKind } {
  for (const [prefix, value] of CLEARS_WHEN) {
    if (alertId.startsWith(prefix)) return value;
  }
  // Radar deviation checks are pattern observations, not tasks. Nothing you
  // press makes a metric return to its median — the business does, or the
  // check was noise. Treating them as judgement is the honest classification.
  if (alertId.startsWith("radar:")
    || alertId.startsWith("recommended-radar:")
    || alertId.startsWith("incident:")) {
    return { kind: "judgement" };
  }
  // Unknown family: say nothing about clearance rather than guess, and treat
  // it as a judgement call.
  //
  // Defaulting to "in-app" was the optimistic direction and the wrong one: it
  // put a Resolve button on work nobody had classified, promising a fix in a
  // screen that may not exist. Judgement promises only that somebody has to
  // look — which is true of anything unclassified — and routes it to the
  // Advisor instead of to a dead end.
  return { kind: "judgement" };
}

/**
 * Translate a statistically-worded alert into something a human can act on,
 * and say plainly when the numbers are too thin to mean anything.
 *
 * A check reading "99.0 robust deviations from its retained median" with a
 * median of 0 and a current value of 1 is not describing a crisis — it is
 * describing a metric that went from nothing to something, against a baseline
 * with no spread to measure against. Presented as urgent, alerts like that
 * teach the operator to ignore Radar, which is far more expensive than the
 * alert is worth.
 */
export function plainMeaningFor(title: string, detail: string, evidence = ""): {
  plainMeaning?: string;
  weakEvidence?: string;
} {
  // Radar puts the wording in the detail and the figures in the evidence
  // line, so both must be scanned or the numbers are missed entirely.
  const text = `${detail} ${evidence}`;
  const deviations = text.match(/([\d.]+)\s*(?:robust\s*)?deviations?/i);
  const current = text.match(/Current\s+([\d.]+)/i);
  const median = text.match(/Median\s+([\d.]+)/i);

  if (!deviations && !/broke its historical pattern/i.test(title)) return {};

  const currentValue = current ? Number(current[1]) : undefined;
  const medianValue = median ? Number(median[1]) : undefined;

  const plainMeaning = currentValue !== undefined && medianValue !== undefined
    ? `This measure is usually around ${medianValue}. Right now it is ${currentValue}. `
      + "Aqua flagged the change in pattern, not a specific problem — it is telling you "
      + "something moved, and leaving the judgement to you."
    : "Aqua noticed this measure behaving differently from its own history. "
      + "It is flagging a change in pattern, not a specific problem.";

  // A baseline of zero has no spread, so "deviations" is arithmetic noise.
  const weakEvidence = medianValue === 0
    ? "The usual value is 0, so any movement at all reads as a huge deviation. "
      + "With a baseline like that the percentage is not meaningful — check whether this "
      + "is worth acting on before spending time on it."
    : currentValue !== undefined && currentValue <= 2 && medianValue !== undefined && medianValue <= 2
      ? "These numbers are very small, so the percentage change overstates what actually happened."
      : undefined;

  return { plainMeaning, weakEvidence };
}

/** Human-readable age, for "this has been sitting for…" context. */
export function alertAge(occurredAt: number, now: number): string {
  const ms = Math.max(0, now - occurredAt);
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
