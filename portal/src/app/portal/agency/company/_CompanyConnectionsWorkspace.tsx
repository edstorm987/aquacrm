"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Globe2, Pencil, PlugZap, Save, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { TradingCompany } from "@/server/types";
import { IntegrationConnectionsPanel } from "../settings/IntegrationConnectionsPanel";
import type { IntegrationProvider } from "@/lib/integrations/catalog";

interface WebsiteConnection {
  id: string;
  name: string;
  website: string;
  company?: TradingCompany;
}

export function CompanyConnectionsWorkspace({
  workspaceWebsite,
  tradingCompanies,
  clients,
  canManage,
  initialIntegration,
}: {
  workspaceWebsite?: string;
  tradingCompanies: TradingCompany[];
  clients: Array<{ id: string; name: string }>;
  canManage: boolean;
  initialIntegration?: IntegrationProvider;
}) {
  const [websites, setWebsites] = useState<WebsiteConnection[]>([
    { id: "workspace", name: "AquaOasis-Web", website: workspaceWebsite ?? "" },
    ...tradingCompanies.map(company => ({
      id: company.id,
      name: company.name,
      website: company.website ?? "",
      company,
    })),
  ]);
  const [editing, setEditing] = useState<WebsiteConnection | null>(null);
  const [notice, setNotice] = useState("");

  async function saveWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const website = String(form.get("website") ?? "").trim();
    setNotice("Saving website...");

    const response = editing.id === "workspace"
      ? await fetch("/api/portal/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ website }),
        })
      : await fetch("/api/portal/trading-companies", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "update",
            companyId: editing.id,
            name: editing.company?.name,
            slug: editing.company?.slug,
            description: editing.company?.description,
            website,
            status: editing.company?.status,
            brand: editing.company?.brand,
          }),
        });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; settings?: { website?: string }; company?: TradingCompany } | null;
    if (!response.ok || !result?.ok) {
      setNotice(result?.error ?? "Website connection could not be saved.");
      return;
    }

    const savedWebsite = editing.id === "workspace" ? result.settings?.website ?? "" : result.company?.website ?? "";
    setWebsites(current => current.map(item => item.id === editing.id
      ? { ...item, website: savedWebsite, company: result.company ?? item.company }
      : item));
    setEditing(null);
    setNotice(`${editing.name} website ${savedWebsite ? "connected" : "removed"}.`);
  }

  return (
    <div className="mt-7 space-y-10">
      <section aria-labelledby="company-websites-heading">
        <div className="flex flex-col gap-2 border-b border-black/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand"><Globe2 size={17} /><p className="text-xs font-semibold uppercase tracking-wide">Company websites</p></div>
            <h2 id="company-websites-heading" className="mt-2 text-xl font-semibold text-black/85">Connect each public company to the workspace.</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-black/50">These are the canonical public websites used across company records, client-facing links and reporting.</p>
          </div>
          {notice ? <p role="status" className="text-xs font-medium text-black/50">{notice}</p> : null}
        </div>

        <div className="divide-y divide-black/10 border-b border-black/10">
          {websites.map(item => (
            <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`grid size-6 place-items-center rounded-full ${item.website ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {item.website ? <Check size={13} /> : <Globe2 size={13} />}
                  </span>
                  <strong className="text-sm font-semibold text-black/80">{item.name}</strong>
                </div>
                <p className="mt-1 truncate pl-8 text-xs text-black/45">{item.website || "No website connected yet"}</p>
              </div>
              <div className="flex items-center gap-2 pl-8 sm:pl-0">
                {item.website ? <a href={item.website} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:border-black/25 hover:text-black">Open <ArrowUpRight size={13} /></a> : null}
                {canManage ? <button type="button" onClick={() => setEditing(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white"><Pencil size={13} />{item.website ? "Edit" : "Connect"}</button> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="company-integrations-heading">
        <div className="mb-5 flex items-center gap-2 text-brand"><PlugZap size={17} /><p id="company-integrations-heading" className="text-xs font-semibold uppercase tracking-wide">Service connections</p></div>
        <IntegrationConnectionsPanel clients={clients} canManage={canManage} initialProvider={initialIntegration} />
      </section>

      <section className="border-y border-black/10 py-5" aria-labelledby="connected-work-heading">
        <h2 id="connected-work-heading" className="text-base font-semibold text-black/80">Use the connections</h2>
        <p className="mt-1 text-sm leading-6 text-black/50">Connect credentials once here, then attach repositories, deployments, analytics and customer communication where the work happens.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <WorkspaceLink href="/portal/agency/development">Websites and development</WorkspaceLink>
          <WorkspaceLink href="/portal/agency/development/performance">Website performance</WorkspaceLink>
          <WorkspaceLink href="/portal/agency/agency-finance">Payments and finance</WorkspaceLink>
          <WorkspaceLink href="/portal/agency/inbox">Inbox and enquiries</WorkspaceLink>
        </div>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="website-connection-title">
          <form onSubmit={saveWebsite} className="w-full max-w-lg rounded-md bg-[#f8f7f4] shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-black/10 bg-white px-5 py-4">
              <div><p className="text-xs font-semibold uppercase text-brand">Company website</p><h2 id="website-connection-title" className="mt-1 text-xl font-semibold text-black/90">{editing.name}</h2></div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/55"><X size={16} /></button>
            </header>
            <div className="p-5">
              <label className="grid gap-1.5 text-xs font-medium text-black/65">Website URL<input name="website" type="url" defaultValue={editing.website} placeholder="https://example.com" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black/40" /></label>
              <p className="mt-2 text-xs leading-5 text-black/40">Leave this blank and save to remove the connection.</p>
            </div>
            <footer className="flex justify-end gap-2 border-t border-black/10 bg-white px-5 py-4">
              <button type="button" onClick={() => setEditing(null)} className="min-h-10 px-3 text-sm text-black/60">Cancel</button>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Save size={14} />Save website</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/65 hover:border-black/30 hover:text-black">{children}<span aria-hidden>›</span></Link>;
}
