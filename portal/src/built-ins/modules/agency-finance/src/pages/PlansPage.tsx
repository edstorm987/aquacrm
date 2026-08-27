import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { FinanceNav } from "../components/FinanceNav";
import { NewPlanForm } from "../components/NewPlanForm";
import { CommercialPlansManager } from "../components/CommercialPlansManager";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";

export default async function PlansPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const [plans, assignments, clients] = await Promise.all([
    c.plans.list(true),
    c.plans.listCommercialAssignments(),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
  ]);
  const apiBase = "/api/portal/agency-finance";
  const defaultCurrency = resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <FinanceNav active="plans" />
      <div>
      <header style={{ marginBottom: 16 }}>
        <h1>Plans</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {plans.length} templates · {assignments.length} active client schedules
        </p>
      </header>

      <h2>New plan</h2>
      <NewPlanForm apiBase={apiBase} defaultCurrency={defaultCurrency} />
      <CommercialPlansManager
        apiBase={apiBase}
        initialPlans={plans}
        assignments={assignments}
        clients={clients.map(client => ({ id: client.id, name: client.name }))}
      />
      </div>
    </section>
  );
}
