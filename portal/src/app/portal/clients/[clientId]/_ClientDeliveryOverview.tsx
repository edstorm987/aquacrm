import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Clock3, FolderKanban, PackageCheck, PanelTop } from "lucide-react";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";
import { formatUkDate } from "@/lib/formatDateTime";

export interface ClientDeliveryProduct {
  id: string;
  name: string;
  description: string;
  deliverables: string[];
  accentColor?: string;
  stage: string;
  progress: number;
}

export interface ClientDeliveryMilestone {
  id: string;
  title: string;
  status: string;
  targetAt?: number;
}

export function ClientDeliveryOverview({ clientId, products, milestones, portalReady, selectedProductId }: {
  clientId: string;
  products: ClientDeliveryProduct[];
  milestones: ClientDeliveryMilestone[];
  portalReady: boolean;
  selectedProductId?: string;
}) {
  const open = milestones.filter(item => item.status !== "complete");
  const now = Date.now();
  const attention = open.filter(item => item.status === "blocked" || Boolean(item.targetAt && item.targetAt < now));
  const focusedProduct = products.find(product => product.id === selectedProductId) ?? products[0];
  return (
    <section className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Fulfilment lens</p>
          <h2 className="mt-2 text-2xl font-semibold text-black/88">Delivery workspace</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">Assigned services, execution stages, milestones, tasks, files, approvals, and the shared portal live here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={clientWorkspaceHref(clientId, "files")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/65">Open files <ArrowRight size={13} /></Link>
          <Link href={clientWorkspaceHref(clientId, "portal")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><PanelTop size={14} /> {portalReady ? "Open portal" : "Prepare portal"}</Link>
        </div>
      </header>

      <div className="grid gap-px overflow-hidden border border-black/10 bg-black/10 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <div className="bg-white p-5">
          <div className="flex items-center gap-2"><PackageCheck size={17} className="text-black/45" /><h3 className="text-sm font-semibold text-black/78">Assigned product workspaces</h3></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {products.map(product => (
              <Link id={`product-${product.id}`} key={product.id} href={clientWorkspaceHref(clientId, "delivery", { product: product.id })} aria-current={focusedProduct?.id === product.id ? "true" : undefined} className={`border-l-2 px-3 py-3 transition ${focusedProduct?.id === product.id ? "bg-brand/[0.065]" : "bg-black/[0.018] hover:bg-black/[0.035]"}`} style={{ borderColor: product.accentColor || "var(--brand-primary)" }}>
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-black/78">{product.name}</p><p className="mt-0.5 text-xs text-black/42">{product.stage}</p></div><span className="text-sm font-semibold tabular-nums text-black/65">{product.progress}%</span></div>
                <div className="mt-3 h-1.5 overflow-hidden bg-black/[0.07]"><div className="h-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, product.progress))}%` }} /></div>
              </Link>
            ))}
            {!products.length ? <p className="py-6 text-sm text-black/45">No product is assigned yet. Assign one from the Fulfilment product editor.</p> : null}
          </div>
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
        </div>
        <aside className="bg-white p-5">
          <p className="text-xs font-semibold text-black/72">Agreed outputs</p>
          <ul className="mt-3 grid gap-2">{focusedProduct.deliverables.length ? focusedProduct.deliverables.map(item => <li key={item} className="flex items-start gap-2 text-xs leading-5 text-black/55"><Check size={13} className="mt-0.5 shrink-0 text-brand" />{item}</li>) : <li className="text-xs text-black/42">Add deliverables in the Fulfilment product editor.</li>}</ul>
        </aside>
      </section> : null}

      <div className="flex items-center gap-2 border-b border-black/10 pb-3"><FolderKanban size={17} className="text-black/45" /><h3 className="text-sm font-semibold text-black/78">Execution board</h3></div>
    </section>
  );
}
