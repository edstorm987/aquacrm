"use client";

import Link from "next/link";
import { useMemo, useState, useRef } from "react";
import {
  Archive,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  Gift,
  HeartPulse,
  MapPin,
  PackageCheck,
  Pencil,
  Plane,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Truck,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  ClientDelightOccasion,
  ClientDelightRecord,
  ClientDelightStatus,
  ExperienceAudience,
  ExperienceDeliveryMethod,
  ExperienceFulfilmentStep,
  ExperiencePackage,
  ExperiencePackageAudience,
} from "@/server/types";
import { dateInputValue, formatUkDate } from "@/lib/shared/formatDateTime";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

type ClientOption = { id: string; name: string; companyId?: string; stageLabel: string; source: string; health: "healthy" | "attention"; healthNotes: string[] };
type StaffOption = { id: string; name: string; email: string; companyIds: string[] };
type CompanyOption = { id: string; name: string; slug: string; colour: string };
type ReputationProfile = { id: string; companyIds?: string[]; name: string; platform?: string; rating?: number; reviewCount?: number; unansweredReviews?: number; status: string };
type View = "catalogue" | "live" | "staff" | "health" | "brands" | "delivered";
type CatalogueAudience = "all" | "client" | "staff";

type PlanDraft = {
  id?: string;
  packageId: string;
  clientId: string;
  recipientUserId: string;
  companyId: string;
  audience: ExperienceAudience;
  recipientName: string;
  occasion: ClientDelightOccasion;
  title: string;
  status: ClientDelightStatus;
  deliveryMethod: ExperienceDeliveryMethod;
  currency: string;
  dueAt: string;
  budget: string;
  cost: string;
  supplier: string;
  trackingUrl: string;
  bookingReference: string;
  location: string;
  guestCount: string;
  includedItems: string[];
  fulfilmentSteps: ExperienceFulfilmentStep[];
  notes: string;
  outcomeNotes: string;
};

type PackageDraft = {
  id?: string;
  companyIds: string[];
  name: string;
  category: string;
  summary: string;
  audience: ExperiencePackageAudience;
  deliveryMethod: ExperienceDeliveryMethod;
  price: string;
  currency: string;
  leadTimeDays: string;
  supplier: string;
  bookingUrl: string;
  includedItems: string;
  fulfilmentSteps: string;
  active: boolean;
};

const OCCASIONS: Array<{ value: ClientDelightOccasion; label: string }> = [
  { value: "welcome", label: "Welcome pack" },
  { value: "birthday", label: "Birthday" },
  { value: "christmas", label: "Christmas" },
  { value: "milestone", label: "Milestone" },
  { value: "event", label: "Event" },
  { value: "trip", label: "Trip or retreat" },
  { value: "random", label: "Just because" },
  { value: "shock-and-awe", label: "Signature moment" },
  { value: "other", label: "Other" },
];

const DELIVERY_METHODS: Array<{ value: ExperienceDeliveryMethod; label: string }> = [
  { value: "delivery", label: "Physical delivery" },
  { value: "digital", label: "Digital access" },
  { value: "in-person", label: "In person" },
  { value: "travel", label: "Travel" },
  { value: "flexible", label: "Flexible" },
];

export function YouDeserveItWorkspace({
  initialRecords,
  initialPackages,
  clients,
  staff,
  companies,
  reputationProfiles,
  currency,
}: {
  initialRecords: ClientDelightRecord[];
  initialPackages: ExperiencePackage[];
  clients: ClientOption[];
  staff: StaffOption[];
  companies: CompanyOption[];
  reputationProfiles: ReputationProfile[];
  currency: string;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [packages, setPackages] = useState(initialPackages);
  const [view, setView] = useState<View>("catalogue");
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [packageDraft, setPackageDraft] = useState<PackageDraft | null>(null);
  const [planError, setPlanError] = useState("");
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueAudience, setCatalogueAudience] = useState<CatalogueAudience>("all");
  const [showArchived, setShowArchived] = useState(false);

  const activePlans = records.filter(record => !["delivered", "cancelled"].includes(record.status));
  const deliveredPlans = records.filter(record => record.status === "delivered");
  const activePackages = packages.filter(item => item.active);
  const plannedSpend = activePlans.reduce((sum, record) => sum + (record.budgetCents ?? 0), 0);
  const actualSpend = records.reduce((sum, record) => sum + (record.costCents ?? 0), 0);
  const dueSoon = activePlans.filter(record => record.dueAt && record.dueAt >= Date.now() && record.dueAt <= Date.now() + 14 * 86_400_000).length;
  const staffRewards = records.filter(record => record.audience === "staff" && record.status !== "cancelled").length;
  const attentionClients = clients.filter(client => client.health === "attention").length;
  const gbpProfiles = reputationProfiles.filter(profile => profile.platform === "Google Business Profile");
  const brandRows = buildBrandRows(companies, clients, records, reputationProfiles);

  const catalogueItems = useMemo(() => {
    const query = catalogueSearch.trim().toLowerCase();
    return packages.filter(item => showArchived || item.active).filter(item => {
      if (catalogueAudience === "client" && !["client", "either"].includes(item.audience)) return false;
      if (catalogueAudience === "staff" && !["staff", "either"].includes(item.audience)) return false;
      return !query || `${item.name} ${item.category} ${item.summary ?? ""} ${item.supplier ?? ""} ${item.includedItems.join(" ")}`.toLowerCase().includes(query);
    });
  }, [catalogueAudience, catalogueSearch, packages, showArchived]);

  function upsertRecord(record: ClientDelightRecord) {
    setRecords(current => current.some(item => item.id === record.id) ? current.map(item => item.id === record.id ? record : item) : [record, ...current]);
  }

  function upsertPackage(item: ExperiencePackage) {
    setPackages(current => current.some(existing => existing.id === item.id) ? current.map(existing => existing.id === item.id ? item : existing) : [...current, item]);
  }

  async function updatePlan(record: ClientDelightRecord, patch: Partial<ClientDelightRecord>) {
    setPlanError("");
    const response = await fetch("/api/tenants/client-delight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id: record.id, ...patch }),
    });
    const json = await response.json().catch(() => null) as { record?: ClientDelightRecord; error?: string } | null;
    if (response.ok && json?.record) { upsertRecord(json.record); return; }
    // A refused move (Finance has not signed the spend off yet) must say so and
    // say what clears it — never fail silently and leave the row looking moved.
    setPlanError(json?.error ?? "Could not update this experience.");
  }

  async function toggleStep(record: ClientDelightRecord, stepId: string) {
    const fulfilmentSteps = record.fulfilmentSteps.map(step => step.id === stepId ? { ...step, completed: !step.completed, completedAt: step.completed ? undefined : Date.now() } : step);
    await updatePlan(record, { fulfilmentSteps });
  }

  async function removePlan(record: ClientDelightRecord) {
    if (!window.confirm(`Delete “${record.title}” for ${record.recipientName}?`)) return;
    const response = await fetch("/api/tenants/client-delight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: record.id }) });
    if (response.ok) { setPlanError(""); setRecords(current => current.filter(item => item.id !== record.id)); }
    else setPlanError("Could not delete this experience.");
  }

  async function setPackageActive(item: ExperiencePackage, active: boolean) {
    const response = await fetch("/api/tenants/experience-packages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", id: item.id, active }) });
    const json = await response.json().catch(() => null) as { package?: ExperiencePackage } | null;
    if (response.ok && json?.package) upsertPackage(json.package);
  }

  function openPackage(item: ExperiencePackage, audience?: ExperienceAudience, recipient?: StaffOption) {
    setPlanDraft(planFromPackage(item, audience, recipient));
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Experience and recognition</p>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">You deserve it.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Curate packages once, then turn them into thoughtful client experiences, staff rewards, trips, events, welcome moments and repeatable fulfilment plans.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/agency/marketing?view=reputation" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/[0.03]"><ShieldCheck size={15} /> Reputation</Link>
          <button type="button" onClick={() => setPackageDraft(emptyPackage(currency))} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/72 hover:bg-black/[0.03]"><Plus size={15} /> New package</button>
          <button type="button" onClick={() => setPlanDraft(emptyPlan(currency))} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Sparkles size={15} /> Create live plan</button>
        </div>
      </header>

      {planError ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">{planError}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Curated packages" value={String(activePackages.length)} icon={<ShoppingBag size={17} />} tone="blue" />
        <Metric label="Live experiences" value={String(activePlans.length)} icon={<Sparkles size={17} />} tone="violet" />
        <Metric label="Due in 14 days" value={String(dueSoon)} icon={<CalendarDays size={17} />} tone="amber" />
        <Metric label="Staff rewards" value={String(staffRewards)} icon={<Users size={17} />} tone="emerald" />
      </dl>

      <section className="border-y border-black/10 py-5" aria-labelledby="experience-command-centre-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="experience-command-centre-title" className="text-lg font-semibold text-black/84">Experience command centre</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/48">Build the offer in your catalogue, assign it to the right person, then operate every booking, purchase, delivery and follow-up from one live checklist.</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-7 gap-y-2 text-right">
            <div><dt className="text-[10px] font-semibold uppercase text-black/35">Committed</dt><dd className="mt-1 text-sm font-semibold text-black/72">{money(plannedSpend, currency)}</dd></div>
            <div><dt className="text-[10px] font-semibold uppercase text-black/35">Actual spend</dt><dd className="mt-1 text-sm font-semibold text-black/72">{money(actualSpend, currency)}</dd></div>
          </dl>
        </div>
        <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-3">
          <CommandAction icon={<ShoppingBag size={17} />} label="Curate catalogue" detail="Create reusable packages and reward choices." active={view === "catalogue"} onClick={() => setView("catalogue")} />
          <CommandAction icon={<PackageCheck size={17} />} label="Run live plans" detail={`${activePlans.length} active across clients, staff and partners.`} active={view === "live"} onClick={() => setView("live")} />
          <CommandAction icon={<Users size={17} />} label="Reward the team" detail={`${staff.length} staff available for internal experiences.`} active={view === "staff"} onClick={() => setView("staff")} />
        </div>
      </section>

      <div className="flex gap-1 overflow-x-auto border-b border-black/10" role="group" aria-label="Experience workspace">
        <Tab active={view === "catalogue"} onClick={() => setView("catalogue")} label="Catalogue" icon={ShoppingBag} />
        <Tab active={view === "live"} onClick={() => setView("live")} label="Live plans" count={activePlans.length} icon={PackageCheck} />
        <Tab active={view === "staff"} onClick={() => setView("staff")} label="Staff rewards" count={staffRewards} icon={Users} />
        <Tab active={view === "health"} onClick={() => setView("health")} label="Client health" count={attentionClients} icon={HeartPulse} />
        <Tab active={view === "brands"} onClick={() => setView("brands")} label="Brands & reputation" icon={Star} />
        <Tab active={view === "delivered"} onClick={() => setView("delivered")} label="Delivered" count={deliveredPlans.length} icon={CheckCircle2} />
      </div>

      {view === "catalogue" ? (
        <CatalogueView
          items={catalogueItems}
          companies={companies}
          search={catalogueSearch}
          onSearch={setCatalogueSearch}
          audience={catalogueAudience}
          onAudience={setCatalogueAudience}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
          onUse={item => openPackage(item)}
          onEdit={item => setPackageDraft(toPackageDraft(item))}
          onArchive={item => void setPackageActive(item, !item.active)}
          onCreate={() => setPackageDraft(emptyPackage(currency))}
        />
      ) : null}

      {view === "live" ? (
        <PlansView
          title="Live experience operations"
          description="The working queue for every package, booking, shipment, event and follow-up."
          records={activePlans}
          onStatus={(record, status) => void updatePlan(record, { status })}
          onToggleStep={(record, stepId) => void toggleStep(record, stepId)}
          onEdit={record => setPlanDraft(toPlanDraft(record))}
          onDelete={record => void removePlan(record)}
          onCreate={() => setPlanDraft(emptyPlan(currency))}
        />
      ) : null}

      {view === "staff" ? (
        <StaffRewardsView
          staff={staff}
          packages={activePackages.filter(item => item.audience !== "client")}
          records={records.filter(record => record.audience === "staff" && record.status !== "cancelled")}
          onReward={(person, item) => item ? openPackage(item, "staff", person) : setPlanDraft({ ...emptyPlan(currency), audience: "staff", recipientUserId: person.id, recipientName: person.name, companyId: person.companyIds[0] ?? "", occasion: "milestone", title: "Staff recognition experience" })}
          onStatus={(record, status) => void updatePlan(record, { status })}
          onToggleStep={(record, stepId) => void toggleStep(record, stepId)}
          onEdit={record => setPlanDraft(toPlanDraft(record))}
          onDelete={record => void removePlan(record)}
        />
      ) : null}

      {view === "health" ? <ClientHealthOverview clients={clients} /> : null}
      {view === "brands" ? <BrandOverview rows={brandRows} gbpProfiles={gbpProfiles} /> : null}
      {view === "delivered" ? (
        <PlansView
          title="Delivered experiences"
          description="A useful record of what landed, what it cost and what the moment achieved."
          records={deliveredPlans}
          onStatus={(record, status) => void updatePlan(record, { status })}
          onToggleStep={(record, stepId) => void toggleStep(record, stepId)}
          onEdit={record => setPlanDraft(toPlanDraft(record))}
          onDelete={record => void removePlan(record)}
          onCreate={() => setPlanDraft(emptyPlan(currency))}
        />
      ) : null}

      {packageDraft ? (
        <PackageEditor
          draft={packageDraft}
          companies={companies}
          onClose={() => setPackageDraft(null)}
          onSaved={item => { upsertPackage(item); setPackageDraft(null); }}
          onDeleted={id => { setPackages(current => current.filter(item => item.id !== id)); setPackageDraft(null); }}
        />
      ) : null}

      {planDraft ? (
        <PlanEditor
          draft={planDraft}
          packages={activePackages}
          clients={clients}
          staff={staff}
          companies={companies}
          onClose={() => setPlanDraft(null)}
          onSaved={record => { upsertRecord(record); setPlanDraft(null); setView(record.audience === "staff" ? "staff" : "live"); }}
        />
      ) : null}
    </div>
  );
}

function CatalogueView({ items, companies, search, onSearch, audience, onAudience, showArchived, onShowArchived, onUse, onEdit, onArchive, onCreate }: {
  items: ExperiencePackage[];
  companies: CompanyOption[];
  search: string;
  onSearch: (value: string) => void;
  audience: CatalogueAudience;
  onAudience: (value: CatalogueAudience) => void;
  showArchived: boolean;
  onShowArchived: (value: boolean) => void;
  onUse: (item: ExperiencePackage) => void;
  onEdit: (item: ExperiencePackage) => void;
  onArchive: (item: ExperiencePackage) => void;
  onCreate: () => void;
}) {
  return (
    <section aria-labelledby="experience-catalogue-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 id="experience-catalogue-title" className="text-lg font-semibold text-black/84">Curated experience catalogue</h2><p className="mt-1 text-sm text-black/45">Your reusable internal storefront for care, recognition and memorable delivery.</p></div>
        <button type="button" onClick={onCreate} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} /> Create package</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-black/10 py-3">
        <label className="relative min-w-0 flex-1 basis-full sm:basis-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search packages, contents or supplier" className="min-h-10 w-full rounded-md border border-black/15 bg-white pl-9 pr-3 text-sm outline-none focus:border-black/35" />
        </label>
        <div className="inline-flex rounded-md border border-black/15 bg-white p-1" role="group" aria-label="Package audience">
          {(["all", "client", "staff"] as CatalogueAudience[]).map(value => <button key={value} type="button" aria-pressed={audience === value} onClick={() => onAudience(value)} className={`min-h-8 rounded px-3 text-xs font-semibold capitalize ${audience === value ? "bg-black text-white" : "text-black/50 hover:bg-black/[0.04]"}`}>{value}</button>)}
        </div>
        <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-xs font-medium text-black/55"><input type="checkbox" checked={showArchived} onChange={event => onShowArchived(event.target.checked)} /> Show archived</label>
      </div>
      {items.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(item => <PackageCard key={item.id} item={item} companies={companies} onUse={() => onUse(item)} onEdit={() => onEdit(item)} onArchive={() => onArchive(item)} />)}
        </div>
      ) : (
        <EmptyState icon={<ShoppingBag size={22} />} title="No packages in this view" detail="Create a package with contents and fulfilment steps, then issue it whenever the right moment appears." action="Create first package" onAction={onCreate} />
      )}
    </section>
  );
}

function PackageCard({ item, companies, onUse, onEdit, onArchive }: { item: ExperiencePackage; companies: CompanyOption[]; onUse: () => void; onEdit: () => void; onArchive: () => void }) {
  const brandNames = item.companyIds.map(id => companies.find(company => company.id === id)?.name).filter(Boolean);
  return (
    <article className={`flex min-h-[330px] flex-col rounded-lg border bg-white p-4 ${item.active ? "border-black/10" : "border-black/10 opacity-65"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-md bg-black/[0.045] text-brand">{deliveryIcon(item.deliveryMethod)}</span>
        <div className="flex flex-wrap justify-end gap-1"><Badge>{item.category}</Badge><Badge>{packageAudienceLabel(item.audience)}</Badge>{!item.active ? <Badge>Archived</Badge> : null}</div>
      </div>
      <h3 className="mt-4 text-base font-semibold text-black/84">{item.name}</h3>
      <p className="mt-1 line-clamp-3 min-h-[60px] text-sm leading-5 text-black/48">{item.summary || "A curated experience ready to personalise and issue."}</p>
      <div className="mt-4 flex items-end justify-between gap-3 border-y border-black/[0.07] py-3">
        <div><p className="text-[10px] font-semibold uppercase text-black/35">Package value</p><p className="mt-1 text-lg font-semibold text-black/82">{item.priceCents == null ? "Custom" : money(item.priceCents, item.currency)}</p></div>
        <p className="text-right text-xs text-black/42">{item.leadTimeDays == null ? "Flexible lead time" : `${item.leadTimeDays} day lead time`}<br />{deliveryLabel(item.deliveryMethod)}</p>
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs text-black/52">
        {item.includedItems.slice(0, 3).map(value => <li key={value} className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-600" /><span>{value}</span></li>)}
        {!item.includedItems.length ? <li className="text-black/35">Add package contents when you edit this package.</li> : null}
      </ul>
      <div className="mt-auto pt-4">
        <p className="mb-3 truncate text-[11px] text-black/35">{brandNames.length ? brandNames.join(", ") : "Available across all brands"}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onUse} disabled={!item.active} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Gift size={14} /> Use package</button>
          <button type="button" onClick={onEdit} title="Edit package" aria-label={`Edit ${item.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Pencil size={14} /></button>
          <button type="button" onClick={onArchive} title={item.active ? "Archive package" : "Restore package"} aria-label={`${item.active ? "Archive" : "Restore"} ${item.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Archive size={14} /></button>
        </div>
      </div>
    </article>
  );
}

function PlansView({ title, description, records, onStatus, onToggleStep, onEdit, onDelete, onCreate }: {
  title: string;
  description: string;
  records: ClientDelightRecord[];
  onStatus: (record: ClientDelightRecord, status: ClientDelightStatus) => void;
  onToggleStep: (record: ClientDelightRecord, stepId: string) => void;
  onEdit: (record: ClientDelightRecord) => void;
  onDelete: (record: ClientDelightRecord) => void;
  onCreate: () => void;
}) {
  return (
    <section aria-labelledby="experience-plans-title">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="experience-plans-title" className="text-lg font-semibold text-black/84">{title}</h2><p className="mt-1 text-sm text-black/45">{description}</p></div><button type="button" onClick={onCreate} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} /> Add plan</button></div>
      {records.length ? <div className="mt-4 grid gap-3">{records.map(record => <PlanRow key={record.id} record={record} onStatus={status => onStatus(record, status)} onToggleStep={stepId => onToggleStep(record, stepId)} onEdit={() => onEdit(record)} onDelete={() => onDelete(record)} />)}</div> : <EmptyState icon={<PackageCheck size={22} />} title="No experiences here yet" detail="Choose a catalogue package or create a live plan from scratch." action="Create live plan" onAction={onCreate} />}
    </section>
  );
}

function PlanRow({ record, onStatus, onToggleStep, onEdit, onDelete }: { record: ClientDelightRecord; onStatus: (status: ClientDelightStatus) => void; onToggleStep: (stepId: string) => void; onEdit: () => void; onDelete: () => void }) {
  const complete = record.fulfilmentSteps.filter(step => step.completed).length;
  const progress = record.fulfilmentSteps.length ? Math.round(complete / record.fulfilmentSteps.length * 100) : 0;
  return (
    <article className="rounded-lg border border-black/10 bg-white p-4">
      <div className="grid gap-4 2xl:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1fr)_150px_160px_auto] 2xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="text-brand">{deliveryIcon(record.deliveryMethod, 15)}</span><h3 className="truncate text-sm font-semibold text-black/82">{record.title}</h3><Badge>{audienceLabel(record.audience)}</Badge></div>
          <p className="mt-1 text-sm text-black/48">{record.recipientName} · {occasionLabel(record.occasion)}</p>
          <p className="mt-2 text-xs leading-5 text-black/42">{record.packageName ? `From ${record.packageName}` : "Bespoke plan"}{record.location ? ` · ${record.location}` : ""}{record.guestCount ? ` · ${record.guestCount} guests` : ""}</p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase text-black/35">Fulfilment</p><p className="text-[10px] font-semibold tabular-nums text-black/42">{complete}/{record.fulfilmentSteps.length} complete</p></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} /></div>
          <div className="mt-2 grid gap-1">
            {record.fulfilmentSteps.slice(0, 4).map(step => <button key={step.id} type="button" onClick={() => onToggleStep(step.id)} className="flex min-h-7 items-center gap-2 text-left text-xs text-black/50 hover:text-black/75">{step.completed ? <CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> : <Circle size={14} className="shrink-0 text-black/25" />}<span className={step.completed ? "line-through opacity-60" : ""}>{step.label}</span></button>)}
            {record.fulfilmentSteps.length > 4 ? <p className="pl-6 text-[10px] text-black/35">+{record.fulfilmentSteps.length - 4} more in edit</p> : null}
            {!record.fulfilmentSteps.length ? <p className="text-xs text-black/35">No checklist yet.</p> : null}
          </div>
        </div>
        <div><p className="text-[10px] font-semibold uppercase text-black/35">When</p><p className="mt-1 text-sm font-medium text-black/65">{record.dueAt ? formatUkDate(record.dueAt, { day: "numeric", month: "short", year: "numeric" }) : "No date"}</p><p className="mt-2 text-xs text-black/38">{record.bookingReference || deliveryLabel(record.deliveryMethod)}</p></div>
        <div><p className="text-[10px] font-semibold uppercase text-black/35">Budget / actual</p><p className="mt-1 text-sm font-medium text-black/65">{money(record.budgetCents ?? 0, record.currency)} / {record.costCents == null ? "Not logged" : money(record.costCents, record.currency)}</p><select aria-label={`${record.title} status`} value={record.status} onChange={event => onStatus(event.target.value as ClientDelightStatus)} className="mt-2 min-h-9 w-full rounded-md border border-black/15 bg-white px-2 text-xs font-medium"><StatusOptions /></select></div>
        <div className="flex justify-end gap-1">
          {record.trackingUrl ? <a href={record.trackingUrl} target="_blank" rel="noreferrer" title="Open booking or tracking" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.03]"><ExternalLink size={14} /></a> : null}
          <button type="button" onClick={onEdit} title="Edit plan" aria-label={`Edit ${record.title}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.03]"><Pencil size={14} /></button>
          <button type="button" onClick={onDelete} title="Delete plan" aria-label={`Delete ${record.title}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button>
        </div>
      </div>
      {record.outcomeNotes ? <div className="mt-4 border-t border-black/[0.07] pt-3 text-xs leading-5 text-black/52"><span className="font-semibold text-black/65">Outcome:</span> {record.outcomeNotes}</div> : null}
    </article>
  );
}

function StaffRewardsView({ staff, packages, records, onReward, onStatus, onToggleStep, onEdit, onDelete }: { staff: StaffOption[]; packages: ExperiencePackage[]; records: ClientDelightRecord[]; onReward: (person: StaffOption, item?: ExperiencePackage) => void; onStatus: (record: ClientDelightRecord, status: ClientDelightStatus) => void; onToggleStep: (record: ClientDelightRecord, stepId: string) => void; onEdit: (record: ClientDelightRecord) => void; onDelete: (record: ClientDelightRecord) => void }) {
  const [selectedPackages, setSelectedPackages] = useState<Record<string, string>>({});
  return (
    <section aria-labelledby="staff-rewards-title">
      <div><h2 id="staff-rewards-title" className="text-lg font-semibold text-black/84">Internal experience and staff rewards</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-black/45">Recognise contribution with the same care you give clients. Choose a curated reward, personalise it, then fulfil it through a real plan.</p></div>
      {staff.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{staff.map(person => {
        const personRecords = records.filter(record => record.recipientUserId === person.id);
        const latest = personRecords.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
        const selected = packages.find(item => item.id === selectedPackages[person.id]);
        return <article key={person.id} className="rounded-lg border border-black/10 bg-white p-4">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/48"><UserRound size={18} /></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-black/82">{person.name}</h3><p className="truncate text-xs text-black/42">{person.email}</p></div><span className="ml-auto rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{personRecords.length} rewards</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select value={selectedPackages[person.id] ?? ""} onChange={event => setSelectedPackages(current => ({ ...current, [person.id]: event.target.value }))} className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-black/65" aria-label={`Reward package for ${person.name}`}><option value="">Bespoke reward</option>{packages.map(item => <option key={item.id} value={item.id}>{item.name} · {item.priceCents == null ? "custom" : money(item.priceCents, item.currency)}</option>)}</select>
            <button type="button" onClick={() => onReward(person, selected)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Gift size={14} /> Reward</button>
          </div>
          <div className="mt-4 border-t border-black/[0.07] pt-3 text-xs text-black/45">{latest ? <button type="button" onClick={() => onEdit(latest)} className="flex w-full items-center justify-between gap-3 text-left hover:text-black/70"><span><strong className="font-semibold text-black/65">Latest:</strong> {latest.title} · {statusLabel(latest.status)}</span><ArrowUpRight size={13} /></button> : "No reward history yet."}</div>
        </article>;
      })}</div> : <EmptyState icon={<Users size={22} />} title="No staff accounts yet" detail="Staff added inside Company will be available for rewards and internal experiences here." />}
      {records.length ? <div className="mt-8"><h3 className="text-sm font-semibold text-black/72">Staff reward history</h3><div className="mt-3 grid gap-3">{records.map(record => <PlanRow key={record.id} record={record} onStatus={status => onStatus(record, status)} onToggleStep={stepId => onToggleStep(record, stepId)} onEdit={() => onEdit(record)} onDelete={() => onDelete(record)} />)}</div></div> : null}
    </section>
  );
}

function PackageEditor({ draft, companies, onClose, onSaved, onDeleted }: { draft: PackageDraft; companies: CompanyOption[]; onClose: () => void; onSaved: (item: ExperiencePackage) => void; onDeleted: (id: string) => void }) {
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/tenants/experience-packages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: form.id ? "update" : "create",
        id: form.id,
        companyIds: form.companyIds,
        name: form.name,
        category: form.category,
        summary: form.summary,
        audience: form.audience,
        deliveryMethod: form.deliveryMethod,
        priceCents: form.price ? Math.round(Number(form.price) * 100) : undefined,
        currency: form.currency,
        leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
        supplier: form.supplier,
        bookingUrl: form.bookingUrl,
        includedItems: splitLines(form.includedItems),
        fulfilmentSteps: splitLines(form.fulfilmentSteps),
        active: form.active,
      }),
    });
    const json = await response.json().catch(() => null) as { package?: ExperiencePackage; error?: string } | null;
    if (response.ok && json?.package) onSaved(json.package); else setError(json?.error ?? "Could not save this package.");
    setBusy(false);
  }

  async function remove() {
    if (!form.id || !window.confirm(`Delete “${form.name}” from the catalogue? Existing plans keep their package snapshot.`)) return;
    setBusy(true); setError("");
    const response = await fetch("/api/tenants/experience-packages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: form.id }) });
    if (response.ok) onDeleted(form.id); else setError("Could not delete this package.");
    setBusy(false);
  }

  function toggleCompany(id: string) {
    setForm(value => ({ ...value, companyIds: value.companyIds.includes(id) ? value.companyIds.filter(item => item !== id) : [...value.companyIds, id] }));
  }

  return (
    <Modal title={form.id ? "Edit experience package" : "Create experience package"} eyebrow="Catalogue builder" onClose={onClose} size="large">
      <form onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Package name"><input required value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} className={control} placeholder="Signature team day" /></Field>
          <Field label="Category"><input required value={form.category} onChange={event => setForm(value => ({ ...value, category: event.target.value }))} className={control} placeholder="Recognition, welcome, trip..." /></Field>
          <Field label="Audience"><select value={form.audience} onChange={event => setForm(value => ({ ...value, audience: event.target.value as ExperiencePackageAudience }))} className={control}><option value="either">Clients and staff</option><option value="client">Clients</option><option value="staff">Staff</option></select></Field>
          <Field label="Delivery"><select value={form.deliveryMethod} onChange={event => setForm(value => ({ ...value, deliveryMethod: event.target.value as ExperienceDeliveryMethod }))} className={control}>{DELIVERY_METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Summary"><textarea required rows={3} value={form.summary} onChange={event => setForm(value => ({ ...value, summary: event.target.value }))} className={`${control} py-2 sm:col-span-2`} placeholder="What this experience is and why it matters." /></Field>
          <Field label="Package value"><div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2"><input type="number" min="0" step="0.01" value={form.price} onChange={event => setForm(value => ({ ...value, price: event.target.value }))} className={control} placeholder="250.00" /><input value={form.currency} onChange={event => setForm(value => ({ ...value, currency: event.target.value.toUpperCase().slice(0, 3) }))} className={control} aria-label="Currency" /></div></Field>
          <Field label="Lead time in days"><input type="number" min="0" step="1" value={form.leadTimeDays} onChange={event => setForm(value => ({ ...value, leadTimeDays: event.target.value }))} className={control} placeholder="14" /></Field>
          <Field label="Supplier"><input value={form.supplier} onChange={event => setForm(value => ({ ...value, supplier: event.target.value }))} className={control} placeholder="Preferred provider" /></Field>
          <Field label="Booking or buying link"><input type="url" value={form.bookingUrl} onChange={event => setForm(value => ({ ...value, bookingUrl: event.target.value }))} className={control} placeholder="https://..." /></Field>
          <Field label="What is included (one per line)"><textarea rows={6} value={form.includedItems} onChange={event => setForm(value => ({ ...value, includedItems: event.target.value }))} className={`${control} py-2`} placeholder={"Welcome gift\nHandwritten note\nPriority booking"} /></Field>
          <Field label="Fulfilment checklist (one per line)"><textarea rows={6} value={form.fulfilmentSteps} onChange={event => setForm(value => ({ ...value, fulfilmentSteps: event.target.value }))} className={`${control} py-2`} placeholder={"Confirm recipient preferences\nBook supplier\nPrepare personal note\nConfirm delivery"} /></Field>
        </div>
        {companies.length ? <fieldset className="mt-4"><legend className="text-xs font-medium text-black/60">Available for brands</legend><div className="mt-2 flex flex-wrap gap-2">{companies.map(company => <label key={company.id} className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium ${form.companyIds.includes(company.id) ? "border-black bg-black text-white" : "border-black/15 bg-white text-black/55"}`}><input type="checkbox" checked={form.companyIds.includes(company.id)} onChange={() => toggleCompany(company.id)} className="sr-only" /><span className="size-2 rounded-full" style={{ backgroundColor: company.colour }} />{company.name}</label>)}</div><p className="mt-2 text-[11px] text-black/35">Leave all unchecked to make the package available across every brand.</p></fieldset> : null}
        <label className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-black/60"><input type="checkbox" checked={form.active} onChange={event => setForm(value => ({ ...value, active: event.target.checked }))} /> Active in catalogue</label>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><div>{form.id ? <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 size={15} /> Delete package</button> : null}</div><div className="flex gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md px-3 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save package"}</button></div></div>
      </form>
    </Modal>
  );
}

function PlanEditor({ draft, packages, clients, staff, companies, onClose, onSaved }: { draft: PlanDraft; packages: ExperiencePackage[]; clients: ClientOption[]; staff: StaffOption[]; companies: CompanyOption[]; onClose: () => void; onSaved: (record: ClientDelightRecord) => void }) {
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choosePackage(id: string) {
    const item = packages.find(value => value.id === id);
    if (!item) return setForm(value => ({ ...value, packageId: "" }));
    setForm(value => ({
      ...value,
      packageId: item.id,
      title: item.name,
      audience: item.audience === "staff" ? "staff" : item.audience === "client" ? "client" : value.audience,
      deliveryMethod: item.deliveryMethod,
      currency: item.currency,
      budget: item.priceCents == null ? "" : (item.priceCents / 100).toFixed(2),
      supplier: item.supplier ?? "",
      trackingUrl: item.bookingUrl ?? value.trackingUrl,
      includedItems: [...item.includedItems],
      fulfilmentSteps: item.fulfilmentSteps.map((label, index) => ({ id: `draft_step_${index}`, label, completed: false })),
      dueAt: item.leadTimeDays == null ? value.dueAt : dateInput(Date.now() + item.leadTimeDays * 86_400_000),
    }));
  }

  function chooseClient(id: string) {
    const client = clients.find(item => item.id === id);
    setForm(value => ({ ...value, clientId: id, recipientUserId: "", recipientName: client?.name ?? value.recipientName, companyId: client?.companyId ?? value.companyId }));
  }

  function chooseStaff(id: string) {
    const person = staff.find(item => item.id === id);
    setForm(value => ({ ...value, recipientUserId: id, clientId: "", recipientName: person?.name ?? value.recipientName, companyId: person?.companyIds[0] ?? value.companyId }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/tenants/client-delight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: form.id ? "update" : "create",
        id: form.id,
        packageId: form.packageId || undefined,
        clientId: form.audience === "client" ? form.clientId || undefined : undefined,
        recipientUserId: form.audience === "staff" ? form.recipientUserId || undefined : undefined,
        companyId: form.companyId || undefined,
        audience: form.audience,
        recipientName: form.recipientName,
        occasion: form.occasion,
        title: form.title,
        status: form.status,
        deliveryMethod: form.deliveryMethod,
        currency: form.currency,
        dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00`).getTime() : undefined,
        budgetCents: form.budget ? Math.round(Number(form.budget) * 100) : undefined,
        costCents: form.cost ? Math.round(Number(form.cost) * 100) : undefined,
        supplier: form.supplier,
        trackingUrl: form.trackingUrl,
        bookingReference: form.bookingReference,
        location: form.location,
        guestCount: form.guestCount ? Number(form.guestCount) : undefined,
        includedItems: form.includedItems,
        fulfilmentSteps: form.fulfilmentSteps,
        notes: form.notes,
        outcomeNotes: form.outcomeNotes,
      }),
    });
    const json = await response.json().catch(() => null) as { record?: ClientDelightRecord; error?: string } | null;
    if (response.ok && json?.record) onSaved(json.record); else setError(json?.error ?? "Could not save this live plan.");
    setBusy(false);
  }

  return (
    <Modal title={form.id ? "Edit live experience" : "Create live experience"} eyebrow="Experience fulfilment" onClose={onClose} size="large">
      <form onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start from package"><select value={form.packageId} onChange={event => choosePackage(event.target.value)} className={control}><option value="">Bespoke plan</option>{packages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Recipient type"><select value={form.audience} onChange={event => setForm(value => ({ ...value, audience: event.target.value as ExperienceAudience, clientId: "", recipientUserId: "", recipientName: "" }))} className={control}><option value="client">Client</option><option value="staff">Staff</option><option value="partner">Partner or supplier</option><option value="personal">Personal</option></select></Field>
          {form.audience === "client" ? <Field label="Client"><select required value={form.clientId} onChange={event => chooseClient(event.target.value)} className={control}><option value="">Choose client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field> : null}
          {form.audience === "staff" ? <Field label="Staff member"><select required value={form.recipientUserId} onChange={event => chooseStaff(event.target.value)} className={control}><option value="">Choose staff member</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></Field> : null}
          {!["client", "staff"].includes(form.audience) ? <Field label="Recipient"><input required value={form.recipientName} onChange={event => setForm(value => ({ ...value, recipientName: event.target.value }))} className={control} placeholder="Person, partner or business" /></Field> : null}
          <Field label="Brand"><select value={form.companyId} onChange={event => setForm(value => ({ ...value, companyId: event.target.value }))} className={control}><option value="">Shared / no brand</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
          <Field label="Experience name"><input required value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} className={control} /></Field>
          <Field label="Occasion"><select value={form.occasion} onChange={event => setForm(value => ({ ...value, occasion: event.target.value as ClientDelightOccasion }))} className={control}>{OCCASIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Status"><select value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as ClientDelightStatus }))} className={control}><StatusOptions /></select></Field>
          <Field label="Due or experience date"><input type="date" value={form.dueAt} onChange={event => setForm(value => ({ ...value, dueAt: event.target.value }))} className={control} /></Field>
          <Field label="Delivery method"><select value={form.deliveryMethod} onChange={event => setForm(value => ({ ...value, deliveryMethod: event.target.value as ExperienceDeliveryMethod }))} className={control}>{DELIVERY_METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Budget"><div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2"><input type="number" min="0" step="0.01" value={form.budget} onChange={event => setForm(value => ({ ...value, budget: event.target.value }))} className={control} /><input value={form.currency} onChange={event => setForm(value => ({ ...value, currency: event.target.value.toUpperCase().slice(0, 3) }))} className={control} aria-label="Plan currency" /></div></Field>
          <Field label="Actual cost"><input type="number" min="0" step="0.01" value={form.cost} onChange={event => setForm(value => ({ ...value, cost: event.target.value }))} className={control} /></Field>
          <Field label="Location or delivery address"><input value={form.location} onChange={event => setForm(value => ({ ...value, location: event.target.value }))} className={control} /></Field>
          <Field label="Guests or quantity"><input type="number" min="0" step="1" value={form.guestCount} onChange={event => setForm(value => ({ ...value, guestCount: event.target.value }))} className={control} /></Field>
          <Field label="Supplier"><input value={form.supplier} onChange={event => setForm(value => ({ ...value, supplier: event.target.value }))} className={control} /></Field>
          <Field label="Booking reference"><input value={form.bookingReference} onChange={event => setForm(value => ({ ...value, bookingReference: event.target.value }))} className={control} /></Field>
          <Field label="Booking or tracking link"><input type="url" value={form.trackingUrl} onChange={event => setForm(value => ({ ...value, trackingUrl: event.target.value }))} className={control} placeholder="https://..." /></Field>
          <Field label="Private planning notes"><textarea rows={4} value={form.notes} onChange={event => setForm(value => ({ ...value, notes: event.target.value }))} className={`${control} py-2`} /></Field>
          <ListEditor label="Included items" values={form.includedItems} onChange={includedItems => setForm(value => ({ ...value, includedItems }))} placeholder="Add an item" />
          <StepEditor steps={form.fulfilmentSteps} onChange={fulfilmentSteps => setForm(value => ({ ...value, fulfilmentSteps }))} />
          <Field label="Outcome and response"><textarea rows={4} value={form.outcomeNotes} onChange={event => setForm(value => ({ ...value, outcomeNotes: event.target.value }))} className={`${control} py-2`} placeholder="What landed well, feedback, impact and next relationship move." /></Field>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md px-3 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save live plan"}</button></div>
      </form>
    </Modal>
  );
}

function ListEditor({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  const [newValue, setNewValue] = useState("");
  function add() { const value = newValue.trim(); if (value) onChange([...values, value]); setNewValue(""); }
  return <div><p className="text-xs font-medium text-black/60">{label}</p><div className="mt-1 rounded-md border border-black/15 bg-white p-2"><div className="grid gap-1">{values.map((value, index) => <div key={`${value}-${index}`} className="flex min-h-8 items-center gap-2 rounded bg-black/[0.025] px-2 text-xs text-black/60"><Check size={13} className="text-emerald-600" /><span className="min-w-0 flex-1">{value}</span><button type="button" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${value}`} className="text-black/30 hover:text-red-600"><X size={13} /></button></div>)}</div><div className="mt-2 flex gap-1"><input value={newValue} onChange={event => setNewValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={placeholder} className="min-h-9 min-w-0 flex-1 rounded-md border border-black/10 px-2 text-xs" /><button type="button" onClick={add} aria-label={`Add ${label.toLowerCase()}`} className="grid size-9 place-items-center rounded-md bg-black text-white"><Plus size={14} /></button></div></div></div>;
}

function StepEditor({ steps, onChange }: { steps: ExperienceFulfilmentStep[]; onChange: (steps: ExperienceFulfilmentStep[]) => void }) {
  const [newValue, setNewValue] = useState("");
  function add() { const label = newValue.trim(); if (label) onChange([...steps, { id: `draft_step_${Date.now()}`, label, completed: false }]); setNewValue(""); }
  return <div><p className="text-xs font-medium text-black/60">Fulfilment checklist</p><div className="mt-1 rounded-md border border-black/15 bg-white p-2"><div className="grid gap-1">{steps.map((step, index) => <div key={step.id} className="flex min-h-8 items-center gap-2 rounded bg-black/[0.025] px-2 text-xs text-black/60"><button type="button" onClick={() => onChange(steps.map(item => item.id === step.id ? { ...item, completed: !item.completed, completedAt: item.completed ? undefined : Date.now() } : item))}>{step.completed ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Circle size={14} className="text-black/25" />}</button><span className={`min-w-0 flex-1 ${step.completed ? "line-through opacity-60" : ""}`}>{step.label}</span><button type="button" onClick={() => onChange(steps.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${step.label}`} className="text-black/30 hover:text-red-600"><X size={13} /></button></div>)}</div><div className="mt-2 flex gap-1"><input value={newValue} onChange={event => setNewValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="Add fulfilment step" className="min-h-9 min-w-0 flex-1 rounded-md border border-black/10 px-2 text-xs" /><button type="button" onClick={add} aria-label="Add fulfilment step" className="grid size-9 place-items-center rounded-md bg-black text-white"><Plus size={14} /></button></div></div></div>;
}

function BrandOverview({ rows, gbpProfiles }: { rows: ReturnType<typeof buildBrandRows>; gbpProfiles: ReputationProfile[] }) {
  return <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="rounded-lg border border-black/10 bg-white"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-4 py-4"><div><h2 className="text-base font-semibold text-black/82">Experience by brand</h2><p className="mt-1 text-sm text-black/45">Client care and reputation coverage across every active brand.</p></div><Link href="/portal/agency/company?view=companies" className="text-xs font-semibold text-brand hover:underline">Manage brands</Link></div><div className="divide-y divide-black/[0.07]">{rows.map(row => <article key={row.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_300px_auto] md:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: row.colour }} /><h3 className="truncate text-sm font-semibold text-black/80">{row.name}</h3></div><p className="mt-1 text-xs text-black/45">{row.clients} clients · {row.welcomePacks} welcome packs · {row.experiencePlans} experiences</p></div><div className="grid grid-cols-3 gap-2"><PillStat label="Health" value={`${row.healthy}/${row.clients || 0}`} tone={row.attention ? "amber" : "green"} /><PillStat label="Profiles" value={String(row.reputationProfiles)} tone={row.reputationProfiles ? "green" : "neutral"} /><PillStat label="Replies" value={String(row.unansweredReviews)} tone={row.unansweredReviews ? "amber" : "green"} /></div><Link href={`/portal/agency/marketing?view=reputation&brand=${encodeURIComponent(row.slug)}`} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/62">Reputation <ArrowUpRight size={13} /></Link></article>)}{!rows.length ? <p className="px-4 py-10 text-center text-sm text-black/40">Active brands will appear here.</p> : null}</div></div>
    <aside className="rounded-lg border border-brand/20 bg-brand/[0.045] p-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Star size={17} /></span><div><h2 className="text-sm font-semibold text-black/80">Google Business Profile</h2><p className="mt-1 text-xs leading-5 text-black/50">Connect experience delivery to review requests and reputation follow-up.</p></div></div><dl className="mt-4 grid grid-cols-3 gap-2"><MiniStat label="Profiles" value={String(gbpProfiles.length)} /><MiniStat label="Reviews" value={String(gbpProfiles.reduce((sum, profile) => sum + (profile.reviewCount ?? 0), 0))} /><MiniStat label="Due" value={String(gbpProfiles.reduce((sum, profile) => sum + (profile.unansweredReviews ?? 0), 0))} /></dl><div className="mt-4 flex flex-wrap gap-2"><Link href="/portal/agency/marketing?view=google-business" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white">Open GBP <ArrowUpRight size={13} /></Link><Link href="/portal/agency/marketing?view=reputation" className="inline-flex min-h-9 items-center rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65">All reputation</Link></div></aside>
  </section>;
}

function ClientHealthOverview({ clients }: { clients: ClientOption[] }) {
  return <section className="rounded-lg border border-black/10 bg-white"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 px-4 py-4"><div><h2 className="text-base font-semibold text-black/82">Client health inside experience</h2><p className="mt-1 text-sm text-black/45">Spot relationships that need care before planning a pack, event or review ask.</p></div><Link href="/portal/clients?view=health" className="text-xs font-semibold text-brand hover:underline">Open full health view</Link></div><div className="divide-y divide-black/[0.07]">{clients.map(client => <article key={client.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-black/80">{client.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${client.health === "healthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{client.health === "healthy" ? "Healthy" : "Needs attention"}</span></div><p className="mt-1 text-xs text-black/45">{client.stageLabel} · Source: {client.source}</p></div><p className="text-xs leading-5 text-black/52">{client.healthNotes.length ? client.healthNotes.join(" · ") : "Details are complete and contact is current."}</p><Link href={`/portal/clients/${client.id}`} className="min-h-9 rounded-md border border-black/10 px-3 py-2 text-center text-xs font-semibold text-black/62">Open</Link></article>)}{!clients.length ? <p className="px-4 py-10 text-center text-sm text-black/40">Active clients will appear here.</p> : null}</div></section>;
}

function Modal({ title, eyebrow, onClose, size, children }: { title: string; eyebrow: string; onClose: () => void; size: "large"; children: React.ReactNode }) {
  // Modal keyboard contract: focus enters the dialog, Tab stays inside it, Escape closes it, and focus returns to the control that opened it.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });
  return <div className="fixed inset-0 z-[90] grid items-end bg-black/45 sm:items-center sm:p-5"><button type="button" aria-label="Close dialog" className="absolute inset-0" onClick={onClose} /><div role="dialog" ref={dialogRef} aria-modal="true" aria-label={title} className={`relative mx-auto max-h-[100dvh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[94dvh] sm:rounded-lg sm:p-6 ${size === "large" ? "max-w-4xl" : "max-w-2xl"}`}><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold text-black/88">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><X size={16} /></button></div>{children}</div></div>;
}

function CommandAction({ icon, label, detail, active, onClick }: { icon: React.ReactNode; label: string; detail: string; active: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex min-h-24 items-start gap-3 bg-white p-4 text-left transition ${active ? "shadow-[inset_0_-2px_0_#111]" : "hover:bg-black/[0.015]"}`}><span className={`grid size-9 shrink-0 place-items-center rounded-md ${active ? "bg-black text-white" : "bg-black/[0.045] text-brand"}`}>{icon}</span><span><span className="block text-sm font-semibold text-black/78">{label}</span><span className="mt-1 block text-xs leading-5 text-black/42">{detail}</span></span></button>; }
function Metric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "blue" | "emerald" | "violet" | "amber" }) { return <div className="mm-kpi-card mm-surface-card min-h-24 rounded-lg border border-black/10 p-4" data-kpi-tone={tone}><div className="flex items-start justify-between gap-3"><dt className="text-[10px] font-semibold uppercase text-black/40">{label}</dt><span className="mm-kpi-icon grid size-8 shrink-0 place-items-center rounded-md">{icon}</span></div><dd className="mt-1 text-2xl font-semibold text-black/85">{value}</dd></div>; }
function Tab({ active, onClick, label, count, icon: Icon }: { active: boolean; onClick: () => void; label: string; count?: number; icon: LucideIcon }) { return <button type="button" aria-current={active ? "true" : undefined} onClick={onClick} className={`relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}><Icon size={15} aria-hidden="true" /><span>{label}{count != null ? <span className="ml-1 text-xs tabular-nums text-black/35">{count}</span> : null}</span>{active ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-black" /> : null}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid content-start gap-1 text-xs font-medium text-black/60">{label}{children}</label>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-black/52">{children}</span>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-black/10 bg-white px-2 py-3 text-center"><dt className="text-[10px] font-semibold uppercase text-black/35">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-black/80">{value}</dd></div>; }
function PillStat({ label, value, tone }: { label: string; value: string; tone: "green" | "amber" | "neutral" }) { const className = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-black/[0.04] text-black/55"; return <div className={`rounded-md px-2 py-2 text-center ${className}`}><p className="text-[10px] font-semibold uppercase">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>; }
function EmptyState({ icon, title, detail, action, onAction }: { icon: React.ReactNode; title: string; detail: string; action?: string; onAction?: () => void }) { return <div className="mt-5 border-y border-dashed border-black/15 px-5 py-14 text-center"><span className="mx-auto grid size-11 place-items-center rounded-md bg-black/[0.04] text-black/35">{icon}</span><h3 className="mt-3 text-sm font-semibold text-black/70">{title}</h3><p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-black/42">{detail}</p>{action && onAction ? <button type="button" onClick={onAction} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={14} />{action}</button> : null}</div>; }
function StatusOptions() { return <><option value="idea">Idea</option><option value="planned">Planned</option><option value="ordered">Booked / ordered</option><option value="sent">Ready / sent</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></>; }

function emptyPackage(currency: string): PackageDraft { return { companyIds: [], name: "", category: "Experience", summary: "", audience: "either", deliveryMethod: "flexible", price: "", currency, leadTimeDays: "", supplier: "", bookingUrl: "", includedItems: "", fulfilmentSteps: "", active: true }; }
function emptyPlan(currency: string): PlanDraft { return { packageId: "", clientId: "", recipientUserId: "", companyId: "", audience: "client", recipientName: "", occasion: "welcome", title: "", status: "planned", deliveryMethod: "flexible", currency, dueAt: "", budget: "", cost: "", supplier: "", trackingUrl: "", bookingReference: "", location: "", guestCount: "", includedItems: [], fulfilmentSteps: [], notes: "", outcomeNotes: "" }; }
function toPackageDraft(item: ExperiencePackage): PackageDraft { return { id: item.id, companyIds: item.companyIds, name: item.name, category: item.category, summary: item.summary ?? "", audience: item.audience, deliveryMethod: item.deliveryMethod, price: item.priceCents == null ? "" : (item.priceCents / 100).toFixed(2), currency: item.currency, leadTimeDays: item.leadTimeDays == null ? "" : String(item.leadTimeDays), supplier: item.supplier ?? "", bookingUrl: item.bookingUrl ?? "", includedItems: item.includedItems.join("\n"), fulfilmentSteps: item.fulfilmentSteps.join("\n"), active: item.active }; }
function toPlanDraft(record: ClientDelightRecord): PlanDraft { return { id: record.id, packageId: record.packageId ?? "", clientId: record.clientId ?? "", recipientUserId: record.recipientUserId ?? "", companyId: record.companyId ?? "", audience: record.audience, recipientName: record.recipientName, occasion: record.occasion, title: record.title, status: record.status, deliveryMethod: record.deliveryMethod, currency: record.currency, dueAt: record.dueAt ? dateInput(record.dueAt) : "", budget: record.budgetCents == null ? "" : (record.budgetCents / 100).toFixed(2), cost: record.costCents == null ? "" : (record.costCents / 100).toFixed(2), supplier: record.supplier ?? "", trackingUrl: record.trackingUrl ?? "", bookingReference: record.bookingReference ?? "", location: record.location ?? "", guestCount: record.guestCount == null ? "" : String(record.guestCount), includedItems: record.includedItems, fulfilmentSteps: record.fulfilmentSteps, notes: record.notes ?? "", outcomeNotes: record.outcomeNotes ?? "" }; }
function planFromPackage(item: ExperiencePackage, audience?: ExperienceAudience, recipient?: StaffOption): PlanDraft { return { ...emptyPlan(item.currency), packageId: item.id, audience: audience ?? (item.audience === "staff" ? "staff" : "client"), recipientUserId: recipient?.id ?? "", recipientName: recipient?.name ?? "", companyId: recipient?.companyIds[0] ?? item.companyIds[0] ?? "", title: item.name, occasion: inferOccasion(item.category), deliveryMethod: item.deliveryMethod, dueAt: item.leadTimeDays == null ? "" : dateInput(Date.now() + item.leadTimeDays * 86_400_000), budget: item.priceCents == null ? "" : (item.priceCents / 100).toFixed(2), supplier: item.supplier ?? "", trackingUrl: item.bookingUrl ?? "", includedItems: [...item.includedItems], fulfilmentSteps: item.fulfilmentSteps.map((label, index) => ({ id: `draft_step_${index}`, label, completed: false })) }; }
function inferOccasion(category: string): ClientDelightOccasion { const value = category.toLowerCase(); if (value.includes("welcome")) return "welcome"; if (value.includes("trip") || value.includes("retreat") || value.includes("travel")) return "trip"; if (value.includes("event") || value.includes("dinner")) return "event"; if (value.includes("milestone") || value.includes("recognition") || value.includes("reward")) return "milestone"; return "other"; }
function splitLines(value: string) { return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean); }
function dateInput(value: number) { return dateInputValue(value); }
function occasionLabel(value: ClientDelightOccasion) { return OCCASIONS.find(item => item.value === value)?.label ?? value; }
function statusLabel(value: ClientDelightStatus) { return value === "ordered" ? "Booked / ordered" : value === "sent" ? "Ready / sent" : value.charAt(0).toUpperCase() + value.slice(1); }
function audienceLabel(value: ExperienceAudience) { return value === "client" ? "Client" : value === "staff" ? "Staff" : value === "partner" ? "Partner" : "Personal"; }
function packageAudienceLabel(value: ExperiencePackageAudience) { return value === "client" ? "Clients" : value === "staff" ? "Staff" : "Clients + staff"; }
function deliveryLabel(value: ExperienceDeliveryMethod) { return DELIVERY_METHODS.find(item => item.value === value)?.label ?? value; }
function deliveryIcon(value: ExperienceDeliveryMethod, size = 18) { if (value === "delivery") return <Truck size={size} />; if (value === "travel") return <Plane size={size} />; if (value === "in-person") return <MapPin size={size} />; if (value === "digital") return <ExternalLink size={size} />; return <Gift size={size} />; }
function money(cents: number, currency: string) { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP", maximumFractionDigits: 0 }).format(cents / 100); } catch { return `${currency || "GBP"} ${(cents / 100).toFixed(0)}`; } }
function buildBrandRows(companies: CompanyOption[], clients: ClientOption[], records: ClientDelightRecord[], reputationProfiles: ReputationProfile[]) { return companies.map(company => { const brandClients = clients.filter(client => client.companyId === company.id); const clientIds = new Set(brandClients.map(client => client.id)); const brandRecords = records.filter(record => record.companyId === company.id || (record.clientId && clientIds.has(record.clientId))); const profiles = reputationProfiles.filter(profile => profile.companyIds?.includes(company.id)); return { ...company, clients: brandClients.length, healthy: brandClients.filter(client => client.health === "healthy").length, attention: brandClients.filter(client => client.health === "attention").length, welcomePacks: brandRecords.filter(record => record.occasion === "welcome" && record.status !== "cancelled").length, experiencePlans: brandRecords.filter(record => record.status !== "cancelled").length, reputationProfiles: profiles.length, unansweredReviews: profiles.reduce((sum, profile) => sum + (profile.unansweredReviews ?? 0), 0) }; }); }

const control = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35";
