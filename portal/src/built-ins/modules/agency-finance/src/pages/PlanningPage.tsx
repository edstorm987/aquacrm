import Link from "next/link";
import { ArrowRight, BarChart3, Flag, Gauge, Target, TrendingUp } from "lucide-react";

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { formatMoney, normaliseCurrency } from "../lib/currencies";
import { containerFor } from "../server/foundationAdapter";
import { FinanceNav } from "../components/FinanceNav";
import { getCompanyProfile } from "@/server/company";

export default async function PlanningPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const profile = getCompanyProfile(props.agencyId, null);
  const now = Date.now();
  const [snapshot, plans, invoices, expenses] = await Promise.all([
    c.pnl.founderSnapshot(now),
    c.plans.list(false),
    c.invoices.list(),
    c.expenses.list(),
  ]);
  const currency = normaliseCurrency(snapshot.currency, normaliseCurrency(props.install.config.defaultCurrency, "gbp"));
  const months = snapshot.trailingMonths;
  const latest = months.at(-1);
  const previous = months.at(-2);
  const currentRevenue = latest?.revenueCents ?? 0;
  const previousRevenue = previous?.revenueCents ?? 0;
  const monthlyGrowthRate = previousRevenue > 0 ? (currentRevenue - previousRevenue) / previousRevenue : 0;
  const averageExpenseCents = months.length
    ? Math.round(months.reduce((sum, month) => sum + month.expensesCents, 0) / months.length)
    : 0;
  const monthlyTarget = profile.monthlyRevenueTargetCents;
  const annualTarget = profile.annualRevenueTargetCents;
  const targetGap = Math.max(0, monthlyTarget - currentRevenue);
  const dealsNeeded = targetGap > 0 ? Math.ceil(targetGap / Math.max(1, profile.averageDealValueCents)) : 0;
  const callsNeeded = dealsNeeded > 0 ? Math.ceil(dealsNeeded / Math.max(0.01, profile.salesCallCloseRatePercent / 100)) : 0;
  const activePlanCount = plans.filter(plan => plan.active).length;
  const outstandingCents = invoices
    .filter(invoice => invoice.currency === currency && ["sent", "overdue"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const pendingExpenseCents = expenses
    .filter(expense => expense.currency === currency && expense.status !== "rejected" && expense.status !== "reimbursed")
    .reduce((sum, expense) => sum + expense.amountCents, 0);
  const projected = projectMonths({
    startYear: latest?.year ?? new Date(now).getUTCFullYear(),
    startMonth: latest?.month ?? new Date(now).getUTCMonth() + 1,
    startRevenueCents: Math.max(currentRevenue, snapshot.mrrCents),
    expenseCents: averageExpenseCents,
    growthRate: clamp(monthlyGrowthRate, -0.25, 0.5),
  });
  const projectedAnnualRevenue = projected.reduce((sum, month) => sum + month.revenueCents, 0);
  const projectedAnnualNet = projected.reduce((sum, month) => sum + month.netCents, 0);
  const annualProgress = annualTarget > 0 ? Math.min(100, Math.round(projectedAnnualRevenue / annualTarget * 100)) : 0;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <FinanceNav active="planning" />
      <header className="grid gap-4 border-b border-black/10 pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Executive finance</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90">Targets and projections</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-black/55">A forward view using live finance actuals, company goals and editable sales assumptions from Company.</p>
        </div>
        <Link href="/portal/agency/company" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03]">
          Edit objectives <ArrowRight size={15} />
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Current month" value={money(currentRevenue, currency)} icon={BarChart3} />
        <Metric label="Monthly target" value={money(monthlyTarget, currency)} icon={Target} />
        <Metric label="MRR / ARR" value={`${money(snapshot.mrrCents, currency)} / ${money(snapshot.arrCents, currency)}`} icon={TrendingUp} />
        <Metric label="Growth rate" value={percent(monthlyGrowthRate)} icon={TrendingUp} tone={monthlyGrowthRate >= 0 ? "good" : "warn"} />
        <Metric label="Target gap" value={money(targetGap, currency)} icon={Flag} tone={targetGap === 0 ? "good" : "warn"} />
      </dl>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h2 className="text-base font-semibold text-black/85">12 month projection</h2>
          <p className="mt-1 text-sm text-black/45">Projection starts from current revenue or MRR, whichever is higher, and applies the latest monthly growth rate.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45">
                <tr><th className="py-2">Month</th><th className="py-2 text-right">Revenue</th><th className="py-2 text-right">Costs</th><th className="py-2 text-right">Net</th></tr>
              </thead>
              <tbody>
                {projected.map(month => (
                  <tr key={`${month.year}-${month.month}`} className="border-b border-black/[0.07]">
                    <td className="py-3">{new Date(Date.UTC(month.year, month.month - 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</td>
                    <td className="py-3 text-right font-mono">{money(month.revenueCents, currency)}</td>
                    <td className="py-3 text-right font-mono text-black/55">{money(month.expenseCents, currency)}</td>
                    <td className={`py-3 text-right font-mono font-semibold ${month.netCents >= 0 ? "text-emerald-800" : "text-red-700"}`}>{money(month.netCents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-black/[0.018] p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><Gauge size={16} /></span>
            <div><h2 className="text-base font-semibold text-black/85">Plan signal</h2><p className="mt-1 text-sm text-black/45">What the numbers imply right now.</p></div>
          </div>
          <dl className="mt-4 divide-y divide-black/10 text-sm">
            <Row label="Projected annual revenue" value={money(projectedAnnualRevenue, currency)} />
            <Row label="Annual target coverage" value={`${annualProgress}%`} />
            <Row label="Projected annual net" value={money(projectedAnnualNet, currency)} />
            <Row label="Outstanding invoices" value={money(outstandingCents, currency)} />
            <Row label="Pending costs" value={money(pendingExpenseCents, currency)} />
            <Row label="Active plans" value={String(activePlanCount)} />
          </dl>
          <p className="mt-4 text-xs leading-5 text-black/45">
            To close this month&apos;s target gap, plan about {dealsNeeded} deal{dealsNeeded === 1 ? "" : "s"} or {callsNeeded} sales call{callsNeeded === 1 ? "" : "s"} at the current average deal and close-rate assumptions.
          </p>
        </aside>
      </section>

      <section>
        <h2 className="text-base font-semibold text-black/85">Business objectives</h2>
        <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
          {profile.objectives.length ? profile.objectives.slice(0, 6).map(objective => {
            const progress = Math.min(100, Math.round(objective.currentValue / Math.max(1, objective.targetValue) * 100));
            return (
              <div key={objective.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center">
                <div><p className="text-sm font-semibold text-black/78">{objective.title}</p><p className="mt-1 text-xs text-black/45">{objective.metric || "Progress"} · {objective.status.replace("-", " ")}</p></div>
                <div><div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><span className="block h-full rounded-full bg-brand" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-right text-[10px] text-black/40">{progress}%</p></div>
              </div>
            );
          }) : <p className="py-8 text-center text-sm text-black/40">Add objectives in Company to connect business goals to finance planning.</p>}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof BarChart3; tone?: "good" | "warn" }) {
  return <div className="min-w-0 rounded-lg border border-black/10 bg-white p-3"><div className="flex items-start justify-between gap-2"><dt className="text-xs font-medium text-black/45">{label}</dt><Icon size={15} className="text-brand" /></div><dd className={`mt-3 break-words text-base font-semibold ${tone === "good" ? "text-emerald-800" : tone === "warn" ? "text-amber-700" : "text-black/85"}`}>{value}</dd></div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-black/50">{label}</dt><dd className="font-mono font-semibold text-black/75">{value}</dd></div>;
}

function projectMonths(input: { startYear: number; startMonth: number; startRevenueCents: number; expenseCents: number; growthRate: number }) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(input.startYear, input.startMonth - 1 + index, 1));
    const revenueCents = Math.max(0, Math.round(input.startRevenueCents * ((1 + input.growthRate) ** index)));
    const expenseCents = Math.max(0, input.expenseCents);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      revenueCents,
      expenseCents,
      netCents: revenueCents - expenseCents,
    };
  });
}

function money(cents: number, currency: string) {
  return formatMoney(cents, currency);
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${Math.round(value * 100)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}
