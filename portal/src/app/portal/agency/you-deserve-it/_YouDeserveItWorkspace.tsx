"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Gift, PackageCheck, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ClientDelightOccasion, ClientDelightRecord, ClientDelightStatus } from "@/server/types";

type ClientOption = { id: string; name: string };
type View = "upcoming" | "all" | "delivered";
type Draft = {
  id?: string;
  clientId: string;
  recipientName: string;
  occasion: ClientDelightOccasion;
  title: string;
  status: ClientDelightStatus;
  dueAt: string;
  budget: string;
  cost: string;
  supplier: string;
  trackingUrl: string;
  notes: string;
};

const EMPTY: Draft = { clientId: "", recipientName: "", occasion: "welcome", title: "", status: "idea", dueAt: "", budget: "", cost: "", supplier: "", trackingUrl: "", notes: "" };
const OCCASIONS: Array<{ value: ClientDelightOccasion; label: string }> = [
  { value: "welcome", label: "Welcome pack" },
  { value: "birthday", label: "Birthday" },
  { value: "christmas", label: "Christmas" },
  { value: "milestone", label: "Client milestone" },
  { value: "random", label: "Just because" },
  { value: "shock-and-awe", label: "Shock and awe" },
  { value: "other", label: "Other" },
];

export function YouDeserveItWorkspace({ initialRecords, clients }: { initialRecords: ClientDelightRecord[]; clients: ClientOption[] }) {
  const [records, setRecords] = useState(initialRecords);
  const [view, setView] = useState<View>("upcoming");
  const [draft, setDraft] = useState<Draft | null>(null);
  const visible = useMemo(() => records.filter(record => view === "all" || (view === "delivered" ? record.status === "delivered" : !["delivered", "cancelled"].includes(record.status))), [records, view]);
  const plannedSpend = records.filter(record => !["delivered", "cancelled"].includes(record.status)).reduce((sum, record) => sum + (record.budgetCents ?? 0), 0);
  const actualSpend = records.reduce((sum, record) => sum + (record.costCents ?? 0), 0);
  const dueSoon = records.filter(record => record.dueAt && record.dueAt >= Date.now() && record.dueAt <= Date.now() + 14 * 86_400_000 && !["delivered", "cancelled"].includes(record.status)).length;

  function upsert(record: ClientDelightRecord) {
    setRecords(current => current.some(item => item.id === record.id) ? current.map(item => item.id === record.id ? record : item) : [record, ...current]);
  }

  async function updateStatus(record: ClientDelightRecord, status: ClientDelightStatus) {
    const response = await fetch("/api/tenants/client-delight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", id: record.id, status }) });
    const json = await response.json().catch(() => null) as { record?: ClientDelightRecord } | null;
    if (response.ok && json?.record) upsert(json.record);
  }

  async function remove(record: ClientDelightRecord) {
    if (!window.confirm(`Delete “${record.title}” for ${record.recipientName}?`)) return;
    const response = await fetch("/api/tenants/client-delight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: record.id }) });
    if (response.ok) setRecords(current => current.filter(item => item.id !== record.id));
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Client delight</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">You deserve it.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Plan thoughtful moments, remember important dates, track every send and understand what the experience costs.</p></div>
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} />Plan something</button>
      </header>

      <dl className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-4">
        <Metric label="In progress" value={String(records.filter(record => !["delivered", "cancelled"].includes(record.status)).length)} />
        <Metric label="Due in 14 days" value={String(dueSoon)} />
        <Metric label="Planned spend" value={money(plannedSpend)} />
        <Metric label="Actual spend" value={money(actualSpend)} />
      </dl>

      <div className="flex gap-6 overflow-x-auto border-b border-black/10" role="tablist" aria-label="Gift view">
        <Tab active={view === "upcoming"} onClick={() => setView("upcoming")} label="Upcoming" />
        <Tab active={view === "all"} onClick={() => setView("all")} label="Everything" />
        <Tab active={view === "delivered"} onClick={() => setView("delivered")} label="Delivered" />
      </div>

      {visible.length ? <div className="divide-y divide-black/10 border-y border-black/10">
        {visible.map(record => <article key={record.id} className="grid gap-4 py-4 lg:grid-cols-[minmax(220px,1fr)_150px_150px_150px_auto] lg:items-center">
          <div className="min-w-0"><div className="flex items-center gap-2"><Gift size={15} className="text-brand" /><p className="font-semibold text-black/80">{record.title}</p></div><p className="mt-1 text-sm text-black/50">{record.recipientName} · {occasionLabel(record.occasion)}</p>{record.notes ? <p className="mt-1 truncate text-xs text-black/40">{record.notes}</p> : null}</div>
          <div><p className="text-[10px] font-semibold uppercase text-black/35">When</p><p className="mt-1 text-sm font-medium text-black/65">{record.dueAt ? new Date(record.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No date"}</p></div>
          <div><p className="text-[10px] font-semibold uppercase text-black/35">Budget / cost</p><p className="mt-1 text-sm font-medium text-black/65">{money(record.budgetCents ?? 0)} / {record.costCents == null ? "—" : money(record.costCents)}</p></div>
          <select aria-label={`${record.title} status`} value={record.status} onChange={event => void updateStatus(record, event.target.value as ClientDelightStatus)} className="min-h-10 rounded-md border border-black/15 bg-white px-2 text-xs font-medium capitalize"><option value="idea">Idea</option><option value="planned">Planned</option><option value="ordered">Ordered</option><option value="sent">Sent</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select>
          <div className="flex justify-end gap-1">{record.trackingUrl ? <a href={record.trackingUrl} target="_blank" rel="noreferrer" title="Open tracking" className="grid size-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.04]"><ExternalLink size={14} /></a> : null}<button type="button" onClick={() => setDraft(toDraft(record))} aria-label={`Edit ${record.title}`} className="grid size-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.04]"><Pencil size={14} /></button><button type="button" onClick={() => void remove(record)} aria-label={`Delete ${record.title}`} className="grid size-9 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button></div>
        </article>)}
      </div> : <div className="border-y border-dashed border-black/15 py-12 text-center"><PackageCheck className="mx-auto text-black/25" /><p className="mt-3 font-semibold text-black/70">{view === "delivered" ? "Nothing delivered yet" : "Nothing planned yet"}</p><p className="mt-1 text-sm text-black/45">Add a welcome pack, important date or spontaneous thank-you when the moment feels right.</p></div>}

      {draft ? <DelightEditor draft={draft} clients={clients} onClose={() => setDraft(null)} onSaved={record => { upsert(record); setDraft(null); }} /> : null}
    </div>
  );
}

function DelightEditor({ draft, clients, onClose, onSaved }: { draft: Draft; clients: ClientOption[]; onClose: () => void; onSaved: (record: ClientDelightRecord) => void }) {
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/tenants/client-delight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: form.id ? "update" : "create", id: form.id, clientId: form.clientId || undefined, recipientName: form.recipientName, occasion: form.occasion, title: form.title, status: form.status, dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00`).getTime() : undefined, budgetCents: form.budget ? Math.round(Number(form.budget) * 100) : undefined, costCents: form.cost ? Math.round(Number(form.cost) * 100) : undefined, supplier: form.supplier, trackingUrl: form.trackingUrl, notes: form.notes }) });
    const json = await response.json().catch(() => null) as { record?: ClientDelightRecord; error?: string } | null;
    if (response.ok && json?.record) onSaved(json.record); else setError(json?.error ?? "Could not save this plan.");
    setBusy(false);
  }
  function chooseClient(clientId: string) {
    const client = clients.find(item => item.id === clientId);
    setForm(value => ({ ...value, clientId, recipientName: client?.name ?? value.recipientName }));
  }
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4"><form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="delight-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-brand">Client delight</p><h2 id="delight-title" className="mt-1 text-xl font-semibold">{form.id ? "Edit the plan." : "Make the moment count."}</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="mt-5 grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Linked client"><select value={form.clientId} onChange={event => chooseClient(event.target.value)} className={control}><option value="">No linked client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="Recipient"><input required value={form.recipientName} onChange={event => setForm(value => ({ ...value, recipientName: event.target.value }))} className={control} placeholder="Person or business" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Occasion"><select value={form.occasion} onChange={event => setForm(value => ({ ...value, occasion: event.target.value as ClientDelightOccasion }))} className={control}>{OCCASIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field label="Status"><select value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as ClientDelightStatus }))} className={control}><option value="idea">Idea</option><option value="planned">Planned</option><option value="ordered">Ordered</option><option value="sent">Sent</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></Field></div><Field label="Gift or experience"><input required value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} className={control} placeholder="Personalised welcome package" /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Send by"><input type="date" value={form.dueAt} onChange={event => setForm(value => ({ ...value, dueAt: event.target.value }))} className={control} /></Field><Field label="Budget (£)"><input type="number" min="0" step="0.01" value={form.budget} onChange={event => setForm(value => ({ ...value, budget: event.target.value }))} className={control} /></Field><Field label="Actual cost (£)"><input type="number" min="0" step="0.01" value={form.cost} onChange={event => setForm(value => ({ ...value, cost: event.target.value }))} className={control} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Supplier"><input value={form.supplier} onChange={event => setForm(value => ({ ...value, supplier: event.target.value }))} className={control} /></Field><Field label="Tracking link"><input type="url" value={form.trackingUrl} onChange={event => setForm(value => ({ ...value, trackingUrl: event.target.value }))} className={control} placeholder="https://..." /></Field></div><Field label="Notes and personal details"><textarea rows={5} value={form.notes} onChange={event => setForm(value => ({ ...value, notes: event.target.value }))} className={`${control} py-2`} placeholder="Why this matters, personal preferences, message to include, sizes or delivery instructions." /></Field></div>{error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white">{busy ? "Saving..." : "Save plan"}</button></div></form></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-h-24 border-b border-r border-black/10 p-4 last:border-r-0 lg:border-b-0"><dt className="text-[10px] font-semibold uppercase text-black/40">{label}</dt><dd className="mt-2 text-2xl font-semibold text-black/85">{value}</dd></div>; }
function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`relative min-h-11 whitespace-nowrap text-sm font-medium ${active ? "text-black" : "text-black/45"}`}>{label}{active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-black/60">{label}{children}</label>; }
function occasionLabel(value: ClientDelightOccasion) { return OCCASIONS.find(item => item.value === value)?.label ?? value; }
function money(cents: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100); }
function toDraft(record: ClientDelightRecord): Draft { return { id: record.id, clientId: record.clientId ?? "", recipientName: record.recipientName, occasion: record.occasion, title: record.title, status: record.status, dueAt: record.dueAt ? new Date(record.dueAt).toISOString().slice(0, 10) : "", budget: record.budgetCents == null ? "" : (record.budgetCents / 100).toFixed(2), cost: record.costCents == null ? "" : (record.costCents / 100).toFixed(2), supplier: record.supplier ?? "", trackingUrl: record.trackingUrl ?? "", notes: record.notes ?? "" }; }
const control = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35";
