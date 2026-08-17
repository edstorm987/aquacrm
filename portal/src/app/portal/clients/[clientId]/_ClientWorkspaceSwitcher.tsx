"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, ExternalLink, Eye, Layers3, Link2, PanelsTopLeft, Plus, Unlink, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export interface RelatedClientWorkspaceOption {
  id: string;
  name: string;
  workspaceLabel?: string;
  providerName: string;
  stageLabel: string;
  portalReady: boolean;
  current?: boolean;
}

export interface AvailableClientWorkspaceOption {
  id: string;
  name: string;
  ownerEmail?: string;
  workspaceLabel?: string;
  providerName: string;
  relationshipWorkspaceCount: number;
}

export interface WorkspaceCompanyOption {
  id: string;
  name: string;
  status: string;
}

export interface WorkspaceProductOption {
  id: string;
  name: string;
  category: string;
  active: boolean;
}

export function ClientWorkspaceSwitcher({
  currentClientId,
  currentCompanyId,
  workspaces,
  availableClients,
  companies,
  products,
  currentProductIds,
  canManage,
}: {
  currentClientId: string;
  currentCompanyId?: string;
  workspaces: RelatedClientWorkspaceOption[];
  availableClients: AvailableClientWorkspaceOption[];
  companies: WorkspaceCompanyOption[];
  products: WorkspaceProductOption[];
  currentProductIds: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"list" | "create" | "link">("list");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [companyId, setCompanyId] = useState(currentCompanyId || "");
  const [carryContact, setCarryContact] = useState(true);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [linkClientId, setLinkClientId] = useState(availableClients[0]?.id || "");
  const [pendingDetachId, setPendingDetachId] = useState("");

  function toggleProduct(productId: string) {
    setProductIds(current => current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId]);
  }

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/tenants/client-workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceClientId: currentClientId, ...payload }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; client?: { id: string } };
      if (!response.ok || !data.ok) throw new Error(data.error || "Workspace change failed.");
      if (data.client?.id) {
        router.push(`/portal/clients/${encodeURIComponent(data.client.id)}`);
        setOpen(false);
        return;
      }
      setPanel("list");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workspace change failed.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setPanel("list");
    setError("");
    setPendingDetachId("");
  }

  if (!canManage && workspaces.length < 2) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mm-client-context-provider" aria-haspopup="dialog">
        <Layers3 size={12} /> {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"} <ChevronDown size={12} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] grid place-items-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="client-workspaces-title">
          <button type="button" aria-label="Close client workspaces" className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
          <section className="relative z-10 flex max-h-[min(760px,92dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-black/10 bg-white text-black shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase text-[#087f8c]">One relationship, separate delivery</p>
                <h2 id="client-workspaces-title" className="mt-1 text-xl font-semibold">Client workspaces</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Each company or project keeps its own portal, services, contracts, payments, files and delivery history.</p>
              </div>
              <button type="button" onClick={close} className="grid size-10 shrink-0 place-items-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.04]" aria-label="Close"><X size={18} /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {error ? <p role="alert" className="mb-4 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              {panel === "list" ? (
                <div>
                  <div className="divide-y divide-black/8 border-y border-black/8">
                    {workspaces.map(workspace => (
                      <div key={workspace.id} className="flex flex-wrap items-center gap-3 py-4">
                        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e8f4f3] text-[#087f8c]"><Building2 size={17} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-black/82">{workspace.name}</p>
                            {workspace.current ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-[#087f8c]"><Check size={11} /> Current</span> : null}
                          </div>
                          <p className="mt-1 text-xs text-black/45">{workspace.workspaceLabel || "General workspace"} · {workspace.providerName} · Account: {workspace.stageLabel} · {workspace.portalReady ? "Portal ready" : "Portal not built"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!workspace.current ? <Link href={`/portal/clients/${encodeURIComponent(workspace.id)}`} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">Internal <ExternalLink size={13} /></Link> : null}
                          {workspace.portalReady ? <Link href={`/client-preview/${encodeURIComponent(workspace.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]"><Eye size={13} /> View portal</Link> : null}
                          {canManage ? <Link href={`/portal/agency/portals/editor?scope=client&clientId=${encodeURIComponent(workspace.id)}&mode=onboarding&section=home&context=client-workspace`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85"><PanelsTopLeft size={13} /> {workspace.portalReady ? "Portal studio" : "Prepare portal"}</Link> : null}
                        </div>
                        {canManage && !workspace.current ? (
                          pendingDetachId === workspace.id ? (
                            <div className="flex w-full items-center justify-end gap-2 border-l-2 border-red-400 bg-red-50 px-3 py-2 sm:w-auto">
                              <span className="mr-auto text-xs font-medium text-red-700 sm:mr-2">Detach this workspace?</span>
                              <button type="button" disabled={busy} onClick={() => setPendingDetachId("")} className="min-h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700">Keep linked</button>
                              <button type="button" disabled={busy} onClick={() => void mutate({ action: "unlink", targetClientId: workspace.id })} className="min-h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Detaching…" : "Detach"}</button>
                            </div>
                          ) : (
                            <button type="button" disabled={busy} onClick={() => setPendingDetachId(workspace.id)} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/38 hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="Detach into its own relationship" aria-label={`Detach ${workspace.name}`}><Unlink size={14} /></button>
                          )
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {canManage ? <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setPanel("create")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85"><Plus size={15} /> New separate workspace</button>
                    {availableClients.length ? <button type="button" onClick={() => setPanel("link")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 px-4 text-sm font-semibold text-black/65 hover:bg-black/[0.03]"><Link2 size={15} /> Link existing</button> : null}
                  </div> : null}
                </div>
              ) : null}

              {panel === "create" ? (
                <form onSubmit={event => { event.preventDefault(); void mutate({ action: "create", name, workspaceLabel, websiteUrl, companyId, carryContact, productIds }); }}>
                  <button type="button" onClick={() => setPanel("list")} className="mb-4 text-xs font-semibold text-[#087f8c]">← Back to workspaces</button>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Company or workspace name"><input required value={name} onChange={event => setName(event.target.value)} placeholder="Their second company" className="workspace-input" /></Field>
                    <Field label="Project label"><input value={workspaceLabel} onChange={event => setWorkspaceLabel(event.target.value)} placeholder="Website rebuild, retained care…" className="workspace-input" /></Field>
                    <Field label="Website"><input type="url" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://" className="workspace-input" /></Field>
                    <Field label="Delivered by"><select value={companyId} onChange={event => setCompanyId(event.target.value)} className="workspace-input"><option value="">Same provider as current</option>{companies.filter(item => item.status !== "archived").map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  </div>
                  <section className="mt-5 border-y border-black/8 py-4" aria-labelledby="new-workspace-services">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div><p id="new-workspace-services" className="text-xs font-semibold text-black/68">Initial services <span className="font-normal text-black/38">optional</span></p><p className="mt-1 text-xs leading-5 text-black/45">Choose only what belongs to this project. Included package services are expanded automatically.</p></div>
                      <div className="flex items-center gap-2">
                        {currentProductIds.length ? <button type="button" onClick={() => setProductIds(currentProductIds.filter(id => products.some(product => product.id === id && product.active)))} className="text-xs font-semibold text-[#087f8c]">Use current selection</button> : null}
                        {productIds.length ? <button type="button" onClick={() => setProductIds([])} className="text-xs font-semibold text-black/42">Clear</button> : null}
                      </div>
                    </div>
                    <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {products.filter(product => product.active).map(product => (
                        <label key={product.id} className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 ${productIds.includes(product.id) ? "border-[#087f8c]/35 bg-[#e8f4f3]" : "border-black/8 bg-white hover:bg-black/[0.02]"}`}>
                          <input type="checkbox" checked={productIds.includes(product.id)} onChange={() => toggleProduct(product.id)} className="mt-0.5 size-4 accent-[#087f8c]" />
                          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-black/72">{product.name}</span><span className="mt-0.5 block truncate text-[10px] uppercase text-black/38">{product.category}</span></span>
                        </label>
                      ))}
                    </div>
                    {!products.some(product => product.active) ? <p className="mt-3 text-xs text-amber-700">Create an active service in Fulfilment before assigning this project.</p> : null}
                    <p className="mt-3 text-xs font-medium text-black/48">{productIds.length ? `${productIds.length} service${productIds.length === 1 ? "" : "s"} selected for the new workspace.` : "No service selected. The new workspace will open in assignment-required state."}</p>
                  </section>
                  <div className="mt-5 divide-y divide-black/8 border-y border-black/8">
                    <CheckRow checked={carryContact} onChange={setCarryContact} label="Carry the verified contact" detail="Reuses their account email, phone and linked people so access can be connected." />
                  </div>
                  <p className="mt-4 text-xs leading-5 text-black/45">The new portal starts as an independent workspace. It is created after services are confirmed, so nothing from the previous project leaks into it.</p>
                  <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPanel("list")} className="min-h-10 rounded-md border border-black/10 px-4 text-sm font-semibold text-black/55">Cancel</button><button disabled={busy || !name.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"><Plus size={15} /> {busy ? "Creating…" : "Create workspace"}</button></div>
                </form>
              ) : null}

              {panel === "link" ? (
                <form onSubmit={event => { event.preventDefault(); void mutate({ action: "link", targetClientId: linkClientId }); }}>
                  <button type="button" onClick={() => setPanel("list")} className="mb-4 text-xs font-semibold text-[#087f8c]">← Back to workspaces</button>
                  <Field label="Existing client workspace"><select required value={linkClientId} onChange={event => setLinkClientId(event.target.value)} className="workspace-input">{availableClients.map(item => <option key={item.id} value={item.id}>{[item.name, item.workspaceLabel ? `Project: ${item.workspaceLabel}` : "", item.providerName, item.relationshipWorkspaceCount > 1 ? `${item.relationshipWorkspaceCount} linked workspaces` : "", item.ownerEmail].filter(Boolean).join(" · ")}</option>)}</select></Field>
                  <p className="mt-4 text-sm leading-6 text-black/50">This joins navigation and relationship identity for the selected workspace and any projects already linked to it. Existing portals, products, files, contracts, payments and project history stay attached to their original workspace.</p>
                  <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPanel("list")} className="min-h-10 rounded-md border border-black/10 px-4 text-sm font-semibold text-black/55">Cancel</button><button disabled={busy || !linkClientId} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40"><Link2 size={15} /> {busy ? "Linking…" : "Link workspace"}</button></div>
                </form>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      <style jsx global>{`.workspace-input{min-height:42px;width:100%;border:1px solid rgba(0,0,0,.12);border-radius:6px;background:#fff;padding:0 12px;font-size:14px;outline:none}.workspace-input:focus{border-color:#087f8c;box-shadow:0 0 0 3px rgba(8,127,140,.1)}`}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-black/62">{label}{children}</label>;
}

function CheckRow({ checked, onChange, label, detail }: { checked: boolean; onChange: (value: boolean) => void; label: string; detail: string }) {
  return <label className="flex cursor-pointer items-start gap-3 py-3"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5 size-4 accent-[#087f8c]" /><span><span className="block text-sm font-semibold text-black/75">{label}</span><span className="mt-0.5 block text-xs leading-5 text-black/45">{detail}</span></span></label>;
}
