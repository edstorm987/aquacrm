import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, Clock3, FolderKanban, PackageCheck, PanelTop, SlidersHorizontal } from "lucide-react";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";
import { formatUkDate } from "@/lib/formatDateTime";
import { ClientServiceSwitcher } from "./_ClientServiceSwitcher";

export interface ClientDeliveryProduct {
  id: string;
  name: string;
  description: string;
  deliverables: string[];
  accentColor?: string;
  stage: string;
  progress: number;
  nextAction?: string;
  nextActionDetail?: string;
}

export interface ClientDeliveryMilestone {
  id: string;
  title: string;
  status: string;
  targetAt?: number;
}

export function ClientDeliveryOverview({ clientId, products, milestones, portalReady, selectedProductId, advanced }: {
  clientId: string;
  products: ClientDeliveryProduct[];
  milestones: ClientDeliveryMilestone[];
  portalReady: boolean;
  selectedProductId?: string;
  advanced: boolean;
}) {
  const open = milestones.filter(item => item.status !== "complete");
  const now = Date.now();
  const attention = open.filter(item => item.status === "blocked" || Boolean(item.targetAt && item.targetAt < now));
  const focusedProduct = products.find(product => product.id === selectedProductId) ?? products[0];
  const simpleHref = clientWorkspaceHref(clientId, "delivery", { product: focusedProduct?.id });
  const advancedHref = clientWorkspaceHref(clientId, "delivery", { product: focusedProduct?.id, mode: "advanced" });
  return (
    <section className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Fulfilment lens</p>
          <h2 className="mt-2 text-2xl font-semibold text-black/88">Service workspace</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">See the active service and its next move first. Boards, SOPs, evidence, and configuration remain available in Advanced Fulfilment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={advanced ? simpleHref : advancedHref} className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold ${advanced ? "border border-black/12 bg-white text-black/65" : "bg-black text-white"}`}><SlidersHorizontal size={14} /> {advanced ? "Simple view" : "Advanced Fulfilment"}</Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-[#315b85] bg-sky-50/55 px-4 py-3">
        <p className="text-xs leading-5 text-black/55"><strong className="font-semibold text-black/72">{advanced ? "Advanced mode" : "Simple mode"}</strong> · {advanced ? "The execution board, linked SOPs, and specialist controls are open below." : "Only the information needed to move delivery forward is shown."}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={clientWorkspaceHref(clientId, "files")} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#315b85]">Files <ArrowRight size={12} /></Link>
          <Link href={clientWorkspaceHref(clientId, "portal")} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#315b85]"><PanelTop size={13} /> {portalReady ? "Portal" : "Prepare portal"}</Link>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden border border-black/10 bg-black/10 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <div className="bg-white p-5">
          <div className="flex items-center gap-2"><PackageCheck size={17} className="text-black/45" /><h3 className="text-sm font-semibold text-black/78">Assigned product workspaces</h3></div>
          <ClientServiceSwitcher clientId={clientId} products={products} selectedProductId={focusedProduct?.id} advanced={advanced} />
        </div>
        <aside className="bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock3 size={17} className="text-black/45" /><h3 className="text-sm font-semibold text-black/78">Milestone watch</h3></div>{attention.length ? <CircleAlert size={16} className="text-red-600" /> : null}</div>
          <p className="mt-4 text-3xl font-semibold tabular-nums text-black/82">{open.length}</p>
          <p className="text-xs text-black/42">open milestone{open.length === 1 ? "" : "s"} · {attention.length} need attention</p>
          <ul className="mt-4 divide-y divide-black/[0.07]">
            {open.slice(0, 4).map(item => <li key={item.id} className="py-2.5"><p className="text-xs font-semibold text-black/68">{item.title}</p><p className="mt-0.5 text-[11px] text-black/40">{item.status}{item.targetAt ? ` · due ${formatUkDate(item.targetAt, { day: "numeric", month: "short", year: "numeric" })}` : ""}</p></li>)}
          </ul>
        </aside>
      </div>

      {focusedProduct ? <section className="grid gap-px overflow-hidden border border-black/10 bg-black/10 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]" aria-label={`${focusedProduct.name} delivery workspace`}>
        <div className="bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Active service workspace</p>
          <h3 className="mt-2 text-xl font-semibold text-black/84">{focusedProduct.name}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/52">{focusedProduct.description || `${focusedProduct.name} delivery, decisions and evidence in one client record.`}</p>
          <div className="mt-5 flex items-center gap-3"><span className="text-3xl font-semibold tabular-nums text-black/82">{focusedProduct.progress}%</span><div><p className="text-xs font-semibold text-black/65">Workspace progress</p><p className="mt-0.5 text-[11px] capitalize text-black/40">Current stage · {focusedProduct.stage}</p></div></div>
          <a href={`/client-preview/${encodeURIComponent(clientId)}?manage=1&section=service&productId=${encodeURIComponent(focusedProduct.id)}`} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white">
            Manage {focusedProduct.name} workspace <ArrowUpRight size={13} />
          </a>
        </div>
        <aside className="bg-white p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Next useful move</p>
          <h4 className="mt-2 text-sm font-semibold text-black/75">{focusedProduct.nextAction || "Review this service stage"}</h4>
          <p className="mt-1 text-xs leading-5 text-black/45">{focusedProduct.nextActionDetail || `Confirm the next action for ${focusedProduct.name}, then retain the result in its service record.`}</p>
          <details className="group mt-4 border-t border-black/[0.08] pt-3">
            <summary className="cursor-pointer list-none text-xs font-semibold text-black/55">Agreed outputs · {focusedProduct.deliverables.length} <span className="group-open:hidden">+</span><span className="hidden group-open:inline">-</span></summary>
            <ul className="mt-3 grid gap-2">{focusedProduct.deliverables.length ? focusedProduct.deliverables.map(item => <li key={item} className="flex items-start gap-2 text-xs leading-5 text-black/55"><Check size={13} className="mt-0.5 shrink-0 text-brand" />{item}</li>) : <li className="text-xs text-black/42">Add deliverables in the Fulfilment product editor.</li>}</ul>
          </details>
        </aside>
      </section> : null}
    </section>
  );
}
