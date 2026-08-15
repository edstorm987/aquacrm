import type { Metadata } from "next";
import { headers } from "next/headers";
import { AlertCircle, ArrowUpRight, CheckCircle2, CreditCard, FileText, LifeBuoy, ShieldCheck } from "lucide-react";
import { ensureHydrated } from "@/server/storage";
import { getClient } from "@/server/tenants";
import { verifyAquaEmbedToken } from "@/lib/server/aquaEmbedToken";
import { loadCustomerPortalData } from "@/app/portal/customer/_portalData";
import { formatUkDate } from "@/lib/formatDateTime";
import { resolveClientPortalProvider } from "@/lib/server/clientPortalProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aqua account",
  robots: { index: false, follow: false },
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f7] p-6 text-[#142020]">
      <section className="w-full max-w-lg border border-[#ccdbda] bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto h-8 w-8 text-[#0f7774]" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">Aqua account unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-[#586a69]">{message}</p>
      </section>
    </main>
  );
}

function originMatchesReferer(expectedOrigin: string | undefined, referer: string | null) {
  if (!expectedOrigin) return true;
  if (!referer) return process.env.NODE_ENV !== "production";
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export default async function AquaAccountEmbed({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const payload = verifyAquaEmbedToken(token);
  if (!payload) return <ErrorState message="This secure view has expired. Refresh it from your portal." />;
  const requestHeaders = await headers();
  if (!originMatchesReferer(payload.origin, requestHeaders.get("referer"))) {
    return <ErrorState message="This secure view belongs to a different portal." />;
  }

  await ensureHydrated();
  const client = getClient(payload.clientId);
  if (!client || client.status === "archived") {
    return <ErrorState message="The linked Aqua client record is no longer available." />;
  }

  const providerName = resolveClientPortalProvider(client, { name: "AquaCRM", mark: "A" }).name;
  const data = await loadCustomerPortalData(client, client.name, providerName);
  const openInvoices = data.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue");
  const paidInvoices = data.invoices.filter(invoice => invoice.status === "paid");

  return (
    <main className="min-h-screen bg-[#f4f7f7] p-4 text-[#142020] sm:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 border-b border-[#cedbd9] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-[#0f7774]">
              <ShieldCheck size={15} aria-hidden="true" />
              Secure {providerName} account
            </span>
            <h1 className="mt-2 text-3xl font-semibold">{client.name}</h1>
            <p className="mt-1 text-sm text-[#637270]">Plans, billing and your service relationship in one place.</p>
          </div>
          <span className="w-fit border border-[#b9cecb] bg-white px-3 py-2 text-xs font-medium text-[#48615f]">
            {payload.mode === "admin" ? "Admin view" : "Client view"}
          </span>
        </header>

        <section className="grid gap-px border border-[#cedbd9] bg-[#cedbd9] sm:grid-cols-3">
          <article className="bg-white p-5">
            <p className="text-xs font-medium text-[#667775]">Service plan</p>
            <p className="mt-2 font-semibold">{data.servicePlan}</p>
            <p className="mt-1 text-sm text-[#667775]">{data.billingCadence}</p>
          </article>
          <article className="bg-white p-5">
            <p className="text-xs font-medium text-[#667775]">Open invoices</p>
            <p className="mt-2 text-2xl font-semibold">{openInvoices.length}</p>
            <p className="mt-1 text-sm text-[#667775]">
              {openInvoices.length ? money(openInvoices.reduce((sum, item) => sum + item.totalCents, 0), openInvoices[0].currency) : "Nothing due"}
            </p>
          </article>
          <article className="bg-white p-5">
            <p className="text-xs font-medium text-[#667775]">Account status</p>
            <p className="mt-2 flex items-center gap-2 font-semibold">
              <CheckCircle2 size={17} className="text-[#0f7774]" aria-hidden="true" />
              Active
            </p>
            <p className="mt-1 text-sm text-[#667775]">{paidInvoices.length} paid invoice{paidInvoices.length === 1 ? "" : "s"}</p>
          </article>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div className="border border-[#cedbd9] bg-white p-5">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-[#0f7774]" aria-hidden="true" />
              <h2 className="font-semibold">Billing history</h2>
            </div>
            <div className="mt-4 divide-y divide-[#e0e8e7]">
              {data.invoices.length ? data.invoices.slice(0, 6).map(invoice => (
                <div key={invoice.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{invoice.number}</p>
                    <p className="text-xs text-[#71807e]">{formatUkDate(invoice.issuedAt, { dateStyle: "medium" })}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(invoice.totalCents, invoice.currency)}</p>
                    <p className="text-xs capitalize text-[#71807e]">{invoice.status}</p>
                  </div>
                </div>
              )) : (
                <p className="py-8 text-sm text-[#71807e]">No invoices have been issued yet.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <article className="border border-[#cedbd9] bg-white p-5">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#0f7774]" aria-hidden="true" />
                <h2 className="font-semibold">Agreements</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#637270]">
                {data.contracts.length
                  ? `${data.contracts.length} agreement${data.contracts.length === 1 ? "" : "s"} attached to this account.`
                  : "No agreements are attached yet."}
              </p>
            </article>
            <article className="border border-[#cedbd9] bg-[#142020] p-5 text-white">
              <LifeBuoy size={19} className="text-[#8fd5ce]" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">Need Aqua support?</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">Open the full Aqua account for service history, requests and account help.</p>
              <a href="/portal/customer/support" target="_blank" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#8fd5ce]">
                Open support <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
