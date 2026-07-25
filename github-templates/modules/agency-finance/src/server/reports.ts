// Report service. Walks invoice + expense rows over a date window and
// returns aggregates. No graphs; raw numbers only — T3's website-editor
// blocks could later visualise.
//
// Multi-currency note: this v1 implementation reports per-currency
// when invoices/expenses span currencies. The default snapshot uses
// the install's default currency (or "usd" fallback) and only counts
// rows in that currency. Cross-currency consolidation is a future
// round.

import type { AgencyId } from "../lib/tenancy";
import type {
  Currency,
  Expense,
  Invoice,
  RevenueSnapshot,
} from "../lib/domain";
import type { CategoryService } from "./categories";
import type { ExpenseService } from "./expenses";
import type { InvoiceService } from "./invoices";

export class ReportService {
  constructor(
    private agencyId: AgencyId,
    private invoices: InvoiceService,
    private expenses: ExpenseService,
    private categories: CategoryService,
  ) {}

  async revenueSnapshot(args: {
    from: number;
    to: number;
    currency?: Currency;
  }): Promise<RevenueSnapshot> {
    const currency = args.currency ?? "usd";
    const allInvoices = await this.invoices.list({});
    const allExpenses = await this.expenses.list({});
    const allCategories = await this.categories.list();
    const catNameById = new Map(allCategories.map(c => [c.id, c.name]));

    const invoicesInWindow = allInvoices.filter(i =>
      i.issuedAt >= args.from && i.issuedAt <= args.to && i.currency === currency,
    );
    const expensesInWindow = allExpenses.filter(e =>
      e.incurredAt >= args.from && e.incurredAt <= args.to && e.currency === currency,
    );

    const invoicesIssued = invoicesInWindow.length;
    const totalIssuedCents = invoicesInWindow.reduce((s, i) => s + i.totalCents, 0);

    const paidInvoices = invoicesInWindow.filter(i => i.status === "paid");
    const invoicesPaid = paidInvoices.length;
    const totalPaidCents = paidInvoices.reduce((s, i) => s + i.totalCents, 0);

    const overdueInvoices = invoicesInWindow.filter(i =>
      i.status === "overdue" || (i.status === "sent" && i.dueAt < Date.now()),
    );
    const totalOverdueCents = overdueInvoices.reduce((s, i) => s + i.totalCents, 0);

    // Only count reimbursed expenses as "actual outflow". Pending and
    // approved-but-not-paid don't hit the bank yet. This is a v1
    // simplification — real GAAP-style accrual accounting would treat
    // approved as committed; future round.
    const reimbursedExpenses = expensesInWindow.filter(e => e.status === "reimbursed");
    const totalExpensesCents = reimbursedExpenses.reduce((s, e) => s + e.amountCents, 0);

    // Per-category aggregation — counts ALL non-rejected expenses in
    // window, paid or not, so the agency can see what it owes per
    // category. Caller can filter further.
    const aggByCategory = new Map<string, { amountCents: number; count: number }>();
    for (const e of expensesInWindow) {
      if (e.status === "rejected") continue;
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

    // Monthly aggregate. Indexed by year-month, easy to plot later.
    const monthlyAgg = new Map<string, { year: number; month: number; paidCents: number; expenseCents: number }>();
    const bumpMonth = (epoch: number, slot: "paidCents" | "expenseCents", cents: number): void => {
      const d = new Date(epoch);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const key = `${year}-${month}`;
      const existing = monthlyAgg.get(key) ?? { year, month, paidCents: 0, expenseCents: 0 };
      existing[slot] += cents;
      monthlyAgg.set(key, existing);
    };
    for (const i of paidInvoices) bumpMonth(i.paidAt ?? i.issuedAt, "paidCents", i.totalCents);
    for (const e of reimbursedExpenses) bumpMonth(e.reimbursedAt ?? e.incurredAt, "expenseCents", e.amountCents);
    const monthly = [...monthlyAgg.values()].sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );

    return {
      from: args.from,
      to: args.to,
      currency,
      invoicesIssued,
      invoicesPaid,
      totalIssuedCents,
      totalPaidCents,
      totalOverdueCents,
      totalExpensesCents,
      netCents: totalPaidCents - totalExpensesCents,
      expensesByCategory,
      monthly,
    };
  }
}
