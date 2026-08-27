// PnLService — founder-dashboard projections (MRR / ARR / churn /
// trailing cash/accrual views) over plans and the canonical accounting service.
//
// Honesty contract: when there are zero invoices AND zero plans we
// return `hasData: false` so the dashboard renders "Connect billing
// to see live numbers" rather than fabricated zeroes.

import type { ClientId } from "../lib/tenancy";
import type {
  Currency,
  FounderSnapshot,
  PnLMonth,
} from "../lib/domain";
import type { PaymentService } from "./payments";
import type { PlanService } from "./plans";
import type { AccountingService } from "./accounting";

export class PnLService {
  constructor(
    private payments: PaymentService,
    private plans: PlanService,
    private accounting: AccountingService,
  ) {}

  // Single trailing 12-month P&L (no founder context). Used by the
  // P&LPage admin route.
  async trailingMonths(refNow: number, count = 12, currency: Currency = "gbp"): Promise<PnLMonth[]> {
    return (await this.accounting.trailingMonths(refNow, count, currency)).map(month => ({
      ...month,
      revenueCents: month.cashRevenueCents,
      expensesCents: month.cashExpenseCents,
      netCents: month.cashNetCents,
    }));
  }

  // FounderSnapshot — MRR / ARR / churn / top clients / trailing 12m.
  // `windowDays` is the lookback used for the churn calculation;
  // defaults to 30.
  async founderSnapshot(refNow: number, windowDays = 30, currency: Currency = "gbp"): Promise<FounderSnapshot> {
    const plans = await this.plans.list(false);
    const assignments = await this.plans.listCommercialAssignments();
    const allPayments = await this.payments.list();
    const accounting = await this.accounting.snapshot({ from: 0, to: refNow, currency });
    const trailingMonths = await this.trailingMonths(refNow, 12, currency);
    const currencyAssignments = assignments.filter(assignment => assignment.currency === currency);
    const mrrCents = currencyAssignments.reduce((sum, assignment) => sum + assignment.monthlyAmountCents, 0);

    const activeClients = new Set<ClientId>();
    for (const assignment of currencyAssignments) activeClients.add(assignment.clientId);

    // Churn: clients whose last payment is older than the window's
    // start AND who have at least one historical payment. Real churn
    // tracking lands when plan-assignment history is logged (R+1).
    const windowMs = windowDays * 86_400_000;
    const lastPaymentByClient = new Map<ClientId, number>();
    for (const p of allPayments) {
      if (p.currency !== currency) continue;
      const cur = lastPaymentByClient.get(p.clientId) ?? 0;
      if (p.paidAt > cur) lastPaymentByClient.set(p.clientId, p.paidAt);
    }
    const churnedClientIds: ClientId[] = [];
    for (const [cid, lastTs] of lastPaymentByClient) {
      if (refNow - lastTs > windowMs && !activeClients.has(cid)) churnedClientIds.push(cid);
    }
    const startingClients = new Set([...activeClients, ...churnedClientIds]).size;
    const churnRate = startingClients > 0 ? churnedClientIds.length / startingClients : 0;

    const topClients = accounting.byClient
      .filter(row => row.cashRevenueCents > 0)
      .map(row => ({ clientId: row.clientId, lifetimeCents: row.cashRevenueCents }))
      .sort((a, b) => b.lifetimeCents - a.lifetimeCents)
      .slice(0, 10);

    const availableCurrencies = Array.from(new Set<Currency>([
      ...accounting.availableCurrencies,
      ...plans.map(plan => plan.currency),
      ...assignments.map(assignment => assignment.currency),
    ])).sort((left, right) => left.localeCompare(right));
    const hasData = accounting.hasData || currencyAssignments.length > 0;
    return {
      currency,
      availableCurrencies,
      mrrCents,
      arrCents: mrrCents * 12,
      activeClients: activeClients.size,
      churnRate,
      churnedClientIds,
      topClients,
      trailingMonths,
      hasData,
    };
  }

  // Deposit tracker derives from the canonical linked client schedule. The
  // deposit milestone names its invoice explicitly; no note/externalRef
  // heuristic and no catalogue clientIds mirror participates.
  async lockInRows(): Promise<Array<{
    clientId: ClientId;
    planId: string;
    planLabel: string;
    currency: Currency;
    lockInMonths: number;
    lockInFeeCents: number;
    paidCents: number;
    paid: boolean;
  }>> {
    const assignments = await this.plans.listCommercialAssignments();
    const out: Array<{
      clientId: ClientId; planId: string; planLabel: string; currency: Currency;
      lockInMonths: number; lockInFeeCents: number; paidCents: number; paid: boolean;
    }> = [];
    for (const assignment of assignments) {
      if (assignment.lockInFeeCents <= 0) continue;
      const payments = assignment.depositInvoiceId
        ? await this.payments.listForInvoice(assignment.depositInvoiceId)
        : [];
      const refunds = assignment.depositInvoiceId
        ? await this.payments.listRefundsForInvoice(assignment.depositInvoiceId)
        : [];
      const paidCents = Math.max(0,
        payments.reduce((sum, payment) => sum + payment.amountCents, 0)
        - refunds.reduce((sum, refund) => sum + refund.amountCents, 0));
      out.push({
        clientId: assignment.clientId,
        planId: assignment.financePlanId,
        planLabel: assignment.title,
        currency: assignment.currency,
        lockInMonths: assignment.lockInMonths,
        lockInFeeCents: assignment.lockInFeeCents,
        paidCents,
        paid: paidCents >= assignment.lockInFeeCents,
      });
    }
    return out;
  }
}
