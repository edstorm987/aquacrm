import Link from "next/link";
import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { InvoiceDetailClient } from "../components/InvoiceDetailClient";
import { stripeConfigured } from "../lib/stripe";

export default async function InvoiceDetailPage(props: PluginPageProps) {
  const id = props.segments[0];
  if (!id) return <p className="text-sm text-black/55">Invoice ID required.</p>;
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const invoice = await c.invoices.get(id);
  if (!invoice) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <h1 className="text-xl font-semibold text-black/85">Invoice not found</h1>
        <Link href="/portal/agency/agency-finance/invoices" className="mt-4 inline-flex text-sm font-semibold text-black/65 underline">Back to invoices</Link>
      </div>
    );
  }
  const [agency, client, template] = await Promise.all([
    c.tenant.getAgency(props.agencyId),
    c.tenant.getClientForAgency(props.agencyId, invoice.clientId),
    c.invoices.getTemplate(),
  ]);
  return <InvoiceDetailClient invoice={invoice} agencyName={agency?.name ?? "Milesymedia"} clientName={client?.name ?? "Client"} template={template} stripeConfigured={stripeConfigured(props.install.config)} />;
}
