// Canonical Finance accounting projections.
//
// Cash and accrual/commitment numbers are deliberately separate. Every
// calculation is scoped to one currency; no implicit FX conversion is ever
// performed. Payment rows are the primary cash-receipt ledger. A fully paid
// legacy invoice with no Payment rows is retained as a compatibility receipt.

import type {
  Currency,
  Expense,
  FinanceAccountingMonth,
  FinanceAccountingSnapshot,
  IncomeEntry,
  Invoice,
  Payment,
  Refund,
} from "../lib/domain";
import { invoiceOutstandingCents, isCollectibleInvoiceStatus } from "../lib/paymentAllocation";
import type { ExpenseService } from "./expenses";
import type { IncomeService } from "./income";
import type { InvoiceService } from "./invoices";
import type { PaymentService } from "./payments";

interface AccountingRows {
  invoices: Invoice[];
  payments: Payment[];
  refunds: Refund[];
  income: IncomeEntry[];
  expenses: Expense[];
}

interface AccountingPeriodInput extends AccountingRows {
  from: number;
  to: number;
  currency: Currency;
}

const inPeriod = (at: number, from: number, to: number): boolean => at >= from && at <= to;

function assertPeriod(from: number, to: number): void {
  if (!Number.isSafeInteger(from) || from < 0) throw new Error("agency-finance: from must be a non-negative timestamp");
  if (!Number.isSafeInteger(to) || to < 0) throw new Error("agency-finance: to must be a non-negative timestamp");
  if (from > to) throw new Error("agency-finance: from must not be after to");
}

function taxShare(invoice: Invoice | undefined, amountCents: number): number {
  if (!invoice || invoice.totalCents <= 0 || invoice.taxCents <= 0) return 0;
  return Math.round(invoice.taxCents * amountCents / invoice.totalCents);
}

export function calculateAccountingPeriod(input: AccountingPeriodInput): FinanceAccountingSnapshot {
  const { from, to, currency } = input;
  assertPeriod(from, to);
  const currencyInvoices = input.invoices.filter(row => row.currency === currency && row.issuedAt <= to);
  const currencyPayments = input.payments.filter(row => row.currency === currency && row.paidAt <= to);
  const currencyRefunds = input.refunds.filter(row => row.currency === currency && row.refundedAt <= to);
  const currencyIncome = input.income.filter(row => row.currency === currency && row.receivedAt <= to);
  const currencyExpenses = input.expenses.filter(row => row.currency === currency && row.incurredAt <= to);
  const invoiceById = new Map(currencyInvoices.map(invoice => [invoice.id, invoice]));
  const invoiceIdsWithPayments = new Set(currencyPayments.map(payment => payment.invoiceId));

  const periodInvoices = currencyInvoices.filter(invoice => inPeriod(invoice.issuedAt, from, to));
  const recognisedInvoices = periodInvoices.filter(invoice => invoice.status !== "draft" && invoice.status !== "void");
  const periodPayments = currencyPayments.filter(payment => inPeriod(payment.paidAt, from, to));
  const periodRefunds = currencyRefunds.filter(refund => inPeriod(refund.refundedAt, from, to));
  const legacyPaidInvoices = currencyInvoices.filter(invoice =>
    invoice.status === "paid"
    && !invoiceIdsWithPayments.has(invoice.id)
    && inPeriod(invoice.paidAt ?? invoice.issuedAt, from, to),
  );
  const periodOtherIncome = currencyIncome.filter(entry => inPeriod(entry.receivedAt, from, to));
  const paidExpenses = currencyExpenses.filter(expense =>
    expense.status === "reimbursed"
    && inPeriod(expense.reimbursedAt ?? expense.incurredAt, from, to),
  );
  const committedExpenses = currencyExpenses.filter(expense =>
    (expense.status === "approved" || expense.status === "reimbursed")
    && inPeriod(expense.incurredAt, from, to),
  );
  const pendingExpenses = currencyExpenses.filter(expense =>
    expense.status === "pending" && inPeriod(expense.incurredAt, from, to),
  );

  const grossCashInvoiceRevenueCents = periodPayments.reduce((sum, payment) => sum + payment.amountCents, 0)
    + legacyPaidInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const refundCents = periodRefunds.reduce((sum, refund) => sum + refund.amountCents, 0);
  const cashInvoiceRevenueCents = grossCashInvoiceRevenueCents - refundCents;
  const otherCashRevenueCents = periodOtherIncome.reduce((sum, entry) => sum + entry.amountCents, 0);
  const grossCashRevenueCents = grossCashInvoiceRevenueCents + otherCashRevenueCents;
  const cashRevenueCents = grossCashRevenueCents - refundCents;
  const cashExpenseCents = paidExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const accrualRevenueCents = recognisedInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const committedExpenseCents = committedExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const pendingExpenseCents = pendingExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  const collectibleInvoices = currencyInvoices.filter(invoice => isCollectibleInvoiceStatus(invoice.status));
  const outstandingReceivableCents = collectibleInvoices.reduce(
    (sum, invoice) => sum + invoiceOutstandingCents(invoice, currencyPayments, currencyRefunds),
    0,
  );
  const overdueReceivableCents = collectibleInvoices
    .filter(invoice => invoice.status === "overdue" || invoice.dueAt < to)
    .reduce((sum, invoice) => sum + invoiceOutstandingCents(invoice, currencyPayments, currencyRefunds), 0);

  const grossOutputTaxCents = periodPayments.reduce(
    (sum, payment) => sum + taxShare(invoiceById.get(payment.invoiceId), payment.amountCents),
  0,
  ) + legacyPaidInvoices.reduce((sum, invoice) => sum + invoice.taxCents, 0);
  const refundedOutputTaxCents = periodRefunds.reduce(
    (sum, refund) => sum + taxShare(invoiceById.get(refund.invoiceId), refund.amountCents),
    0,
  );
  const outputTaxCents = grossOutputTaxCents - refundedOutputTaxCents;
  const inputTaxCents = paidExpenses.reduce(
    (sum, expense) => sum + (expense.taxDeductible === false ? 0 : (expense.taxCents ?? 0)),
    0,
  );
  const deductibleCashExpenseCents = paidExpenses.reduce(
    (sum, expense) => sum + Math.round(expense.amountCents * (expense.businessUsePercent ?? 100) / 100),
    0,
  );

  const byClient = new Map<string, { cashRevenueCents: number; cashExpenseCents: number }>();
  const addClient = (clientId: string | undefined, field: "cashRevenueCents" | "cashExpenseCents", cents: number): void => {
    if (!clientId) return;
    const row = byClient.get(clientId) ?? { cashRevenueCents: 0, cashExpenseCents: 0 };
    row[field] += cents;
    byClient.set(clientId, row);
  };
  for (const payment of periodPayments) addClient(payment.clientId, "cashRevenueCents", payment.amountCents);
  for (const refund of periodRefunds) addClient(refund.clientId, "cashRevenueCents", -refund.amountCents);
  for (const invoice of legacyPaidInvoices) addClient(invoice.clientId, "cashRevenueCents", invoice.totalCents);
  for (const entry of periodOtherIncome) addClient(entry.clientId, "cashRevenueCents", entry.amountCents);
  for (const expense of paidExpenses) addClient(expense.clientId, "cashExpenseCents", expense.amountCents);

  const availableCurrencies = Array.from(new Set<Currency>([
    currency,
    ...input.invoices.map(row => row.currency),
    ...input.payments.map(row => row.currency),
    ...input.refunds.map(row => row.currency),
    ...input.income.map(row => row.currency),
    ...input.expenses.map(row => row.currency),
  ])).sort((left, right) => left.localeCompare(right));

  return {
    from,
    to,
    currency,
    availableCurrencies,
    invoicesIssued: periodInvoices.length,
    invoiceReceipts: new Set([
      ...periodPayments.map(payment => payment.invoiceId),
      ...legacyPaidInvoices.map(invoice => invoice.id),
    ]).size,
    issuedInvoiceCents: periodInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    grossCashInvoiceRevenueCents,
    cashInvoiceRevenueCents,
    otherCashRevenueCents,
    grossCashRevenueCents,
    refundCents,
    cashRevenueCents,
    cashExpenseCents,
    cashNetCents: cashRevenueCents - cashExpenseCents,
    accrualRevenueCents,
    committedExpenseCents,
    pendingExpenseCents,
    accrualNetCents: accrualRevenueCents - committedExpenseCents,
    outstandingReceivableCents,
    overdueReceivableCents,
    outputTaxCents,
    inputTaxCents,
    deductibleCashExpenseCents,
    missingReceiptCount: paidExpenses.filter(expense => !expense.receiptUrl && !expense.attachments?.length).length,
    byClient: [...byClient.entries()].map(([clientId, row]) => ({
      clientId,
      ...row,
      cashNetCents: row.cashRevenueCents - row.cashExpenseCents,
    })).sort((left, right) => right.cashNetCents - left.cashNetCents || left.clientId.localeCompare(right.clientId)),
    hasData: periodInvoices.length > 0
      || periodPayments.length > 0
      || periodRefunds.length > 0
      || legacyPaidInvoices.length > 0
      || periodOtherIncome.length > 0
      || currencyExpenses.some(expense => inPeriod(expense.incurredAt, from, to)),
  };
}

export class AccountingService {
  constructor(
    private invoices: InvoiceService,
    private payments: PaymentService,
    private income: IncomeService,
    private expenses: ExpenseService,
  ) {}

  private async rows(): Promise<AccountingRows> {
    const [invoices, payments, refunds, income, expenses] = await Promise.all([
      this.invoices.list(),
      this.payments.list(),
      this.payments.listRefunds(),
      this.income.list(),
      this.expenses.list(),
    ]);
    return { invoices, payments, refunds, income, expenses };
  }

  async snapshot(args: { from: number; to: number; currency: Currency }): Promise<FinanceAccountingSnapshot> {
    return calculateAccountingPeriod({ ...await this.rows(), ...args });
  }

  async trailingMonths(refNow: number, count: number, currency: Currency): Promise<FinanceAccountingMonth[]> {
    if (!Number.isSafeInteger(refNow) || refNow < 0) throw new Error("agency-finance: now must be a non-negative timestamp");
    if (!Number.isSafeInteger(count) || count < 0 || count > 1_200) throw new Error("agency-finance: month count must be between 0 and 1200");
    const rows = await this.rows();
    const ref = new Date(refNow);
    const length = count;
    return Array.from({ length }, (_, index) => {
      const offset = length - 1 - index;
      const start = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - offset, 1);
      const end = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - offset + 1, 1) - 1;
      return this.month(calculateAccountingPeriod({ ...rows, from: start, to: end, currency }), start);
    });
  }

  async calendarMonths(args: { from: number; to: number; currency: Currency }): Promise<FinanceAccountingMonth[]> {
    assertPeriod(args.from, args.to);
    const rows = await this.rows();
    const start = new Date(args.from);
    const end = new Date(args.to);
    const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
    const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
    const months: FinanceAccountingMonth[] = [];
    for (let cursor = first; cursor <= last;) {
      const date = new Date(cursor);
      const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      const snapshot = calculateAccountingPeriod({
        ...rows,
        from: Math.max(args.from, cursor),
        to: Math.min(args.to, next - 1),
        currency: args.currency,
      });
      months.push(this.month(snapshot, cursor));
      cursor = next;
    }
    return months;
  }

  private month(snapshot: FinanceAccountingSnapshot, monthStart: number): FinanceAccountingMonth {
    const date = new Date(monthStart);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      cashRevenueCents: snapshot.cashRevenueCents,
      grossCashRevenueCents: snapshot.grossCashRevenueCents,
      refundCents: snapshot.refundCents,
      cashExpenseCents: snapshot.cashExpenseCents,
      cashNetCents: snapshot.cashNetCents,
      accrualRevenueCents: snapshot.accrualRevenueCents,
      committedExpenseCents: snapshot.committedExpenseCents,
      accrualNetCents: snapshot.accrualNetCents,
      paidCents: snapshot.cashRevenueCents,
      expenseCents: snapshot.cashExpenseCents,
    };
  }
}
