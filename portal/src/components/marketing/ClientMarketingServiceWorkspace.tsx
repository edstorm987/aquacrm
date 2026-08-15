"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  Check,
  CircleDollarSign,
  ExternalLink,
  Gauge,
  Megaphone,
  Pencil,
  Plus,
  RadioTower,
  Save,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import {
  clientMarketingMetrics,
  type ClientMarketingApproval,
  type ClientMarketingService,
} from "@/lib/clientMarketingService";
import { formatUkDate, localDateTimeInputValue } from "@/lib/formatDateTime";

type View = "overview" | "content" | "campaigns" | "profiles";
type Editor = { kind: "settings" | "profile" | "content" | "campaign"; id?: string } | null;
type Review = { kind: "content" | "campaign"; id: string; title: string } | null;

export function ClientMarketingServiceWorkspace({
  clientId,
  clientName,
  initial,
  canManage,
  canApprove,
  embeddedInMarketing = false,
}: {
  clientId: string;
  clientName: string;
  initial: ClientMarketingService;
  canManage: boolean;
  canApprove: boolean;
  embeddedInMarketing?: boolean;
}) {
  const router = useRouter();
  const [service, setService] = useState(initial);
  const [view, setView] = useState<View>("overview");
  const [editor, setEditor] = useState<Editor>(null);
  const [review, setReview] = useState<Review>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metrics = useMemo(() => clientMarketingMetrics(service), [service]);

  async function mutate(action: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tenants/client-marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, action, ...body }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; service?: ClientMarketingService } | null;
      if (!response.ok || !data?.ok || !data.service) throw new Error(data?.error || "Marketing service could not be updated.");
      setService(data.service);
      setEditor(null);
      setReview(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Marketing service could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "profile" | "content" | "campaign", id: string) {
    if (!window.confirm(`Remove this ${kind}?`)) return;
    await mutate(`remove-${kind}`, { id });
  }

  const pendingItems = [
    ...service.content.filter(item => item.approval === "pending").map(item => ({ kind: "content" as const, id: item.id, title: item.title, detail: `${item.platform} · ${item.format}` })),
    ...service.campaigns.filter(item => item.approval === "pending").map(item => ({ kind: "campaign" as const, id: item.id, title: item.name, detail: `${item.platform} · ${item.objective}` })),
  ];

  return (
    <section className="min-w-0 border-y border-black/10 bg-white" aria-labelledby="client-marketing-heading">
      <header className="grid gap-5 border-b border-black/10 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-brand"><Sparkles size={13} /> Client service</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 id="client-marketing-heading" className="text-2xl font-semibold text-black/88">Social and paid media</h2>
            <StatusPill value={service.enabled ? service.status : "not active"} tone={service.status === "active" ? "good" : service.status === "paused" ? "warn" : "neutral"} />
            {metrics.pendingApprovals > 0 ? <StatusPill value={`${metrics.pendingApprovals} awaiting approval`} tone="warn" /> : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">One delivery record for {clientName}&apos;s channels, content approvals, media spend and attributed results. The agency and client see the same truth with different controls.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {canManage && !embeddedInMarketing ? <Link href={`/portal/agency/marketing?view=client-services&client=${encodeURIComponent(clientId)}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/65">Open in Marketing <ExternalLink size={14} /></Link> : null}
          {canManage ? <button type="button" onClick={() => setEditor({ kind: "settings" })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Settings2 size={14} /> Configure service</button> : null}
        </div>
      </header>

      <nav aria-label="Client marketing views" className="flex gap-px overflow-x-auto border-b border-black/10 bg-black/10">
        <ViewButton active={view === "overview"} label="Overview" icon={<Gauge size={15} />} onClick={() => setView("overview")} />
        <ViewButton active={view === "content"} label="Content" count={service.content.length} icon={<CalendarClock size={15} />} onClick={() => setView("content")} />
        <ViewButton active={view === "campaigns"} label="Paid campaigns" count={service.campaigns.length} icon={<Target size={15} />} onClick={() => setView("campaigns")} />
        <ViewButton active={view === "profiles"} label="Social profiles" count={service.profiles.length} icon={<RadioTower size={15} />} onClick={() => setView("profiles")} />
      </nav>

      {error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}

      {view === "overview" ? (
        <div>
          <div className="grid border-b border-black/10 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="Active campaigns" value={String(metrics.activeCampaigns)} detail={`${service.campaigns.length} total`} icon={<Megaphone size={15} />} />
            <Metric label="Media spend" value={money(metrics.spendCents, service.currency)} detail={`${money(service.monthlyBudgetCents, service.currency)} monthly allocation`} icon={<CircleDollarSign size={15} />} />
            <Metric label="Qualified leads" value={String(metrics.leads)} detail={metrics.cplCents === null ? "CPL needs a lead" : `${money(metrics.cplCents, service.currency)} cost per lead`} icon={<UsersRound size={15} />} />
            <Metric label="Conversions" value={String(metrics.conversions)} detail={metrics.conversionRate === null ? "No click sample" : `${percent(metrics.conversionRate)} click-to-conversion`} icon={<Target size={15} />} />
            <Metric label="ROAS" value={metrics.roas === null ? "No sample" : `${metrics.roas.toFixed(2)}x`} detail={`${money(metrics.revenueCents, service.currency)} attributed revenue`} icon={<BarChart3 size={15} />} />
            <Metric label="Approvals" value={String(metrics.pendingApprovals)} detail={`${metrics.scheduledContent} posts scheduled`} icon={<Check size={15} />} attention={metrics.pendingApprovals > 0} />
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
            <div className="min-w-0 border-b border-black/10 p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-end justify-between gap-4">
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Campaign control</p><h3 className="mt-1 text-lg font-semibold text-black/82">Performance by campaign</h3></div>
                {canManage ? <button type="button" onClick={() => setEditor({ kind: "campaign" })} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold"><Plus size={13} /> Campaign</button> : null}
              </div>
              <CampaignTable service={service} canManage={canManage} setEditor={setEditor} remove={remove} />
            </div>
            <div className="p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">Client decisions</p>
              <h3 className="mt-1 text-lg font-semibold text-black/82">Approval queue</h3>
              <div className="mt-4 divide-y divide-black/[0.07] border-y border-black/10">
                {pendingItems.map(item => <div key={`${item.kind}:${item.id}`} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-black/78">{item.title}</p><p className="mt-1 text-xs text-black/45">{item.detail}</p></div>{canApprove ? <button type="button" onClick={() => setReview(item)} className="shrink-0 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white">Review</button> : null}</div></div>)}
                {!pendingItems.length ? <p className="py-8 text-center text-sm text-black/40">Nothing is waiting for a decision.</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {view === "content" ? <ContentView service={service} canManage={canManage} canApprove={canApprove} setEditor={setEditor} setReview={setReview} remove={remove} /> : null}
      {view === "campaigns" ? <CampaignsView service={service} canManage={canManage} canApprove={canApprove} setEditor={setEditor} setReview={setReview} remove={remove} /> : null}
      {view === "profiles" ? <ProfilesView service={service} canManage={canManage} setEditor={setEditor} remove={remove} /> : null}

      {editor ? <EditorModal editor={editor} service={service} busy={busy} onClose={() => setEditor(null)} onSave={mutate} /> : null}
      {review ? <ReviewModal review={review} busy={busy} onClose={() => setReview(null)} onSave={mutate} /> : null}
    </section>
  );
}

function ViewButton({ active, label, count, icon, onClick }: { active: boolean; label: string; count?: number; icon: React.ReactNode; onClick(): void }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-14 min-w-fit flex-1 items-center justify-center gap-2 bg-white px-4 text-sm font-semibold ${active ? "text-brand shadow-[inset_0_-2px_0_var(--brand)]" : "text-black/52 hover:text-black/75"}`}>{icon}{label}{count !== undefined ? <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] tabular-nums">{count}</span> : null}</button>;
}

function Metric({ label, value, detail, icon, attention = false }: { label: string; value: string; detail: string; icon: React.ReactNode; attention?: boolean }) {
  return <div className="min-w-0 border-b border-black/10 p-4 last:border-b-0 sm:border-r xl:border-b-0"><div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide ${attention ? "text-amber-700" : "text-black/38"}`}>{icon}{label}</div><p className="mt-3 text-xl font-semibold tabular-nums text-black/82">{value}</p><p className="mt-1 text-[11px] leading-4 text-black/42">{detail}</p></div>;
}

function StatusPill({ value, tone }: { value: string; tone: "good" | "warn" | "neutral" }) {
  const style = tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-black/[0.045] text-black/48";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${style}`}>{value}</span>;
}

function ContentView({ service, canManage, canApprove, setEditor, setReview, remove }: { service: ClientMarketingService; canManage: boolean; canApprove: boolean; setEditor(value: Editor): void; setReview(value: Review): void; remove(kind: "content", id: string): void }) {
  return <div className="p-5"><SectionHeading eyebrow="Publishing workflow" title="Content queue" detail="Ideas move through production, client review, scheduling and publication without losing the decision trail." action={canManage ? <button type="button" onClick={() => setEditor({ kind: "content" })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Plus size={14} /> Add content</button> : null} /><div className="mt-5 overflow-x-auto border-y border-black/10"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-wide text-black/38"><tr><th className="px-3 py-3">Content</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Stage</th><th className="px-3 py-3">Approval</th><th className="px-3 py-3">Publish</th><th className="px-3 py-3 text-right">Controls</th></tr></thead><tbody className="divide-y divide-black/[0.07]">{service.content.map(item => <tr key={item.id}><td className="px-3 py-4"><p className="font-semibold text-black/78">{item.title}</p>{item.clientFeedback ? <p className="mt-1 max-w-md text-xs text-amber-700">Feedback: {item.clientFeedback}</p> : null}</td><td className="px-3 py-4 text-black/55">{item.platform} · {item.format}</td><td className="px-3 py-4"><StatusPill value={item.status} tone={item.status === "published" || item.status === "scheduled" ? "good" : "neutral"} /></td><td className="px-3 py-4"><StatusPill value={approvalLabel(item.approval)} tone={item.approval === "approved" ? "good" : item.approval === "pending" || item.approval === "changes-requested" ? "warn" : "neutral"} /></td><td className="px-3 py-4 text-xs text-black/48">{item.scheduledAt ? dateTime(item.scheduledAt) : "Not scheduled"}</td><td className="px-3 py-4"><div className="flex justify-end gap-1">{canApprove && item.approval === "pending" ? <button type="button" title="Review content" onClick={() => setReview({ kind: "content", id: item.id, title: item.title })} className="min-h-9 rounded-md bg-black px-3 text-xs font-semibold text-white">Review</button> : null}{canManage ? <><IconButton title="Edit content" onClick={() => setEditor({ kind: "content", id: item.id })}><Pencil size={14} /></IconButton><IconButton title="Remove content" danger onClick={() => remove("content", item.id)}><Trash2 size={14} /></IconButton></> : null}</div></td></tr>)}</tbody></table>{!service.content.length ? <Empty text="No content has been planned for this client yet." /> : null}</div></div>;
}

function CampaignsView({ service, canManage, canApprove, setEditor, setReview, remove }: { service: ClientMarketingService; canManage: boolean; canApprove: boolean; setEditor(value: Editor): void; setReview(value: Review): void; remove(kind: "campaign", id: string): void }) {
  return <div className="p-5"><SectionHeading eyebrow="Paid acquisition" title="Campaign control" detail="Budgets, approvals, delivery and attributable outcomes for every client ad account." action={canManage ? <button type="button" onClick={() => setEditor({ kind: "campaign" })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Plus size={14} /> Add campaign</button> : null} /><div className="mt-5"><CampaignTable service={service} canManage={canManage} canApprove={canApprove} setEditor={setEditor} setReview={setReview} remove={remove} expanded /></div></div>;
}

function CampaignTable({ service, canManage, canApprove = false, setEditor, setReview = () => {}, remove, expanded = false }: { service: ClientMarketingService; canManage: boolean; canApprove?: boolean; setEditor(value: Editor): void; setReview?(value: Review): void; remove(kind: "campaign", id: string): void; expanded?: boolean }) {
  return <div className={`${expanded ? "" : "mt-4"} overflow-x-auto border-y border-black/10`}><table className="w-full min-w-[780px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-wide text-black/38"><tr><th className="px-3 py-3">Campaign</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Spend / budget</th><th className="px-3 py-3 text-right">Leads</th><th className="px-3 py-3 text-right">Conversions</th><th className="px-3 py-3 text-right">ROAS</th><th className="px-3 py-3 text-right">Controls</th></tr></thead><tbody className="divide-y divide-black/[0.07]">{service.campaigns.map(item => { const roas = item.spendCents > 0 ? item.revenueCents / item.spendCents : null; return <tr key={item.id}><td className="px-3 py-4"><p className="font-semibold text-black/78">{item.name}</p><p className="mt-1 text-xs text-black/43">{item.platform} · {item.objective}</p>{item.clientFeedback ? <p className="mt-1 text-xs text-amber-700">Feedback: {item.clientFeedback}</p> : null}</td><td className="px-3 py-4"><StatusPill value={`${item.status} · ${approvalLabel(item.approval)}`} tone={item.approval === "approved" && item.status === "active" ? "good" : item.approval === "pending" || item.approval === "changes-requested" ? "warn" : "neutral"} /></td><td className="px-3 py-4 text-right tabular-nums text-black/58">{money(item.spendCents, service.currency)} / {money(item.budgetCents, service.currency)}</td><td className="px-3 py-4 text-right font-semibold tabular-nums text-black/72">{item.leads}</td><td className="px-3 py-4 text-right font-semibold tabular-nums text-black/72">{item.conversions}</td><td className="px-3 py-4 text-right font-semibold tabular-nums text-black/72">{roas === null ? "-" : `${roas.toFixed(2)}x`}</td><td className="px-3 py-4"><div className="flex justify-end gap-1">{canApprove && item.approval === "pending" ? <button type="button" onClick={() => setReview({ kind: "campaign", id: item.id, title: item.name })} className="min-h-9 rounded-md bg-black px-3 text-xs font-semibold text-white">Review</button> : null}{canManage ? <><IconButton title="Edit campaign" onClick={() => setEditor({ kind: "campaign", id: item.id })}><Pencil size={14} /></IconButton><IconButton title="Remove campaign" danger onClick={() => remove("campaign", item.id)}><Trash2 size={14} /></IconButton></> : null}</div></td></tr>; })}</tbody></table>{!service.campaigns.length ? <Empty text="No paid campaigns have been added for this client yet." /> : null}</div>;
}

function ProfilesView({ service, canManage, setEditor, remove }: { service: ClientMarketingService; canManage: boolean; setEditor(value: Editor): void; remove(kind: "profile", id: string): void }) {
  return <div className="p-5"><SectionHeading eyebrow="Channel inventory" title="Client social profiles" detail="The exact accounts being managed, who owns them and whether access is operational." action={canManage ? <button type="button" onClick={() => setEditor({ kind: "profile" })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Plus size={14} /> Add profile</button> : null} /><div className="mt-5 grid border border-black/10 sm:grid-cols-2 xl:grid-cols-3">{service.profiles.map(item => <article key={item.id} className="border-b border-r border-black/10 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-black/38">{item.platform}</p><p className="mt-1 truncate text-base font-semibold text-black/78">{item.handle}</p><p className="mt-1 text-xs text-black/45">{item.owner ? `Owner: ${item.owner}` : "Owner not assigned"}</p></div><StatusPill value={item.status} tone={item.status === "connected" ? "good" : item.status === "attention" ? "warn" : "neutral"} /></div><div className="mt-4 flex items-center justify-between gap-2">{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand">Open profile <ExternalLink size={12} /></a> : <span className="text-xs text-black/35">No URL</span>}{canManage ? <div className="flex gap-1"><IconButton title="Edit profile" onClick={() => setEditor({ kind: "profile", id: item.id })}><Pencil size={14} /></IconButton><IconButton title="Remove profile" danger onClick={() => remove("profile", item.id)}><Trash2 size={14} /></IconButton></div> : null}</div></article>)}{!service.profiles.length ? <div className="sm:col-span-2 xl:col-span-3"><Empty text="No social accounts have been assigned to this service." /></div> : null}</div></div>;
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/38">{eyebrow}</p><h3 className="mt-1 text-lg font-semibold text-black/82">{title}</h3><p className="mt-1 max-w-2xl text-sm text-black/50">{detail}</p></div>{action}</div>;
}

function IconButton({ title, danger = false, onClick, children }: { title: string; danger?: boolean; onClick(): void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`grid size-9 place-items-center rounded-md border ${danger ? "border-red-200 text-red-600" : "border-black/10 text-black/52"}`}>{children}</button>;
}

function Empty({ text }: { text: string }) { return <p className="px-5 py-12 text-center text-sm text-black/40">{text}</p>; }

function EditorModal({ editor, service, busy, onClose, onSave }: { editor: Exclude<Editor, null>; service: ClientMarketingService; busy: boolean; onClose(): void; onSave(action: string, body: Record<string, unknown>): Promise<void> }) {
  const profile = editor.kind === "profile" ? service.profiles.find(item => item.id === editor.id) : undefined;
  const content = editor.kind === "content" ? service.content.find(item => item.id === editor.id) : undefined;
  const campaign = editor.kind === "campaign" ? service.campaigns.find(item => item.id === editor.id) : undefined;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (editor.kind === "settings") return onSave("update-service", { patch: { enabled: form.get("enabled") === "on", status: form.get("status"), currency: form.get("currency"), monthlyBudgetCents: poundsToCents(form.get("monthlyBudget")), primaryGoal: form.get("primaryGoal"), audience: form.get("audience"), approvalRequired: form.get("approvalRequired") === "on", reportingCadence: form.get("reportingCadence") } });
    if (editor.kind === "profile") return onSave("upsert-profile", { id: profile?.id, row: { platform: form.get("platform"), handle: form.get("handle"), url: form.get("url"), owner: form.get("owner"), status: form.get("status") } });
    if (editor.kind === "content") return onSave("upsert-content", { id: content?.id, row: { title: form.get("title"), platform: form.get("platform"), format: form.get("format"), status: form.get("status"), approval: content?.approval ?? "pending", scheduledAt: dateInputToTs(form.get("scheduledAt")), publishedUrl: form.get("publishedUrl"), notes: form.get("notes"), clientFeedback: content?.clientFeedback } });
    return onSave("upsert-campaign", { id: campaign?.id, row: { name: form.get("name"), platform: form.get("platform"), objective: form.get("objective"), status: form.get("status"), approval: campaign?.approval ?? "pending", budgetCents: poundsToCents(form.get("budget")), spendCents: poundsToCents(form.get("spend")), impressions: Number(form.get("impressions") || 0), clicks: Number(form.get("clicks") || 0), leads: Number(form.get("leads") || 0), conversions: Number(form.get("conversions") || 0), revenueCents: poundsToCents(form.get("revenue")), startsAt: dateInputToTs(form.get("startsAt")), endsAt: dateInputToTs(form.get("endsAt")), notes: form.get("notes"), clientFeedback: campaign?.clientFeedback } });
  }
  const title = editor.kind === "settings" ? "Configure social and ads service" : `${editor.id ? "Edit" : "Add"} ${editor.kind}`;
  return <div className="fixed inset-0 z-[120] grid items-end bg-black/45 sm:items-center sm:p-5"><button type="button" aria-label="Close editor" className="absolute inset-0" onClick={onClose} /><form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="marketing-editor-heading" className="relative mx-auto grid max-h-[94dvh] w-full max-w-2xl gap-4 overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg"><header className="flex items-start justify-between gap-3 border-b border-black/10 pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-brand">Client marketing</p><h3 id="marketing-editor-heading" className="mt-1 text-xl font-semibold">{title}</h3></div><IconButton title="Close editor" onClick={onClose}><X size={16} /></IconButton></header>{editor.kind === "settings" ? <SettingsFields service={service} /> : editor.kind === "profile" ? <ProfileFields profile={profile} /> : editor.kind === "content" ? <ContentFields content={content} /> : <CampaignFields campaign={campaign} />}<footer className="flex justify-end border-t border-black/10 pt-4"><button disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white disabled:opacity-50"><Save size={14} />{busy ? "Saving..." : "Save"}</button></footer></form></div>;
}

function SettingsFields({ service }: { service: ClientMarketingService }) { return <><label className="inline-flex items-center gap-2 text-sm font-semibold"><input name="enabled" type="checkbox" defaultChecked={service.enabled} />Service active for this client</label><div className="grid gap-3 sm:grid-cols-3"><Select label="Status" name="status" value={service.status} options={["setup", "active", "paused", "complete"]} /><Select label="Currency" name="currency" value={service.currency} options={["gbp", "usd", "eur"]} /><Select label="Reporting" name="reportingCadence" value={service.reportingCadence} options={["weekly", "fortnightly", "monthly"]} /></div><Field label="Monthly media budget" name="monthlyBudget" type="number" value={String(service.monthlyBudgetCents / 100)} /><Field label="Primary goal" name="primaryGoal" value={service.primaryGoal} placeholder="Generate qualified enquiries at a sustainable cost" /><TextArea label="Target audience" name="audience" value={service.audience} placeholder="Who we are trying to reach, their intent and exclusions" /><label className="inline-flex items-center gap-2 text-sm font-semibold"><input name="approvalRequired" type="checkbox" defaultChecked={service.approvalRequired} />Require client approval before publishing or launch</label></>; }
function ProfileFields({ profile }: { profile?: ClientMarketingService["profiles"][number] }) { return <><div className="grid gap-3 sm:grid-cols-2"><Select label="Platform" name="platform" value={profile?.platform ?? "Instagram"} options={["Instagram", "Facebook", "LinkedIn", "TikTok", "YouTube", "X", "Pinterest", "Other"]} /><Select label="Access state" name="status" value={profile?.status ?? "planned"} options={["planned", "connected", "attention", "archived"]} /></div><Field label="Handle or account name" name="handle" value={profile?.handle} required placeholder="@clientbrand" /><Field label="Profile URL" name="url" type="url" value={profile?.url} /><Field label="Owner" name="owner" value={profile?.owner} placeholder="Ed, client contact or team member" /></>; }
function ContentFields({ content }: { content?: ClientMarketingService["content"][number] }) { return <><Field label="Content title" name="title" value={content?.title} required /><div className="grid gap-3 sm:grid-cols-3"><Select label="Platform" name="platform" value={content?.platform ?? "Instagram"} options={["Instagram", "Facebook", "LinkedIn", "TikTok", "YouTube", "Multi-channel"]} /><Select label="Format" name="format" value={content?.format ?? "Post"} options={["Post", "Carousel", "Reel", "Story", "Short video", "Long video", "Ad creative"]} /><Select label="Stage" name="status" value={content?.status ?? "idea"} options={["idea", "draft", "review", "approved", "scheduled", "published"]} /></div><Field label="Scheduled for" name="scheduledAt" type="datetime-local" value={dateTimeInput(content?.scheduledAt)} /><Field label="Published URL" name="publishedUrl" type="url" value={content?.publishedUrl} /><TextArea label="Brief and production notes" name="notes" value={content?.notes} /></>; }
function CampaignFields({ campaign }: { campaign?: ClientMarketingService["campaigns"][number] }) { return <><Field label="Campaign name" name="name" value={campaign?.name} required /><div className="grid gap-3 sm:grid-cols-3"><Select label="Platform" name="platform" value={campaign?.platform ?? "Meta Ads"} options={["Meta Ads", "Google Ads", "LinkedIn Ads", "TikTok Ads", "YouTube Ads", "Other"]} /><Select label="Status" name="status" value={campaign?.status ?? "draft"} options={["draft", "review", "scheduled", "active", "paused", "complete"]} /><Field label="Budget" name="budget" type="number" value={String((campaign?.budgetCents ?? 0) / 100)} /></div><Field label="Objective" name="objective" value={campaign?.objective} required /><div className="grid gap-3 sm:grid-cols-3"><Field label="Spend" name="spend" type="number" value={String((campaign?.spendCents ?? 0) / 100)} /><Field label="Impressions" name="impressions" type="number" value={String(campaign?.impressions ?? 0)} /><Field label="Clicks" name="clicks" type="number" value={String(campaign?.clicks ?? 0)} /><Field label="Leads" name="leads" type="number" value={String(campaign?.leads ?? 0)} /><Field label="Conversions" name="conversions" type="number" value={String(campaign?.conversions ?? 0)} /><Field label="Attributed revenue" name="revenue" type="number" value={String((campaign?.revenueCents ?? 0) / 100)} /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Starts" name="startsAt" type="datetime-local" value={dateTimeInput(campaign?.startsAt)} /><Field label="Ends" name="endsAt" type="datetime-local" value={dateTimeInput(campaign?.endsAt)} /></div><TextArea label="Brief, targeting and delivery notes" name="notes" value={campaign?.notes} /></>; }

function ReviewModal({ review, busy, onClose, onSave }: { review: Exclude<Review, null>; busy: boolean; onClose(): void; onSave(action: string, body: Record<string, unknown>): Promise<void> }) {
  const [feedback, setFeedback] = useState("");
  return <div className="fixed inset-0 z-[125] grid items-end bg-black/45 sm:items-center sm:p-5"><button type="button" aria-label="Close review" className="absolute inset-0" onClick={onClose} /><div role="dialog" aria-modal="true" className="relative mx-auto w-full max-w-lg rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg"><header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase text-brand">Client approval</p><h3 className="mt-1 text-xl font-semibold">{review.title}</h3></div><IconButton title="Close review" onClick={onClose}><X size={16} /></IconButton></header><label className="mt-5 grid gap-1 text-xs font-semibold text-black/55">Feedback<textarea value={feedback} onChange={event => setFeedback(event.target.value)} rows={4} className="rounded-md border border-black/15 p-3 text-sm" placeholder="Optional context or the exact changes required" /></label><footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-black/10 pt-4"><button type="button" disabled={busy} onClick={() => onSave(`review-${review.kind}`, { id: review.id, approval: "changes-requested", feedback })} className="min-h-10 rounded-md border border-amber-300 px-4 text-xs font-semibold text-amber-800">Request changes</button><button type="button" disabled={busy} onClick={() => onSave(`review-${review.kind}`, { id: review.id, approval: "approved", feedback })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-xs font-semibold text-white"><Check size={14} />Approve</button></footer></div></div>;
}

function Field({ label, name, value, type = "text", required = false, placeholder }: { label: string; name: string; value?: string; type?: string; required?: boolean; placeholder?: string }) { return <label className="grid gap-1 text-xs font-semibold text-black/55">{label}<input name={name} type={type} required={required} defaultValue={value ?? ""} placeholder={placeholder} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} className="min-h-11 rounded-md border border-black/15 px-3 text-sm font-normal text-black/80" /></label>; }
function TextArea({ label, name, value, placeholder }: { label: string; name: string; value?: string; placeholder?: string }) { return <label className="grid gap-1 text-xs font-semibold text-black/55">{label}<textarea name={name} defaultValue={value ?? ""} placeholder={placeholder} rows={4} className="rounded-md border border-black/15 p-3 text-sm font-normal text-black/80" /></label>; }
function Select({ label, name, value, options }: { label: string; name: string; value: string; options: string[] }) { return <label className="grid gap-1 text-xs font-semibold text-black/55">{label}<select name={name} defaultValue={value} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm font-normal capitalize text-black/80">{options.map(option => <option key={option} value={option}>{option.replaceAll("-", " ")}</option>)}</select></label>; }

function approvalLabel(value: ClientMarketingApproval): string { return value.replaceAll("-", " "); }
function money(cents: number, currency: ClientMarketingService["currency"]): string { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100); }
function percent(value: number): string { return new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value); }
function dateTime(value: number): string { return formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function dateTimeInput(value?: number): string { return localDateTimeInputValue(value); }
function dateInputToTs(value: FormDataEntryValue | null): number | undefined { const ts = value ? new Date(String(value)).getTime() : NaN; return Number.isFinite(ts) ? ts : undefined; }
function poundsToCents(value: FormDataEntryValue | null): number { const amount = Number(value || 0); return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0; }
