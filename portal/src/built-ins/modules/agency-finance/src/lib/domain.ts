// Agency-finance domain. Persisted under per-install plugin storage.
//
// Scope: per-agency. Both Invoice and Expense rows carry `agencyId`;
// Invoice additionally carries `clientId` (the client being billed).
// All money is integer cents — no floats.

import type { AgencyId, ClientId, UserId } from "./tenancy";

// ─── Invoice ─────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void" | "refunded";
export type Currency = "usd" | "gbp" | "eur";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;                  // computed = quantity * unitCents
}

export interface Invoice {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;                  // billed to a client
  number: string;                      // human-readable, e.g. "INV-2026-0042"
  issuedAt: number;                    // epoch ms — when invoice issued
  dueAt: number;                       // epoch ms — payment due
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;                  // subtotal + tax
  currency: Currency;
  status: InvoiceStatus;
  notes?: string;
  externalRef?: string;                // Stripe Invoice id when synced
  paidAt?: number;
  paidVia?: "stripe" | "bank-transfer" | "cash" | "manual";
  createdAt: number;
  updatedAt: number;
}

export interface CreateInvoiceInput {
  clientId: ClientId;
  issuedAt?: number;
  dueAt: number;
  lineItems: Array<{ description: string; quantity: number; unitCents: number }>;
  taxCents?: number;
  currency?: Currency;
  notes?: string;
}

export interface UpdateInvoicePatch {
  dueAt?: number;
  lineItems?: Array<{ description: string; quantity: number; unitCents: number }>;
  taxCents?: number;
  notes?: string;
  status?: InvoiceStatus;
  externalRef?: string;
  paidVia?: Invoice["paidVia"];
}

// ─── Expense ─────────────────────────────────────────────────────────────

export type ExpenseStatus = "pending" | "approved" | "reimbursed" | "rejected";

export interface Expense {
  id: string;
  agencyId: AgencyId;
  staffId?: string;                    // optional foundation User id (or agency-HR Staff id)
  categoryId: string;
  vendor?: string;
  description?: string;
  amountCents: number;
  currency: Currency;
  incurredAt: number;                  // epoch ms — when the expense happened
  status: ExpenseStatus;
  receiptUrl?: string;                 // stored on plugin storage
  approvedBy?: UserId;
  approvedAt?: number;
  reimbursedAt?: number;
  decisionNote?: string;               // approval / rejection reason
  createdAt: number;
  updatedAt: number;
}

export interface CreateExpenseInput {
  staffId?: string;
  categoryId: string;
  vendor?: string;
  description?: string;
  amountCents: number;
  currency?: Currency;
  incurredAt?: number;
  receiptUrl?: string;
}

export interface UpdateExpensePatch {
  staffId?: string;
  categoryId?: string;
  vendor?: string;
  description?: string;
  amountCents?: number;
  incurredAt?: number;
  receiptUrl?: string;
}

// ─── ExpenseCategory ─────────────────────────────────────────────────────

export type ExpenseCategoryStatus = "active" | "archived";

export interface ExpenseCategory {
  id: string;
  agencyId: AgencyId;
  name: string;
  isDefault: boolean;                  // seeded vs. agency-added
  status: ExpenseCategoryStatus;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
}

export interface UpdateCategoryPatch {
  name?: string;
  description?: string;
  status?: ExpenseCategoryStatus;
}

// ─── Listing filters ─────────────────────────────────────────────────────

export interface InvoiceFilter {
  status?: InvoiceStatus;
  clientId?: ClientId;
  query?: string;
  fromIssuedAt?: number;
  toIssuedAt?: number;
}

export interface ExpenseFilter {
  status?: ExpenseStatus;
  categoryId?: string;
  staffId?: string;
  fromIncurredAt?: number;
  toIncurredAt?: number;
}

// ─── Report types ────────────────────────────────────────────────────────

export interface RevenueSnapshot {
  from: number;
  to: number;
  currency: Currency;
  invoicesIssued: number;
  invoicesPaid: number;
  totalIssuedCents: number;
  totalPaidCents: number;
  totalOverdueCents: number;
  totalExpensesCents: number;
  netCents: number;                    // totalPaidCents - totalExpensesCents
  expensesByCategory: Array<{ categoryId: string; categoryName: string; amountCents: number; count: number }>;
  monthly: Array<{ year: number; month: number; paidCents: number; expenseCents: number }>;
}

// ─── R007 additions: Payment + Plan + P&L (founder dashboard) ────────────

export type PaymentMethod = "stripe" | "bank-transfer" | "cash" | "manual" | "other";

// Payment is a money-in event tied to an Invoice. v1 supports a single
// payment per invoice (full settlement); the storage layout permits
// multiple records per invoice for partial-payment R+1.
export interface Payment {
  id: string;
  agencyId: AgencyId;
  invoiceId: string;
  clientId: ClientId;
  amountCents: number;
  currency: Currency;
  method: PaymentMethod;
  paidAt: number;
  notes?: string;
  externalRef?: string;       // Stripe charge / bank reference
  createdAt: number;
}

export interface CreatePaymentInput {
  invoiceId: string;
  amountCents: number;
  currency: Currency;
  method: PaymentMethod;
  paidAt?: number;            // defaults to now()
  notes?: string;
  externalRef?: string;
}

export type PlanTier = "starter" | "growth" | "scale" | "custom";

export interface Plan {
  id: string;
  agencyId: AgencyId;
  tier: PlanTier;
  label: string;
  monthlyAmountCents: number;
  currency: Currency;
  // Lock-in: 0 = month-to-month. Months > 0 imply a one-time lock-in fee
  // (tracked on the assigned client's metadata.lockInPaid by T1 R002).
  lockInMonths: number;
  lockInFeeCents: number;
  // Clients currently assigned to this plan. v1: a client can only
  // belong to ONE plan; reassignment moves the id between arrays.
  clientIds: ClientId[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePlanInput {
  tier: PlanTier;
  label: string;
  monthlyAmountCents: number;
  currency?: Currency;
  lockInMonths?: number;
  lockInFeeCents?: number;
  active?: boolean;
}

export interface UpdatePlanPatch {
  label?: string;
  monthlyAmountCents?: number;
  lockInMonths?: number;
  lockInFeeCents?: number;
  active?: boolean;
}

// ─── P&L / founder dashboard ─────────────────────────────────────────────

export interface PnLMonth {
  year: number;
  month: number;             // 1-12
  revenueCents: number;      // payments received within the month
  expensesCents: number;     // expenses incurred within the month
  netCents: number;
}

export interface FounderSnapshot {
  currency: Currency;
  // Monthly Recurring Revenue: sum of monthlyAmountCents for assigned
  // active plans (not based on payments — true MRR view).
  mrrCents: number;
  arrCents: number;          // mrr × 12
  // Active client count: clients assigned to any active plan.
  activeClients: number;
  // Churn = clients_lost_in_window / clients_at_window_start.
  // Returned 0 when window has zero starting clients (avoids NaN).
  churnRate: number;
  churnedClientIds: ClientId[];
  // Top clients by lifetime revenue (sum of payments).
  topClients: Array<{ clientId: ClientId; lifetimeCents: number }>;
  // 12 trailing months ending in the snapshot's "now" month.
  trailingMonths: PnLMonth[];
  // Honesty contract — true when the snapshot has zero invoices AND
  // zero plans; the dashboard renders an empty-state instead of
  // fabricated numbers.
  hasData: boolean;
}

export interface PaymentFilter {
  invoiceId?: string;
  clientId?: ClientId;
  fromPaidAt?: number;
  toPaidAt?: number;
  method?: PaymentMethod;
}
