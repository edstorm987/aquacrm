import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function InvoiceDetailPage(props: PluginPageProps) {
  const id = props.segments[0];
  if (!id) return <p>invoice id required.</p>;
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const invoice = await c.invoices.get(id);
  if (!invoice) return <p>Invoice not found.</p>;
  const html = await c.invoices.renderInvoiceHtml(id);
  return (
    <section className="finance-invoice-detail">
      <header>
        <h1>{invoice.number}</h1>
        <span className={`finance-pill finance-pill-${invoice.status}`}>{invoice.status}</span>
      </header>
      {html && <div dangerouslySetInnerHTML={{ __html: html }} />}
    </section>
  );
}
