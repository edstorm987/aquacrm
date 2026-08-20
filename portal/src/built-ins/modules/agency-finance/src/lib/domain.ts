// Agency-finance domain. Persisted under per-install plugin storage.
//
// Scope: per-agency. Both Invoice and Expense rows carry `agencyId`;
// Invoice additionally carries `clientId` (the client being billed).
// All money is integer cents — no floats.

import type { AgencyId, ClientId, UserId } from "./tenancy";

// ─── Invoice ─────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void" | "refunded";
export type Currency = "gbp" | "eur" | "usd" | "cad" | "aud" | "nzd" | "chf" | "sek" | "nok" | "dkk" | "jpy" | "sgd" | "hkd" | "aed";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;                  // computed = quantity * unitCents
}

export interface Invoice {
  id: string;
  agencyId: AgencyId;
  companyId?: string;
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
  companyId?: string;
  issuedAt?: number;
  dueAt: number;
  lineItems: Array<{ description: string; quantity: number; unitCents: number }>;
  taxCents?: number;
  currency?: Currency;
  notes?: string;
  idempotencyKey?: string;    // one-time key per submit intent; see lib/idempotency.ts
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

export interface InvoiceTemplate {
  name: string;
  accentColor: string;
  documentTitle: string;
  businessDetails?: string;
  paymentDetails?: string;
  footerText?: string;
  letterheadDataUrl?: string;
  updatedAt: number;
}

export type UpdateInvoiceTemplateInput = Omit<InvoiceTemplate, "updatedAt">;

// ─── Expense ─────────────────────────────────────────────────────────────

export type ExpenseStatus = "pending" | "approved" | "reimbursed" | "rejected";
export type ExpenseRecurrence = "monthly" | "quarterly" | "annual";

export interface ExpenseAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
  storageProvider: "supabase" | "vercel-blob" | "local";
  storageKey: string;
  uploadedAt: number;
}

export interface Expense {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;                 // optional direct cost allocation
  staffId?: string;                    // optional foundation User id (or agency-HR Staff id)
  categoryId: string;
  budgetPotId?: string;
  vendor?: string;
  description?: string;
  reason?: string;
  amountCents: number;
  netCents?: number;                   // amount before recoverable tax
  taxCents?: number;                   // VAT / sales tax included in amount
  taxRateBps?: number;                 // basis points: 2000 = 20%
  taxDeductible?: boolean;
  businessUsePercent?: number;         // 0-100 for mixed-use costs
  billableToClient?: boolean;
  currency: Currency;
  incurredAt: number;                  // epoch ms — when the expense happened
  status: ExpenseStatus;
  receiptUrl?: string;                 // stored on plugin storage
  attachments?: ExpenseAttachment[];
  paymentMethod?: "bank-transfer" | "card" | "cash" | "direct-debit" | "other";
  reference?: string;
  recurrence?: ExpenseRecurrence;
  nextDueAt?: number;
  recurringActive?: boolean;
  approvedBy?: UserId;
  approvedAt?: number;
  reimbursedAt?: number;
  decisionNote?: string;               // approval / rejection reason
  customFields?: Record<string, string | string[] | boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateExpenseInput {
  clientId?: ClientId;
  staffId?: string;
  categoryId: string;
  budgetPotId?: string;
  vendor?: string;
  description?: string;
  reason?: string;
  amountCents: number;
  taxCents?: number;
  taxRateBps?: number;
  taxDeductible?: boolean;
  businessUsePercent?: number;
  billableToClient?: boolean;
  currency?: Currency;
  incurredAt?: number;
  receiptUrl?: string;
  attachments?: ExpenseAttachment[];
  paymentMethod?: Expense["paymentMethod"];
  reference?: string;
  recurrence?: ExpenseRecurrence;
  nextDueAt?: number;
  recurringActive?: boolean;
  recordAsPaid?: boolean;
  customFields?: Record<string, string | string[] | boolean>;
  idempotencyKey?: string;    // one-time key per submit intent; see lib/idempotency.ts
}

export interface UpdateExpensePatch {
  clientId?: ClientId | null;
  staffId?: string | null;
  categoryId?: string;
  budgetPotId?: string | null;
  vendor?: string | null;
  description?: string | null;
  reason?: string | null;
  amountCents?: number;
  currency?: Currency;
  taxCents?: number;
  taxRateBps?: number | null;
  taxDeductible?: boolean;
  businessUsePercent?: number;
  billableToClient?: boolean;
  incurredAt?: number;
  receiptUrl?: string | null;
  attachments?: ExpenseAttachment[];
  paymentMethod?: Expense["paymentMethod"] | null;
  reference?: string | null;
  recurrence?: ExpenseRecurrence | null;
  nextDueAt?: number | null;
  recurringActive?: boolean;
  customFields?: Record<string, string | string[] | boolean>;
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

// ─── Budget pots ─────────────────────────────────────────────────────────

export type BudgetPotPurpose = "growth" | "marketing" | "gear" | "equipment" | "expansion" | "operations" | "team" | "tax" | "emergency" | "client-delivery" | "other";
export type BudgetPotPeriod = "one-off" | "monthly" | "quarterly" | "annual" | "custom";
export type BudgetPotStatus = "active" | "paused" | "closed";

export interface BudgetPot {
  id: string;
  agencyId: AgencyId;
  name: string;
  purpose: BudgetPotPurpose;
  companyIds?: string[];
  currency: Currency;
  period: BudgetPotPeriod;
  allocatedCents: number;
  fundedCents: number;
  startAt?: number;
  endAt?: number;
  notes?: string;
  status: BudgetPotStatus;
  createdBy: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBudgetPotInput {
  name: string;
  purpose: BudgetPotPurpose;
  companyIds?: string[];
  currency?: Currency;
  period?: BudgetPotPeriod;
  allocatedCents: number;
  fundedCents?: number;
  startAt?: number;
  endAt?: number;
  notes?: string;
}

export interface UpdateBudgetPotPatch {
  name?: string;
  purpose?: BudgetPotPurpose;
  companyIds?: string[];
  period?: BudgetPotPeriod;
  allocatedCents?: number;
  fundedCents?: number;
  startAt?: number | null;
  endAt?: number | null;
  notes?: string | null;
  status?: BudgetPotStatus;
}

// ─── Finance operations: compliance and workforce costs ────────────────

export type FinanceObligationType = "annual-accounts" | "corporation-tax" | "vat-return" | "paye" | "pension" | "audit" | "insurance" | "licence" | "contract-renewal" | "data-protection" | "other";
export type FinanceObligationFrequency = "one-off" | "monthly" | "quarterly" | "annual" | "custom";
export type FinanceObligationStatus = "upcoming" | "action-required" | "in-progress" | "completed" | "waived" | "archived";

export interface FinanceObligation {
  id: string;
  agencyId: AgencyId;
  name: string;
  type: FinanceObligationType;
  companyIds?: string[];
  status: FinanceObligationStatus;
  frequency: FinanceObligationFrequency;
  owner?: string;
  provider?: string;
  reference?: string;
  linkedLegalDocumentId?: string;
  budgetPotId?: string;
  currency: Currency;
  expectedCostCents: number;
  coverageAmountCents?: number;
  effectiveAt?: number;
  nextDueAt?: number;
  reminderAt?: number;
  coverageEndsAt?: number;
  lastCompletedAt?: number;
  notes?: string;
  createdBy: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateFinanceObligationInput {
  name: string;
  type: FinanceObligationType;
  companyIds?: string[];
  status?: FinanceObligationStatus;
  frequency?: FinanceObligationFrequency;
  owner?: string;
  provider?: string;
  reference?: string;
  linkedLegalDocumentId?: string;
  budgetPotId?: string;
  currency?: Currency;
  expectedCostCents?: number;
  coverageAmountCents?: number;
  effectiveAt?: number;
  nextDueAt?: number;
  reminderAt?: number;
  coverageEndsAt?: number;
  notes?: string;
}

export interface UpdateFinanceObligationPatch extends Partial<Omit<CreateFinanceObligationInput, "type" | "linkedLegalDocumentId" | "budgetPotId" | "effectiveAt" | "nextDueAt" | "reminderAt" | "coverageEndsAt">> {
  type?: FinanceObligationType;
  linkedLegalDocumentId?: string | null;
  budgetPotId?: string | null;
  effectiveAt?: number | null;
  nextDueAt?: number | null;
  reminderAt?: number | null;
  coverageEndsAt?: number | null;
  lastCompletedAt?: number | null;
}

export type PayeeType = "employee" | "director" | "freelancer" | "contractor" | "agency";
export type CompensationRateBasis = "annual" | "monthly" | "hourly" | "daily" | "fixed";
export type CompensationFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "milestone";
export type CompensationProfileStatus = "active" | "paused" | "ended" | "archived";

export interface CompensationProfile {
  id: string;
  agencyId: AgencyId;
  staffId?: string;
  name: string;
  email?: string;
  payeeType: PayeeType;
  departmentId?: string;
  departmentName?: string;
  title?: string;
  companyIds?: string[];
  budgetPotId?: string;
  currency: Currency;
  rateBasis: CompensationRateBasis;
  baseRateCents: number;
  unitsPerWeek?: number;
  payFrequency: CompensationFrequency;
  employerCostPercent: number;
  annualBonusTargetCents: number;
  nextPayAt?: number;
  contractStartsAt?: number;
  contractEndsAt?: number;
  status: CompensationProfileStatus;
  notes?: string;
  createdBy: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCompensationProfileInput {
  staffId?: string;
  name: string;
  email?: string;
  payeeType: PayeeType;
  departmentId?: string;
  departmentName?: string;
  title?: string;
  companyIds?: string[];
  budgetPotId?: string;
  currency?: Currency;
  rateBasis: CompensationRateBasis;
  baseRateCents: number;
  unitsPerWeek?: number;
  payFrequency?: CompensationFrequency;
  employerCostPercent?: number;
  annualBonusTargetCents?: number;
  nextPayAt?: number;
  contractStartsAt?: number;
  contractEndsAt?: number;
  notes?: string;
}

export interface UpdateCompensationProfilePatch extends Partial<Omit<CreateCompensationProfileInput, "staffId" | "departmentId" | "departmentName" | "budgetPotId" | "nextPayAt" | "contractStartsAt" | "contractEndsAt">> {
  staffId?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  budgetPotId?: string | null;
  nextPayAt?: number | null;
  contractStartsAt?: number | null;
  contractEndsAt?: number | null;
  status?: CompensationProfileStatus;
}

export type CompensationPaymentKind = "salary" | "wages" | "bonus" | "commission" | "freelancer-invoice" | "contractor-invoice" | "employer-tax" | "pension" | "other";
export type CompensationPaymentStatus = "planned" | "approved" | "paid" | "cancelled";

export interface CompensationPayment {
  id: string;
  agencyId: AgencyId;
  profileId: string;
  budgetPotId?: string;
  kind: CompensationPaymentKind;
  periodLabel?: string;
  currency: Currency;
  grossCents: number;
  employerCostCents: number;
  status: CompensationPaymentStatus;
  dueAt: number;
  paidAt?: number;
  reference?: string;
  notes?: string;
  createdBy: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCompensationPaymentInput {
  profileId: string;
  budgetPotId?: string;
  kind: CompensationPaymentKind;
  periodLabel?: string;
  currency?: Currency;
  grossCents: number;
  employerCostCents?: number;
  status?: CompensationPaymentStatus;
  dueAt?: number;
  paidAt?: number;
  reference?: string;
  notes?: string;
  idempotencyKey?: string;    // one-time key per submit intent; see lib/idempotency.ts
}

export interface UpdateCompensationPaymentPatch extends Partial<Omit<CreateCompensationPaymentInput, "profileId" | "budgetPotId" | "paidAt">> {
  budgetPotId?: string | null;
  paidAt?: number | null;
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
  clientId?: ClientId;
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
  // One-time key per submit intent. A resubmit under the same key is deduped
  // (returns the first payment). A genuine second/partial payment uses a new
  // key and is recorded normally. See lib/idempotency.ts.
  idempotencyKey?: string;
}

export interface IncomeEntry {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  title: string;
  category?: string;
  description?: string;
  amountCents: number;
  currency: Currency;
  method: PaymentMethod;
  receivedAt: number;
  reference?: string;
  notes?: string;
  createdBy: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateIncomeEntryInput {
  clientId?: ClientId;
  title: string;
  category?: string;
  description?: string;
  amountCents: number;
  currency?: Currency;
  method: PaymentMethod;
  receivedAt?: number;
  reference?: string;
  notes?: string;
  idempotencyKey?: string;    // one-time key per submit intent; see lib/idempotency.ts
}

export interface IncomeEntryFilter {
  clientId?: ClientId;
  method?: PaymentMethod;
  fromReceivedAt?: number;
  toReceivedAt?: number;
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
  idempotencyKey?: string;    // one-time key per submit intent; see lib/idempotency.ts
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
