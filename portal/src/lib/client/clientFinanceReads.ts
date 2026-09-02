import {
  CheckedMutationError,
  checkedJsonMutation,
  mutationErrorMessage,
} from "@/lib/client/checkedMutation";

export interface ClientFinanceInvoice {
  id: string;
  number: string;
  issuedAt: number;
  dueAt: number;
  totalCents: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void" | "partially-refunded" | "refunded";
  paidAt?: number;
  lineItems?: Array<{ description: string }>;
  notes?: string;
}

export interface ClientFinanceExpense {
  id: string;
  categoryId: string;
  vendor?: string;
  description?: string;
  amountCents: number;
  taxCents?: number;
  currency: string;
  incurredAt: number;
  status: "pending" | "approved" | "reimbursed" | "rejected";
  receiptUrl?: string;
}

export interface ClientFinanceExpenseCategory {
  id: string;
  name: string;
  status: "active" | "archived";
}

interface InvoicePayload {
  ok: true;
  invoices: ClientFinanceInvoice[];
}

interface ExpensePayload {
  ok: true;
  expenses: ClientFinanceExpense[];
}

interface ExpenseCategoryPayload {
  ok: true;
  categories: ClientFinanceExpenseCategory[];
}

export type ClientFinanceReadFailureKind = "unavailable" | "plugin-missing";

export type ClientFinanceReadResult<T> =
  | { available: true; rows: T[] }
  | { available: false; kind: ClientFinanceReadFailureKind; message: string };

export interface ClientFinanceReadResults {
  invoices: ClientFinanceReadResult<ClientFinanceInvoice>;
  expenses: ClientFinanceReadResult<ClientFinanceExpense>;
  categories: ClientFinanceReadResult<ClientFinanceExpenseCategory>;
}

export type ClientFinanceReadPhase = "loading" | "ready" | "unavailable" | "plugin-missing";

export interface ClientFinanceReadState<T> {
  phase: ClientFinanceReadPhase;
  rows: T[];
  hasConfirmedSnapshot: boolean;
  message?: string;
}

type ClientFinanceFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function validInvoice(value: unknown): value is ClientFinanceInvoice {
  const invoice = record(value);
  return Boolean(
    invoice
    && typeof invoice.id === "string"
    && typeof invoice.number === "string"
    && typeof invoice.issuedAt === "number"
    && typeof invoice.dueAt === "number"
    && typeof invoice.totalCents === "number"
    && typeof invoice.currency === "string"
    && ["draft", "sent", "paid", "overdue", "void", "partially-refunded", "refunded"].includes(String(invoice.status))
    && optionalNumber(invoice.paidAt)
    && optionalString(invoice.notes)
    && (invoice.lineItems === undefined || (
      Array.isArray(invoice.lineItems)
      && invoice.lineItems.every(item => typeof record(item)?.description === "string")
    )),
  );
}

function validExpense(value: unknown): value is ClientFinanceExpense {
  const expense = record(value);
  return Boolean(
    expense
    && typeof expense.id === "string"
    && typeof expense.categoryId === "string"
    && typeof expense.amountCents === "number"
    && typeof expense.currency === "string"
    && typeof expense.incurredAt === "number"
    && ["pending", "approved", "reimbursed", "rejected"].includes(String(expense.status))
    && optionalString(expense.vendor)
    && optionalString(expense.description)
    && optionalNumber(expense.taxCents)
    && optionalString(expense.receiptUrl),
  );
}

function validCategory(value: unknown): value is ClientFinanceExpenseCategory {
  const category = record(value);
  return Boolean(
    category
    && typeof category.id === "string"
    && typeof category.name === "string"
    && (category.status === "active" || category.status === "archived"),
  );
}

function validInvoicePayload(value: InvoicePayload): boolean {
  return value.ok === true && Array.isArray(value.invoices) && value.invoices.every(validInvoice);
}

function validExpensePayload(value: ExpensePayload): boolean {
  return value.ok === true && Array.isArray(value.expenses) && value.expenses.every(validExpense);
}

function validExpenseCategoryPayload(value: ExpenseCategoryPayload): boolean {
  return value.ok === true && Array.isArray(value.categories) && value.categories.every(validCategory);
}

const EXPLICIT_PLUGIN_MISSING_CODES = new Set([
  "feature_disabled",
  "plugin_disabled",
  "plugin_missing",
  "plugin_not_installed",
  "not_installed",
]);

function explicitPluginMissing(error: unknown): boolean {
  if (!(error instanceof CheckedMutationError)) return false;
  const payload = record(error.payload);
  const code = payload?.error ?? payload?.code ?? payload?.reason;
  return typeof code === "string" && EXPLICIT_PLUGIN_MISSING_CODES.has(code.trim().toLowerCase());
}

async function readRows<TPayload, TRow>(options: {
  input: string;
  fallback: string;
  select: (payload: TPayload) => TRow[];
  validate: (payload: TPayload) => boolean;
  fetcher?: ClientFinanceFetcher;
  signal?: AbortSignal;
}): Promise<ClientFinanceReadResult<TRow>> {
  try {
    const payload = await checkedJsonMutation<TPayload>(
      options.input,
      { method: "GET", cache: "no-store", signal: options.signal },
      { fallback: options.fallback, fetcher: options.fetcher, validate: options.validate },
    );
    return { available: true, rows: options.select(payload) };
  } catch (error) {
    const kind: ClientFinanceReadFailureKind = explicitPluginMissing(error)
      ? "plugin-missing"
      : "unavailable";
    return { available: false, kind, message: mutationErrorMessage(error, options.fallback) };
  }
}

/**
 * Read each mounted Finance catalogue through its own checked boundary. One
 * source failing must not erase or misclassify the sources that did answer.
 */
export async function readClientFinanceSources(options: {
  clientId: string;
  fetcher?: ClientFinanceFetcher;
  signal?: AbortSignal;
}): Promise<ClientFinanceReadResults> {
  const clientId = encodeURIComponent(options.clientId);
  const [invoices, expenses, categories] = await Promise.all([
    readRows<InvoicePayload, ClientFinanceInvoice>({
      input: `/api/portal/agency-finance/invoices?clientId=${clientId}`,
      fallback: "Invoices could not be loaded.",
      select: payload => payload.invoices,
      validate: validInvoicePayload,
      fetcher: options.fetcher,
      signal: options.signal,
    }),
    readRows<ExpensePayload, ClientFinanceExpense>({
      input: `/api/portal/agency-finance/expenses?clientId=${clientId}`,
      fallback: "Client costs could not be loaded.",
      select: payload => payload.expenses,
      validate: validExpensePayload,
      fetcher: options.fetcher,
      signal: options.signal,
    }),
    readRows<ExpenseCategoryPayload, ClientFinanceExpenseCategory>({
      input: "/api/portal/agency-finance/categories",
      fallback: "Expense categories could not be loaded.",
      select: payload => payload.categories,
      validate: validExpenseCategoryPayload,
      fetcher: options.fetcher,
      signal: options.signal,
    }),
  ]);
  return { invoices, expenses, categories };
}

export function initialClientFinanceReadState<T>(): ClientFinanceReadState<T> {
  return { phase: "loading", rows: [], hasConfirmedSnapshot: false };
}

export function beginClientFinanceRead<T>(current: ClientFinanceReadState<T>): ClientFinanceReadState<T> {
  return { ...current, phase: "loading", message: undefined };
}

export function settleClientFinanceRead<T>(
  current: ClientFinanceReadState<T>,
  result: ClientFinanceReadResult<T>,
): ClientFinanceReadState<T> {
  if (result.available) {
    return { phase: "ready", rows: result.rows, hasConfirmedSnapshot: true };
  }
  return {
    phase: result.kind,
    rows: current.rows,
    hasConfirmedSnapshot: current.hasConfirmedSnapshot,
    message: result.message,
  };
}

export function clientFinanceReadPresentation<T>(state: ClientFinanceReadState<T>) {
  const current = state.phase === "ready";
  return {
    current,
    canMutate: current,
    showLoading: state.phase === "loading",
    showUnavailable: state.phase === "unavailable",
    showPluginMissing: state.phase === "plugin-missing",
    showRows: state.hasConfirmedSnapshot && state.rows.length > 0,
    showEmpty: current && state.hasConfirmedSnapshot && state.rows.length === 0,
    retainedSnapshotIsStale: !current && state.hasConfirmedSnapshot,
  };
}
