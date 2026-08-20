import type { ResolutionFocus } from "@/lib/inbox/resolutionContext";
import type { AgencyTaskPriority } from "@/server/types";

/**
 * Repeatable work, written down once.
 *
 * Jobs like onboarding a client are the same seven steps every time, and the
 * cost of retyping them is not the typing — it is the step that gets forgotten
 * on the eighth client because nobody wrote it down. A template makes the
 * sequence the default rather than something remembered.
 *
 * Two kinds share one shape: the built-ins below, which every agency gets, and
 * the ones written here (persisted per agency). The picker shows them in one
 * list because from the operator's side there is no difference — only the
 * built-ins cannot be edited away.
 */

export interface TaskTemplateStep {
  label: string;
  /** Where this sub-task is carried out, so it gets its own Resolve. */
  href?: string;
  /** What the destination should highlight. */
  focus?: ResolutionFocus;
  /** A procedure to follow for this step. */
  sopId?: string;
}

export interface TaskTemplateShape {
  name: string;
  /** One line on when to reach for it, shown in the picker. */
  summary: string;
  /**
   * The task's title. `{subject}` is replaced with whoever it is about when
   * applied, and dropped when there is nobody — "Onboard" alone still reads.
   */
  taskTitle: string;
  notes?: string;
  priority?: AgencyTaskPriority;
  steps: TaskTemplateStep[];
}

export type TaskTemplateCategory = "journey" | "fulfilment" | "finance" | "operations";

export interface BuiltInTaskTemplate extends TaskTemplateShape {
  id: string;
  category: TaskTemplateCategory;
}

/**
 * Which jobs arrive with their steps already attached.
 *
 * An accepted action that lands with an empty checklist puts the sequence back
 * in the operator's head — the template only helps if they remember it exists.
 * Mapped by alert family so accepting "the contract is signed" produces the
 * onboarding steps without anybody choosing them.
 *
 * Deliberately sparse. A mapping is only correct where the whole template IS
 * the job: attaching seven onboarding steps to a portal-access alert would
 * bury one real task under six irrelevant ones, and the operator would start
 * deleting checklists on sight.
 *
 * Radar and incident families are absent on purpose — they are judgement
 * calls, and a checklist would imply a procedure exists where none does.
 */
export const TEMPLATE_FOR_FAMILY: Array<[string, string]> = [
  ["enquiry-classification:", "builtin:qualify-enquiry"],
  ["enquiry:", "builtin:qualify-enquiry"],
  ["contract-awaiting:", "builtin:onboard-client"],
  ["invoice:", "builtin:chase-invoice"],
  ["finance:overdue-invoices", "builtin:chase-invoice"],
];

/**
 * The families a template can be pointed at by hand, in plain English.
 *
 * Offered as a list rather than a free-text prefix: an operator typing
 * "invoice" and meaning `invoice:` would silently claim nothing.
 */
export const CLAIMABLE_FAMILIES: Array<{ prefix: string; label: string }> = [
  { prefix: "enquiry-classification:", label: "An enquiry needs classifying" },
  { prefix: "enquiry:", label: "A new enquiry arrives" },
  { prefix: "contract-awaiting:", label: "A contract is signed" },
  { prefix: "invoice:", label: "An invoice needs chasing" },
  { prefix: "finance:overdue-invoices", label: "Invoices are overdue" },
  { prefix: "portal-access:", label: "A client has no portal access" },
  { prefix: "meeting:", label: "A meeting needs arranging" },
  { prefix: "prospect-follow-up:", label: "A prospect needs following up" },
  { prefix: "task:", label: "A task falls due" },
  { prefix: "compliance-", label: "A compliance check needs evidence" },
];

/** The built-in template that claims this alert, if any. */
export function builtInTemplateForSource(sourceId: string): BuiltInTaskTemplate | undefined {
  for (const [prefix, templateId] of TEMPLATE_FOR_FAMILY) {
    if (sourceId.startsWith(prefix)) return builtInTemplate(templateId);
  }
  return undefined;
}

export const SUBJECT_TOKEN = "{subject}";

/**
 * Fills the subject into a template title.
 *
 * With no subject the token is removed along with the connecting word, so
 * "Onboard {subject}" becomes "Onboard" rather than "Onboard {subject}" —
 * a task titled with a literal placeholder is worse than a vague one.
 */
export function fillTemplateTitle(taskTitle: string, subject?: string): string {
  const trimmed = subject?.trim();
  if (trimmed) return taskTitle.replaceAll(SUBJECT_TOKEN, trimmed).trim();
  return taskTitle
    .replace(/\s*(?:for|with|from)?\s*\{subject\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The library everyone starts with.
 *
 * Destinations are only attached where the step genuinely happens on a page
 * that exists app-wide. A step like "send the welcome pack" carries no href on
 * purpose: pointing it at a vaguely related screen would make the Resolve
 * button a lie, and the operator learns to stop trusting the buttons.
 */
export const BUILT_IN_TASK_TEMPLATES: BuiltInTaskTemplate[] = [
  {
    id: "builtin:onboard-client",
    category: "journey",
    name: "Onboard a new client",
    summary: "Everything between a signed contract and a client who is actually running.",
    taskTitle: "Onboard {subject}",
    priority: "high",
    steps: [
      { label: "Check the signed contract is on file", href: "/portal/clients", focus: "contract" },
      { label: "Create their client workspace", href: "/portal/clients", focus: "details" },
      { label: "Assign their products and services", href: "/portal/agency/products", focus: "details" },
      { label: "Set up their portal access", href: "/portal/agency/portals", focus: "access" },
      { label: "Raise the first invoice", href: "/portal/agency/agency-finance/invoices", focus: "payment" },
      { label: "Book the kick-off call", href: "/portal/agency/calendar", focus: "meeting" },
      { label: "Send the welcome pack" },
    ],
  },
  {
    id: "builtin:qualify-enquiry",
    category: "journey",
    name: "Work a new enquiry",
    summary: "From an enquiry landing to a qualified lead sitting in the pipeline.",
    taskTitle: "Qualify the enquiry from {subject}",
    steps: [
      { label: "Read the full enquiry, including what they consented to", href: "/portal/agency/inbox", focus: "reply" },
      { label: "Classify who they are", href: "/portal/agency/contacts", focus: "classification" },
      { label: "Link them to a company if there is one", href: "/portal/agency/contacts", focus: "company" },
      { label: "Reply to them", href: "/portal/agency/inbox", focus: "reply" },
      { label: "Book a discovery call", href: "/portal/agency/calendar", focus: "meeting" },
      { label: "Move them into the pipeline", href: "/portal/agency/pipelines/leads", focus: "details" },
    ],
  },
  {
    id: "builtin:send-proposal",
    category: "journey",
    name: "Prepare and send a proposal",
    summary: "The steps between a good call and a proposal you are happy to be held to.",
    taskTitle: "Send a proposal to {subject}",
    steps: [
      { label: "Write down the scope you actually agreed on the call" },
      { label: "Price it against the product catalogue", href: "/portal/agency/products", focus: "details" },
      { label: "Draft the proposal" },
      { label: "Read it back as the client, then fix what is vague" },
      { label: "Send it", href: "/portal/agency/inbox", focus: "reply" },
      { label: "Diary the follow-up before you close the laptop", href: "/portal/agency/calendar", focus: "meeting" },
    ],
  },
  {
    id: "builtin:chase-invoice",
    category: "finance",
    name: "Chase an overdue invoice",
    summary: "Check it is genuinely unpaid before chasing, then escalate in order.",
    taskTitle: "Chase the overdue invoice for {subject}",
    priority: "high",
    steps: [
      { label: "Confirm the invoice is genuinely unpaid", href: "/portal/agency/agency-finance/invoices", focus: "payment" },
      { label: "Check whether a payment plan already covers it", href: "/portal/agency/agency-finance/invoices", focus: "payment" },
      { label: "Send a polite reminder with the invoice attached", href: "/portal/agency/inbox", focus: "reply" },
      { label: "Ring them if the reminder goes unanswered for a week" },
      { label: "Record what was agreed and set the next date", href: "/portal/agency/agency-finance/invoices", focus: "payment" },
    ],
  },
  {
    id: "builtin:month-end",
    category: "finance",
    name: "Month-end close",
    summary: "The monthly sweep across expenses, invoices, budgets and obligations.",
    taskTitle: "Month-end close",
    steps: [
      { label: "Reconcile the month's expenses", href: "/portal/agency/agency-finance/expenses", focus: "evidence" },
      { label: "Chase anything still outstanding", href: "/portal/agency/agency-finance/invoices", focus: "payment" },
      { label: "Review budgets against actuals", href: "/portal/agency/agency-finance/budgets", focus: "budget" },
      { label: "Check upcoming obligations are funded", href: "/portal/agency/agency-finance/operations", focus: "payment" },
      { label: "Clear whatever Radar raised this month", href: "/portal/agency/radar", focus: "evidence" },
    ],
  },
  {
    id: "builtin:launch-website",
    category: "fulfilment",
    name: "Launch a website",
    summary: "The pre-flight list, so a launch is not the first time anything is checked.",
    taskTitle: "Launch the website for {subject}",
    priority: "high",
    steps: [
      { label: "Final content and copy check with the client" },
      { label: "Check performance is inside budget", href: "/portal/agency/fulfilment/technical/performance", focus: "evidence" },
      { label: "Confirm monitoring is switched on", href: "/portal/agency/fulfilment/technical/website", focus: "evidence" },
      { label: "Switch DNS over" },
      { label: "Watch it for an hour after cutover", href: "/portal/agency/fulfilment/technical/performance", focus: "evidence" },
      { label: "Tell the client it is live", href: "/portal/agency/inbox", focus: "reply" },
    ],
  },
  {
    id: "builtin:client-review",
    category: "journey",
    name: "Quarterly client review",
    summary: "Turning three months of delivery into a conversation about the next three.",
    taskTitle: "Quarterly review with {subject}",
    steps: [
      { label: "Pull their performance for the quarter", href: "/portal/agency/performance", focus: "evidence" },
      { label: "List what was delivered against what was promised", href: "/portal/agency/fulfilment", focus: "details" },
      { label: "Book the review", href: "/portal/agency/calendar", focus: "meeting" },
      { label: "Agree next quarter's priorities on the call" },
      { label: "Write the outcomes onto their record", href: "/portal/clients", focus: "details" },
    ],
  },
  {
    id: "builtin:offboard-client",
    category: "operations",
    name: "Offboard a client",
    summary: "Leaving well — money settled, access closed, assets handed over.",
    taskTitle: "Offboard {subject}",
    steps: [
      { label: "Raise the final invoice", href: "/portal/agency/agency-finance/invoices", focus: "payment" },
      { label: "Hand over their assets and credentials", href: "/portal/agency/fulfilment/technical/vault", focus: "details" },
      { label: "Revoke portal access", href: "/portal/agency/portals", focus: "access" },
      { label: "Cancel any recurring charges", href: "/portal/agency/agency-finance/operations", focus: "payment" },
      { label: "Ask for a testimonial while the work is fresh" },
      { label: "Archive their workspace", href: "/portal/clients", focus: "details" },
    ],
  },
];

export function builtInTemplate(id: string): BuiltInTaskTemplate | undefined {
  return BUILT_IN_TASK_TEMPLATES.find(template => template.id === id);
}
