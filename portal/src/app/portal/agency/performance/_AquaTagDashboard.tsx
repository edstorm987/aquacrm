"use client";

// Aqua Tag ANALYTICS — what the tags have measured: views, conversions, search
// visibility. Lives under Performance because it is reporting, not setup.
//
// `agency/fulfilment/_AquaTagsWorkspace.tsx` is the OTHER Aqua Tag surface,
// where a site is registered and its key installed. Changing what a tag COLLECTS
// happens there; changing how it is REPORTED happens here.
//
// See docs/workspace/hazards-and-duplication.md.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  ExternalLink,
  FileBarChart,
  KeyRound,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import {
  isValidPerformanceReportMonth,
  isReportMutationPayload,
  normalizeReportWithdrawalReason,
  type ReportMutationPayload,
} from "@/lib/client/performanceReportMutationPayload";
import type { PublicIntegrationConnection } from "@/lib/integrations/types";
import type { MonthlyPerformanceReport } from "@/lib/performance/performanceReports";
import { GrowthPerformance, type PerformanceClient } from "./_PerformanceWorkspace";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

type Period = 7 | 28 | 90;
type ReportMutationAction = "generate" | "publish" | "withdraw" | "delete";
type ReportMutationBusyState = { action: ReportMutationAction; reportId?: string };

export function AquaTagDashboard({
  client,
  period,
  canManageSearchConsole,
  beginReportMutation,
  onReportsChange,
}: {
  client: PerformanceClient;
  period: Period;
  canManageSearchConsole: boolean;
  beginReportMutation: () => number;
  onReportsChange: (reports: MonthlyPerformanceReport[], sequence: number) => void;
}) {
  const [propertyId, setPropertyId] = useState("all");
  const selectedProperty = client.properties.find(property => property.id === propertyId);
  const analytics = selectedProperty?.analyticsByPeriod[String(period) as "7" | "28" | "90"]
    ?? client.analyticsByPeriod[String(period) as "7" | "28" | "90"];
  const connectedProperties = client.properties.filter(property => property.lastSeenAt || property.tagStatus === "installed").length;

  return (
    <div className="flex flex-col gap-7">
      <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <div className="flex flex-col gap-5 border-b border-black/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black text-white"><Activity size={17} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-black/85">{client.name} web properties</h2><span className="rounded border border-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-black/45">Aqua Tag</span></div>
              <p className="mt-1 text-sm leading-6 text-black/50">Choose a website or see the combined picture across every connected property.</p>
            </div>
          </div>
          <select value={propertyId} onChange={event => setPropertyId(event.target.value)} aria-label="Choose website property" className="min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/75 sm:w-72">
            <option value="all">All web properties</option>
            {client.properties.map(property => <option key={property.id} value={property.id}>{property.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-black/10 sm:grid-cols-4 sm:divide-y-0">
          <StatusMetric label="Tag coverage" value={`${connectedProperties}/${client.properties.length}`} detail="properties reporting" good={connectedProperties > 0} />
          <StatusMetric label="Last signal" value={selectedProperty?.lastSeenAt ? relativeTime(selectedProperty.lastSeenAt) : client.lastSeenAt ? relativeTime(client.lastSeenAt) : "Waiting"} detail="first-party activity" good={Boolean(selectedProperty?.lastSeenAt || client.lastSeenAt)} />
          <StatusMetric label="Forms" value={String(analytics.current.conversions)} detail={`tracked in ${period} days`} good={analytics.current.conversions > 0} />
          <StatusMetric label="Search data" value={analytics.current.searchImpressions ? "Connected" : "Not synced"} detail={analytics.current.searchImpressions ? `${analytics.current.searchImpressions.toLocaleString("en-GB")} impressions` : canManageSearchConsole ? "connect below" : "owner or manager setup"} good={analytics.current.searchImpressions > 0} />
        </div>
      </section>

      <GrowthPerformance analytics={analytics} />

      {canManageSearchConsole ? <SearchConsolePanel client={client} /> : <SearchConsoleReadOnlyPanel />}

      {client.scope === "client" ? (
        <MonthlyReportsPanel
          client={client}
          selectedPropertyId={propertyId === "all" ? undefined : propertyId}
          beginReportMutation={beginReportMutation}
          onReportsChange={onReportsChange}
        />
      ) : (
        <section className="rounded-lg border border-black/10 bg-black/[0.025] p-5 sm:p-6">
          <div className="flex items-start gap-3"><FileBarChart className="mt-0.5 text-brand" size={19} /><div><h2 className="font-semibold text-black/80">Client reports live with each client</h2><p className="mt-1 text-sm leading-6 text-black/50">Choose a client above to generate, review and publish their monthly report into their private portal.</p></div></div>
        </section>
      )}
    </div>
  );
}

function SearchConsoleReadOnlyPanel() {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#eef6f4] text-[#17675f]"><Search size={17} /></span>
        <div>
          <h2 className="font-semibold text-black/85">Google Search Console</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Search performance remains available in the reporting above. An agency owner or manager can connect, sync or manage the encrypted Google credentials.</p>
        </div>
      </div>
    </section>
  );
}

function SearchConsolePanel({ client }: { client: PerformanceClient }) {
  const [connections, setConnections] = useState<PublicIntegrationConnection[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const scopedConnections = useMemo(() => connections.filter(connection => connection.provider === "google-search-console" && (!connection.clientId || connection.clientId === client.id)), [client.id, connections]);

  const loadConnections = useCallback(async (signal?: AbortSignal) => {
    setBusyId("load");
    setLoadState("loading");
    setMessage(undefined);
    try {
      const payload = await checkedJsonMutation<{ ok?: boolean; connections?: PublicIntegrationConnection[] }>(
        "/api/portal/settings/integrations",
        { method: "GET", cache: "no-store", signal },
        {
          fallback: "Search Console connections could not be loaded.",
          validate: value => value.ok === true && Array.isArray(value.connections),
        },
      );
      if (signal?.aborted) return;
      setConnections(payload.connections ?? []);
      setLoadState("ready");
    } catch (nextError) {
      if (!signal?.aborted) {
        setLoadState("error");
        setMessage(mutationErrorMessage(nextError, "Search Console connections could not be loaded."));
      }
    } finally {
      if (!signal?.aborted) setBusyId(undefined);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadConnections(controller.signal);
    return () => controller.abort();
  }, [client.id, loadConnections]);

  async function sync(connection: PublicIntegrationConnection) {
    setBusyId(connection.id);
    setMessage(undefined);
    try {
      const payload = await checkedJsonMutation<{ ok?: boolean; count?: number; connection?: PublicIntegrationConnection }>(
        "/api/portal/performance/search-console",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ connectionId: connection.id, clientId: client.id }),
        },
        {
          fallback: "Search Console could not be synced.",
          validate: value => value.ok === true && Boolean(value.connection),
        },
      );
      const nextConnection = payload.connection!;
      setConnections(current => current.map(item => item.id === nextConnection.id ? nextConnection : item));
      setMessage(`Synced ${payload.count ?? 0} search rows. Refresh this page to see the updated charts.`);
    } catch (nextError) {
      setMessage(mutationErrorMessage(nextError, "Search Console could not be synced."));
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white">
      <div className="flex flex-col gap-4 border-b border-black/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#eef6f4] text-[#17675f]"><Search size={17} /></span><div><h2 className="font-semibold text-black/85">Google Search Console</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Pull clicks, impressions, queries and landing pages server-side, then merge them with the matching Aqua property. Google credentials never enter the public tag.</p></div></div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {loadState === "loading" ? <span className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-medium text-black/45"><RefreshCw size={14} className="animate-spin" />Checking connection</span> : null}
          {loadState === "error" ? <button type="button" onClick={() => void loadConnections()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800"><RefreshCw size={14} />Retry connection check</button> : null}
          <button type="button" onClick={() => setConnecting(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><KeyRound size={15} />Connect</button>
        </div>
      </div>
      {message ? <p role={loadState === "error" ? "alert" : "status"} className="border-b border-black/10 bg-black/[0.025] px-5 py-3 text-sm text-black/65 sm:px-6">{message}</p> : null}
      {loadState === "ready" ? (scopedConnections.length ? <div className="divide-y divide-black/10">{scopedConnections.map(connection => (
        <div key={connection.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-black/80">{connection.label}</p><ConnectionStatus connection={connection} /></div><p className="mt-1 truncate text-xs text-black/45">{connection.config.siteUrl || "Property not named"} · Aqua property {connection.config.propertyId || "not mapped"}</p><p className="mt-1 text-xs text-black/40">Last sync: {connection.config.lastSyncAt ? relativeTime(Number(connection.config.lastSyncAt)) : "Never"}</p></div>
          <button type="button" onClick={() => void sync(connection)} disabled={busyId === connection.id} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/15 px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]"><RefreshCw size={14} className={busyId === connection.id ? "animate-spin" : ""} />{busyId === connection.id ? "Syncing..." : "Sync 90 days"}</button>
        </div>
      ))}</div> : <div className="p-8 text-center"><p className="font-semibold text-black/70">No Search Console connection for this account</p><p className="mt-1 text-sm text-black/45">Connect the exact Google property and map it to an Aqua property.</p></div>) : loadState === "error" ? <div className="p-6 text-sm text-red-700">Connection status is unavailable. Retry the check; no empty-state assumption was made.</div> : <div className="p-6 text-sm text-black/45">Checking the current search setup...</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-4 text-xs text-black/45 sm:px-6"><span className="inline-flex items-center gap-2"><ShieldCheck size={14} />Encrypted credentials · read-only Google scope</span><Link href="/portal/agency/company?view=connections" className="inline-flex min-h-6 items-center gap-1 font-semibold text-black/60 hover:text-black">Manage all connections <ExternalLink size={12} /></Link></div>
      {connecting ? <SearchConsoleModal client={client} onClose={() => setConnecting(false)} onSaved={next => { setConnections(next); setLoadState("ready"); setConnecting(false); setMessage("Search Console connection saved. Test or sync it when ready."); }} /> : null}
    </section>
  );
}

function SearchConsoleModal({ client, onClose, onSaved }: { client: PerformanceClient; onClose: () => void; onSaved: (connections: PublicIntegrationConnection[]) => void }) {
  const [busy, setBusy] = useState(false);
  // Modal keyboard contract: focus enters the dialog, Tab stays inside it, Escape backs out (except mid-save), focus returns to the control that opened it.
  const dialogRef = useRef<HTMLFormElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onClose });
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const payload = await checkedJsonMutation<{ ok?: boolean; connections?: PublicIntegrationConnection[] }>(
        "/api/portal/settings/integrations",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "save",
            provider: "google-search-console",
            label: data.get("label"),
            clientId: client.scope === "client" ? client.id : undefined,
            values: {
              siteUrl: data.get("siteUrl"),
              propertyId: data.get("propertyId"),
              serviceAccountJson: data.get("serviceAccountJson"),
            },
          }),
        },
        {
          fallback: "Connection could not be saved.",
          validate: value => value.ok === true && Array.isArray(value.connections),
        },
      );
      onSaved(payload.connections ?? []);
    } catch (nextError) {
      setError(mutationErrorMessage(nextError, "Connection could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation"><form onSubmit={submit} role="dialog" ref={dialogRef} aria-modal="true" aria-labelledby="search-console-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg border border-black/10 bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-brand">Organic search</p><h2 id="search-console-title" className="mt-1 text-xl font-semibold">Connect Search Console</h2><p className="mt-2 text-sm leading-6 text-black/50">Create a Google service account, add its email as a user on the Search Console property, then paste the downloaded JSON key below.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-black/[0.04]"><X size={17} /></button></div><div className="mt-5 grid gap-4"><Field label="Connection name"><input name="label" required defaultValue={`${client.name} Search Console`} className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></Field><Field label="Exact Search Console property" help="For a domain property use sc-domain:example.com"><input name="siteUrl" required className="min-h-11 rounded-md border border-black/15 px-3 text-sm" placeholder="sc-domain:example.com" /></Field><Field label="Matching Aqua property"><select name="propertyId" required className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="">Choose property</option>{client.properties.map(property => <option key={property.id} value={property.id}>{property.label} · {property.id}</option>)}</select></Field><Field label="Service account JSON" help="Stored encrypted in the integration vault and never returned to the browser."><textarea name="serviceAccountJson" required rows={7} spellCheck={false} className="rounded-md border border-black/15 px-3 py-2 font-mono text-xs" placeholder={'{"type":"service_account", ...}'} /></Field>{error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}</div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm font-medium">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save connection"}</button></div></form></div>;
}

function MonthlyReportsPanel({
  client,
  selectedPropertyId,
  beginReportMutation,
  onReportsChange,
}: {
  client: PerformanceClient;
  selectedPropertyId?: string;
  beginReportMutation: () => number;
  onReportsChange: (reports: MonthlyPerformanceReport[], sequence: number) => void;
}) {
  const [month, setMonth] = useState(previousMonth());
  const [busy, setBusy] = useState<ReportMutationBusyState>();
  const busyRef = useRef(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string }>();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const reportMonthValid = isValidPerformanceReportMonth(month, currentMonth);
  const isGenerating = busy?.action === "generate";

  async function action(actionName: ReportMutationAction, reportId?: string, withdrawalReason?: string) {
    if (busyRef.current) return;
    const normalizedWithdrawalReason = actionName === "withdraw"
      ? normalizeReportWithdrawalReason(withdrawalReason)
      : undefined;
    if (actionName === "generate" && !isValidPerformanceReportMonth(month, currentMonth)) {
      setFeedback({ tone: "error", message: "Choose a valid current or past report month." });
      return;
    }
    if (actionName === "withdraw" && !normalizedWithdrawalReason) {
      setFeedback({ tone: "error", message: "Add a reason for withdrawing this report." });
      return;
    }
    busyRef.current = true;
    setBusy({ action: actionName, reportId });
    setFeedback(undefined);
    const fallback = actionName === "generate" ? "The report draft could not be generated."
      : actionName === "publish" ? "The report could not be published."
        : actionName === "withdraw" ? "The report could not be withdrawn."
          : "The report draft could not be deleted.";
    try {
      const sequence = beginReportMutation();
      const payload = await checkedJsonMutation<ReportMutationPayload>(
        "/api/portal/performance/reports",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: actionName,
            clientId: client.id,
            reportId,
            propertyId: actionName === "generate" ? selectedPropertyId : undefined,
            month,
            withdrawalReason: normalizedWithdrawalReason,
          }),
        },
        {
          fallback,
          validate: value => isReportMutationPayload(value, {
            action: actionName,
            clientId: client.id,
            reportId,
            month,
            propertyId: actionName === "generate" ? selectedPropertyId : undefined,
            withdrawalReason: normalizedWithdrawalReason,
          }),
        },
      );
      const next = payload.reports;
      onReportsChange(next, sequence);
      setFeedback({
        tone: "success",
        message: actionName === "generate" ? "A new draft revision was generated from the selected month." : actionName === "publish" ? "Report published in the client portal." : actionName === "withdraw" ? "Report withdrawn from the client portal; its history was retained." : "Draft deleted.",
      });
    } catch (error) {
      setFeedback({ tone: "error", message: mutationErrorMessage(error, fallback) });
    } finally {
      busyRef.current = false;
      setBusy(undefined);
    }
  }

  function deleteDraft(report: MonthlyPerformanceReport) {
    if (window.confirm(`Delete draft revision ${report.revision} of ${report.label}? This cannot be undone.`)) void action("delete", report.id);
  }

  function withdraw(report: MonthlyPerformanceReport) {
    const reason = window.prompt(`Why is ${report.label} revision ${report.revision} being withdrawn from the client portal?`);
    if (reason?.trim()) void action("withdraw", report.id, reason);
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white">
      <div className="flex flex-col gap-4 border-b border-black/10 p-5 lg:flex-row lg:items-end lg:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#f6f1e8] text-[#7c6032]"><FileBarChart size={18} /></span>
          <div>
            <h2 className="font-semibold text-black/85">Monthly client reports</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Generate a factual draft, check it, then publish it into {client.name}&apos;s Results area. Published revisions stay in the audit history.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="grid gap-1 text-[10px] font-semibold uppercase text-black/45">
            Report month
            <input
              type="month"
              value={month}
              max={currentMonth}
              required
              aria-invalid={!reportMonthValid}
              onChange={event => setMonth(event.target.value)}
              disabled={Boolean(busy)}
              className="min-h-10 rounded-md border border-black/15 px-3 text-sm font-medium normal-case disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={() => void action("generate")}
            disabled={Boolean(busy) || !reportMonthValid}
            aria-busy={isGenerating}
            className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? <MutationSpinner size={15} /> : <CalendarDays size={15} aria-hidden="true" />}
            {isGenerating ? "Generating..." : "Generate draft"}
          </button>
        </div>
      </div>
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`border-b border-black/10 px-5 py-3 text-sm sm:px-6 ${feedback.tone === "error" ? "bg-red-50 text-red-700" : "bg-black/[0.025] text-black/60"}`}>{feedback.message}</p> : null}
      {client.reports.length ? (
        <div className="divide-y divide-black/10">
          {client.reports.map(report => (
            <ReportRow
              key={report.id}
              report={report}
              propertyLabel={client.properties.find(item => item.id === report.propertyId)?.label}
              busy={Boolean(busy)}
              busyAction={busy?.reportId === report.id && busy.action !== "generate" ? busy.action : undefined}
              onPublish={() => void action("publish", report.id)}
              onWithdraw={() => withdraw(report)}
              onDelete={() => deleteDraft(report)}
            />
          ))}
        </div>
      ) : <div className="p-9 text-center"><FileBarChart className="mx-auto text-black/20" /><p className="mt-3 font-semibold text-black/70">No monthly reports yet</p><p className="mt-1 text-sm text-black/45">Generate the first draft when the reporting month is ready.</p></div>}
    </section>
  );
}

function ReportRow({ report, propertyLabel, busy, busyAction, onPublish, onWithdraw, onDelete }: { report: MonthlyPerformanceReport; propertyLabel?: string; busy: boolean; busyAction?: Exclude<ReportMutationAction, "generate">; onPublish: () => void; onWithdraw: () => void; onDelete: () => void }) {
  const statusTone = report.status === "published" ? "bg-emerald-50 text-emerald-700" : report.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-black/[0.05] text-black/45";
  const isPublishing = busyAction === "publish";
  const isWithdrawing = busyAction === "withdraw";
  const isDeleting = busyAction === "delete";
  return <div className="p-5 sm:p-6" aria-busy={Boolean(busyAction)}><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-black/80">{report.label}</p><span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone}`}>{report.status}</span><span className="text-[10px] font-medium text-black/35">revision {report.revision}</span></div><p className="mt-1 text-xs text-black/42">{propertyLabel || "All properties"} · generated {formatUkDate(report.generatedAt, { dateStyle: "medium" })}</p></div><div className="grid grid-cols-3 gap-4 text-center lg:min-w-80"><ReportMetric label="Views" value={report.analytics.current.views} /><ReportMetric label="Enquiries" value={report.analytics.current.conversions} /><ReportMetric label="Search clicks" value={report.analytics.current.searchClicks} /></div><div className="flex gap-2">{report.status === "draft" ? <><button type="button" onClick={onPublish} disabled={busy} aria-busy={isPublishing} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isPublishing ? <MutationSpinner /> : <Send size={14} aria-hidden="true" />}{isPublishing ? "Publishing..." : "Publish"}</button><button type="button" onClick={onDelete} disabled={busy} aria-busy={isDeleting} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm text-black/50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50">{isDeleting ? <MutationSpinner /> : null}{isDeleting ? "Deleting..." : "Delete draft"}</button></> : report.status === "published" ? <><span className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-semibold text-emerald-700"><Check size={14} />In portal</span><button type="button" onClick={onWithdraw} disabled={busy} aria-busy={isWithdrawing} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm text-black/50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50">{isWithdrawing ? <MutationSpinner /> : null}{isWithdrawing ? "Withdrawing..." : "Withdraw"}</button></> : <span className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-black/40">History retained</span>}</div></div><details className="mt-4 border-t border-black/8 pt-4"><summary className="cursor-pointer text-sm font-semibold text-black/60">Preview report summary</summary><div className="mt-4 grid gap-5 md:grid-cols-2"><ReportList title="Highlights" rows={report.highlights} /><ReportList title="Next steps" rows={report.nextSteps} /></div></details></div>;
}

function MutationSpinner({ size = 14 }: { size?: number }) { return <span className="inline-flex animate-spin" aria-hidden="true"><RefreshCw size={size} /></span>; }

function StatusMetric({ label, value, detail, good }: { label: string; value: string; detail: string; good?: boolean }) { return <div className="min-h-24 p-4 sm:p-5"><p className="text-[10px] font-semibold uppercase text-black/40">{label}</p><p className={`mt-2 text-lg font-semibold ${good ? "text-emerald-700" : "text-black/75"}`}>{value}</p><p className="mt-1 text-xs text-black/40">{detail}</p></div>; }
function ConnectionStatus({ connection }: { connection: PublicIntegrationConnection }) { const connected = connection.status === "connected"; return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${connected ? "bg-emerald-50 text-emerald-700" : connection.status === "needs-attention" ? "bg-red-50 text-red-700" : "bg-black/[0.05] text-black/50"}`}>{connected ? <Check size={10} /> : null}{connection.status.replace("-", " ")}</span>; }
function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs font-semibold text-black/70">{label}{children}{help ? <span className="font-normal leading-5 text-black/40">{help}</span> : null}</label>; }
function ReportMetric({ label, value }: { label: string; value: number }) { return <div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 font-semibold tabular-nums text-black/75">{value.toLocaleString("en-GB")}</p></div>; }
function ReportList({ title, rows }: { title: string; rows: string[] }) { return <div><h3 className="text-xs font-semibold uppercase text-black/40">{title}</h3><ul className="mt-2 space-y-2">{rows.map(row => <li key={row} className="text-sm leading-6 text-black/58">{row}</li>)}</ul></div>; }
function previousMonth() { const value = new Date(); value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() - 1); return value.toISOString().slice(0, 7); }
function relativeTime(value: number) { const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000)); return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`; }
