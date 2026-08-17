"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, ExternalLink, Layers3, LoaderCircle, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface ProductRolloutClient {
  id: string;
  name: string;
  effectiveName: string;
  variation: boolean;
  variationUpdatedAt?: number;
  portalBuilt: boolean;
  catalogueCurrent: boolean;
  packageScopeCurrent: boolean;
  templateStatus: "current" | "outdated" | "shared" | "not-built";
  assignmentLabel: string;
}

export function ProductRolloutCentre({
  productId,
  productName,
  portalEnabled,
  productTemplateNeedsRefresh,
  clients,
}: {
  productId: string;
  productName: string;
  portalEnabled: boolean;
  productTemplateNeedsRefresh: boolean;
  clients: ProductRolloutClient[];
}) {
  const router = useRouter();
  const recommended = useMemo(() => clients.filter(client => !client.catalogueCurrent || !client.packageScopeCurrent || client.templateStatus === "outdated").map(client => client.id), [clients]);
  const [selected, setSelected] = useState<string[]>(recommended);
  const [busy, setBusy] = useState<"sync-catalogue" | "adopt-template" | "">("");
  const [notice, setNotice] = useState("");
  const allSelected = clients.length > 0 && selected.length === clients.length;

  useEffect(() => {
    setSelected(recommended);
  }, [recommended]);

  function toggle(clientId: string) {
    setSelected(current => current.includes(clientId) ? current.filter(id => id !== clientId) : [...current, clientId]);
  }

  async function run(action: "sync-catalogue" | "adopt-template") {
    if (!selected.length) return;
    if (action === "adopt-template" && !window.confirm(`Adopt the current published ${productName} template for the selected client portals? Bespoke presentation edits in direct product-template copies will be replaced.`)) return;
    setBusy(action);
    setNotice("");
    try {
      const response = await fetch("/api/portal/products/rollout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, productId, clientIds: selected }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; updated?: number; shared?: number; preserved?: number } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "The rollout could not be completed.");
      setNotice(action === "sync-catalogue"
        ? `${payload.updated ?? 0} client assignment${payload.updated === 1 ? "" : "s"} synchronised. Existing delivery records were preserved.`
        : `${payload.updated ?? 0} direct client portal${payload.updated === 1 ? "" : "s"} adopted the template. ${payload.shared ?? 0} combined portals already use the shared product layer.`);
      setSelected([]);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The rollout could not be completed.");
    } finally {
      setBusy("");
    }
  }

  return <section id="assigned-clients" className="scroll-mt-24 border-y border-black/10 py-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><Layers3 size={18} /></span>
        <div>
          <p className="text-[10px] font-semibold uppercase text-brand">Assigned clients</p>
          <h2 className="mt-1 text-lg font-semibold text-black/85">Clients, variations and rollout</h2>
          <p className="mt-1 text-sm leading-6 text-black/50">See everyone using this service, whether they inherit the master definition or have a bespoke variation, and exactly which portal or catalogue updates need attention.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!selected.length || Boolean(busy)} onClick={() => void run("sync-catalogue")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/68 disabled:opacity-40">{busy === "sync-catalogue" ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}Sync configuration</button>
        {portalEnabled ? <button type="button" disabled={!selected.length || Boolean(busy)} onClick={() => void run("adopt-template")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40">{busy === "adopt-template" ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldCheck size={14} />}Adopt published template</button> : null}
      </div>
    </div>

    {productTemplateNeedsRefresh ? <div className="mt-5 flex flex-col gap-3 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold text-amber-950">Product details are newer than the portal template</p><p className="mt-0.5 text-xs leading-5 text-amber-900/65">Open Studio, refresh the draft from Stunning Standard, review it, then publish before adopting it for direct client copies.</p></div></div><Link href={`/portal/agency/portals/editor?scope=template&productId=${encodeURIComponent(productId)}`} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md bg-amber-950 px-3 text-xs font-semibold text-white">Review template update</Link></div> : null}

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-3">
      <p className="text-xs text-black/45"><strong className="font-semibold text-black/70">{clients.length}</strong> affected client{clients.length === 1 ? "" : "s"} · <strong className="font-semibold text-amber-700">{recommended.length}</strong> need review</p>
      {clients.length ? <button type="button" onClick={() => setSelected(allSelected ? [] : clients.map(client => client.id))} className="text-xs font-semibold text-brand">{allSelected ? "Clear selection" : "Select all"}</button> : null}
    </div>

    {clients.length ? <div className="divide-y divide-black/8">{clients.map(client => {
      const needsAttention = !client.catalogueCurrent || !client.packageScopeCurrent || client.templateStatus === "outdated";
      return <div key={client.id} className="grid gap-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <input aria-label={`Select ${client.name}`} type="checkbox" checked={selected.includes(client.id)} onChange={() => toggle(client.id)} className="size-4 accent-black" />
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-black/75">{client.name}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${client.variation ? "bg-sky-50 text-sky-700" : "bg-black/[0.05] text-black/45"}`}>{client.variation ? "Client variation" : "Master service"}</span></div><span className="mt-0.5 block text-xs text-black/42">{client.effectiveName}{client.effectiveName !== client.assignmentLabel ? ` · ${client.assignmentLabel}` : ""}</span></div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <Status current={client.catalogueCurrent} currentLabel="Catalogue current" attentionLabel="Product copy changed" />
          <Status current={client.packageScopeCurrent} currentLabel="Scope current" attentionLabel="Package changed" />
          <span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${client.templateStatus === "outdated" ? "bg-red-50 text-red-700" : client.templateStatus === "not-built" ? "bg-black/[0.05] text-black/45" : "bg-emerald-50 text-emerald-700"}`}>{templateLabel(client.templateStatus)}</span>
          {needsAttention ? <span title="This client is included in the recommended rollout" className="grid size-6 place-items-center rounded-full bg-amber-100 text-amber-700"><CircleAlert size={12} /></span> : <span className="grid size-6 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check size={12} /></span>}
          <Link title={`Open ${client.name} internal workspace`} href={`/portal/clients/${encodeURIComponent(client.id)}?tab=delivery&product=${encodeURIComponent(productId)}`} className="grid size-8 place-items-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.04]"><SlidersHorizontal size={13} /></Link>
          {client.portalBuilt ? <Link title={`Open ${client.name} portal studio`} href={`/portal/agency/portals/editor?scope=client&clientId=${encodeURIComponent(client.id)}&productId=${encodeURIComponent(productId)}&context=client-workspace`} className="grid size-8 place-items-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.04]"><ExternalLink size={13} /></Link> : null}
        </div>
      </div>;
    })}</div> : <p className="py-8 text-center text-sm text-black/35">This product is not assigned to any clients yet.</p>}
    {notice ? <p role="status" className="mt-4 border-l-2 border-brand bg-brand/[0.04] px-3 py-2 text-xs text-black/65">{notice}</p> : null}
  </section>;
}

function Status({ current, currentLabel, attentionLabel }: { current: boolean; currentLabel: string; attentionLabel: string }) {
  return <span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${current ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{current ? currentLabel : attentionLabel}</span>;
}

function templateLabel(status: ProductRolloutClient["templateStatus"]): string {
  if (status === "current") return "Template current";
  if (status === "outdated") return "Template update ready";
  if (status === "shared") return "Shared product layer";
  return "Portal not built";
}
