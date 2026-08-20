"use client";

import { useMemo, useState } from "react";
import { scopeProfiles, summariseProfileDimension, type ProfileDimension } from "@/lib/people/customerProfileScope";
import { useRouter } from "next/navigation";
import { BadgeCheck, BriefcaseBusiness, Building2, Pencil, Plus, Search, Trash2, UserRoundSearch, X } from "lucide-react";

import type {
  MarketingAudienceType,
  MarketingCustomerProfile,
  MarketingCustomerProfilePriority,
  MarketingCustomerProfileStatus,
  MarketingEvidenceConfidence,
} from "@/built-ins/modules/agency-marketing/src/lib/domain";

interface CompanyOption {
  id: string;
  name: string;
  colour: string;
}

type Draft = {
  id?: string;
  companyIds: string[];
  name: string;
  segment: string;
  summary: string;
  audienceType: MarketingAudienceType;
  status: MarketingCustomerProfileStatus;
  priority: MarketingCustomerProfilePriority;
  evidenceConfidence: MarketingEvidenceConfidence;
  owner: string;
  ageRange: string;
  locations: string;
  languages: string;
  genderNotes: string;
  incomeRange: string;
  lifeStage: string;
  industries: string;
  companySize: string;
  businessStage: string;
  jobTitles: string;
  decisionRoles: string;
  goals: string;
  painPoints: string;
  motivations: string;
  objections: string;
  buyingTriggers: string;
  preferredChannels: string;
  contentPreferences: string;
  offerFit: string;
  typicalBudget: string;
  buyingCycle: string;
  estimatedAudienceSize: string;
  researchNotes: string;
};

const EMPTY_DRAFT: Draft = {
  companyIds: [],
  name: "",
  segment: "",
  summary: "",
  audienceType: "consumer",
  status: "draft",
  priority: "primary",
  evidenceConfidence: "assumption",
  owner: "",
  ageRange: "",
  locations: "",
  languages: "",
  genderNotes: "",
  incomeRange: "",
  lifeStage: "",
  industries: "",
  companySize: "",
  businessStage: "",
  jobTitles: "",
  decisionRoles: "",
  goals: "",
  painPoints: "",
  motivations: "",
  objections: "",
  buyingTriggers: "",
  preferredChannels: "",
  contentPreferences: "",
  offerFit: "",
  typicalBudget: "",
  buyingCycle: "",
  estimatedAudienceSize: "",
  researchNotes: "",
};

const FIELD = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10";
const AREA = `${FIELD} min-h-24 py-2 leading-5`;

export function CustomerProfilesWorkspace({
  profiles,
  companies,
  defaultCompanyIds = [],
}: {
  profiles: MarketingCustomerProfile[];
  companies: CompanyOption[];
  defaultCompanyIds?: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | MarketingCustomerProfileStatus>("all");
  const [scopeCompanyId, setScopeCompanyId] = useState("all");
  const [dimension, setDimension] = useState<ProfileDimension>("segment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const companyNames = useMemo(() => new Map(companies.map(company => [company.id, company.name])), [companies]);
  const scoped = useMemo(() => scopeProfiles(profiles, scopeCompanyId), [profiles, scopeCompanyId]);
  const breakdown = useMemo(() => summariseProfileDimension(scoped, dimension, companyNames), [scoped, dimension, companyNames]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped.filter(profile => {
      if (status !== "all" && profile.status !== status) return false;
      if (!needle) return true;
      return [
        profile.name,
        profile.segment,
        profile.summary,
        profile.owner,
        ...profile.locations,
        ...profile.industries,
        ...profile.goals,
        ...profile.painPoints,
        ...profile.jobTitles,
      ].some(value => value?.toLowerCase().includes(needle));
    });
  }, [scoped, query, status]);

  function beginCreate() {
    setDraft({ ...EMPTY_DRAFT, companyIds: [...defaultCompanyIds] });
    setError(null);
  }

  function beginEdit(profile: MarketingCustomerProfile) {
    setDraft({
      id: profile.id,
      companyIds: [...profile.companyIds],
      name: profile.name,
      segment: profile.segment ?? "",
      summary: profile.summary ?? "",
      audienceType: profile.audienceType,
      status: profile.status,
      priority: profile.priority,
      evidenceConfidence: profile.evidenceConfidence,
      owner: profile.owner ?? "",
      ageRange: profile.ageRange ?? "",
      locations: join(profile.locations),
      languages: join(profile.languages),
      genderNotes: profile.genderNotes ?? "",
      incomeRange: profile.incomeRange ?? "",
      lifeStage: profile.lifeStage ?? "",
      industries: join(profile.industries),
      companySize: profile.companySize ?? "",
      businessStage: profile.businessStage ?? "",
      jobTitles: join(profile.jobTitles),
      decisionRoles: join(profile.decisionRoles),
      goals: join(profile.goals),
      painPoints: join(profile.painPoints),
      motivations: join(profile.motivations),
      objections: join(profile.objections),
      buyingTriggers: join(profile.buyingTriggers),
      preferredChannels: join(profile.preferredChannels),
      contentPreferences: join(profile.contentPreferences),
      offerFit: profile.offerFit ?? "",
      typicalBudget: profile.typicalBudget ?? "",
      buyingCycle: profile.buyingCycle ?? "",
      estimatedAudienceSize: profile.estimatedAudienceSize === undefined ? "" : String(profile.estimatedAudienceSize),
      researchNotes: profile.researchNotes ?? "",
    });
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    const payload = {
      ...draft,
      locations: split(draft.locations),
      languages: split(draft.languages),
      industries: split(draft.industries),
      jobTitles: split(draft.jobTitles),
      decisionRoles: split(draft.decisionRoles),
      goals: split(draft.goals),
      painPoints: split(draft.painPoints),
      motivations: split(draft.motivations),
      objections: split(draft.objections),
      buyingTriggers: split(draft.buyingTriggers),
      preferredChannels: split(draft.preferredChannels),
      contentPreferences: split(draft.contentPreferences),
      estimatedAudienceSize: draft.estimatedAudienceSize ? Number(draft.estimatedAudienceSize) : undefined,
    };
    delete payload.id;
    try {
      const response = await fetch("/api/portal/agency-marketing/customer-profiles", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft.id ? { id: draft.id, patch: payload } : payload),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Customer profile could not be saved.");
      setDraft(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Customer profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(profile: MarketingCustomerProfile) {
    if (!window.confirm(`Delete "${profile.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/portal/agency-marketing/customer-profiles?id=${encodeURIComponent(profile.id)}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Customer profile could not be deleted.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Customer profile could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  const active = scoped.filter(profile => profile.status === "active").length;
  const validated = scoped.filter(profile => profile.evidenceConfidence === "validated").length;
  const primary = scoped.filter(profile => profile.priority === "primary" && profile.status !== "archived").length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Audience intelligence</p>
          <h2 className="mt-1 text-xl font-semibold text-black/85">Customer profiles</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-black/50">Define the people and organisations each company is trying to reach, then use the same profile across campaigns, channels and offers.</p>
        </div>
        <button type="button" onClick={beginCreate} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
          <Plus size={16} /> Add customer profile
        </button>
      </div>

      <dl className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-4">
        <Metric label="Profiles" value={String(scoped.length)} />
        <Metric label="Active" value={String(active)} />
        <Metric label="Primary audiences" value={String(primary)} />
        <Metric label="Validated" value={String(validated)} />
      </dl>

      <div className="rounded-md border border-black/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-black/45">Breakdown</p><p className="mt-0.5 text-sm font-semibold text-black/70">{scoped.length} profile{scoped.length === 1 ? "" : "s"} in scope, by dimension</p></div>
          <label><span className="sr-only">Breakdown dimension</span><select value={dimension} onChange={event => setDimension(event.target.value as ProfileDimension)} className={`${FIELD} min-w-40`}>{(["segment", "priority", "status", "confidence", "location", "company"] as const).map(dim => <option key={dim} value={dim}>{dim[0]!.toUpperCase() + dim.slice(1)}</option>)}</select></label>
        </div>
        {breakdown.length ? <ul className="mt-3 space-y-2">{breakdown.slice(0, 8).map(row => <li key={row.value} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="min-w-0"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium text-black/60">{row.value}</span><span className="text-xs tabular-nums text-black/45">{row.count}</span></div><div className="mt-1 h-1.5 rounded-full bg-black/5"><span className="block h-full rounded-full bg-black/60" style={{ width: `${Math.max(6, row.count / breakdown[0]!.count * 100)}%` }} /></div></div></li>)}</ul> : <p className="mt-3 text-xs text-black/40">No profiles in this scope yet.</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <label><span className="sr-only">Company scope</span><select value={scopeCompanyId} onChange={event => setScopeCompanyId(event.target.value)} className={`${FIELD} min-w-44`}><option value="all">All companies (ecosystem)</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <input value={query} onChange={event => setQuery(event.target.value)} className={`${FIELD} pl-9`} placeholder="Search customer profiles" aria-label="Search customer profiles" />
        </label>
        <label>
          <span className="sr-only">Profile status</span>
          <select value={status} onChange={event => setStatus(event.target.value as typeof status)} className={`${FIELD} min-w-40`}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>

      {error && !draft ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(profile => (
          <article key={profile.id} className="rounded-md border border-black/10 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-black/82">{profile.name}</h3>
                  <StatusBadge status={profile.status} />
                  {profile.evidenceConfidence === "validated" ? <span title="Validated profile" className="text-emerald-700"><BadgeCheck size={15} /></span> : null}
                </div>
                <p className="mt-1 text-xs text-black/45">{profile.segment || audienceLabel(profile.audienceType)} · {priorityLabel(profile.priority)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => beginEdit(profile)} title="Edit customer profile" aria-label={`Edit ${profile.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03] hover:text-black"><Pencil size={15} /></button>
                <button type="button" disabled={busy} onClick={() => remove(profile)} title="Delete customer profile" aria-label={`Delete ${profile.name}`} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/40 hover:border-red-200 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
              </div>
            </div>

            {profile.summary ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-black/55">{profile.summary}</p> : null}

            <div className="mt-4 grid gap-3 border-t border-black/[0.07] pt-3 sm:grid-cols-2">
              <ProfileFact icon={<UserRoundSearch size={14} />} label="Demographic" value={[profile.ageRange, profile.lifeStage, profile.locations.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || "Not defined"} />
              <ProfileFact icon={<BriefcaseBusiness size={14} />} label="Commercial" value={[profile.companySize, profile.typicalBudget, profile.buyingCycle].filter(Boolean).join(" · ") || "Not defined"} />
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {[...profile.goals.slice(0, 2), ...profile.painPoints.slice(0, 2)].map(item => <span key={item} className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] font-medium text-black/52">{item}</span>)}
              {!profile.goals.length && !profile.painPoints.length ? <span className="text-xs text-black/35">Goals and pain points not added yet.</span> : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.07] pt-3 text-xs text-black/45">
              <BrandNames companyIds={profile.companyIds} companies={companies} />
              <span>{confidenceLabel(profile.evidenceConfidence)}</span>
            </div>
          </article>
        ))}
      </div>

      {!visible.length ? <div className="border-y border-black/10 py-14 text-center"><UserRoundSearch size={24} className="mx-auto text-black/20" /><p className="mt-3 text-sm font-semibold text-black/60">No customer profiles to show</p><p className="mt-1 text-xs text-black/40">Add a primary audience for this company or change the current filters.</p></div> : null}

      {draft ? <ProfileDialog draft={draft} setDraft={setDraft} companies={companies} busy={busy} error={error} onSubmit={save} onClose={() => { setDraft(null); setError(null); }} /> : null}
    </section>
  );
}

function ProfileDialog({
  draft,
  setDraft,
  companies,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  companies: CompanyOption[];
  busy: boolean;
  error: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => current ? { ...current, [key]: value } : current);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="customer-profile-dialog-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-md bg-white shadow-2xl sm:rounded-md">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-brand">Audience intelligence</p><h2 id="customer-profile-dialog-title" className="mt-1 text-lg font-semibold text-black/85">{draft.id ? "Edit customer profile" : "Add customer profile"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><X size={17} /></button>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-8 px-5 py-5">
            <FormSection title="Profile identity" icon={<UserRoundSearch size={16} />}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Profile name" span="lg:col-span-2"><input required value={draft.name} onChange={event => patch("name", event.target.value)} className={FIELD} placeholder="Growth-minded local founder" /></Field>
                <Field label="Segment"><input value={draft.segment} onChange={event => patch("segment", event.target.value)} className={FIELD} placeholder="Primary website buyer" /></Field>
                <Field label="Owner"><input value={draft.owner} onChange={event => patch("owner", event.target.value)} className={FIELD} /></Field>
                <Field label="Audience type"><select value={draft.audienceType} onChange={event => patch("audienceType", event.target.value as MarketingAudienceType)} className={FIELD}><option value="consumer">Consumer</option><option value="business">Business</option><option value="mixed">Mixed</option></select></Field>
                <Field label="Priority"><select value={draft.priority} onChange={event => patch("priority", event.target.value as MarketingCustomerProfilePriority)} className={FIELD}><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="experimental">Experimental</option></select></Field>
                <Field label="Status"><select value={draft.status} onChange={event => patch("status", event.target.value as MarketingCustomerProfileStatus)} className={FIELD}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></Field>
                <Field label="Evidence"><select value={draft.evidenceConfidence} onChange={event => patch("evidenceConfidence", event.target.value as MarketingEvidenceConfidence)} className={FIELD}><option value="assumption">Assumption</option><option value="informed">Research informed</option><option value="validated">Validated</option></select></Field>
                <Field label="Profile summary" span="md:col-span-2 lg:col-span-4"><textarea value={draft.summary} onChange={event => patch("summary", event.target.value)} className={AREA} placeholder="Who they are, what situation they are in, and why this audience matters." /></Field>
              </div>
              <fieldset className="mt-4"><legend className="text-xs font-semibold text-black/55">Company scope</legend><div className="mt-2 flex flex-wrap gap-2">{companies.map(company => { const checked = draft.companyIds.includes(company.id); return <label key={company.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-semibold ${checked ? "border-black bg-black text-white" : "border-black/10 text-black/55"}`}><input type="checkbox" checked={checked} onChange={() => patch("companyIds", checked ? draft.companyIds.filter(id => id !== company.id) : [...draft.companyIds, company.id])} className="sr-only" /><span className="size-2 rounded-full" style={{ backgroundColor: company.colour }} />{company.name}</label>; })}</div><p className="mt-2 text-xs text-black/35">Leave every company clear for a group-wide audience.</p></fieldset>
            </FormSection>

            <FormSection title="Demographics" icon={<Building2 size={16} />}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Age range"><input value={draft.ageRange} onChange={event => patch("ageRange", event.target.value)} className={FIELD} placeholder="30-50" /></Field>
                <Field label="Locations"><input value={draft.locations} onChange={event => patch("locations", event.target.value)} className={FIELD} placeholder="London, Kent, UK" /></Field>
                <Field label="Languages"><input value={draft.languages} onChange={event => patch("languages", event.target.value)} className={FIELD} placeholder="English" /></Field>
                <Field label="Income range"><input value={draft.incomeRange} onChange={event => patch("incomeRange", event.target.value)} className={FIELD} placeholder="£45k-£90k household" /></Field>
                <Field label="Life stage"><input value={draft.lifeStage} onChange={event => patch("lifeStage", event.target.value)} className={FIELD} placeholder="Established owner, growing team" /></Field>
                <Field label="Gender notes"><input value={draft.genderNotes} onChange={event => patch("genderNotes", event.target.value)} className={FIELD} placeholder="Only when relevant" /></Field>
              </div>
            </FormSection>

            <FormSection title="Business and decision profile" icon={<BriefcaseBusiness size={16} />}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Industries"><input value={draft.industries} onChange={event => patch("industries", event.target.value)} className={FIELD} placeholder="Hospitality, trades, professional services" /></Field>
                <Field label="Company size"><input value={draft.companySize} onChange={event => patch("companySize", event.target.value)} className={FIELD} placeholder="1-20 employees" /></Field>
                <Field label="Business stage"><input value={draft.businessStage} onChange={event => patch("businessStage", event.target.value)} className={FIELD} placeholder="Growing, repositioning" /></Field>
                <Field label="Job titles"><input value={draft.jobTitles} onChange={event => patch("jobTitles", event.target.value)} className={FIELD} placeholder="Founder, Managing Director" /></Field>
                <Field label="Decision roles"><input value={draft.decisionRoles} onChange={event => patch("decisionRoles", event.target.value)} className={FIELD} placeholder="Buyer, approver, influencer" /></Field>
                <Field label="Estimated audience size"><input type="number" min="0" value={draft.estimatedAudienceSize} onChange={event => patch("estimatedAudienceSize", event.target.value)} className={FIELD} /></Field>
              </div>
            </FormSection>

            <FormSection title="Needs and buying behaviour" icon={<BadgeCheck size={16} />}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ListField label="Goals" value={draft.goals} onChange={value => patch("goals", value)} />
                <ListField label="Pain points" value={draft.painPoints} onChange={value => patch("painPoints", value)} />
                <ListField label="Motivations" value={draft.motivations} onChange={value => patch("motivations", value)} />
                <ListField label="Objections" value={draft.objections} onChange={value => patch("objections", value)} />
                <ListField label="Buying triggers" value={draft.buyingTriggers} onChange={value => patch("buyingTriggers", value)} />
                <ListField label="Preferred channels" value={draft.preferredChannels} onChange={value => patch("preferredChannels", value)} />
                <ListField label="Content preferences" value={draft.contentPreferences} onChange={value => patch("contentPreferences", value)} />
                <Field label="Typical budget"><input value={draft.typicalBudget} onChange={event => patch("typicalBudget", event.target.value)} className={FIELD} placeholder="£2,000-£8,000" /></Field>
                <Field label="Buying cycle"><input value={draft.buyingCycle} onChange={event => patch("buyingCycle", event.target.value)} className={FIELD} placeholder="2-6 weeks, founder led" /></Field>
                <Field label="Offer and message fit" span="md:col-span-2 lg:col-span-3"><textarea value={draft.offerFit} onChange={event => patch("offerFit", event.target.value)} className={AREA} placeholder="Best-fit services, promise, proof and positioning for this audience." /></Field>
                <Field label="Research notes" span="md:col-span-2 lg:col-span-3"><textarea value={draft.researchNotes} onChange={event => patch("researchNotes", event.target.value)} className={AREA} placeholder="Interview evidence, analytics, sales patterns, source links and assumptions to test." /></Field>
              </div>
            </FormSection>
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 bg-white px-5 py-4">
            {error ? <p className="text-sm text-red-700">{error}</p> : <span />}
            <div className="flex gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-black/10 px-4 text-sm font-semibold text-black/60">Cancel</button><button disabled={busy} type="submit" className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save profile"}</button></div>
          </div>
        </form>
      </section>
    </div>
  );
}

function FormSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section><div className="mb-4 flex items-center gap-2 border-b border-black/10 pb-2 text-sm font-semibold text-black/72"><span className="text-brand">{icon}</span><h3>{title}</h3></div>{children}</section>;
}

function Field({ label, children, span = "" }: { label: string; children: React.ReactNode; span?: string }) {
  return <label className={span}><span className="mb-1.5 block text-xs font-semibold text-black/52">{label}</span>{children}</label>;
}

function ListField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><textarea value={value} onChange={event => onChange(event.target.value)} className={AREA} placeholder="Separate items with commas or new lines" /></Field>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-black/10 px-4 py-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"><dt className="text-xs font-medium text-black/42">{label}</dt><dd className="mt-1 text-xl font-semibold text-black/82">{value}</dd></div>;
}

function ProfileFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-2"><span className="mt-0.5 text-brand">{icon}</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-0.5 line-clamp-2 text-xs leading-5 text-black/55">{value}</p></div></div>;
}

function BrandNames({ companyIds, companies }: { companyIds: string[]; companies: CompanyOption[] }) {
  if (!companyIds.length) return <span>Group / shared</span>;
  return <span className="inline-flex min-w-0 items-center gap-1.5"><Building2 size={12} /><span className="truncate">{companyIds.map(id => companies.find(company => company.id === id)?.name).filter(Boolean).join(", ") || "Selected companies"}</span></span>;
}

function StatusBadge({ status }: { status: MarketingCustomerProfileStatus }) {
  const styles = status === "active" ? "bg-emerald-50 text-emerald-700" : status === "archived" ? "bg-black/[0.045] text-black/45" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${styles}`}>{status}</span>;
}

function join(values: string[]): string { return values.join(", "); }
function split(value: string): string[] { return Array.from(new Set(value.split(/[,\n]/).map(item => item.trim()).filter(Boolean))); }
function audienceLabel(value: MarketingAudienceType): string { return value === "business" ? "Business audience" : value === "mixed" ? "Mixed audience" : "Consumer audience"; }
function priorityLabel(value: MarketingCustomerProfilePriority): string { return value === "primary" ? "Primary audience" : value === "secondary" ? "Secondary audience" : "Experimental audience"; }
function confidenceLabel(value: MarketingEvidenceConfidence): string { return value === "validated" ? "Validated evidence" : value === "informed" ? "Research informed" : "Working assumption"; }
