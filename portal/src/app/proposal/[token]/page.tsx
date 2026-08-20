import { notFound } from "next/navigation";

import { findCommercialProposal } from "@/lib/server/commercialProposal";
import { ProposalActions } from "./_ProposalActions";
import { formatUkDate } from "@/lib/shared/formatDateTime";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposal = await findCommercialProposal(token);
  if (!proposal) notFound();
  const { pack, agencyName } = proposal;

  return (
    <main className="min-h-screen bg-[#f3f3f1] px-4 py-8 text-[#171717] print:bg-white print:p-0">
      <article className="mx-auto max-w-4xl bg-white p-6 shadow-sm sm:p-10 lg:p-14 print:max-w-none print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-8 border-b-[3px] border-black pb-7">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Proposal</p><h1 className="mt-2 text-2xl font-semibold">{agencyName}</h1><p className="mt-1 text-sm text-black/50">{pack.serviceLevel}</p></div>
          <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Invoice</p><p className="mt-2 text-xl font-semibold">{pack.invoiceNumber}</p><p className="mt-1 text-sm capitalize text-black/45">{pack.billingCadence.replace("-", " ")}</p></div>
        </header>
        <section className="grid gap-6 py-8 sm:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Prepared for</p><p className="mt-2 font-semibold">{pack.recipientName ?? pack.recipientEmail}</p><p className="text-sm text-black/50">{pack.recipientEmail}</p></div>
          <div className="sm:text-right"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Payment due</p><p className="mt-2 font-semibold">{formatUkDate(pack.dueAt, { dateStyle: "long" })}</p></div>
        </section>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="border-b border-black/15 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-3">Description</th><th className="py-3 text-right">Qty</th><th className="py-3 text-right">Unit</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{pack.lineItems.map((item, index) => <tr key={`${item.description}-${index}`} className="border-b border-black/[0.07]"><td className="py-4 pr-4 font-medium">{item.description}</td><td className="py-4 text-right text-black/55">{item.quantity}</td><td className="py-4 text-right">{money(item.unitCents, pack.currency)}</td><td className="py-4 text-right font-semibold">{money(item.quantity * item.unitCents, pack.currency)}</td></tr>)}</tbody></table></div>
        <dl className="ml-auto mt-7 max-w-sm divide-y divide-black/10 text-sm"><div className="flex justify-between py-3"><dt>Subtotal</dt><dd>{money(pack.subtotalCents, pack.currency)}</dd></div><div className="flex justify-between py-3"><dt>Tax</dt><dd>{money(pack.taxCents, pack.currency)}</dd></div><div className="flex justify-between border-b-2 border-black py-3 text-lg font-semibold"><dt>Total</dt><dd>{money(pack.totalCents, pack.currency)}</dd></div></dl>
        <section className="mt-12 border-t border-black/10 pt-8"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">{pack.agreementTitle}</p><div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-black/70">{pack.agreementBody}</div></section>
        {pack.notes ? <section className="mt-8 border-t border-black/10 pt-5"><p className="text-xs font-semibold uppercase tracking-wide text-black/40">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/60">{pack.notes}</p></section> : null}
        <ProposalActions token={token} accepted={pack.agreementStatus === "accepted"} checkoutUrl={pack.stripeCheckoutUrl} />
      </article>
    </main>
  );
}
