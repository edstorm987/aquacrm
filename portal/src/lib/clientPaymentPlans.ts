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
  paidAt?: number;
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
