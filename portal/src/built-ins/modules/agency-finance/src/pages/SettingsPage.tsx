import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";
import { describePluginSettings } from "@/lib/server/plugins/pluginSettingsSurface";
import { PluginSettingsPanel } from "@/components/workspaces/PluginSettingsPanel";
import { FinanceNav } from "../components/FinanceNav";

export default async function SettingsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const defaultCurrency = resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency);
  const [categories, invoices, expenses] = await Promise.all([
    c.categories.list(),
    c.invoices.list(),
    c.expenses.list(),
  ]);
  // The manifest's own `settings.groups`, rendered generically. Until 22 Aug
  // 2026 nothing rendered them at all, so `stripeSecretKey` was undeclarable
  // and `stripeConfigured()` was permanently false — while `closeDeal.ts` and
  // `stripe.ts` both told the operator to "Set up Stripe in Finance settings".
  // This is that control.
  const declaredSettings = describePluginSettings(props.install.pluginId, { agencyId: props.agencyId });
  const draftInvoices = invoices.filter(i => i.status === "draft").length;
  const sentInvoices = invoices.filter(i => i.status === "sent").length;
  const pendingExpenses = expenses.filter(e => e.status === "pending").length;
  return (
    <section className="finance-settings mx-auto w-full max-w-6xl space-y-8 pb-12">
      <FinanceNav active="settings" />
      <div>
      <header><h1>Settings</h1><p>Agency-finance install state.</p></header>
      <dl className="finance-settings-grid">
        <div><dt>Categories</dt><dd>{categories.length} ({categories.filter(c => c.status === "active").length} active)</dd></div>
        <div><dt>Draft invoices</dt><dd>{draftInvoices}</dd></div>
        <div><dt>Sent invoices</dt><dd>{sentInvoices}</dd></div>
        <div><dt>Pending expenses</dt><dd>{pendingExpenses}</dd></div>
      </dl>
      <h2>Categories</h2>
      <ul>
        {categories.map(c => (
          <li key={c.id}>{c.name} {c.isDefault ? "(default)" : ""} · {c.status}</li>
        ))}
      </ul>
      {declaredSettings ? <PluginSettingsPanel initial={declaredSettings} /> : null}

      <h2>Install</h2>
      <dl className="finance-settings-grid">
        <div><dt>Default currency</dt><dd>{defaultCurrency.toUpperCase()}</dd></div>
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Enabled</dt><dd>{props.install.enabled ? "Yes" : "No"}</dd></div>
      </dl>
      </div>
    </section>
  );
}
