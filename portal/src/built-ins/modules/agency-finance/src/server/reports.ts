// Report service. Walks invoice + expense rows over a date window and
// returns aggregates. No graphs; raw numbers only — T3's website-editor
// blocks could later visualise.
//
// Multi-currency note: this v1 implementation reports per-currency
// when invoices/expenses span currencies. The default snapshot uses
// the install's default currency (or "gbp" fallback) and only counts
// rows in that currency. Cross-currency consolidation is a future
// round.

import type {
  Currency,
  RevenueSnapshot,
} from "../lib/domain";
import type { CategoryService } from "./categories";
import type { ExpenseService } from "./expenses";
import type { InvoiceService } from "./invoices";
import type { AccountingService } from "./accounting";

export class ReportService {
  constructor(
    private invoices: InvoiceService,
    private expenses: ExpenseService,
    private categories: CategoryService,
    private accounting: AccountingService,
  ) {}

  async revenueSnapshot(args: {
    from: number;
    to: number;
    currency?: Currency;
  }): Promise<RevenueSnapshot> {
    const currency = args.currency ?? "gbp";
    const allInvoices = await this.invoices.list({});
    const allExpenses = await this.expenses.list({});
    const allCategories = await this.categories.list();
    const accounting = await this.accounting.snapshot({ ...args, currency });
    const catNameById = new Map(allCategories.map(c => [c.id, c.name]));

    const invoicesInWindow = allInvoices.filter(i =>
      i.issuedAt >= args.from && i.issuedAt <= args.to && i.currency === currency,
    );
    const expensesInWindow = allExpenses.filter(e =>
      e.incurredAt >= args.from && e.incurredAt <= args.to && e.currency === currency,
    );

    const invoicesIssued = invoicesInWindow.length;
    const totalIssuedCents = invoicesInWindow.reduce((s, i) => s + i.totalCents, 0);

    const invoicesPaid = accounting.invoiceReceipts;
    const totalPaidCents = accounting.cashRevenueCents;

    const totalOverdueCents = accounting.overdueReceivableCents;

    // Cash outflow and approved/reimbursed commitments are intentionally
    // separate in the canonical accounting snapshot.
    const totalExpensesCents = accounting.cashExpenseCents;

    // Per-category accrual view: only approved or already reimbursed costs.
    const aggByCategory = new Map<string, { amountCents: number; count: number }>();
    for (const e of expensesInWindow) {
      if (e.status !== "approved" && e.status !== "reimbursed") continue;
      const slot = aggByCategory.get(e.categoryId) ?? { amountCents: 0, count: 0 };
      slot.amountCents += e.amountCents;
      slot.count += 1;
      aggByCategory.set(e.categoryId, slot);
    }
    const expensesByCategory = [...aggByCategory.entries()].map(([categoryId, v]) => ({
      categoryId,
      categoryName: catNameById.get(categoryId) ?? "Unknown",
      amountCents: v.amountCents,
      count: v.count,
    })).sort((a, b) => b.amountCents - a.amountCents);

    const monthly = await this.accounting.calendarMonths({ from: args.from, to: args.to, currency });

    return {
      from: args.from,
      to: args.to,
      currency,
      availableCurrencies: accounting.availableCurrencies,
      invoicesIssued,
      invoicesPaid,
      totalIssuedCents,
      totalPaidCents,
      totalOverdueCents,
      totalExpensesCents,
      netCents: totalPaidCents - totalExpensesCents,
      cashRevenueCents: accounting.cashRevenueCents,
      grossCashRevenueCents: accounting.grossCashRevenueCents,
      refundCents: accounting.refundCents,
      cashExpenseCents: accounting.cashExpenseCents,
      cashNetCents: accounting.cashNetCents,
      accrualRevenueCents: accounting.accrualRevenueCents,
      committedExpenseCents: accounting.committedExpenseCents,
      accrualNetCents: accounting.accrualNetCents,
      pendingExpenseCents: accounting.pendingExpenseCents,
      outstandingReceivableCents: accounting.outstandingReceivableCents,
      outputTaxCents: accounting.outputTaxCents,
      inputTaxCents: accounting.inputTaxCents,
      deductibleCashExpenseCents: accounting.deductibleCashExpenseCents,
      missingReceiptCount: accounting.missingReceiptCount,
      expensesByCategory,
      monthly,
    };
  }
}
