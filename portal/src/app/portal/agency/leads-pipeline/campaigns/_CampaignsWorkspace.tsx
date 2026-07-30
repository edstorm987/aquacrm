"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkflowSteps } from "@/app/portal/agency/leads-pipeline/_WorkflowSteps";

interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  channel?: CampaignChannel;
  sourceKey?: string;
  status: "draft" | "scheduled" | "active" | "paused" | "sending" | "sent" | "completed";
  budgetCents?: number;
  spendCents?: number;
  attributedRevenueCents?: number;
  startsAt?: number;
  endsAt?: number;
  externalUrl?: string;
  notes?: string;
  attributedLeads?: number;
  attributedClients?: number;
  recipients: number;
  sentCount: number;
  sentAt?: number;
  createdAt: number;
  audienceFilter: {
    tags?: string[];
    sourcedFrom?: string[];
    notContactedSinceMs?: number;
    pipelineColumn?: string;
  };
}

interface CampaignsWorkspaceProps {
  campaigns: CampaignRow[];
  availableTags: string[];
  availableSources: string[];
  pipelineColumns: string[];
  emailSenderReady: boolean;
  embedded?: boolean;
}

const EMPTY_FORM = {
  name: "",
  channel: "email" as CampaignChannel,
  sourceKey: "",
  subject: "",
  bodyText: "",
  budget: "",
  spend: "",
  revenue: "",
  startsAt: "",
  endsAt: "",
  externalUrl: "",
  notes: "",
  tags: "",
  sourcedFrom: "",
  pipelineColumn: "",
};

type CampaignChannel = "email" | "google-ads" | "meta-ads" | "linkedin-ads" | "organic" | "event" | "referral" | "other";
const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  email: "Email", "google-ads": "Google Ads", "meta-ads": "Meta Ads",
  "linkedin-ads": "LinkedIn Ads", organic: "Organic", event: "Event",
  referral: "Referral", other: "Other",
};

export function CampaignsWorkspace({ campaigns, availableTags, availableSources, pipelineColumns, emailSenderReady, embedded = false }: CampaignsWorkspaceProps) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftCount = campaigns.filter(c => c.status === "draft").length;
  const sentCount = campaigns.filter(c => c.status === "sent").length;
  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spendCents ?? 0), 0);

  const audienceFilter = useMemo(() => ({
    tags: splitList(form.tags),
    sourcedFrom: splitList(form.sourcedFrom),
    pipelineColumn: form.pipelineColumn || undefined,
  }), [form.tags, form.sourcedFrom, form.pipelineColumn]);

  async function previewAudience() {
    setBusy("preview");
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/campaigns/preview-audience", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(audienceFilter),
      });
      const data = await res.json() as { ok: boolean; error?: string; count?: number };
      if (!data.ok) throw new Error(data.error ?? "Could not preview audience.");
      setAudienceCount(data.count ?? 0);
      setNotice(`${data.count ?? 0} lead${data.count === 1 ? "" : "s"} match this audience.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function createCampaign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("create");
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          channel: form.channel,
          sourceKey: form.sourceKey,
          subject: form.subject,
          bodyHtml: textToHtml(form.bodyText),
          bodyText: form.bodyText,
          budgetCents: poundsToCents(form.budget),
          spendCents: poundsToCents(form.spend),
          attributedRevenueCents: poundsToCents(form.revenue),
          startsAt: dateToMs(form.startsAt),
          endsAt: dateToMs(form.endsAt),
          externalUrl: form.externalUrl,
          notes: form.notes,
          audienceFilter,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; campaign?: CampaignRow };
      if (!data.ok) throw new Error(data.error ?? "Could not create campaign.");
      setNotice(`Campaign "${data.campaign?.name ?? form.name}" saved as a draft.`);
      setForm(EMPTY_FORM);
      setAudienceCount(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function sendCampaign(id: string) {
    setBusy(`send:${id}`);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/portal/leads-pipeline/campaigns/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json() as { ok: boolean; error?: string; campaign?: CampaignRow };
      if (!data.ok) throw new Error(data.error ?? "Could not send campaign.");
      setNotice(`Sent ${data.campaign?.sentCount ?? 0}/${data.campaign?.recipients ?? 0} emails.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function updateCampaign(id: string, draft: CampaignDraft) {
    setBusy(`update:${id}`);
    setNotice(null);
    setError(null);
    try {
      const audienceFilter = {
        tags: splitList(draft.tags),
        sourcedFrom: splitList(draft.sourcedFrom),
        pipelineColumn: draft.pipelineColumn || undefined,
      };
      const res = await fetch(`/api/portal/leads-pipeline/campaigns?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          channel: draft.channel,
          sourceKey: draft.sourceKey,
          subject: draft.subject,
          bodyHtml: textToHtml(draft.bodyText),
          bodyText: draft.bodyText,
          budgetCents: poundsToCents(draft.budget),
          spendCents: poundsToCents(draft.spend),
          attributedRevenueCents: poundsToCents(draft.revenue),
          startsAt: dateToMs(draft.startsAt),
          endsAt: dateToMs(draft.endsAt),
          externalUrl: draft.externalUrl,
          notes: draft.notes,
          status: draft.status,
          audienceFilter,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; campaign?: CampaignRow };
      if (!data.ok) throw new Error(data.error ?? "Could not update campaign.");
      setNotice(`Campaign "${data.campaign?.name ?? draft.name}" updated.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="leads-pipeline-campaigns" className="flex flex-col gap-6">
      {!embedded ? <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Outreach</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Campaigns</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            Write a simple email blast, choose the leads it should go to, preview the audience, then send when the list is right.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/agency/pipelines/leads" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Leads board
          </Link>
          <Link href="/portal/agency/leads-pipeline/contacts" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Contacts
          </Link>
        </div>
      </header> : null}

      {!embedded ? <WorkflowSteps active="outreach" /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Campaigns" value={String(campaigns.length)} />
        <Stat label="Drafts" value={String(draftCount)} />
        <Stat label="Sent campaigns" value={String(sentCount)} />
        <Stat label="Emails queued" value={String(totalSent)} />
        <Stat label="Spend tracked" value={formatMoney(totalSpend)} />
      </section>

      {(notice || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {error ?? notice}
        </div>
      )}

      {!emailSenderReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Email outbox setup needs attention before campaigns can send. Drafts and audience previews still work.
        </div>
      )}

      <form onSubmit={createCampaign} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3">
            <Field label="Campaign name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="July website audit follow-up" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Channel" value={form.channel} onChange={v => setForm(f => ({ ...f, channel: v as CampaignChannel }))} options={Object.entries(CHANNEL_LABELS)} />
              <Field label="Source key" value={form.sourceKey} onChange={v => setForm(f => ({ ...f, sourceKey: v }))} placeholder="google-search-july" />
            </div>
            {form.channel === "email" ? <>
            <Field label="Subject" value={form.subject} onChange={v => setForm(f => ({ ...f, subject: v }))} placeholder="Quick idea for your website" required />
            <label className="text-xs font-medium text-black/60">
              Email body
              <textarea
                value={form.bodyText}
                onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))}
                required
                rows={7}
                className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80"
                placeholder={"Hi {{name}},\n\nI had a quick look at {{company}} and spotted a few easy wins...\n\nEd"}
              />
            </label>
            </> : <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Campaign link" value={form.externalUrl} onChange={v => setForm(f => ({ ...f, externalUrl: v }))} placeholder="https://..." />
              <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Audience, creative, objective..." />
            </div>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Budget (£)" value={form.budget} onChange={v => setForm(f => ({ ...f, budget: v }))} placeholder="500" />
              <Field label="Spend to date (£)" value={form.spend} onChange={v => setForm(f => ({ ...f, spend: v }))} placeholder="0" />
              <Field label="Revenue attributed (£)" value={form.revenue} onChange={v => setForm(f => ({ ...f, revenue: v }))} placeholder="0" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date" type="date" value={form.startsAt} onChange={v => setForm(f => ({ ...f, startsAt: v }))} />
              <Field label="End date" type="date" value={form.endsAt} onChange={v => setForm(f => ({ ...f, endsAt: v }))} />
            </div>
          </div>

          <aside className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
            <h2 className="text-sm font-semibold text-black/85">Audience</h2>
            <Field label="Tags" value={form.tags} onChange={v => setForm(f => ({ ...f, tags: v }))} placeholder={availableTags.slice(0, 3).join(", ") || "warm, local-business"} />
            <Field label="Sources" value={form.sourcedFrom} onChange={v => setForm(f => ({ ...f, sourcedFrom: v }))} placeholder={availableSources.slice(0, 2).join(", ") || "sheet-upload"} />
            <label className="mt-3 block text-xs font-medium text-black/60">
              Pipeline stage
              <select
                value={form.pipelineColumn}
                onChange={e => setForm(f => ({ ...f, pipelineColumn: e.target.value }))}
                className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="">Any stage</option>
                {pipelineColumns.map(col => <option key={col} value={col}>{col}</option>)}
              </select>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={previewAudience} disabled={busy === "preview"} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03] disabled:opacity-50">
                {busy === "preview" ? "Checking..." : "Preview audience"}
              </button>
              <button type="submit" disabled={busy === "create"} className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-50">
                {busy === "create" ? "Saving..." : "Save draft"}
              </button>
            </div>
            {audienceCount !== null && (
              <p className="mt-3 rounded-md bg-white px-3 py-2 text-xs text-black/65">
                Audience preview: <strong>{audienceCount}</strong> matching lead{audienceCount === 1 ? "" : "s"}.
              </p>
            )}
          </aside>
        </div>
      </form>

      <section className="rounded-xl border border-black/10 bg-white/70 p-4 shadow-sm">
        <h2 className="text-base font-semibold text-black/85">Campaign history</h2>
        <div className="mt-3 grid gap-3">
          {campaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm text-black/45">
              No campaigns yet.
            </div>
          ) : campaigns.map(campaign => (
            <article key={campaign.id} className="rounded-lg border border-black/10 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-black/90">{campaign.name}</h3>
                  <p className="mt-1 truncate text-xs text-black/50">{CHANNEL_LABELS[campaign.channel ?? "email"]}{campaign.sourceKey ? ` · ${campaign.sourceKey}` : ""}{campaign.subject ? ` · ${campaign.subject}` : ""}</p>
                </div>
                <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium capitalize text-black/55">{campaign.status}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-black/55">
                <span>{campaign.recipients} recipients</span>
                <span>{campaign.sentCount} sent</span>
                <span>{formatMoney(campaign.spendCents ?? 0)} spent</span>
                {campaign.budgetCents ? <span>of {formatMoney(campaign.budgetCents)} budget</span> : null}
                <span>{campaign.attributedLeads ?? 0} leads</span>
                <span>{campaign.attributedClients ?? 0} clients</span>
                {campaign.attributedRevenueCents ? <span>{formatMoney(campaign.attributedRevenueCents)} revenue</span> : null}
                {campaign.sentAt && <span>Sent {new Date(campaign.sentAt).toLocaleDateString()}</span>}
              </div>
              {campaign.status !== "sent" && campaign.status !== "sending" && (
                <CampaignEditor
                  campaign={campaign}
                  pipelineColumns={pipelineColumns}
                  busy={busy === `update:${campaign.id}`}
                  onSave={draft => updateCampaign(campaign.id, draft)}
                />
              )}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-black/10 pt-3">
                {(campaign.channel ?? "email") === "email" && campaign.status !== "sent" && campaign.status !== "sending" && (
                  <button
                    type="button"
                    onClick={() => sendCampaign(campaign.id)}
                    disabled={busy === `send:${campaign.id}`}
                    className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === `send:${campaign.id}` ? "Sending..." : "Send campaign"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

interface CampaignDraft {
  name: string;
  channel: CampaignChannel;
  sourceKey: string;
  subject: string;
  bodyText: string;
  budget: string;
  spend: string;
  revenue: string;
  startsAt: string;
  endsAt: string;
  externalUrl: string;
  notes: string;
  status: CampaignRow["status"];
  tags: string;
  sourcedFrom: string;
  pipelineColumn: string;
}

function CampaignEditor({
  campaign,
  pipelineColumns,
  busy,
  onSave,
}: {
  campaign: CampaignRow;
  pipelineColumns: string[];
  busy: boolean;
  onSave: (draft: CampaignDraft) => void;
}) {
  const [draft, setDraft] = useState<CampaignDraft>({
    name: campaign.name,
    channel: campaign.channel ?? "email",
    sourceKey: campaign.sourceKey ?? "",
    subject: campaign.subject,
    bodyText: campaign.bodyText ?? htmlToText(campaign.bodyHtml),
    tags: (campaign.audienceFilter.tags ?? []).join(", "),
    sourcedFrom: (campaign.audienceFilter.sourcedFrom ?? []).join(", "),
    pipelineColumn: campaign.audienceFilter.pipelineColumn ?? "",
    budget: centsToInput(campaign.budgetCents),
    spend: centsToInput(campaign.spendCents),
    revenue: centsToInput(campaign.attributedRevenueCents),
    startsAt: msToDate(campaign.startsAt),
    endsAt: msToDate(campaign.endsAt),
    externalUrl: campaign.externalUrl ?? "",
    notes: campaign.notes ?? "",
    status: campaign.status,
  });

  return (
    <details className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-3">
      <summary className="cursor-pointer text-xs font-medium text-black/65">Edit draft</summary>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Campaign name" value={draft.name} onChange={value => setDraft(d => ({ ...d, name: value }))} required />
          <SelectField label="Channel" value={draft.channel} onChange={value => setDraft(d => ({ ...d, channel: value as CampaignChannel }))} options={Object.entries(CHANNEL_LABELS)} />
          <Field label="Source key" value={draft.sourceKey} onChange={value => setDraft(d => ({ ...d, sourceKey: value }))} />
          <SelectField label="Status" value={draft.status} onChange={value => setDraft(d => ({ ...d, status: value as CampaignRow["status"] }))} options={[["draft", "Draft"], ["active", "Active"], ["paused", "Paused"], ["completed", "Completed"]]} />
          {draft.channel === "email" ? <Field label="Subject" value={draft.subject} onChange={value => setDraft(d => ({ ...d, subject: value }))} required /> : null}
          <Field label="Tags" value={draft.tags} onChange={value => setDraft(d => ({ ...d, tags: value }))} placeholder="warm, follow-up" />
          <Field label="Sources" value={draft.sourcedFrom} onChange={value => setDraft(d => ({ ...d, sourcedFrom: value }))} placeholder="sheet-upload, manual" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Budget (£)" value={draft.budget} onChange={value => setDraft(d => ({ ...d, budget: value }))} />
          <Field label="Spend to date (£)" value={draft.spend} onChange={value => setDraft(d => ({ ...d, spend: value }))} />
          <Field label="Revenue attributed (£)" value={draft.revenue} onChange={value => setDraft(d => ({ ...d, revenue: value }))} />
          <Field label="Start date" type="date" value={draft.startsAt} onChange={value => setDraft(d => ({ ...d, startsAt: value }))} />
          <Field label="End date" type="date" value={draft.endsAt} onChange={value => setDraft(d => ({ ...d, endsAt: value }))} />
          <Field label="Campaign link" value={draft.externalUrl} onChange={value => setDraft(d => ({ ...d, externalUrl: value }))} />
        </div>
        <Field label="Notes" value={draft.notes} onChange={value => setDraft(d => ({ ...d, notes: value }))} />
        {draft.channel === "email" ? <label className="text-xs font-medium text-black/60">
          Pipeline stage
          <select
            value={draft.pipelineColumn}
            onChange={e => setDraft(d => ({ ...d, pipelineColumn: e.target.value }))}
            className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">Any stage</option>
            {pipelineColumns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </label> : null}
        <label className="text-xs font-medium text-black/60">
          Email body
          <textarea
            value={draft.bodyText}
            onChange={e => setDraft(d => ({ ...d, bodyText: e.target.value }))}
            rows={5}
            className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/80"
          />
        </label>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy}
          className="w-fit rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03] disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save changes"}
        </button>
      </div>
    </details>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-xs font-medium text-black/60">
      {label}
      <input
        required={required}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-black/80"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block text-xs font-medium text-black/60">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/80">{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-black/45">{label}</div>
      <div className="mt-1 text-xl font-semibold text-black/90">{value}</div>
    </div>
  );
}

function splitList(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function poundsToCents(value: string): number | undefined {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : undefined;
}

function centsToInput(value?: number): string {
  return value === undefined ? "" : String(value / 100);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value / 100);
}

function dateToMs(value: string): number | undefined {
  const result = value ? new Date(`${value}T12:00:00`).getTime() : Number.NaN;
  return Number.isFinite(result) ? result : undefined;
}

function msToDate(value?: number): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function textToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .trim();
}
