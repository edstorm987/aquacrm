"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

import type { PublicIntegrationConnection } from "@/lib/integrations/types";
import type { MonthlyPerformanceReport } from "@/lib/performanceReports";
import { GrowthPerformance, type PerformanceClient } from "./_PerformanceWorkspace";

type Period = 7 | 28 | 90;

export function AquaTagDashboard({
  client,
  period,
  onReportsChange,
}: {
  client: PerformanceClient;
  period: Period;
  onReportsChange: (reports: MonthlyPerformanceReport[]) => void;
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
          <StatusMetric label="Search data" value={analytics.current.searchImpressions ? "Connected" : "Not synced"} detail={analytics.current.searchImpressions ? `${analytics.current.searchImpressions.toLocaleString("en-GB")} impressions` : "connect below"} good={analytics.current.searchImpressions > 0} />
        </div>
      </section>

      <GrowthPerformance analytics={analytics} />

      <SearchConsolePanel client={client} />

      {client.scope === "client" ? (
        <MonthlyReportsPanel
          client={client}
          selectedPropertyId={propertyId === "all" ? undefined : propertyId}
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

function SearchConsolePanel({ client }: { client: PerformanceClient }) {
  const [connections, setConnections] = useState<PublicIntegrationConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const scopedConnections = useMemo(() => connections.filter(connection => connection.provider === "google-search-console" && (!connection.clientId || connection.clientId === client.id)), [client.id, connections]);

  useEffect(() => {
    let active = true;

    async function loadConnections() {
      setBusyId("load");
      setLoaded(false);
      setMessage(undefined);
      const response = await fetch("/api/portal/settings/integrations", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { connections?: PublicIntegrationConnection[]; error?: string } | null;
      if (!active) return;
      if (response.ok) setConnections(payload?.connections ?? []);
      else setMessage(payload?.error || "Connections could not be loaded.");
      setLoaded(true);
      setBusyId(undefined);
    }

    void loadConnections();
    return () => { active = false; };
  }, [client.id]);

  async function sync(connection: PublicIntegrationConnection) {
    setBusyId(connection.id);
    setMessage(undefined);
    const response = await fetch("/api/portal/performance/search-console", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: connection.id, clientId: client.id }),
    });
    const payload = await response.json().catch(() => null) as { count?: number; connection?: PublicIntegrationConnection; error?: string } | null;
    if (response.ok && payload?.connection) {
      setConnections(current => current.map(item => item.id === payload.connection?.id ? payload.connection as PublicIntegrationConnection : item));
      setMessage(`Synced ${payload.count ?? 0} search rows. Refresh this page to see the updated charts.`);
    } else setMessage(payload?.error || "Search Console could not be synced.");
    setBusyId(undefined);
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white">
      <div className="flex flex-col gap-4 border-b border-black/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#eef6f4] text-[#17675f]"><Search size={17} /></span><div><h2 className="font-semibold text-black/85">Google Search Console</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Pull clicks, impressions, queries and landing pages server-side, then merge them with the matching Aqua property. Google credentials never enter the public tag.</p></div></div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!loaded ? <span className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-medium text-black/45"><RefreshCw size={14} className="animate-spin" />Checking connection</span> : null}
          <button type="button" onClick={() => setConnecting(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><KeyRound size={15} />Connect</button>
        </div>
      </div>
      {message ? <p className="border-b border-black/10 bg-black/[0.025] px-5 py-3 text-sm text-black/65 sm:px-6">{message}</p> : null}
      {loaded ? (scopedConnections.length ? <div className="divide-y divide-black/10">{scopedConnections.map(connection => (
        <div key={connection.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-black/80">{connection.label}</p><ConnectionStatus connection={connection} /></div><p className="mt-1 truncate text-xs text-black/45">{connection.config.siteUrl || "Property not named"} · Aqua property {connection.config.propertyId || "not mapped"}</p><p className="mt-1 text-xs text-black/40">Last sync: {connection.config.lastSyncAt ? relativeTime(Number(connection.config.lastSyncAt)) : "Never"}</p></div>
          <button type="button" onClick={() => void sync(connection)} disabled={busyId === connection.id} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/15 px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]"><RefreshCw size={14} className={busyId === connection.id ? "animate-spin" : ""} />{busyId === connection.id ? "Syncing..." : "Sync 90 days"}</button>
        </div>
      ))}</div> : <div className="p-8 text-center"><p className="font-semibold text-black/70">No Search Console connection for this account</p><p className="mt-1 text-sm text-black/45">Connect the exact Google property and map it to an Aqua property.</p></div>) : <div className="p-6 text-sm text-black/45">Checking the current search setup...</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-4 text-xs text-black/45 sm:px-6"><span className="inline-flex items-center gap-2"><ShieldCheck size={14} />Encrypted credentials · read-only Google scope</span><Link href="/portal/agency/settings?tab=integrations" className="inline-flex items-center gap-1 font-semibold text-black/60 hover:text-black">Manage all integrations <ExternalLink size={12} /></Link></div>
      {connecting ? <SearchConsoleModal client={client} onClose={() => setConnecting(false)} onSaved={next => { setConnections(next); setLoaded(true); setConnecting(false); setMessage("Search Console connection saved. Test or sync it when ready."); }} /> : null}
    </section>
  );
}

function SearchConsoleModal({ client, onClose, onSaved }: { client: PerformanceClient; onClose: () => void; onSaved: (connections: PublicIntegrationConnection[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/portal/settings/integrations", {
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
    });
    const payload = await response.json().catch(() => null) as { connections?: PublicIntegrationConnection[]; error?: string } | null;
    if (response.ok) onSaved(payload?.connections ?? []);
    else setError(payload?.error || "Connection could not be saved.");
    setBusy(false);
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation"><form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="search-console-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg border border-black/10 bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-brand">Organic search</p><h2 id="search-console-title" className="mt-1 text-xl font-semibold">Connect Search Console</h2><p className="mt-2 text-sm leading-6 text-black/50">Create a Google service account, add its email as a user on the Search Console property, then paste the downloaded JSON key below.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-black/[0.04]"><X size={17} /></button></div><div className="mt-5 grid gap-4"><Field label="Connection name"><input name="label" required defaultValue={`${client.name} Search Console`} className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></Field><Field label="Exact Search Console property" help="For a domain property use sc-domain:example.com"><input name="siteUrl" required className="min-h-11 rounded-md border border-black/15 px-3 text-sm" placeholder="sc-domain:example.com" /></Field><Field label="Matching Aqua property"><select name="propertyId" required className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="">Choose property</option>{client.properties.map(property => <option key={property.id} value={property.id}>{property.label} · {property.id}</option>)}</select></Field><Field label="Service account JSON" help="Stored encrypted in the integration vault and never returned to the browser."><textarea name="serviceAccountJson" required rows={7} spellCheck={false} className="rounded-md border border-black/15 px-3 py-2 font-mono text-xs" placeholder={'{"type":"service_account", ...}'} /></Field>{error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}</div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm font-medium">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save connection"}</button></div></form></div>;
}

function MonthlyReportsPanel({ client, selectedPropertyId, onReportsChange }: { client: PerformanceClient; selectedPropertyId?: string; onReportsChange: (reports: MonthlyPerformanceReport[]) => void }) {
  const [reports, setReports] = useState(client.reports);
  const [month, setMonth] = useState(previousMonth());
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function action(actionName: "generate" | "publish" | "delete", reportId?: string) {
    setBusy(reportId || actionName);
    setMessage(undefined);
    const response = await fetch("/api/portal/performance/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: actionName, clientId: client.id, reportId, propertyId: actionName === "generate" ? selectedPropertyId : undefined, month }) });
    const payload = await response.json().catch(() => null) as { reports?: MonthlyPerformanceReport[]; error?: string } | null;
    if (response.ok) {
      const next = payload?.reports ?? [];
      setReports(next);
      onReportsChange(next);
      setMessage(actionName === "generate" ? "Draft generated from the selected month." : actionName === "publish" ? "Report published in the client portal." : "Report deleted.");
    } else setMessage(payload?.error || "The report could not be updated.");
    setBusy(undefined);
  }

  return <section className="rounded-lg border border-black/10 bg-white"><div className="flex flex-col gap-4 border-b border-black/10 p-5 lg:flex-row lg:items-end lg:justify-between sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#f6f1e8] text-[#7c6032]"><FileBarChart size={18} /></span><div><h2 className="font-semibold text-black/85">Monthly client reports</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Generate a factual draft, check it, then publish it into {client.name}&apos;s Results area.</p></div></div><div className="flex flex-col gap-2 sm:flex-row"><label className="grid gap-1 text-[10px] font-semibold uppercase text-black/45">Report month<input type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={event => setMonth(event.target.value)} className="min-h-10 rounded-md border border-black/15 px-3 text-sm font-medium normal-case" /></label><button type="button" onClick={() => void action("generate")} disabled={Boolean(busy)} className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"><CalendarDays size={15} />{busy === "generate" ? "Generating..." : "Generate draft"}</button></div></div>{message ? <p className="border-b border-black/10 bg-black/[0.025] px-5 py-3 text-sm text-black/60 sm:px-6">{message}</p> : null}{reports.length ? <div className="divide-y divide-black/10">{reports.map(report => <ReportRow key={report.id} report={report} propertyLabel={client.properties.find(item => item.id === report.propertyId)?.label} busy={busy === report.id} onPublish={() => void action("publish", report.id)} onDelete={() => void action("delete", report.id)} />)}</div> : <div className="p-9 text-center"><FileBarChart className="mx-auto text-black/20" /><p className="mt-3 font-semibold text-black/70">No monthly reports yet</p><p className="mt-1 text-sm text-black/45">Generate the first draft when the reporting month is ready.</p></div>}</section>;
}

function ReportRow({ report, propertyLabel, busy, onPublish, onDelete }: { report: MonthlyPerformanceReport; propertyLabel?: string; busy: boolean; onPublish: () => void; onDelete: () => void }) {
  return <div className="p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-black/80">{report.label}</p><span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${report.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{report.status}</span></div><p className="mt-1 text-xs text-black/42">{propertyLabel || "All properties"} · generated {new Date(report.generatedAt).toLocaleDateString("en-GB")}</p></div><div className="grid grid-cols-3 gap-4 text-center lg:min-w-80"><ReportMetric label="Views" value={report.analytics.current.views} /><ReportMetric label="Enquiries" value={report.analytics.current.conversions} /><ReportMetric label="Search clicks" value={report.analytics.current.searchClicks} /></div><div className="flex gap-2">{report.status === "draft" ? <button type="button" onClick={onPublish} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Send size={14} />Publish</button> : <span className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-semibold text-emerald-700"><Check size={14} />In portal</span>}<button type="button" onClick={onDelete} disabled={busy} className="min-h-10 rounded-md border border-black/10 px-3 text-sm text-black/50 hover:text-red-700">Delete</button></div></div><details className="mt-4 border-t border-black/8 pt-4"><summary className="cursor-pointer text-sm font-semibold text-black/60">Preview report summary</summary><div className="mt-4 grid gap-5 md:grid-cols-2"><ReportList title="Highlights" rows={report.highlights} /><ReportList title="Next steps" rows={report.nextSteps} /></div></details></div>;
}

function StatusMetric({ label, value, detail, good }: { label: string; value: string; detail: string; good?: boolean }) { return <div className="min-h-24 p-4 sm:p-5"><p className="text-[10px] font-semibold uppercase text-black/40">{label}</p><p className={`mt-2 text-lg font-semibold ${good ? "text-emerald-700" : "text-black/75"}`}>{value}</p><p className="mt-1 text-xs text-black/40">{detail}</p></div>; }
function ConnectionStatus({ connection }: { connection: PublicIntegrationConnection }) { const connected = connection.status === "connected"; return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${connected ? "bg-emerald-50 text-emerald-700" : connection.status === "needs-attention" ? "bg-red-50 text-red-700" : "bg-black/[0.05] text-black/50"}`}>{connected ? <Check size={10} /> : null}{connection.status.replace("-", " ")}</span>; }
function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs font-semibold text-black/70">{label}{children}{help ? <span className="font-normal leading-5 text-black/40">{help}</span> : null}</label>; }
function ReportMetric({ label, value }: { label: string; value: number }) { return <div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 font-semibold tabular-nums text-black/75">{value.toLocaleString("en-GB")}</p></div>; }
function ReportList({ title, rows }: { title: string; rows: string[] }) { return <div><h3 className="text-xs font-semibold uppercase text-black/40">{title}</h3><ul className="mt-2 space-y-2">{rows.map(row => <li key={row} className="text-sm leading-6 text-black/58">{row}</li>)}</ul></div>; }
function previousMonth() { const value = new Date(); value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() - 1); return value.toISOString().slice(0, 7); }
function relativeTime(value: number) { const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000)); return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`; }
