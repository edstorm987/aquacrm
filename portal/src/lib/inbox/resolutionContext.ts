/**
 * Resolution context — the "why am I here?" carried across a Resolve click.
 *
 * Pressing Resolve navigates you somewhere else entirely. By the time the page
 * loads, the reason is off-screen: you are looking at a record with no memory
 * of the alert that sent you. This encodes the intent in the URL so the
 * destination can state what you came to do, point at the exact control that
 * does it, and — when the job takes more than one step — show where you are in
 * the sequence.
 *
 * Deliberately URL-carried rather than held in memory: a Resolve link must
 * survive a full page load, a refresh, a bookmark and a shared link.
 */

export const RESOLUTION_PARAM = "resolve";
export const RESOLUTION_FOCUS_PARAM = "focus";
export const RESOLUTION_STEP_PARAM = "step";
/**
 * The specific record that tripped the check.
 *
 * Without this, "Evidence" drops you on a list and leaves you to find the row
 * yourself — barely better than no button, and worse on a long list where the
 * thing you were sent to see scrolls off the bottom.
 */
export const RESOLUTION_RECORD_PARAM = "record";

/**
 * What the destination should draw attention to.
 *
 * A page that does not recognise a value simply shows no highlight — the
 * announcement bar still explains the task. Better a missing ring than a ring
 * pointing at the wrong thing.
 */
export const RESOLUTION_FOCUSES = [
  "classification",
  "company",
  "details",
  "payment",
  "contract",
  "approval",
  "meeting",
  "budget",
  "evidence",
  "reply",
  "task",
  "access",
] as const;

export type ResolutionFocus = typeof RESOLUTION_FOCUSES[number];

const FOCUS_VALUES = new Set<string>(RESOLUTION_FOCUSES);

export function isResolutionFocus(value: unknown): value is ResolutionFocus {
  return typeof value === "string" && FOCUS_VALUES.has(value);
}

export interface ResolutionIntent {
  /** The originating alert id, so progress can be recomputed from live data. */
  alertId: string;
  focus?: ResolutionFocus;
  /** 1-based step index, for resolutions that span more than one place. */
  step?: number;
  /** Id of the exact record to surface, for evidence links. */
  record?: string;
}

/**
 * Append resolution context to a destination href, preserving its own query
 * AND its fragment.
 *
 * The fragment is split off FIRST. A URL is `path?query#hash`, so splitting on
 * "?" before "#" swallows the fragment into the query string — which would
 * quietly break the task alerts that deep-link with `#task-<id>`, the anchor
 * focus protection relies on to promote and open the right record.
 */
export function withResolutionContext(href: string, intent: ResolutionIntent): string {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;

  const [path, existing] = withoutHash.split("?");
  const params = new URLSearchParams(existing);
  params.set(RESOLUTION_PARAM, intent.alertId);
  if (intent.focus) params.set(RESOLUTION_FOCUS_PARAM, intent.focus);
  if (intent.step && intent.step > 1) params.set(RESOLUTION_STEP_PARAM, String(intent.step));
  if (intent.record) params.set(RESOLUTION_RECORD_PARAM, intent.record);

  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}${hash}`;
}

// ─── Multi-step plans ─────────────────────────────────────────────────────
//
// Plenty of alerts are not one click. Chasing an unsigned contract means
// opening it, chasing the client, then recording what came back — in different
// places. Without a plan the operator lands on step one and has no idea more
// is expected, so the alert keeps firing and looks broken.
//
// Steps are DERIVED from live data every time rather than stored. A stored
// checklist drifts: mark a step done, the underlying record changes, and the
// checklist now lies. Deriving means progress is always the truth.

export interface ResolutionStep {
  id: string;
  /** Imperative, e.g. "Record the payment". */
  label: string;
  /** Where this step happens. */
  href: string;
  focus?: ResolutionFocus;
  /** Whether the evidence says this step is already satisfied. */
  done: boolean;
  /** Shown when a step cannot be completed yet. */
  blockedReason?: string;
}

export interface ResolutionPlan {
  alertId: string;
  /** What the whole job is, e.g. "Get this contract signed". */
  title: string;
  steps: ResolutionStep[];
}

export interface ResolutionProgress {
  total: number;
  completed: number;
  /** The step to do next, or null when everything is done. */
  current: ResolutionStep | null;
  allDone: boolean;
}

export function resolutionProgress(plan: ResolutionPlan | null): ResolutionProgress {
  const steps = plan?.steps ?? [];
  const completed = steps.filter(step => step.done).length;
  // The next actionable step is the first not-done one, so a step completed
  // out of order does not strand the sequence.
  const current = steps.find(step => !step.done) ?? null;
  return {
    total: steps.length,
    completed,
    current,
    allDone: steps.length > 0 && completed === steps.length,
  };
}

export interface ResolutionCopy {
  task: string;
  hint: string;
}

/** The sentence shown in the announcement bar for a single-step resolution. */
export function resolutionCopy(focus: ResolutionFocus | undefined, subject?: string): ResolutionCopy {
  const who = subject ? ` for ${subject}` : "";
  switch (focus) {
    case "classification":
      return { task: `Set the relationship${who}`, hint: "Choose what this relationship is — highlighted below." };
    case "company":
      return { task: `Confirm the company${who}`, hint: "Answer the company question — highlighted below." };
    case "details":
      return { task: `Check the details${who}`, hint: "Correct anything wrong — highlighted below." };
    case "payment":
      return { task: `Settle the money${who}`, hint: "Record the payment or raise the follow-up — highlighted below." };
    case "contract":
      return { task: `Move the contract on${who}`, hint: "Send, chase or record acceptance — highlighted below." };
    case "approval":
      return { task: `Make a decision${who}`, hint: "Accept, park or reject — highlighted below." };
    case "meeting":
      return { task: `Sort the meeting${who}`, hint: "Confirm, reschedule or record the outcome — highlighted below." };
    case "budget":
      return { task: `Deal with the budget${who}`, hint: "Fund it, amend it or reduce the commitment — highlighted below." };
    case "evidence":
      return { task: `Attach the evidence${who}`, hint: "Upload or record what is missing — highlighted below." };
    case "reply":
      return { task: `Reply${who}`, hint: "Respond and record the outcome — highlighted below." };
    case "access":
      return { task: `Sort portal access${who}`, hint: "Check the invite and confirm they can get in — highlighted below." };
    case "task":
      return { task: `Complete the action${who}`, hint: "Finish, reassign or reschedule it — highlighted below." };
    default:
      return { task: "Resolving an item from Needs attention", hint: "Complete the action on this page." };
  }
}
