import type { OperationalAlert } from "@/lib/intelligence/operationalAttention";
import { type ResolutionFocus, withResolutionContext } from "@/lib/inbox/resolutionContext";
import { clearanceFor } from "@/lib/inbox/resolutionExplain";

/**
 * Infers what a given alert wants you to act on, from its id.
 *
 * Applied centrally to every alert rather than hand-written at each of the 44
 * push sites. Editing those individually guarantees drift: a new alert added
 * later would silently lose its resolution context, and nobody would notice
 * because the link still works — it would just arrive with no explanation.
 *
 * An unrecognised prefix yields no focus, which is a safe default: the
 * announcement bar still names the task, the page simply shows no highlight.
 * A missing ring is honest; a ring pointing at the wrong control is not.
 */
const FOCUS_BY_PREFIX: Array<[string, ResolutionFocus]> = [
  ["source-unavailable:website-enquiries", "details"],
  ["enquiry-classification:", "classification"],
  ["person-organisation:", "company"],
  ["invoice:", "payment"],
  ["payment-plan:", "payment"],
  // Order matters: the budget entries must be tested before the generic
  // finance ones, or every finance alert would claim the budget focus.
  ["finance:budget-", "budget"],
  ["finance:expense-evidence", "evidence"],
  ["finance:expense-review", "approval"],
  ["finance:recurring-expenses", "details"],
  ["finance:overdue-invoices", "payment"],
  ["finance:obligations-overdue", "payment"],
  ["finance:obligations-upcoming", "payment"],
  ["finance:people-payments-due", "payment"],
  ["development:monitoring-stale", "evidence"],
  ["contract-awaiting:", "contract"],
  ["compliance-", "evidence"],
  ["external-proposal:", "approval"],
  ["meeting:", "meeting"],
  ["prospect-follow-up:", "meeting"],
  ["portal-access:", "access"],
  ["task:", "task"],
  ["calendar-reminder:", "task"],
  ["request:", "reply"],
  ["enquiry:", "reply"],
  ["website-message:", "reply"],
  ["contact:", "reply"],
  ["client-marketing-", "details"],
  // Client Health alerts land on the site's metrics and their history — the
  // deviation is the thing to look at, so point the highlight at the evidence.
  ["client-health-", "evidence"],
  ["campaign-", "details"],
  // Radar deviations land on their numbers. Nothing here can be "fixed" — the
  // judgement is whether the movement is real — so the highlight points at the
  // metrics and their history, which is the only thing worth looking at.
  ["recommended-radar:", "evidence"],
  ["radar:", "evidence"],
  ["incident:", "evidence"],
  ["outage:", "evidence"],
  ["development:errors:", "evidence"],
  ["people:", "details"],
];

export function inferResolutionFocus(alertId: string): ResolutionFocus | undefined {
  for (const [prefix, focus] of FOCUS_BY_PREFIX) {
    if (alertId.startsWith(prefix)) return focus;
  }
  return undefined;
}

/**
 * Stamps resolution context onto every alert. Idempotent — an alert that
 * already carries context (because it needed a bespoke focus) is left alone.
 */
export function withResolutionContexts(alerts: OperationalAlert[]): OperationalAlert[] {
  return alerts.map(alert => {
    // Fill the declared fields from the tables where a check has not set them
    // itself, so everything downstream can read the field rather than
    // re-deriving from the id and getting a different answer.
    const focus = alert.focus ?? inferResolutionFocus(alert.id);
    const { kind, clearsWhen } = clearanceFor(alert.id);
    const classified: OperationalAlert = {
      ...alert,
      focus,
      kind: alert.kind ?? kind,
      clearsWhen: alert.clearsWhen ?? clearsWhen,
    };
    if (classified.href.includes("resolve=")) return classified;
    return {
      ...classified,
      href: withResolutionContext(classified.href, { alertId: classified.id, focus }),
    };
  });
}
