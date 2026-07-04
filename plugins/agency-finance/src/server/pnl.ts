// PnLService — founder-dashboard projections (MRR / ARR / churn /
// trailing P&L) over plans + payments + expenses + invoices.
//
// Honesty contract: when there are zero invoices AND zero plans we
// return `hasData: false` so the dashboard renders "Connect billing
// to see live numbers" rather than fabricated zeroes.

import type { AgencyId, ClientId } from "../lib/tenancy";
import type {
  Currency,
  FounderSnapshot,
  PnLMonth,
} from "../lib/domain";
import type { ExpenseService } from "./expenses";
import type { InvoiceService } from "./invoices";
import type { PaymentService } from "./payments";
import type { PlanService } from "./plans";

const MONTH_KEY = (year: number, month: number): string => `${year}-${month}`;

function startOfMonthUTC(year: number, month: number): number {
  return Date.UTC(year, month - 1, 1, 0, 0, 0);
}

function ymOf(ts: number): { year: number; month: number } {
  const d = new Date(ts);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export class PnLService {
  constructor(
    private agencyId: AgencyId,
    private invoices: InvoiceService,
    private payments: PaymentService,
    private expenses: ExpenseService,
    private plans: PlanService,
  ) {}

  // Single trailing 12-month P&L (no founder context). Used by the
  // P&LPage admin route.
  async trailingMonths(refNow: number, count = 12): Promise<PnLMonth[]> {
    const allPayments = await this.payments.list();
    const allExpenses = await this.expenses.list();
    const months: PnLMonth[] = [];
    const ref = ymOf(refNow);
    // Walk back `count` months ending in ref's month.
    for (let i = count - 1; i >= 0; i--) {
      const date = new Date(Date.UTC(ref.year, ref.month - 1 - i, 1));
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const start = startOfMonthUTC(year, month);
      const end = startOfMonthUTC(year, month + 1);
      const revenueCents = allPayments
        .filter(p => p.paidAt >= start && p.paidAt < end)
        .reduce((s, p) => s + p.amountCents, 0);
      const expensesCents = allExpenses
        .filter(e => e.incurredAt >= start && e.incurredAt < end && e.status === "approved")
        .reduce((s, e) => s + e.amountCents, 0);
      months.push({
        year, month,
        revenueCents,
        expensesCents,
        netCents: revenueCents - expensesCents,
      });
    }
    return months;
  }

  // FounderSnapshot — MRR / ARR / churn / top clients / trailing 12m.
  // `windowDays` is the lookback used for the churn calculation;
  // defaults to 30.
  async founderSnapshot(refNow: number, windowDays = 30): Promise<FounderSnapshot> {
    const plans = await this.plans.list(false);
    const allInvoices = await this.invoices.list();
    const allPayments = await this.payments.list();
    const trailingMonths = await this.trailingMonths(refNow, 12);

    const currency: Currency = plans[0]?.currency ?? allInvoices[0]?.currency ?? "gbp";
    const mrrCents = plans
      .filter(p => p.active)
      .reduce((s, p) => s + p.monthlyAmountCents * p.clientIds.length, 0);

    const activeClients = new Set<ClientId>();
    for (const p of plans) if (p.active) for (const c of p.clientIds) activeClients.add(c);

    // Churn: clients whose last payment is older than the window's
    // start AND who have at least one historical payment. Real churn
    // tracking lands when plan-assignment history is logged (R+1).
    const windowMs = windowDays * 86_400_000;
    const lastPaymentByClient = new Map<ClientId, number>();
    for (const p of allPayments) {
      const cur = lastPaymentByClient.get(p.clientId) ?? 0;
      if (p.paidAt > cur) lastPaymentByClient.set(p.clientId, p.paidAt);
    }
    const churnedClientIds: ClientId[] = [];
    for (const [cid, lastTs] of lastPaymentByClient) {
      if (refNow - lastTs > windowMs && !activeClients.has(cid)) churnedClientIds.push(cid);
    }
    const startingClients = new Set([...activeClients, ...churnedClientIds]).size;
    const churnRate = startingClients > 0 ? churnedClientIds.length / startingClients : 0;

    // Lifetime revenue per client.
    const lifetime = new Map<ClientId, number>();
    for (const p of allPayments) {
      lifetime.set(p.clientId, (lifetime.get(p.clientId) ?? 0) + p.amountCents);
    }
    const topClients = [...lifetime.entries()]
      .map(([clientId, lifetimeCents]) => ({ clientId, lifetimeCents }))
      .sort((a, b) => b.lifetimeCents - a.lifetimeCents)
      .slice(0, 10);

    const hasData = allInvoices.length > 0 || plans.length > 0;
    return {
      currency,
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

  // Lock-in tracker: clients on plans with lockInMonths > 0, surfaced
  // with their plan + the lock-in fee status (paid / unpaid). Lock-in
  // payment status comes from looking for a Payment where invoice
  // metadata flags it (per T1 R002 R+1 contract `metadata.lockInPaid`).
  // For v1 we treat any Payment.notes containing "lock-in" or
  // externalRef starting "lockin_" as the lock-in fee.
  async lockInRows(): Promise<Array<{
    clientId: ClientId;
    planId: string;
    planLabel: string;
    lockInMonths: number;
    lockInFeeCents: number;
    paidCents: number;
    paid: boolean;
  }>> {
    const plans = await this.plans.list(true);
    const out: Array<{
      clientId: ClientId; planId: string; planLabel: string;
      lockInMonths: number; lockInFeeCents: number; paidCents: number; paid: boolean;
    }> = [];
    for (const plan of plans) {
      if (plan.lockInMonths <= 0) continue;
      for (const cid of plan.clientIds) {
        const payments = await this.payments.list({ clientId: cid });
        const lockPayments = payments.filter(p =>
          (p.notes ?? "").toLowerCase().includes("lock-in") ||
          (p.externalRef ?? "").startsWith("lockin_"),
        );
        const paidCents = lockPayments.reduce((s, p) => s + p.amountCents, 0);
        out.push({
          clientId: cid,
          planId: plan.id,
          planLabel: plan.label,
          lockInMonths: plan.lockInMonths,
          lockInFeeCents: plan.lockInFeeCents,
          paidCents,
          paid: paidCents >= plan.lockInFeeCents,
        });
      }
    }
    return out;
  }
}
