"use client";

import {
  Activity, CheckCircle2, Code2, ExternalLink, Eye, FileClock, GitBranch,
  Globe2, LoaderCircle, RadioTower, RefreshCw, Save, ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ClientTelemetrySummary } from "@/lib/clientTelemetry";
import type {
  AgencyWebsitePageStatus,
  AgencyWebsiteProject,
  AgencyWebsiteReleaseStatus,
} from "@/server/types";

const releaseOptions: Array<{ id: AgencyWebsiteReleaseStatus; label: string; detail: string }> = [
  { id: "gated", label: "Redesign gate", detail: "Public sees the current gated Milesymedia mini-site." },
  { id: "live", label: "Live", detail: "Public sees the complete current website." },
  { id: "maintenance", label: "Maintenance", detail: "Public sees planned-maintenance messaging." },
];

export function WebsiteWorkspace({
  initialWebsite,
  initialSummary,
  canManage,
}: {
  initialWebsite: AgencyWebsiteProject;
  initialSummary: ClientTelemetrySummary;
  canManage: boolean;
}) {
  const [website, setWebsite] = useState(initialWebsite);
  const [summary, setSummary] = useState(initialSummary);
  const [previewMode, setPreviewMode] = useState<"real" | "public">("real");
  const [previewRoute, setPreviewRoute] = useState("/");
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const realBuildUrl = website.productionUrl;
  const previewUrl = previewMode === "real"
    ? `${realBuildUrl}?v=${previewKey}`
    : `${previewRoute}${previewRoute.includes("?") ? "&" : "?"}preview=portal&v=${previewKey}`;
  const connected = Boolean(website.telemetryLastSeenAt);
  const recentEvents = useMemo(() => website.telemetryEvents.slice(0, 8), [website.telemetryEvents]);

  async function action(payload: Record<string, unknown>, label: string) {
    setBusy(String(payload.action ?? "save"));
    setNotice("");
    const response = await fetch("/api/portal/website", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; website?: AgencyWebsiteProject } | null;
    setBusy("");
    if (!response.ok || !result?.ok || !result.website) {
      setNotice(result?.error ?? "Website could not be updated.");
      return;
    }
    setWebsite(result.website);
    setSummary(summarize(result.website));
    setPreviewKey(value => value + 1);
    setNotice(label);
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await action({
      action: "update",
      gateHeadline: values.get("gateHeadline"),
      gateMessage: values.get("gateMessage"),
      maintenanceMessage: values.get("maintenanceMessage"),
      productionUrl: values.get("productionUrl"),
      previewUrl: values.get("previewUrl"),
      repositoryUrl: values.get("repositoryUrl"),
      localPath: values.get("localPath"),
    }, "Website settings saved.");
    setSettingsOpen(false);
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">First-party website</p>
            <span className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] font-semibold uppercase text-black/50">Ours</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">Milesymedia website control.</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">Preview the public experience, control releases and individual page updates, and prove monitoring works before using the same pattern for clients.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={website.previewUrl} target="_blank" rel="noreferrer" className={secondary}><Eye size={15} />Open local preview</a>
          <a href={realBuildUrl} target="_blank" rel="noreferrer" className={primary}><ExternalLink size={15} />Open official site</a>
        </div>
      </header>

      <section className="grid border-y border-black/10 md:grid-cols-4">
        <Metric label="Public mode" value={releaseLabel(website.status)} icon={<ShieldCheck size={16} />} />
        <Metric label="Tag" value={connected ? "Connected" : "Waiting"} icon={<RadioTower size={16} />} tone={connected ? "good" : "warn"} />
        <Metric label="Views today" value={String(summary.pageviews24h)} icon={<Activity size={16} />} />
        <Metric label="Errors today" value={String(summary.errors24h)} icon={<Code2 size={16} />} tone={summary.errors24h ? "bad" : "good"} />
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-black/85">Release mode</h2>
            <p className="mt-1 text-sm text-black/45">One deliberate public state. Private previews remain available in every mode.</p>
          </div>
          {notice ? <p role="status" className="text-xs font-medium text-brand">{notice}</p> : null}
        </div>
        <div className="mt-4 grid gap-2 lg:grid-cols-3">
          {releaseOptions.map(option => (
            <button
              key={option.id}
              type="button"
              disabled={!canManage || Boolean(busy)}
              onClick={() => void action({ action: "update", status: option.id }, `Public website set to ${option.label}.`)}
              className={`min-h-24 border p-4 text-left transition ${website.status === option.id ? "border-brand bg-brand/[0.055]" : "border-black/10 bg-white hover:bg-black/[0.02]"}`}
            >
              <span className="flex items-center justify-between gap-3">
                <strong className="text-sm text-black/80">{option.label}</strong>
                {website.status === option.id ? <CheckCircle2 size={16} className="text-brand" /> : null}
              </span>
              <span className="mt-2 block text-xs leading-5 text-black/45">{option.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden border border-black/10 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-md bg-black/[0.04] text-black/45"><Globe2 size={16} /></span>
            <div><h2 className="text-sm font-semibold text-black/80">Website preview</h2><p className="text-xs text-black/40">{previewMode === "real" ? "Official live website" : previewRoute}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-1">
              <button type="button" onClick={() => setPreviewMode("public")} className={`${previewMode === "public" ? "bg-white text-black shadow-sm" : "text-black/45"} min-h-8 rounded px-3 text-xs font-semibold`}>Public gate</button>
              <button type="button" onClick={() => setPreviewMode("real")} className={`${previewMode === "real" ? "bg-white text-black shadow-sm" : "text-black/45"} min-h-8 rounded px-3 text-xs font-semibold`}>Official site</button>
            </div>
            {previewMode === "public" ? (
              <select value={previewRoute} onChange={event => setPreviewRoute(event.target.value)} aria-label="Preview page" className={control}>
                {website.pages.map(page => <option value={page.route} key={page.route}>{page.label}</option>)}
              </select>
            ) : null}
            <button type="button" onClick={() => setPreviewKey(value => value + 1)} className={iconButton} aria-label="Refresh preview" title="Refresh preview"><RefreshCw size={15} /></button>
          </div>
        </header>
        <iframe key={`${previewMode}:${previewRoute}:${previewKey}`} title={`Milesymedia website ${previewMode === "real" ? "real build" : "public gate"}`} src={previewUrl} className="h-[680px] w-full bg-[#100c07]" />
      </section>

      <section className="grid gap-7 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-black/85">Pages</h2><p className="mt-1 text-sm text-black/45">Take one page aside without gating the whole website.</p></div>
            <span className="text-xs text-black/40">{website.pages.length} routes</span>
          </div>
          <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
            {website.pages.map(page => (
              <div key={page.route} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><strong className="text-sm text-black/75">{page.label}</strong><code className="text-[10px] text-black/35">{page.route}</code></div>
                  <p className="mt-1 text-xs text-black/45">{page.status === "updating" ? page.message || "Visitors see a focused update notice." : "Available to public visitors."}</p>
                </div>
                <select
                  value={page.status}
                  disabled={!canManage || Boolean(busy)}
                  aria-label={`${page.label} status`}
                  onChange={event => void action({ action: "page-status", route: page.route, pageStatus: event.target.value as AgencyWebsitePageStatus }, `${page.label} status updated.`)}
                  className={control}
                >
                  <option value="live">Live</option>
                  <option value="updating">Updating</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-black/85">Aqua tag</h2><p className="mt-1 text-sm text-black/45">Real signals from our own website.</p></div>
            <button type="button" disabled={!canManage || Boolean(busy)} onClick={() => void action({ action: "test-tag" }, "Test signal received.")} className={secondary}>
              {busy === "test-tag" ? <LoaderCircle size={15} className="animate-spin" /> : <RadioTower size={15} />}Test tag
            </button>
          </div>
          <div className="mt-3 border-y border-black/10">
            {recentEvents.length ? recentEvents.map(event => (
              <div key={event.id} className="flex items-start gap-3 border-b border-black/5 py-3 last:border-b-0">
                <span className={`mt-1 size-2 rounded-full ${event.type === "error" ? "bg-red-500" : event.type === "heartbeat" ? "bg-amber-500" : "bg-emerald-500"}`} />
                <div className="min-w-0 flex-1"><p className="text-xs font-medium capitalize text-black/65">{event.type}</p><p className="truncate text-[11px] text-black/40">{event.path || event.message || event.title || "Milesymedia website"}</p></div>
                <time className="text-[10px] text-black/35">{relativeTime(event.receivedAt)}</time>
              </div>
            )) : <p className="py-10 text-center text-sm text-black/40">Open the public site or run a tag test to receive the first signal.</p>}
          </div>
        </div>
      </section>

      <details open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)} className="border-t border-black/10 pt-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <span><strong className="text-sm text-black/75">Website settings</strong><small className="mt-1 block text-xs text-black/40">Repository, environments and public holding-page messages.</small></span>
          <span className="text-xl text-black/30">+</span>
        </summary>
        <form onSubmit={saveSettings} className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="productionUrl" label="Official production URL" defaultValue={website.productionUrl} />
            <Field name="previewUrl" label="Local or staging preview URL" defaultValue={website.previewUrl} />
            <Field name="repositoryUrl" label="GitHub repository" defaultValue={website.repositoryUrl} />
            <Field name="localPath" label="Website source" defaultValue={website.localPath} />
          </div>
          <Field name="gateHeadline" label="Gate label" defaultValue={website.gateHeadline} />
          <TextArea name="gateMessage" label="Redesign gate message" defaultValue={website.gateMessage} />
          <TextArea name="maintenanceMessage" label="Maintenance message" defaultValue={website.maintenanceMessage} />
          <div className="flex justify-end"><button disabled={!canManage || Boolean(busy)} className={primary}><Save size={15} />Save settings</button></div>
        </form>
      </details>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 text-xs text-black/40">
        <span className="inline-flex items-center gap-2"><GitBranch size={13} />{website.repositoryUrl.replace(/^https?:\/\//, "")}</span>
        <span className="inline-flex items-center gap-2"><FileClock size={13} />{website.localPath}</span>
      </footer>
    </div>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  const colour = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-black/65";
  return <div className="flex items-center gap-3 border-b border-black/10 px-4 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><span className={colour}>{icon}</span><div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className={`mt-1 text-sm font-semibold ${colour}`}>{value}</p></div></div>;
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return <label className="text-xs font-medium text-black/55">{label}<input name={name} defaultValue={defaultValue} className={`${control} mt-1 w-full`} /></label>;
}

function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return <label className="text-xs font-medium text-black/55">{label}<textarea name={name} defaultValue={defaultValue} rows={3} className={`${control} mt-1 w-full py-2`} /></label>;
}

function summarize(website: AgencyWebsiteProject): ClientTelemetrySummary {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1_000;
  const recent = website.telemetryEvents.filter(event => event.occurredAt >= dayAgo);
  const loads = recent.filter(event => event.type === "performance" && event.metric === "load" && typeof event.value === "number");
  return {
    pageviews24h: recent.filter(event => event.type === "pageview").length,
    errors24h: recent.filter(event => event.type === "error").length,
    deployments30d: website.telemetryEvents.filter(event => event.type === "deployment").length,
    averageLoadMs: loads.length ? Math.round(loads.reduce((sum, event) => sum + (event.value ?? 0), 0) / loads.length) : undefined,
    lastSeenAt: website.telemetryLastSeenAt,
  };
}

function releaseLabel(status: AgencyWebsiteReleaseStatus) {
  return status === "live" ? "Live" : status === "maintenance" ? "Maintenance" : "Redesign gate";
}

function relativeTime(value: number) {
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

const control = "min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm text-black/70 outline-none focus:border-brand";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-black/65 hover:bg-black/[0.03] disabled:opacity-50";
const iconButton = "grid size-10 place-items-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.03]";
