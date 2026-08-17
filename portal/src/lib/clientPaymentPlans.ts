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
  status: ClientPaymentMilestoneStatus;
  invoiceId?: string;
  invoiceNumber?: string;
  invoicedAt?: number;
  paidAt?: number;
}

export interface ClientPaymentPlan {
  id: string;
  title: string;
  summary?: string;
  currency: string;
  status: ClientPaymentPlanStatus;
  customerVisible: boolean;
  productIds: string[];
  milestones: ClientPaymentMilestone[];
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
  currency?: string;
  paidAt?: number;
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
            status: cleanStatus(milestone.status, CLIENT_PAYMENT_MILESTONE_STATUSES, "planned"),
            invoiceId: text(milestone.invoiceId, 120) || undefined,
            invoiceNumber: text(milestone.invoiceNumber, 80) || undefined,
            invoicedAt: timestamp(milestone.invoicedAt),
            paidAt: timestamp(milestone.paidAt),
          }];
        }).slice(0, 48)
      : [];
    return [{
      id,
      title,
      summary: text(row.summary, 2_000) || undefined,
      currency: text(row.currency, 8).toLowerCase() || "gbp",
      status: cleanStatus(row.status, CLIENT_PAYMENT_PLAN_STATUSES, "draft"),
      customerVisible: row.customerVisible === true,
      productIds: Array.isArray(row.productIds)
        ? [...new Set(row.productIds.map(item => text(item, 120)).filter(Boolean))].slice(0, 24)
        : [],
      milestones,
      internalNotes: text(row.internalNotes, 4_000) || undefined,
      createdAt: timestamp(row.createdAt) ?? Date.now(),
      updatedAt: timestamp(row.updatedAt) ?? Date.now(),
      activatedAt: timestamp(row.activatedAt),
      completedAt: timestamp(row.completedAt),
    }];
  }).slice(0, 24);
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
    .map(plan => ({ ...plan, internalNotes: undefined }));
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
  const chargeableInvoices = invoices.filter(invoice => !["void", "refunded", "draft"].includes(invoice.status));
  const openInvoices = chargeableInvoices.filter(invoice => ["sent", "overdue"].includes(invoice.status));
  const paidInvoices = chargeableInvoices.filter(invoice => invoice.status === "paid");
  const linkedInvoiceIds = new Set(retainedPlans.flatMap(plan => plan.milestones.map(milestone => milestone.invoiceId).filter((id): id is string => Boolean(id))));
  const missedMilestones = activePlans.flatMap(plan => plan.milestones).filter(milestone =>
    milestone.status !== "paid" && milestone.status !== "waived" && milestone.dueAt < now,
  );
  const missedInvoices = openInvoices.filter(invoice =>
    invoice.dueAt !== undefined && invoice.dueAt < now && !linkedInvoiceIds.has(invoice.id),
  );
  const nextDueAt = [
    ...activePlans.flatMap(plan => plan.milestones)
      .filter(milestone => milestone.status !== "paid" && milestone.status !== "waived" && milestone.dueAt >= now)
      .map(milestone => milestone.dueAt),
    ...openInvoices.filter(invoice => invoice.dueAt !== undefined && invoice.dueAt >= now).map(invoice => invoice.dueAt as number),
  ].sort((a, b) => a - b)[0];
  const planCurrency = retainedPlans[0]?.currency;
  const invoiceCurrency = chargeableInvoices.find(invoice => invoice.currency)?.currency;
  const currency = (planCurrency || invoiceCurrency || "gbp").toLowerCase();
  const agreedCents = retainedPlans.length
    ? retainedPlans.reduce((sum, plan) => sum + paymentPlanTotal(plan), 0)
    : chargeableInvoices.reduce((sum, invoice) => sum + (invoice.totalCents ?? 0), 0);
  const paidCents = retainedPlans.length
    ? retainedPlans.reduce((sum, plan) => sum + paymentPlanPaid(plan), 0)
    : paidInvoices.reduce((sum, invoice) => sum + (invoice.totalCents ?? 0), 0);
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
    currency,
    agreedCents,
    paidCents,
    outstandingCents: Math.max(0, agreedCents - paidCents),
    missedPayments,
    openInvoices: openInvoices.length,
    activePlans: activePlans.length,
    completedPlans: completedPlans.length,
    nextDueAt,
    lastPaidAt: paidInvoices.map(invoice => invoice.paidAt).filter((value): value is number => Boolean(value)).sort((a, b) => b - a)[0],
  };
}
