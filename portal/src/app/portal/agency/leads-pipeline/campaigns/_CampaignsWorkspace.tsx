"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckSquare, FilePenLine, Mail, Megaphone, PoundSterling, Send } from "lucide-react";
import { WorkflowSteps } from "@/app/portal/agency/leads-pipeline/_WorkflowSteps";
import {
  CampaignCreativeStudio,
  campaignAssetUrl,
  createEmptyCampaignCreative,
  placementDefaultsForChannel,
  type CampaignCreative,
} from "./_CampaignCreativeStudio";

interface CampaignRow {
  id: string;
  name: string;
  companyIds?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  channel?: CampaignChannel;
  kind?: CampaignKind;
  sourceKey?: string;
  status: "draft" | "scheduled" | "active" | "paused" | "sending" | "sent" | "completed";
  budgetCents?: number;
  spendCents?: number;
  attributedRevenueCents?: number;
  startsAt?: number;
  endsAt?: number;
  externalUrl?: string;
  notes?: string;
  steps?: CampaignStep[];
  creative?: CampaignCreative;
  attributedLeads?: number;
  attributedClients?: number;
  recipients: number;
  sentCount: number;
  sentAt?: number;
  createdAt: number;
  audienceFilter: {
    companyIds?: string[];
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
  companies?: CampaignCompanyOption[];
  defaultCompanyIds?: string[];
  defaultChannel?: CampaignChannel;
  embedded?: boolean;
}

interface CampaignCompanyOption {
  id: string;
  name: string;
  slug: string;
  colour: string;
}

const EMPTY_FORM = {
  name: "",
  companyIds: [] as string[],
  kind: "newsletter" as CampaignKind,
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
  steps: [] as CampaignStep[],
  tags: "",
  sourcedFrom: "",
  pipelineColumn: "",
  creative: createEmptyCampaignCreative("meta-ads"),
};

type CampaignChannel = "email" | "newsletter" | "cold-outreach" | "dm" | "direct-mail" | "print" | "google-ads" | "meta-ads" | "linkedin-ads" | "organic" | "social" | "event" | "referral" | "charity" | "other";
type CampaignKind = "social-media" | "physical" | "newsletter" | "cold" | "dm" | "charity" | "paid" | "organic" | "event" | "other";
type CampaignStepStatus = "todo" | "in-progress" | "ready" | "done";
interface CampaignStep {
  id: string;
  name: string;
  channel?: CampaignChannel;
  owner?: string;
  dueAt?: number;
  status: CampaignStepStatus;
  notes?: string;
}

const CAMPAIGN_KIND_LABELS: Record<CampaignKind, string> = {
  "social-media": "Social media",
  physical: "Physical / print",
  newsletter: "Newsletter",
  cold: "Cold outreach",
  dm: "DM campaign",
  charity: "Charity / community",
  paid: "Paid media",
  organic: "Organic",
  event: "Event",
  other: "Other",
};
const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  email: "Email", newsletter: "Newsletter", "cold-outreach": "Cold outreach",
  dm: "Direct message", "direct-mail": "Direct mail", print: "Print",
  "google-ads": "Google Ads", "meta-ads": "Meta Ads",
  "linkedin-ads": "LinkedIn Ads", organic: "Organic", social: "Social",
  event: "Event", referral: "Referral", charity: "Charity", other: "Other",
};

const CAMPAIGN_LANES: Array<{ kind: CampaignKind; title: string; detail: string }> = [
  { kind: "social-media", title: "Social", detail: "Posts, reels, stories and organic account activity." },
  { kind: "newsletter", title: "Newsletter", detail: "Audience emails, nurture sends and regular updates." },
  { kind: "physical", title: "Physical", detail: "Flyers, postcards, print drops and local material." },
  { kind: "dm", title: "DM", detail: "Instagram, LinkedIn or Facebook message campaigns." },
  { kind: "cold", title: "Cold", detail: "Prospect lists, openers, follow-ups and replies." },
  { kind: "charity", title: "Charity", detail: "Community, cause-led, partnership and impact campaigns." },
];

const CAMPAIGN_PLAYBOOKS: Record<CampaignKind, { focus: string; steps: string[]; sourcePlaceholder: string; notesPlaceholder: string }> = {
  "social-media": {
    focus: "Content calendar, platform creative, captions, approvals and engagement follow-up.",
    steps: ["Plan content angle", "Create feed/story assets", "Approve captions", "Schedule posts", "Review engagement"],
    sourcePlaceholder: "instagram-august-content",
    notesPlaceholder: "Accounts, post formats, caption angle, hashtags and reply plan",
  },
  physical: {
    focus: "Printed material, local distribution, fulfilment dates and response tracking.",
    steps: ["Define audience list", "Write print copy", "Design artwork", "Send to printer", "Distribute locally", "Track responses"],
    sourcePlaceholder: "postcard-drop-august",
    notesPlaceholder: "Print spec, quantity, delivery route, supplier, QR code and offer",
  },
  newsletter: {
    focus: "Editorial theme, consented audience, links, send schedule and reply review.",
    steps: ["Pick topic and offer", "Draft newsletter", "Proof links and consent", "Schedule send", "Review replies"],
    sourcePlaceholder: "newsletter-august",
    notesPlaceholder: "Sections, offer, audience segment, links and send time",
  },
  cold: {
    focus: "Prospect list, opener, follow-up sequence, replies and lead handover.",
    steps: ["Build prospect list", "Write opener", "Send first wave", "Follow up", "Move replies into leads"],
    sourcePlaceholder: "cold-local-retail-august",
    notesPlaceholder: "Niche, qualifying signal, opener angle, follow-up cadence and reply handling",
  },
  dm: {
    focus: "Account list, first message, warm reply handling and CRM logging.",
    steps: ["Choose account list", "Write DM opener", "Send first wave", "Follow up warm replies", "Log outcomes"],
    sourcePlaceholder: "instagram-dm-local-founders",
    notesPlaceholder: "Platform, account criteria, opener, follow-up message and response labels",
  },
  charity: {
    focus: "Cause, partner, story, community assets, outreach and impact reporting.",
    steps: ["Choose cause and partner", "Define story and offer", "Create community assets", "Publish and outreach", "Report impact"],
    sourcePlaceholder: "community-charity-push",
    notesPlaceholder: "Partner, cause, pledge, approval contact, impact proof and announcement plan",
  },
  paid: {
    focus: "Paid objective, creative variants, targeting, launch checks and spend review.",
    steps: ["Set objective", "Build creative", "Create audience", "Launch campaign", "Review spend and leads"],
    sourcePlaceholder: "meta-lead-gen-august",
    notesPlaceholder: "Audience, placements, creative variants, offer and budget guardrails",
  },
  organic: {
    focus: "Organic topic, publishing route, comments, conversations and result review.",
    steps: ["Plan topic", "Create content", "Publish", "Respond to engagement", "Review results"],
    sourcePlaceholder: "organic-content-push",
    notesPlaceholder: "Topic cluster, post angle, channels and response plan",
  },
  event: {
    focus: "Invite list, promotion, event delivery and attendee follow-up.",
    steps: ["Define event goal", "Create invite", "Promote", "Run event", "Follow up attendees"],
    sourcePlaceholder: "local-event-august",
    notesPlaceholder: "Venue, attendees, invite route, running order and follow-up offer",
  },
  other: {
    focus: "Plan, asset creation, launch, follow-up and result review.",
    steps: ["Plan", "Create assets", "Launch", "Follow up", "Review results"],
    sourcePlaceholder: "campaign-source",
    notesPlaceholder: "Audience, assets, launch route, next actions and results",
  },
};

export function CampaignsWorkspace({ campaigns, availableTags, availableSources, pipelineColumns, emailSenderReady, companies = [], defaultCompanyIds = [], defaultChannel = "email", embedded = false }: CampaignsWorkspaceProps) {
  const router = useRouter();
  const [form, setForm] = useState(() => {
    const kind = kindForChannel(defaultChannel);
    return { ...EMPTY_FORM, companyIds: [...defaultCompanyIds], kind, channel: defaultChannel, steps: defaultCampaignSteps(kind), creative: createEmptyCampaignCreative(defaultChannel) };
  });
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftCount = campaigns.filter(c => c.status === "draft").length;
  const sentCount = campaigns.filter(c => c.status === "sent").length;
  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spendCents ?? 0), 0);
  const laneCounts = useMemo(() => campaignLaneCounts(campaigns), [campaigns]);

  const audienceFilter = useMemo(() => ({
    companyIds: form.companyIds,
    tags: splitList(form.tags),
    sourcedFrom: splitList(form.sourcedFrom),
    pipelineColumn: form.pipelineColumn || undefined,
  }), [form.companyIds, form.tags, form.sourcedFrom, form.pipelineColumn]);

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
          companyIds: form.companyIds,
          kind: form.kind,
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
          steps: form.steps,
          creative: isEmailLikeChannel(form.channel) ? undefined : form.creative,
          audienceFilter,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; campaign?: CampaignRow };
      if (!data.ok) throw new Error(data.error ?? "Could not create campaign.");
      setNotice(`Campaign "${data.campaign?.name ?? form.name}" saved as a draft.`);
      setForm({ ...EMPTY_FORM, companyIds: [...defaultCompanyIds], kind: kindForChannel(defaultChannel), channel: defaultChannel, steps: defaultCampaignSteps(kindForChannel(defaultChannel)), creative: createEmptyCampaignCreative(defaultChannel) });
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
        companyIds: draft.companyIds,
        tags: splitList(draft.tags),
        sourcedFrom: splitList(draft.sourcedFrom),
        pipelineColumn: draft.pipelineColumn || undefined,
      };
      const res = await fetch(`/api/portal/leads-pipeline/campaigns?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          companyIds: draft.companyIds,
          kind: draft.kind,
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
          steps: draft.steps,
          creative: isEmailLikeChannel(draft.channel) ? undefined : draft.creative,
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

  function applyKind(kind: CampaignKind) {
    const channel = defaultChannelForKind(kind);
    setForm(current => ({
      ...current,
      kind,
      channel,
      steps: defaultCampaignSteps(kind),
      creative: createEmptyCampaignCreative(channel),
    }));
  }

  return (
    <div data-testid="leads-pipeline-campaigns" className="flex flex-col gap-6">
      {!embedded ? <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Outreach</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Campaigns</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">
            Build email, social and paid-media campaigns in one place. Compose the creative, inspect every placement, define the audience and track the result.
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
        <Stat label="Campaigns" value={String(campaigns.length)} icon={<Megaphone size={16} />} tone="blue" />
        <Stat label="Drafts" value={String(draftCount)} icon={<FilePenLine size={16} />} tone="amber" />
        <Stat label="Sent campaigns" value={String(sentCount)} icon={<Send size={16} />} tone="emerald" />
        <Stat label="Emails queued" value={String(totalSent)} icon={<Mail size={16} />} tone="violet" />
        <Stat label="Spend tracked" value={formatMoney(totalSpend)} icon={<PoundSterling size={16} />} tone="blue" />
      </section>

      {(notice || error) && (
        <div className={`rounded-md border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {error ?? notice}
        </div>
      )}

      {!emailSenderReady && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Email outbox setup needs attention before campaigns can send. Drafts and audience previews still work.
        </div>
      )}

      <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Campaign lanes">
        {CAMPAIGN_LANES.map(lane => {
          const active = form.kind === lane.kind;
          const count = laneCounts[lane.kind] ?? 0;
          return (
            <button
              key={lane.kind}
              type="button"
              onClick={() => applyKind(lane.kind)}
              aria-pressed={active}
              className={`rounded-md border p-3 text-left transition ${active ? "border-black bg-black text-white shadow-sm" : "border-black/10 bg-white text-black/70 hover:border-black/25 hover:bg-black/[0.02]"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <strong className="text-sm">{lane.title}</strong>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-white/15 text-white/80" : "bg-black/[0.045] text-black/45"}`}>{count}</span>
              </span>
              <span className={`mt-1 block text-[11px] leading-4 ${active ? "text-white/62" : "text-black/42"}`}>{lane.detail}</span>
            </button>
          );
        })}
      </section>

      <CampaignLanePlaybook
        kind={form.kind}
        channel={form.channel}
        steps={form.steps}
        onReset={() => setForm(current => ({ ...current, steps: defaultCampaignSteps(current.kind) }))}
      />

      <form onSubmit={createCampaign} className="mm-surface-card rounded-md p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3">
            <CampaignBrandSelector companyIds={form.companyIds} companies={companies} onChange={companyIds => setForm(current => ({ ...current, companyIds }))} />
            <Field label="Campaign name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="July website audit follow-up" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Campaign type" value={form.kind} onChange={v => {
                const kind = v as CampaignKind;
                const channel = defaultChannelForKind(kind);
                setForm(f => ({ ...f, kind, channel, steps: defaultCampaignSteps(kind), creative: createEmptyCampaignCreative(channel) }));
              }} options={Object.entries(CAMPAIGN_KIND_LABELS)} />
              <SelectField label="Primary channel" value={form.channel} onChange={v => setForm(f => ({ ...f, channel: v as CampaignChannel, kind: kindForChannel(v as CampaignChannel), creative: { ...f.creative, placements: placementDefaultsForChannel(v) } }))} options={Object.entries(CHANNEL_LABELS)} />
              <Field label="Source key" value={form.sourceKey} onChange={v => setForm(f => ({ ...f, sourceKey: v }))} placeholder={CAMPAIGN_PLAYBOOKS[form.kind].sourcePlaceholder} />
            </div>
            {isEmailLikeChannel(form.channel) ? <>
            <Field label="Subject" value={form.subject} onChange={v => setForm(f => ({ ...f, subject: v }))} placeholder="Quick idea for your website" required />
            <label className="text-xs font-medium text-black/60">
              {form.channel === "newsletter" ? "Newsletter body" : "Email body"}
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
              <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder={CAMPAIGN_PLAYBOOKS[form.kind].notesPlaceholder} />
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
            <CampaignStepsEditor steps={form.steps} onChange={steps => setForm(f => ({ ...f, steps }))} />
          </div>

          <aside className="rounded-md border border-black/10 bg-black/[0.02] p-3">
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
        {usesCreativeStudio(form.channel) ? <CampaignCreativeStudio value={form.creative} onChange={creative => setForm(current => ({ ...current, creative }))} channel={form.channel} /> : null}
      </form>

      <section className="mm-surface-card rounded-md p-4">
        <h2 className="text-base font-semibold text-black/85">Campaign history</h2>
        <div className="mt-3 grid gap-3">
          {campaigns.length === 0 ? (
            <div className="rounded-md border border-dashed border-black/10 p-6 text-center text-sm text-black/45">
              No campaigns yet.
            </div>
          ) : campaigns.map(campaign => (
            <article key={campaign.id} className="mm-surface-card mm-hover-lift rounded-md p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-black/90">{campaign.name}</h3><CampaignBrandBadges companyIds={campaign.companyIds} companies={companies} /></div>
                  <p className="mt-1 truncate text-xs text-black/50">{CAMPAIGN_KIND_LABELS[campaign.kind ?? kindForChannel(campaign.channel ?? "email")]} · {CHANNEL_LABELS[campaign.channel ?? "email"]}{campaign.sourceKey ? ` · ${campaign.sourceKey}` : ""}{campaign.subject ? ` · ${campaign.subject}` : ""}</p>
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
                {campaign.steps?.length ? <span>{campaign.steps.filter(step => step.status === "done").length}/{campaign.steps.length} steps done</span> : null}
              </div>
              {campaign.steps?.length ? <CampaignStepSummary steps={campaign.steps} /> : null}
              {campaign.creative?.asset ? <div className="mt-3 flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.02] p-2">
                <div className="h-14 w-20 overflow-hidden rounded-md bg-black/[0.04]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={campaignAssetUrl(campaign.creative.asset)} alt="Campaign creative" className="size-full object-cover" />
                </div>
                <div className="min-w-0"><div className="truncate text-xs font-semibold text-black/75">{campaign.creative.headline || campaign.creative.asset.fileName}</div><div className="mt-1 text-[11px] text-black/45">{campaign.creative.placements.length} placement{campaign.creative.placements.length === 1 ? "" : "s"} configured</div></div>
              </div> : null}
              {campaign.status !== "sent" && campaign.status !== "sending" && (
                <CampaignEditor
                  campaign={campaign}
                  pipelineColumns={pipelineColumns}
                  companies={companies}
                  busy={busy === `update:${campaign.id}`}
                  onSave={draft => updateCampaign(campaign.id, draft)}
                />
              )}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-black/10 pt-3">
                {isEmailLikeChannel(campaign.channel ?? "email") && campaign.status !== "sent" && campaign.status !== "sending" && (
                  <button
                    type="button"
                    onClick={() => sendCampaign(campaign.id)}
                    disabled={busy === `send:${campaign.id}`}
                    className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === `send:${campaign.id}` ? "Sending..." : (campaign.channel === "newsletter" ? "Send newsletter" : "Send campaign")}
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
  companyIds: string[];
  kind: CampaignKind;
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
  steps: CampaignStep[];
  status: CampaignRow["status"];
  tags: string;
  sourcedFrom: string;
  pipelineColumn: string;
  creative: CampaignCreative;
}

function CampaignEditor({
  campaign,
  pipelineColumns,
  companies,
  busy,
  onSave,
}: {
  campaign: CampaignRow;
  pipelineColumns: string[];
  companies: CampaignCompanyOption[];
  busy: boolean;
  onSave: (draft: CampaignDraft) => void;
}) {
  const [draft, setDraft] = useState<CampaignDraft>({
    name: campaign.name,
    companyIds: campaign.companyIds ?? [],
    kind: campaign.kind ?? kindForChannel(campaign.channel ?? "email"),
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
    steps: campaign.steps?.length ? campaign.steps : defaultCampaignSteps(campaign.kind ?? kindForChannel(campaign.channel ?? "email")),
    status: campaign.status,
    creative: campaign.creative ?? createEmptyCampaignCreative(campaign.channel ?? "meta-ads"),
  });

  return (
    <details className="mt-3 rounded-md border border-black/10 bg-black/[0.02] p-3">
      <summary className="cursor-pointer text-xs font-medium text-black/65">Edit draft</summary>
      <div className="mt-3 grid gap-3">
        <CampaignBrandSelector companyIds={draft.companyIds} companies={companies} onChange={companyIds => setDraft(current => ({ ...current, companyIds }))} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Campaign name" value={draft.name} onChange={value => setDraft(d => ({ ...d, name: value }))} required />
          <SelectField label="Campaign type" value={draft.kind} onChange={value => {
            const kind = value as CampaignKind;
            const channel = defaultChannelForKind(kind);
            setDraft(d => ({ ...d, kind, channel, steps: defaultCampaignSteps(kind), creative: createEmptyCampaignCreative(channel) }));
          }} options={Object.entries(CAMPAIGN_KIND_LABELS)} />
          <SelectField label="Channel" value={draft.channel} onChange={value => setDraft(d => ({ ...d, channel: value as CampaignChannel, kind: kindForChannel(value as CampaignChannel), creative: { ...d.creative, placements: placementDefaultsForChannel(value) } }))} options={Object.entries(CHANNEL_LABELS)} />
          <Field label="Source key" value={draft.sourceKey} onChange={value => setDraft(d => ({ ...d, sourceKey: value }))} />
          <SelectField label="Status" value={draft.status} onChange={value => setDraft(d => ({ ...d, status: value as CampaignRow["status"] }))} options={[["draft", "Draft"], ["active", "Active"], ["paused", "Paused"], ["completed", "Completed"]]} />
          {isEmailLikeChannel(draft.channel) ? <Field label="Subject" value={draft.subject} onChange={value => setDraft(d => ({ ...d, subject: value }))} required /> : null}
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
        <CampaignStepsEditor steps={draft.steps} onChange={steps => setDraft(d => ({ ...d, steps }))} compact />
        {isEmailLikeChannel(draft.channel) ? <label className="text-xs font-medium text-black/60">
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
        {isEmailLikeChannel(draft.channel) ? <label className="text-xs font-medium text-black/60">
          {draft.channel === "newsletter" ? "Newsletter body" : "Email body"}
          <textarea
            value={draft.bodyText}
            onChange={e => setDraft(d => ({ ...d, bodyText: e.target.value }))}
            rows={5}
            className="mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/80"
          />
        </label> : usesCreativeStudio(draft.channel) ? <CampaignCreativeStudio value={draft.creative} onChange={creative => setDraft(current => ({ ...current, creative }))} channel={draft.channel} compact /> : null}
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

function CampaignBrandBadges({ companyIds, companies }: { companyIds?: string[]; companies: CampaignCompanyOption[] }) {
  if (!companyIds?.length) {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Group / shared</span>;
  }

  return (
    <span className="inline-flex flex-wrap gap-1">
      {companyIds.map(companyId => {
        const company = companies.find(option => option.id === companyId);
        return (
          <span key={companyId} className="inline-flex items-center gap-1 rounded-full bg-black/[0.045] px-2 py-0.5 text-[10px] font-semibold text-black/60">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: company?.colour ?? "#737373" }} aria-hidden />
            {company?.name ?? "Assigned brand"}
          </span>
        );
      })}
    </span>
  );
}

function CampaignStepsEditor({ steps, onChange, compact = false }: { steps: CampaignStep[]; onChange: (steps: CampaignStep[]) => void; compact?: boolean }) {
  function patch(id: string, patchValue: Partial<CampaignStep>) {
    onChange(steps.map(step => step.id === id ? { ...step, ...patchValue } : step));
  }

  function addStep() {
    onChange([...steps, { id: createStepId(), name: "New campaign step", status: "todo" }]);
  }

  function removeStep(id: string) {
    onChange(steps.filter(step => step.id !== id));
  }

  return (
    <section className={`rounded-md border border-black/10 bg-black/[0.018] p-3 ${compact ? "" : "mt-1"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-black/75"><CheckSquare size={15} />Campaign steps</div>
        <button type="button" onClick={addStep} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/[0.03]">Add step</button>
      </div>
      <div className="mt-3 grid gap-2">
        {steps.map((step, index) => (
          <div key={step.id} className="grid gap-2 rounded-md border border-black/8 bg-white p-2 md:grid-cols-[minmax(0,1.4fr)_120px_120px_110px_auto] md:items-end">
            <Field label={`Step ${index + 1}`} value={step.name} onChange={value => patch(step.id, { name: value })} placeholder="Design postcard / write DM opener" />
            <SelectField label="Status" value={step.status} onChange={value => patch(step.id, { status: value as CampaignStepStatus })} options={[["todo", "To do"], ["in-progress", "In progress"], ["ready", "Ready"], ["done", "Done"]]} />
            <Field label="Owner" value={step.owner ?? ""} onChange={owner => patch(step.id, { owner })} placeholder="Ed" />
            <Field label="Due" type="date" value={msToDate(step.dueAt)} onChange={value => patch(step.id, { dueAt: dateToMs(value) })} />
            <button type="button" onClick={() => removeStep(step.id)} className="min-h-10 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
            <div className="md:col-span-5">
              <Field label="Step notes" value={step.notes ?? ""} onChange={notes => patch(step.id, { notes })} placeholder="Asset, copy, distribution, approval or fulfilment detail" />
            </div>
          </div>
        ))}
        {!steps.length ? <button type="button" onClick={addStep} className="rounded-md border border-dashed border-black/15 py-6 text-xs text-black/45">Add the first campaign step</button> : null}
      </div>
    </section>
  );
}

function CampaignStepSummary({ steps }: { steps: CampaignStep[] }) {
  return (
    <div className="mt-3 grid gap-1.5 rounded-md border border-black/10 bg-black/[0.018] p-2">
      {steps.slice(0, 4).map(step => (
        <div key={step.id} className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-black/58">{step.name}</span>
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-semibold capitalize text-black/45">{step.status.replace("-", " ")}</span>
        </div>
      ))}
      {steps.length > 4 ? <p className="text-[11px] text-black/40">+{steps.length - 4} more steps</p> : null}
    </div>
  );
}

function CampaignBrandSelector({
  companyIds,
  companies,
  onChange,
}: {
  companyIds: string[];
  companies: CampaignCompanyOption[];
  onChange: (companyIds: string[]) => void;
}) {
  if (companies.length === 0) return null;

  return (
    <fieldset className="rounded-md border border-black/10 bg-black/[0.018] p-3">
      <legend className="px-1 text-xs font-semibold text-black/70">Brand scope</legend>
      <p className="text-xs leading-5 text-black/45">Choose every brand this campaign supports. Audience previews and sends only include leads linked to those brands.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={companyIds.length === 0}
          onClick={() => onChange([])}
          className={`min-h-9 rounded-md border px-3 text-xs font-semibold ${companyIds.length === 0 ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/55 hover:border-black/25"}`}
        >
          Group / shared
        </button>
        {companies.map(company => {
          const selected = companyIds.includes(company.id);
          return (
            <button
              key={company.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? companyIds.filter(id => id !== company.id) : [...companyIds, company.id])}
              className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${selected ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/55 hover:border-black/25"}`}
            >
              <span className="size-2 rounded-full ring-1 ring-white/30" style={{ backgroundColor: company.colour }} aria-hidden />
              {company.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CampaignLanePlaybook({
  kind,
  channel,
  steps,
  onReset,
}: {
  kind: CampaignKind;
  channel: CampaignChannel;
  steps: CampaignStep[];
  onReset: () => void;
}) {
  const playbook = CAMPAIGN_PLAYBOOKS[kind];
  const done = steps.filter(step => step.status === "done").length;

  return (
    <section className="grid gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-black/78">{CAMPAIGN_KIND_LABELS[kind]} campaign kit</h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black/45">{CHANNEL_LABELS[channel]}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black/45">{done}/{steps.length} done</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-black/46">{playbook.focus}</p>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {playbook.steps.map((step, index) => (
            <span key={step} className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-black/8 bg-white px-2 text-[11px] font-medium text-black/52">
              <span className="font-mono text-black/35">{index + 1}</span>{step}
            </span>
          ))}
        </div>
      </div>
      <button type="button" onClick={onReset} className="min-h-9 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">
        Reset steps
      </button>
    </section>
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

function Stat({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "blue" | "emerald" | "violet" | "amber" }) {
  return (
    <div className="mm-kpi-card mm-surface-card mm-hover-lift flex min-h-24 items-center gap-3 rounded-md p-4" data-kpi-tone={tone}>
      <span className="mm-kpi-icon">{icon}</span>
      <div><div className="text-xs font-medium text-black/45">{label}</div><div className="mt-1 text-xl font-semibold text-black/90">{value}</div></div>
    </div>
  );
}

function defaultChannelForKind(kind: CampaignKind): CampaignChannel {
  const map: Record<CampaignKind, CampaignChannel> = {
    "social-media": "organic",
    physical: "direct-mail",
    newsletter: "newsletter",
    cold: "cold-outreach",
    dm: "dm",
    charity: "charity",
    paid: "meta-ads",
    organic: "organic",
    event: "event",
    other: "other",
  };
  return map[kind];
}

function campaignLaneCounts(campaigns: CampaignRow[]): Record<CampaignKind, number> {
  const counts = Object.fromEntries(Object.keys(CAMPAIGN_KIND_LABELS).map(kind => [kind, 0])) as Record<CampaignKind, number>;
  for (const campaign of campaigns) {
    const kind = campaign.kind ?? kindForChannel(campaign.channel ?? "email");
    counts[kind] += 1;
  }
  return counts;
}

function kindForChannel(channel: CampaignChannel): CampaignKind {
  if (channel === "newsletter" || channel === "email") return "newsletter";
  if (channel === "cold-outreach") return "cold";
  if (channel === "dm") return "dm";
  if (channel === "direct-mail" || channel === "print") return "physical";
  if (channel === "charity") return "charity";
  if (channel === "google-ads" || channel === "meta-ads" || channel === "linkedin-ads") return "paid";
  if (channel === "organic" || channel === "social") return "social-media";
  if (channel === "event") return "event";
  return "other";
}

function usesCreativeStudio(channel: CampaignChannel): boolean {
  return ["google-ads", "meta-ads", "linkedin-ads", "organic", "social"].includes(channel);
}

function isEmailLikeChannel(channel: CampaignChannel): boolean {
  return channel === "email" || channel === "newsletter";
}

function defaultCampaignSteps(kind: CampaignKind): CampaignStep[] {
  return CAMPAIGN_PLAYBOOKS[kind].steps.map(name => ({ id: createStepId(), name, status: "todo" }));
}

function createStepId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `step_${crypto.randomUUID()}`;
  return `step_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
