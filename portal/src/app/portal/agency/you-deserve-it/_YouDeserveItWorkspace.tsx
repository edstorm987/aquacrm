"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, ExternalLink, Gift, HeartPulse, Map, PackageCheck, Pencil, Plus, ReceiptText, ShieldCheck, Sparkles, Star, Trash2, Wallet, X } from "lucide-react";
import type { ClientDelightOccasion, ClientDelightRecord, ClientDelightStatus } from "@/server/types";

type ClientOption = { id: string; name: string; companyId?: string; stageLabel: string; source: string; health: "healthy" | "attention"; healthNotes: string[] };
type CompanyOption = { id: string; name: string; slug: string; colour: string };
type ReputationProfile = { id: string; companyIds?: string[]; name: string; platform?: string; rating?: number; reviewCount?: number; unansweredReviews?: number; status: string };
type View = "upcoming" | "experience" | "health" | "all" | "delivered";
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
  { value: "event", label: "Client event" },
  { value: "trip", label: "Client trip" },
  { value: "random", label: "Just because" },
  { value: "shock-and-awe", label: "Shock and awe" },
  { value: "other", label: "Other" },
];

export function YouDeserveItWorkspace({
  initialRecords,
  clients,
  companies,
  reputationProfiles,
}: {
  initialRecords: ClientDelightRecord[];
  clients: ClientOption[];
  companies: CompanyOption[];
  reputationProfiles: ReputationProfile[];
}) {
  const [records, setRecords] = useState(initialRecords);
  const [view, setView] = useState<View>("upcoming");
  const [draft, setDraft] = useState<Draft | null>(null);
  const visible = useMemo(() => records.filter(record => view === "all" || (view === "delivered" ? record.status === "delivered" : !["delivered", "cancelled"].includes(record.status))), [records, view]);
  const plannedSpend = records.filter(record => !["delivered", "cancelled"].includes(record.status)).reduce((sum, record) => sum + (record.budgetCents ?? 0), 0);
  const actualSpend = records.reduce((sum, record) => sum + (record.costCents ?? 0), 0);
  const dueSoon = records.filter(record => record.dueAt && record.dueAt >= Date.now() && record.dueAt <= Date.now() + 14 * 86_400_000 && !["delivered", "cancelled"].includes(record.status)).length;
  const welcomePacks = records.filter(record => record.occasion === "welcome" && record.status !== "cancelled").length;
  const experiencePlans = records.filter(record => ["event", "trip", "shock-and-awe"].includes(record.occasion) && record.status !== "cancelled").length;
  const attentionClients = clients.filter(client => client.health === "attention").length;
  const gbpProfiles = reputationProfiles.filter(profile => profile.platform === "Google Business Profile");
  const brandRows = buildBrandRows(companies, clients, records, reputationProfiles);

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

  function prefill(occasion: ClientDelightOccasion): Draft {
    if (occasion === "welcome") return { ...EMPTY, occasion, title: "Configured welcome pack", status: "planned", notes: "Pack contents, welcome note, access links, printed items, gift, supplier, delivery address and follow-up check." };
    if (occasion === "event") return { ...EMPTY, occasion, title: "Client experience event", status: "idea", notes: "Purpose, invited clients, venue, agenda, content capture, transport, dietary needs, budget and next commercial step." };
    if (occasion === "trip") return { ...EMPTY, occasion, title: "Client trip or visit", status: "idea", notes: "Client health goal, travel, accommodation, itinerary, meetings, documents, gifts, emergency contact and post-trip follow-up." };
    return { ...EMPTY, occasion };
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Client experience</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">You deserve it.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Run welcome packs, client health, reputation management, review profiles, events, trips and thoughtful moments across every brand.</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/agency/marketing?view=reputation" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03]"><ShieldCheck size={15} />Reputation</Link>
          <button type="button" onClick={() => setDraft({ ...EMPTY })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} />Plan something</button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Experience plans" value={String(experiencePlans)} icon={<Sparkles size={17} />} tone="violet" />
        <Metric label="Due in 14 days" value={String(dueSoon)} icon={<CalendarDays size={17} />} tone="amber" />
        <Metric label="Welcome packs" value={String(welcomePacks)} icon={<PackageCheck size={17} />} tone="blue" />
        <Metric label="Client health" value={`${clients.length - attentionClients}/${clients.length || 0}`} icon={<HeartPulse size={17} />} tone="emerald" />
      </dl>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="rounded-lg border border-black/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
            <div><h2 className="text-base font-semibold text-black/82">Experience command centre</h2><p className="mt-1 text-xs text-black/45">Choose the kind of care to configure, then save it as a live plan.</p></div>
            <div className="flex gap-2 text-xs text-black/45"><span>{money(plannedSpend)} planned</span><span>{money(actualSpend)} spent</span></div>
          </div>
          <div className="grid divide-y divide-black/[0.07] md:grid-cols-3 md:divide-x md:divide-y-0">
            <QuickPlan icon={<PackageCheck size={17} />} title="Welcome packs" detail="Configure onboarding packs, cards, gifts, links and delivery notes." onClick={() => setDraft(prefill("welcome"))} />
            <QuickPlan icon={<BriefcaseBusiness size={17} />} title="Client events" detail="Plan launches, shoots, dinners, reviews, workshops and hosted moments." onClick={() => setDraft(prefill("event"))} />
            <QuickPlan icon={<Map size={17} />} title="Trips" detail="Plan client visits, travel, accommodation, schedules and relationship goals." onClick={() => setDraft(prefill("trip"))} />
          </div>
        </div>
        <aside className="rounded-lg border border-brand/20 bg-brand/[0.045] p-4">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Star size={17} /></span><div><h2 className="text-sm font-semibold text-black/80">Google Business Profile</h2><p className="mt-1 text-xs leading-5 text-black/50">Keep GBP connected to reputation work for each brand, then track rating, review count and unanswered replies.</p></div></div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Profiles" value={String(gbpProfiles.length)} />
            <MiniStat label="Reviews" value={String(gbpProfiles.reduce((sum, profile) => sum + (profile.reviewCount ?? 0), 0))} />
            <MiniStat label="Replies due" value={String(gbpProfiles.reduce((sum, profile) => sum + (profile.unansweredReviews ?? 0), 0))} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/portal/agency/marketing?view=google-business" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white">Open GBP <ArrowUpRight size={13} /></Link>
            <Link href="/portal/agency/marketing?view=reputation" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65">All reputation</Link>
          </div>
        </aside>
      </section>

      <div className="mm-surface-card flex gap-1 overflow-x-auto rounded-lg border border-black/10 p-1" role="tablist" aria-label="Gift view">
        <Tab active={view === "upcoming"} onClick={() => setView("upcoming")} label="Upcoming" />
        <Tab active={view === "experience"} onClick={() => setView("experience")} label="Experience" />
        <Tab active={view === "health"} onClick={() => setView("health")} label="Client health" />
        <Tab active={view === "all"} onClick={() => setView("all")} label="Everything" />
        <Tab active={view === "delivered"} onClick={() => setView("delivered")} label="Delivered" />
      </div>

      {view === "experience" ? <ExperienceOverview rows={brandRows} /> : null}
      {view === "health" ? <ClientHealthOverview clients={clients} /> : null}

      {view !== "experience" && view !== "health" && visible.length ? <div className="grid gap-2">
        {visible.map(record => <article key={record.id} className="mm-surface-card mm-hover-lift grid gap-4 rounded-lg border border-black/10 p-4 lg:grid-cols-[minmax(220px,1fr)_150px_150px_150px_auto] lg:items-center">
          <div className="min-w-0"><div className="flex items-center gap-2"><Gift size={15} className="text-brand" /><p className="font-semibold text-black/80">{record.title}</p></div><p className="mt-1 text-sm text-black/50">{record.recipientName} · {occasionLabel(record.occasion)}</p>{record.notes ? <p className="mt-1 truncate text-xs text-black/40">{record.notes}</p> : null}</div>
          <div><p className="text-[10px] font-semibold uppercase text-black/35">When</p><p className="mt-1 text-sm font-medium text-black/65">{record.dueAt ? new Date(record.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No date"}</p></div>
          <div><p className="text-[10px] font-semibold uppercase text-black/35">Budget / cost</p><p className="mt-1 text-sm font-medium text-black/65">{money(record.budgetCents ?? 0)} / {record.costCents == null ? "—" : money(record.costCents)}</p></div>
          <select aria-label={`${record.title} status`} value={record.status} onChange={event => void updateStatus(record, event.target.value as ClientDelightStatus)} className="min-h-10 rounded-md border border-black/15 bg-white px-2 text-xs font-medium capitalize"><option value="idea">Idea</option><option value="planned">Planned</option><option value="ordered">Ordered</option><option value="sent">Sent</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select>
          <div className="flex justify-end gap-1">{record.trackingUrl ? <a href={record.trackingUrl} target="_blank" rel="noreferrer" title="Open tracking" className="grid size-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.04]"><ExternalLink size={14} /></a> : null}<button type="button" onClick={() => setDraft(toDraft(record))} aria-label={`Edit ${record.title}`} className="grid size-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.04]"><Pencil size={14} /></button><button type="button" onClick={() => void remove(record)} aria-label={`Delete ${record.title}`} className="grid size-9 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button></div>
        </article>)}
      </div> : view === "experience" || view === "health" ? null : <div className="mm-surface-card rounded-lg border border-dashed border-black/15 px-5 py-12 text-center"><span className="mm-area-icon mx-auto grid size-12 place-items-center rounded-lg"><PackageCheck size={21} /></span><p className="mt-4 font-semibold text-black/70">{view === "delivered" ? "Nothing delivered yet" : "Nothing planned yet"}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-black/45">Add a welcome pack, important date, trip, event or spontaneous thank-you when the moment feels right.</p>{view !== "delivered" ? <button type="button" onClick={() => setDraft({ ...EMPTY })} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} />Plan something</button> : null}</div>}

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

function QuickPlan({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group grid min-h-36 content-start gap-2 p-4 text-left hover:bg-black/[0.02]">
      <span className="grid size-9 place-items-center rounded-md bg-black/[0.045] text-brand group-hover:bg-brand group-hover:text-white">{icon}</span>
      <span className="text-sm font-semibold text-black/80">{title}</span>
      <span className="text-xs leading-5 text-black/48">{detail}</span>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-black/10 bg-white px-2 py-3"><dt className="text-[10px] font-semibold uppercase text-black/35">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-black/80">{value}</dd></div>;
}

function ExperienceOverview({ rows }: { rows: ReturnType<typeof buildBrandRows> }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-4 py-4">
        <div><h2 className="text-base font-semibold text-black/82">Experience by brand</h2><p className="mt-1 text-sm text-black/45">See whether each brand has clients, plans, welcome packs and reputation profiles covered.</p></div>
        <Link href="/portal/agency/company" className="text-xs font-semibold text-brand hover:underline">Manage brands</Link>
      </div>
      <div className="divide-y divide-black/[0.07]">
        {rows.map(row => (
          <article key={row.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_320px_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: row.colour }} aria-hidden /><h3 className="truncate text-sm font-semibold text-black/80">{row.name}</h3></div>
              <p className="mt-1 text-xs text-black/45">{row.clients} clients · {row.welcomePacks} welcome packs · {row.experiencePlans} events/trips/plans</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <PillStat label="Client health" value={`${row.healthy}/${row.clients || 0}`} tone={row.attention ? "amber" : "green"} />
              <PillStat label="Reputation" value={String(row.reputationProfiles)} tone={row.reputationProfiles ? "green" : "neutral"} />
              <PillStat label="Replies due" value={String(row.unansweredReviews)} tone={row.unansweredReviews ? "amber" : "green"} />
            </div>
            <Link href={`/portal/agency/marketing?view=reputation&brand=${encodeURIComponent(row.slug)}`} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Reputation <ArrowUpRight size={13} /></Link>
          </article>
        ))}
        {!rows.length ? <p className="px-4 py-10 text-center text-sm text-black/40">Brands will appear here once they are active in Company.</p> : null}
      </div>
    </section>
  );
}

function ClientHealthOverview({ clients }: { clients: ClientOption[] }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-4 py-4">
        <div><h2 className="text-base font-semibold text-black/82">Client health inside experience</h2><p className="mt-1 text-sm text-black/45">Spot which relationships need attention before planning packs, events or review asks.</p></div>
        <Link href="/portal/clients?view=health" className="text-xs font-semibold text-brand hover:underline">Open full health view</Link>
      </div>
      <div className="divide-y divide-black/[0.07]">
        {clients.map(client => (
          <article key={client.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-black/80">{client.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${client.health === "healthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{client.health === "healthy" ? "Healthy" : "Needs attention"}</span></div><p className="mt-1 text-xs text-black/45">{client.stageLabel} · Source: {client.source}</p></div>
            <p className="text-xs leading-5 text-black/52">{client.healthNotes.length ? client.healthNotes.join(" · ") : "Details are complete and contact is current."}</p>
            <Link href={`/portal/clients/${client.id}`} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-center text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Open</Link>
          </article>
        ))}
        {!clients.length ? <p className="px-4 py-10 text-center text-sm text-black/40">Active clients will appear here.</p> : null}
      </div>
    </section>
  );
}

function PillStat({ label, value, tone }: { label: string; value: string; tone: "green" | "amber" | "neutral" }) {
  const className = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-black/[0.04] text-black/55";
  return <div className={`rounded-md px-2 py-2 ${className}`}><p className="text-[10px] font-semibold uppercase">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>;
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "blue" | "emerald" | "violet" | "amber" }) { return <div className="mm-kpi-card mm-surface-card min-h-24 rounded-lg border border-black/10 p-4" data-kpi-tone={tone}><div className="flex items-start justify-between gap-3"><dt className="text-[10px] font-semibold uppercase text-black/40">{label}</dt><span className="mm-kpi-icon grid size-8 shrink-0 place-items-center rounded-md">{icon}</span></div><dd className="mt-1 text-2xl font-semibold text-black/85">{value}</dd></div>; }
function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-10 whitespace-nowrap rounded-md px-3 text-sm font-medium transition ${active ? "bg-black text-white shadow-sm" : "text-black/45 hover:bg-black/[0.04] hover:text-black/70"}`}>{label}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-black/60">{label}{children}</label>; }
function occasionLabel(value: ClientDelightOccasion) { return OCCASIONS.find(item => item.value === value)?.label ?? value; }
function money(cents: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100); }
function toDraft(record: ClientDelightRecord): Draft { return { id: record.id, clientId: record.clientId ?? "", recipientName: record.recipientName, occasion: record.occasion, title: record.title, status: record.status, dueAt: record.dueAt ? new Date(record.dueAt).toISOString().slice(0, 10) : "", budget: record.budgetCents == null ? "" : (record.budgetCents / 100).toFixed(2), cost: record.costCents == null ? "" : (record.costCents / 100).toFixed(2), supplier: record.supplier ?? "", trackingUrl: record.trackingUrl ?? "", notes: record.notes ?? "" }; }
function buildBrandRows(companies: CompanyOption[], clients: ClientOption[], records: ClientDelightRecord[], reputationProfiles: ReputationProfile[]) {
  return companies.map(company => {
    const brandClients = clients.filter(client => client.companyId === company.id);
    const clientIds = new Set(brandClients.map(client => client.id));
    const brandRecords = records.filter(record => record.clientId && clientIds.has(record.clientId));
    const profiles = reputationProfiles.filter(profile => profile.companyIds?.includes(company.id));
    return {
      ...company,
      clients: brandClients.length,
      healthy: brandClients.filter(client => client.health === "healthy").length,
      attention: brandClients.filter(client => client.health === "attention").length,
      welcomePacks: brandRecords.filter(record => record.occasion === "welcome" && record.status !== "cancelled").length,
      experiencePlans: brandRecords.filter(record => ["event", "trip", "shock-and-awe"].includes(record.occasion) && record.status !== "cancelled").length,
      reputationProfiles: profiles.length,
      unansweredReviews: profiles.reduce((sum, profile) => sum + (profile.unansweredReviews ?? 0), 0),
    };
  });
}
const control = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35";
