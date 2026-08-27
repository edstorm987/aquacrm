export const CLIENT_PAYMENT_PLAN_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export const CLIENT_PAYMENT_MILESTONE_STATUSES = ["planned", "invoiced", "paid", "waived"] as const;

export type ClientPaymentPlanStatus = (typeof CLIENT_PAYMENT_PLAN_STATUSES)[number];
export type ClientPaymentMilestoneStatus = (typeof CLIENT_PAYMENT_MILESTONE_STATUSES)[number];

export interface ClientPaymentMilestone {
  id: string;
  title: string;
  description?: string;
  amountCents: number;
  dueAt: number;
  productId?: string;
  productName?: string;
  kind?: "deposit" | "recurring" | "custom";
  status: ClientPaymentMilestoneStatus;
  /** Durable identity for one invoice attempt; retained so retries adopt the same invoice. */
  invoiceOperationId?: string;
  invoiceOperationStartedAt?: number;
  invoiceId?: string;
  invoiceNumber?: string;
  invoicedAt?: number;
  paidAt?: number;
}

export interface ClientPaymentPlan {
  id: string;
  /** Monotonic compare-and-swap revision for edits to this plan. */
  revision: number;
  title: string;
  summary?: string;
  currency: string;
  status: ClientPaymentPlanStatus;
  customerVisible: boolean;
  productIds: string[];
  milestones: ClientPaymentMilestone[];
  /** Optional Finance catalogue template that originated this canonical client schedule. */
  financePlanId?: string;
  /** Snapshotted recurring commercial terms. Catalogue edits affect future assignments only. */
  monthlyAmountCents?: number;
  lockInMonths?: number;
  lockInFeeCents?: number;
  commercialAssignedAt?: number;
  commercialOperationId?: string;
  /** Durable cancellation intent; prevents an old retry cancelling a later assignment. */
  commercialCancelledByOperationId?: string;
  internalNotes?: string;
  createdAt: number;
  updatedAt: number;
  activatedAt?: number;
  completedAt?: number;
}

export interface PaymentPlanInvoiceEvidence {
  id: string;
  number: string;
  status: string;
  dueAt?: number;
  totalCents?: number;
  /** Net receipt allocation after durable refunds, when the caller has it. */
  netPaidCents?: number;
  currency?: string;
  paidAt?: number;
}

export interface InvoiceCurrencyPosition {
  currency: string;
  recordedCents: number;
  paidCents: number;
  outstandingCents: number;
  invoiceCount: number;
  paidInvoices: number;
  openInvoices: number;
}

export type ClientPaymentPositionState =
  | "unconfigured"
  | "draft"
  | "payment-plan"
  | "payment-due"
  | "missed-payment"
  | "paid-in-full";

export interface ClientPaymentPosition {
  state: ClientPaymentPositionState;
  label: string;
  currencyPositions: ClientPaymentCurrencyPosition[];
  missedPayments: number;
  openInvoices: number;
  activePlans: number;
  completedPlans: number;
  nextDueAt?: number;
  lastPaidAt?: number;
}

export interface ClientPaymentCurrencyPosition {
  currency: string;
  agreedCents: number;
  paidCents: number;
  outstandingCents: number;
  missedPayments: number;
  openInvoices: number;
  activePlans: number;
  completedPlans: number;
  nextDueAt?: number;
  lastPaidAt?: number;
}

const COLLECTIBLE_INVOICE_STATUSES = new Set(["sent", "overdue", "partially-refunded"]);
const FINANCIAL_INVOICE_STATUSES = new Set(["sent", "overdue", "paid", "partially-refunded"]);

function invoiceCurrency(value: unknown): string {
  return text(value, 8).toLowerCase() || "gbp";
}

export function isCollectibleInvoiceStatus(status: string): boolean {
  return COLLECTIBLE_INVOICE_STATUSES.has(status);
}

export function summariseInvoicesByCurrency(
  invoices: readonly PaymentPlanInvoiceEvidence[],
): InvoiceCurrencyPosition[] {
  const grouped = new Map<string, InvoiceCurrencyPosition>();
  for (const invoice of invoices) {
    const currency = invoiceCurrency(invoice.currency);
    const position = grouped.get(currency) ?? {
      currency,
      recordedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
      invoiceCount: 0,
      paidInvoices: 0,
      openInvoices: 0,
    };
    const amount = positiveInteger(invoice.totalCents);
    position.recordedCents += amount;
    position.invoiceCount += 1;
    const netPaidCents = Math.min(amount, positiveInteger(invoice.netPaidCents));
    if (invoice.status === "paid") {
      position.paidCents += invoice.netPaidCents === undefined ? amount : netPaidCents;
      position.paidInvoices += 1;
    } else if (isCollectibleInvoiceStatus(invoice.status)) {
      position.paidCents += netPaidCents;
      position.outstandingCents += Math.max(0, amount - netPaidCents);
      position.openInvoices += 1;
    }
    grouped.set(currency, position);
  }
  return [...grouped.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function timestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function cleanStatus<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value as T[number] : fallback;
}

export function cleanClientPaymentPlans(value: unknown): ClientPaymentPlan[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ClientPaymentPlan[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const id = text(row.id, 120);
    const title = text(row.title, 180);
    if (!id || !title) return [];
    const milestones = Array.isArray(row.milestones)
      ? row.milestones.flatMap((item): ClientPaymentMilestone[] => {
          if (!item || typeof item !== "object") return [];
          const milestone = item as Record<string, unknown>;
          const milestoneId = text(milestone.id, 120);
          const milestoneTitle = text(milestone.title, 180);
          const dueAt = timestamp(milestone.dueAt);
          if (!milestoneId || !milestoneTitle || !dueAt) return [];
          return [{
            id: milestoneId,
            title: milestoneTitle,
            description: text(milestone.description, 1_000) || undefined,
            amountCents: positiveInteger(milestone.amountCents),
            dueAt,
            productId: text(milestone.productId, 120) || undefined,
            productName: text(milestone.productName, 180) || undefined,
            kind: cleanStatus(milestone.kind, ["deposit", "recurring", "custom"] as const, "custom"),
            status: cleanStatus(milestone.status, CLIENT_PAYMENT_MILESTONE_STATUSES, "planned"),
            invoiceOperationId: text(milestone.invoiceOperationId, 160) || undefined,
            invoiceOperationStartedAt: timestamp(milestone.invoiceOperationStartedAt),
            invoiceId: text(milestone.invoiceId, 120) || undefined,
            invoiceNumber: text(milestone.invoiceNumber, 80) || undefined,
            invoicedAt: timestamp(milestone.invoicedAt),
            paidAt: timestamp(milestone.paidAt),
          }];
        }).slice(0, 48)
      : [];
    return [{
      id,
      revision: positiveInteger(row.revision),
      title,
      summary: text(row.summary, 2_000) || undefined,
      currency: text(row.currency, 8).toLowerCase() || "gbp",
      status: cleanStatus(row.status, CLIENT_PAYMENT_PLAN_STATUSES, "draft"),
      customerVisible: row.customerVisible === true,
      productIds: Array.isArray(row.productIds)
        ? [...new Set(row.productIds.map(item => text(item, 120)).filter(Boolean))].slice(0, 24)
        : [],
      milestones,
      financePlanId: text(row.financePlanId, 120) || undefined,
      monthlyAmountCents: row.monthlyAmountCents === undefined ? undefined : positiveInteger(row.monthlyAmountCents),
      lockInMonths: row.lockInMonths === undefined ? undefined : positiveInteger(row.lockInMonths),
      lockInFeeCents: row.lockInFeeCents === undefined ? undefined : positiveInteger(row.lockInFeeCents),
      commercialAssignedAt: timestamp(row.commercialAssignedAt),
      commercialOperationId: text(row.commercialOperationId, 180) || undefined,
      commercialCancelledByOperationId: text(row.commercialCancelledByOperationId, 180) || undefined,
      internalNotes: text(row.internalNotes, 4_000) || undefined,
      createdAt: timestamp(row.createdAt) ?? Date.now(),
      updatedAt: timestamp(row.updatedAt) ?? Date.now(),
      activatedAt: timestamp(row.activatedAt),
      completedAt: timestamp(row.completedAt),
    }];
  }).slice(0, 24);
}

export interface FinancePlanScheduleTerms {
  id: string;
  label: string;
  currency: string;
  monthlyAmountCents: number;
  lockInMonths: number;
  lockInFeeCents: number;
}

export function buildFinancePlanSchedule(input: {
  terms: FinancePlanScheduleTerms;
  clientPaymentPlanId: string;
  operationId: string;
  firstDueAt: number;
  customerVisible: boolean;
  now: number;
  makeMilestoneId: (kind: "deposit" | "recurring", index: number) => string;
}): ClientPaymentPlan {
  const monthlyCount = Math.max(1, input.terms.lockInMonths);
  const milestones: ClientPaymentMilestone[] = [];
  if (input.terms.lockInFeeCents > 0) {
    milestones.push({
      id: input.makeMilestoneId("deposit", 0),
      title: `${input.terms.label} · Deposit`,
      amountCents: input.terms.lockInFeeCents,
      dueAt: input.firstDueAt,
      kind: "deposit",
      status: "planned",
    });
  }
  for (let index = 0; index < monthlyCount; index += 1) {
    milestones.push({
      id: input.makeMilestoneId("recurring", index),
      title: monthlyCount === 1
        ? `${input.terms.label} · Monthly payment`
        : `${input.terms.label} · Month ${index + 1} of ${monthlyCount}`,
      amountCents: input.terms.monthlyAmountCents,
      dueAt: addUtcMonths(input.firstDueAt, index),
      kind: "recurring",
      status: "planned",
    });
  }
  return {
    id: input.clientPaymentPlanId,
    revision: 0,
    title: input.terms.label,
    summary: input.terms.lockInMonths > 0
      ? `${input.terms.lockInMonths}-month commercial plan.`
      : "Month-to-month commercial plan.",
    currency: input.terms.currency.toLowerCase(),
    status: "active",
    customerVisible: input.customerVisible,
    productIds: [],
    milestones,
    financePlanId: input.terms.id,
    monthlyAmountCents: input.terms.monthlyAmountCents,
    lockInMonths: input.terms.lockInMonths,
    lockInFeeCents: input.terms.lockInFeeCents,
    commercialAssignedAt: input.now,
    commercialOperationId: input.operationId,
    createdAt: input.now,
    updatedAt: input.now,
    activatedAt: input.now,
  };
}

export function cancelActiveFinancePlanSchedules(
  plans: readonly ClientPaymentPlan[],
  now: number,
  cancellationOperationId?: string,
): ClientPaymentPlan[] {
  return plans.map(plan => plan.financePlanId && plan.status === "active"
    ? {
        ...plan,
        revision: plan.revision + 1,
        status: "cancelled" as const,
        commercialCancelledByOperationId: cancellationOperationId,
        updatedAt: now,
      }
    : plan);
}

function addUtcMonths(timestampValue: number, months: number): number {
  const date = new Date(timestampValue);
  const targetMonthStart = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    1,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
  const lastTargetDay = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(date.getUTCDate(), lastTargetDay));
  return targetMonthStart.getTime();
}

export function reconcileClientPaymentPlan(
  plan: ClientPaymentPlan,
  invoices: readonly PaymentPlanInvoiceEvidence[],
): ClientPaymentPlan {
  const byId = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const milestones = plan.milestones.map(milestone => {
    const invoice = milestone.invoiceId ? byId.get(milestone.invoiceId) : undefined;
    if (!invoice) return milestone;
    if (invoice.status === "paid") {
      return { ...milestone, status: "paid" as const, invoiceNumber: invoice.number, paidAt: invoice.paidAt ?? milestone.paidAt };
    }
    if (invoice.status === "void" || invoice.status === "refunded") {
      return { ...milestone, status: "planned" as const, invoiceId: undefined, invoiceNumber: undefined, invoicedAt: undefined, paidAt: undefined };
    }
    return { ...milestone, status: "invoiced" as const, invoiceNumber: invoice.number, paidAt: undefined };
  });
  const chargeable = milestones.filter(milestone => milestone.status !== "waived");
  const status = plan.status === "active" && chargeable.length > 0 && chargeable.every(milestone => milestone.status === "paid")
    ? "completed" as const
    : plan.status === "completed" && chargeable.some(milestone => milestone.status !== "paid")
      ? "active" as const
      : plan.status;
  return {
    ...plan,
    status,
    milestones,
    completedAt: status === "completed" ? plan.completedAt ?? Date.now() : undefined,
  };
}

export function paymentPlanTotal(plan: ClientPaymentPlan): number {
  return plan.milestones.reduce((total, milestone) => total + (milestone.status === "waived" ? 0 : milestone.amountCents), 0);
}

export function paymentPlanPaid(plan: ClientPaymentPlan): number {
  return plan.milestones.reduce((total, milestone) => total + (milestone.status === "paid" ? milestone.amountCents : 0), 0);
}

export function customerVisiblePaymentPlans(plans: readonly ClientPaymentPlan[]): ClientPaymentPlan[] {
  return plans
    .filter(plan => plan.customerVisible && plan.status !== "draft" && plan.status !== "cancelled")
    .map(plan => ({
      ...plan,
      internalNotes: undefined,
      commercialOperationId: undefined,
      commercialCancelledByOperationId: undefined,
      milestones: plan.milestones.map(({ invoiceOperationId: _operationId, invoiceOperationStartedAt: _operationStartedAt, ...milestone }) => milestone),
    }));
}

export function summariseClientPaymentPosition(
  plans: readonly ClientPaymentPlan[],
  invoices: readonly PaymentPlanInvoiceEvidence[],
  now = Date.now(),
): ClientPaymentPosition {
  const reconciled = plans.map(plan => reconcileClientPaymentPlan(plan, invoices));
  const retainedPlans = reconciled.filter(plan => plan.status !== "cancelled");
  const activePlans = retainedPlans.filter(plan => plan.status === "active");
  const completedPlans = retainedPlans.filter(plan => plan.status === "completed");
  const chargeableInvoices = invoices.filter(invoice => FINANCIAL_INVOICE_STATUSES.has(invoice.status));
  const openInvoices = chargeableInvoices.filter(invoice => isCollectibleInvoiceStatus(invoice.status));
  const paidInvoices = chargeableInvoices.filter(invoice => invoice.status === "paid");
  const linkedInvoiceCurrencies = new Map<string, string>();
  for (const plan of retainedPlans) {
    for (const milestone of plan.milestones) {
      if (milestone.invoiceId) linkedInvoiceCurrencies.set(milestone.invoiceId, invoiceCurrency(plan.currency));
    }
  }
  const linkedInvoiceIds = new Set(linkedInvoiceCurrencies.keys());
  const missedMilestones = activePlans.flatMap(plan => plan.milestones).filter(milestone =>
    milestone.status !== "paid" && milestone.status !== "waived" && milestone.dueAt < now,
  );
  const missedInvoices = openInvoices.filter(invoice =>
    invoice.dueAt !== undefined && invoice.dueAt < now && !linkedInvoiceIds.has(invoice.id),
  );
  const grouped = new Map<string, ClientPaymentCurrencyPosition>();
  const positionFor = (currencyValue: unknown): ClientPaymentCurrencyPosition => {
    const currency = invoiceCurrency(currencyValue);
    const existing = grouped.get(currency);
    if (existing) return existing;
    const created: ClientPaymentCurrencyPosition = {
      currency,
      agreedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
      missedPayments: 0,
      openInvoices: 0,
      activePlans: 0,
      completedPlans: 0,
    };
    grouped.set(currency, created);
    return created;
  };
  for (const plan of retainedPlans) {
    const position = positionFor(plan.currency);
    position.agreedCents += paymentPlanTotal(plan);
    position.paidCents += paymentPlanPaid(plan);
    if (plan.status === "active") position.activePlans += 1;
    if (plan.status === "completed") position.completedPlans += 1;
    for (const milestone of plan.milestones) {
      if (plan.status !== "active" || milestone.status === "paid" || milestone.status === "waived") continue;
      if (milestone.dueAt < now) position.missedPayments += 1;
      else if (position.nextDueAt === undefined || milestone.dueAt < position.nextDueAt) position.nextDueAt = milestone.dueAt;
    }
  }
  for (const invoice of chargeableInvoices) {
    const linkedCurrency = linkedInvoiceCurrencies.get(invoice.id);
    const position = positionFor(linkedCurrency ?? invoice.currency);
    if (isCollectibleInvoiceStatus(invoice.status)) position.openInvoices += 1;
    if (invoice.status === "paid" && invoice.paidAt && (position.lastPaidAt === undefined || invoice.paidAt > position.lastPaidAt)) {
      position.lastPaidAt = invoice.paidAt;
    }
    if (linkedInvoiceIds.has(invoice.id)) continue;
    const amount = positiveInteger(invoice.totalCents);
    position.agreedCents += amount;
    if (invoice.status === "paid") position.paidCents += invoice.netPaidCents === undefined ? amount : Math.min(amount, positiveInteger(invoice.netPaidCents));
    if (invoice.status === "partially-refunded") position.paidCents += Math.min(amount, positiveInteger(invoice.netPaidCents));
    if (isCollectibleInvoiceStatus(invoice.status) && invoice.dueAt !== undefined) {
      if (invoice.dueAt < now) position.missedPayments += 1;
      else if (position.nextDueAt === undefined || invoice.dueAt < position.nextDueAt) position.nextDueAt = invoice.dueAt;
    }
  }
  const currencyPositions = [...grouped.values()]
    .map(position => ({
      ...position,
      outstandingCents: Math.max(0, position.agreedCents - position.paidCents),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  const missedPayments = missedMilestones.length + missedInvoices.length;
  const hasOnlyPaidInvoices = chargeableInvoices.length > 0 && chargeableInvoices.every(invoice => invoice.status === "paid");
  const hasDraft = retainedPlans.some(plan => plan.status === "draft") || invoices.some(invoice => invoice.status === "draft");
  const state: ClientPaymentPositionState = missedPayments > 0
    ? "missed-payment"
    : openInvoices.length > 0
      ? "payment-due"
      : activePlans.length > 0
        ? "payment-plan"
        : completedPlans.length > 0 || hasOnlyPaidInvoices
          ? "paid-in-full"
          : hasDraft
            ? "draft"
            : "unconfigured";
  const label: Record<ClientPaymentPositionState, string> = {
    unconfigured: "Payment terms not configured",
    draft: "Payment schedule in draft",
    "payment-plan": "Payment plan active",
    "payment-due": "Payment due",
    "missed-payment": missedPayments === 1 ? "1 missed payment" : `${missedPayments} missed payments`,
    "paid-in-full": "Paid in full",
  };
  return {
    state,
    label: label[state],
    currencyPositions,
    missedPayments,
    openInvoices: openInvoices.length,
    activePlans: activePlans.length,
    completedPlans: completedPlans.length,
    nextDueAt: currencyPositions.map(position => position.nextDueAt).filter((value): value is number => value !== undefined).sort((a, b) => a - b)[0],
    lastPaidAt: paidInvoices.map(invoice => invoice.paidAt).filter((value): value is number => Boolean(value)).sort((a, b) => b - a)[0],
  };
}
