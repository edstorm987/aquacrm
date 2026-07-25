import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const [categories, invoices, expenses] = await Promise.all([
    c.categories.list(),
    c.invoices.list(),
    c.expenses.list(),
  ]);
  const draftInvoices = invoices.filter(i => i.status === "draft").length;
  const sentInvoices = invoices.filter(i => i.status === "sent").length;
  const pendingExpenses = expenses.filter(e => e.status === "pending").length;
  return (
    <section className="finance-settings">
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
      <h2>Install</h2>
      <dl className="finance-settings-grid">
        <div><dt>Default currency</dt><dd>{(props.install.config.defaultCurrency as string | undefined) ?? "usd"}</dd></div>
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Enabled</dt><dd>{props.install.enabled ? "Yes" : "No"}</dd></div>
      </dl>
    </section>
  );
}
