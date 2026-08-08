"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";

export type MarketingAssetKind = "social" | "website" | "funnel" | "google-ads" | "reputation";
type MarketingAssetStatus = "draft" | "active" | "paused" | "complete" | "archived";

export interface MarketingAsset {
  id: string;
  companyIds?: string[];
  kind: MarketingAssetKind;
  name: string;
  platform?: string;
  url?: string;
  objective?: string;
  owner?: string;
  status: MarketingAssetStatus;
  budgetCents: number;
  spendCents: number;
  leads: number;
  conversions: number;
  rating?: number;
  reviewCount?: number;
  unansweredReviews?: number;
  notes?: string;
}

const CONFIG: Record<MarketingAssetKind, {
  eyebrow: string;
  title: string;
  description: string;
  addLabel: string;
  platformLabel: string;
  platformOptions: string[];
  empty: string;
}> = {
  social: {
    eyebrow: "Owned channels",
    title: "Social media",
    description: "Keep every service-brand profile, its purpose, owner, link and performance in one place.",
    addLabel: "Add social profile",
    platformLabel: "Network",
    platformOptions: ["Instagram", "Facebook", "LinkedIn", "TikTok", "YouTube", "X", "Pinterest", "Other"],
    empty: "Add a service brand's social profiles to start tracking them.",
  },
  website: {
    eyebrow: "Owned channels",
    title: "Website",
    description: "Track every AquaOasis-Web and service-brand website, landing page and organic conversion point.",
    addLabel: "Add website property",
    platformLabel: "Property type",
    platformOptions: ["Main website", "Landing page", "Blog", "Directory profile", "Other"],
    empty: "Add the main website or a landing page to start tracking it.",
  },
  funnel: {
    eyebrow: "Conversion",
    title: "Funnels",
    description: "Manage each route from first click to enquiry, meeting or purchase.",
    addLabel: "Add funnel",
    platformLabel: "Funnel type",
    platformOptions: ["Lead magnet", "Contact", "Book a meeting", "Audit", "Proposal", "Checkout", "Other"],
    empty: "Add a funnel and record what it is meant to convert.",
  },
  "google-ads": {
    eyebrow: "Paid acquisition",
    title: "Google Ads",
    description: "Track Google Ads campaigns, spend, leads and conversions across every service brand without losing the commercial picture.",
    addLabel: "Add Google Ads campaign",
    platformLabel: "Campaign type",
    platformOptions: ["Search", "Performance Max", "Display", "Video", "Demand Gen", "Local", "Other"],
    empty: "Add a Google Ads campaign to track spend and results.",
  },
  reputation: {
    eyebrow: "Trust",
    title: "Reputation management",
    description: "Monitor review profiles, ratings and unanswered feedback across every place customers judge the business.",
    addLabel: "Add review profile",
    platformLabel: "Review platform",
    platformOptions: ["Google Business Profile", "Trustpilot", "Facebook", "Yell", "Tripadvisor", "Industry directory", "Other"],
    empty: "Add a review profile to track rating, review volume and replies.",
  },
};

type AssetDraft = {
  id?: string;
  name: string;
  platform: string;
  url: string;
  objective: string;
  owner: string;
  status: MarketingAssetStatus;
  budget: string;
  spend: string;
  leads: string;
  conversions: string;
  rating: string;
  reviewCount: string;
  unansweredReviews: string;
  notes: string;
};

const EMPTY_DRAFT: AssetDraft = {
  name: "", platform: "", url: "", objective: "", owner: "", status: "draft",
  budget: "", spend: "", leads: "", conversions: "", rating: "", reviewCount: "", unansweredReviews: "", notes: "",
};

export function MarketingChannelsWorkspace({ kind, assets, activeCompanyId }: { kind: MarketingAssetKind; assets: MarketingAsset[]; activeCompanyId: string | null }) {
  const router = useRouter();
  const config = CONFIG[kind];
  const [draft, setDraft] = useState<AssetDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = assets.filter(asset => asset.status === "active").length;
  const spend = assets.reduce((sum, asset) => sum + asset.spendCents, 0);
  const leads = assets.reduce((sum, asset) => sum + asset.leads, 0);
  const conversions = assets.reduce((sum, asset) => sum + asset.conversions, 0);

  function edit(asset: MarketingAsset) {
    setDraft({
      id: asset.id,
      name: asset.name,
      platform: asset.platform ?? "",
      url: asset.url ?? "",
      objective: asset.objective ?? "",
      owner: asset.owner ?? "",
      status: asset.status,
      budget: centsToInput(asset.budgetCents),
      spend: centsToInput(asset.spendCents),
      leads: String(asset.leads),
      conversions: String(asset.conversions),
      rating: asset.rating === undefined ? "" : String(asset.rating),
      reviewCount: String(asset.reviewCount ?? 0),
      unansweredReviews: String(asset.unansweredReviews ?? 0),
      notes: asset.notes ?? "",
    });
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy("save");
    setError(null);
    const payload = {
      name: draft.name,
      platform: draft.platform,
      url: draft.url,
      objective: draft.objective,
      owner: draft.owner,
      status: draft.status,
      budgetCents: moneyToCents(draft.budget),
      spendCents: moneyToCents(draft.spend),
      leads: countValue(draft.leads),
      conversions: countValue(draft.conversions),
      rating: draft.rating ? Math.min(5, Math.max(0, Number(draft.rating))) : undefined,
      reviewCount: countValue(draft.reviewCount),
      unansweredReviews: countValue(draft.unansweredReviews),
      notes: draft.notes,
      companyIds: activeCompanyId ? [activeCompanyId] : undefined,
    };
    try {
      const response = await fetch("/api/portal/agency-marketing/assets", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft.id ? { id: draft.id, patch: payload } : { ...payload, kind }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not save this marketing item.");
      setDraft(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this marketing item.");
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(asset: MarketingAsset, status: MarketingAssetStatus) {
    setBusy(`status:${asset.id}`);
    setError(null);
    try {
      const response = await fetch("/api/portal/agency-marketing/assets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: asset.id, patch: { status } }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not update status.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update status.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(asset: MarketingAsset) {
    if (!window.confirm(`Delete "${asset.name}" from Marketing?`)) return;
    setBusy(`delete:${asset.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/portal/agency-marketing/assets?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not delete this item.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this item.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{config.eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-black/85">{config.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">{config.description}</p>
        </div>
        <button type="button" onClick={() => { setDraft({ ...EMPTY_DRAFT }); setError(null); }} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
          <Plus size={16} /> {config.addLabel}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 border-y border-black/10 sm:grid-cols-4">
        <Metric label="Tracked" value={String(assets.length)} />
        <Metric label="Active" value={String(active)} />
        <Metric label={kind === "reputation" ? "Average rating" : "Spend"} value={kind === "reputation" ? averageRating(assets) : formatMoney(spend)} />
        <Metric label={kind === "reputation" ? "Reviews / unanswered" : "Leads / conversions"} value={kind === "reputation" ? `${assets.reduce((sum, asset) => sum + (asset.reviewCount ?? 0), 0)} / ${assets.reduce((sum, asset) => sum + (asset.unansweredReviews ?? 0), 0)}` : `${leads} / ${conversions}`} />
      </div>

      {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-2 divide-y divide-black/[0.08]">
        {assets.map(asset => (
          <article key={asset.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(160px,.7fr)_minmax(210px,.8fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-black/80">{asset.name}</h3>
                {asset.platform ? <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[10px] font-medium text-black/55">{asset.platform}</span> : null}
              </div>
              <p className="mt-1 truncate text-xs text-black/45">{asset.objective || "No objective added yet."}</p>
              {asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 truncate text-xs font-medium text-brand hover:underline">{displayUrl(asset.url)} <ExternalLink size={11} /></a> : null}
            </div>
            <div className="text-xs leading-5 text-black/50">
              {kind === "reputation" ? <>
                <p>{asset.rating?.toFixed(1) ?? "No rating"} · {asset.reviewCount ?? 0} reviews</p>
                <p className={(asset.unansweredReviews ?? 0) > 0 ? "text-amber-700" : ""}>{asset.unansweredReviews ?? 0} awaiting reply</p>
              </> : <>
                <p>{formatMoney(asset.spendCents)} spent{asset.budgetCents ? ` of ${formatMoney(asset.budgetCents)}` : ""}</p>
                <p>{asset.leads} leads · {asset.conversions} conversions</p>
              </>}
            </div>
            <select value={asset.status} disabled={busy === `status:${asset.id}`} onChange={event => void changeStatus(asset, event.target.value as MarketingAssetStatus)} aria-label={`${asset.name} status`} className="min-h-10 rounded-md border border-black/10 bg-white px-3 text-xs font-medium capitalize text-black/65">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="complete">Complete</option>
              <option value="archived">Archived</option>
            </select>
            <div className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => edit(asset)} aria-label={`Edit ${asset.name}`} title="Edit" className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50 hover:bg-black/[0.03]"><Pencil size={15} /></button>
              <button type="button" onClick={() => void remove(asset)} disabled={busy === `delete:${asset.id}`} aria-label={`Delete ${asset.name}`} title="Delete" className="grid size-9 place-items-center rounded-md border border-red-100 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
            </div>
          </article>
        ))}
        {assets.length === 0 ? <p className="py-14 text-center text-sm text-black/40">{config.empty}</p> : null}
      </div>

      {draft ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4">
          <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="marketing-item-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase text-brand">{config.title}</p><h2 id="marketing-item-title" className="mt-1 text-xl font-semibold">{draft.id ? "Edit item" : config.addLabel}</h2></div>
              <button type="button" onClick={() => setDraft(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mt-5 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" required value={draft.name} onChange={value => setDraft(current => current ? { ...current, name: value } : current)} placeholder={kind === "social" ? "Brand Instagram" : kind === "website" ? "Main website" : kind === "funnel" ? "Website audit funnel" : kind === "reputation" ? "Google Business Profile" : "Local search campaign"} />
                <Select label={config.platformLabel} value={draft.platform} onChange={value => setDraft(current => current ? { ...current, platform: value } : current)} options={config.platformOptions} />
              </div>
              <Field label="Link" type="url" value={draft.url} onChange={value => setDraft(current => current ? { ...current, url: value } : current)} placeholder="https://..." />
              <Field label="Objective" value={draft.objective} onChange={value => setDraft(current => current ? { ...current, objective: value } : current)} placeholder="What should this produce for the business?" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Owner" value={draft.owner} onChange={value => setDraft(current => current ? { ...current, owner: value } : current)} placeholder="Ed" />
                <Select label="Status" value={draft.status} onChange={value => setDraft(current => current ? { ...current, status: value as MarketingAssetStatus } : current)} options={["draft", "active", "paused", "complete", "archived"]} />
              </div>
              {kind === "reputation" ? <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Rating" type="number" value={draft.rating} onChange={value => setDraft(current => current ? { ...current, rating: value } : current)} />
                <Field label="Total reviews" type="number" value={draft.reviewCount} onChange={value => setDraft(current => current ? { ...current, reviewCount: value } : current)} />
                <Field label="Awaiting reply" type="number" value={draft.unansweredReviews} onChange={value => setDraft(current => current ? { ...current, unansweredReviews: value } : current)} />
              </div> : <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Budget (£)" type="number" value={draft.budget} onChange={value => setDraft(current => current ? { ...current, budget: value } : current)} />
                <Field label="Spend (£)" type="number" value={draft.spend} onChange={value => setDraft(current => current ? { ...current, spend: value } : current)} />
                <Field label="Leads" type="number" value={draft.leads} onChange={value => setDraft(current => current ? { ...current, leads: value } : current)} />
                <Field label="Conversions" type="number" value={draft.conversions} onChange={value => setDraft(current => current ? { ...current, conversions: value } : current)} />
              </div>}
              <label className="text-xs font-medium text-black/60">Notes<textarea rows={4} value={draft.notes} onChange={event => setDraft(current => current ? { ...current, notes: event.target.value } : current)} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm text-black/80" /></label>
            </div>
            {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="min-h-10 px-3 text-sm text-black/60">Cancel</button>
              <button disabled={busy === "save"} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === "save" ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-black/10 px-3 py-4 last:border-r-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-black/75">{value}</p></div>;
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="text-xs font-medium text-black/60">{label}<input required={required} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 text-sm text-black/80" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="text-xs font-medium text-black/60">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm capitalize text-black/75"><option value="">Not set</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function moneyToCents(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}
function countValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}
function centsToInput(value: number): string {
  return value ? (value / 100).toFixed(2).replace(/\.00$/, "") : "";
}
function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value / 100);
}
function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function averageRating(assets: MarketingAsset[]): string {
  const rated = assets.filter(asset => typeof asset.rating === "number");
  if (!rated.length) return "Not set";
  return `${(rated.reduce((sum, asset) => sum + (asset.rating ?? 0), 0) / rated.length).toFixed(1)} / 5`;
}
