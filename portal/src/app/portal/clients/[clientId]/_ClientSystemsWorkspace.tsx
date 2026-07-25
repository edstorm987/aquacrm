"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  CircleDot,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Gauge,
  GitBranch,
  Globe2,
  RefreshCw,
  Rocket,
  Server,
} from "lucide-react";
import {
  summarizeClientTelemetry,
  type ClientTelemetryEvent,
  type ClientTelemetrySnapshot,
} from "@/lib/clientTelemetry";

interface SystemProperty {
  id: string;
  label: string;
  kind: "website" | "client-portal" | "dev-portal" | "repo" | "template" | "tag";
  status: "planning" | "building" | "review" | "live" | "redirected" | "archived";
  repoUrl?: string;
  liveUrl?: string;
  previewUrl?: string;
  vercelProject?: string;
  tagStatus?: "planned" | "installed" | "missing" | "broken" | "not-needed";
  updatedAt: number;
}

const EVENT_LABEL: Record<ClientTelemetryEvent["type"], string> = {
  pageview: "Page viewed",
  performance: "Performance sample",
  error: "Browser error",
  deployment: "Deployment",
  heartbeat: "Connection checked",
  custom: "Custom event",
};

function relativeTime(timestamp?: number): string {
  if (!timestamp) return "No signal yet";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function EventIcon({ type }: { type: ClientTelemetryEvent["type"] }) {
  if (type === "error") return <AlertTriangle size={16} aria-hidden="true" />;
  if (type === "deployment") return <Rocket size={16} aria-hidden="true" />;
  if (type === "performance") return <Gauge size={16} aria-hidden="true" />;
  if (type === "pageview") return <Globe2 size={16} aria-hidden="true" />;
  return <Activity size={16} aria-hidden="true" />;
}

export function ClientSystemsWorkspace({
  clientId,
  clientName,
  properties,
}: {
  clientId: string;
  clientName: string;
  properties: SystemProperty[];
}) {
  const [telemetry, setTelemetry] = useState<ClientTelemetrySnapshot | null>(null);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monitorableProperties = properties.filter(property =>
    property.kind === "website"
    || property.kind === "client-portal"
    || property.kind === "dev-portal"
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    monitorableProperties[0]?.id ?? "",
  );

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/tenants/client-telemetry?clientId=${encodeURIComponent(clientId)}`, {
      cache: "no-store",
    });
    const body = await response.json() as {
      ok: boolean;
      telemetry?: ClientTelemetrySnapshot;
      error?: string;
    };
    if (!body.ok || !body.telemetry) throw new Error(body.error || "Could not load monitoring.");
    setTelemetry(body.telemetry);
  }, [clientId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load().catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [load]);

  const summary = useMemo(
    () => summarizeClientTelemetry(telemetry?.events ?? []),
    [telemetry?.events],
  );
  const connectionState = !telemetry?.lastSeenAt
    ? "waiting"
    : Date.now() - telemetry.lastSeenAt < 15 * 60 * 1000
      ? "connected"
      : "quiet";
  const taggedProperties = properties.filter(property => property.tagStatus === "installed");
  const snippet = telemetry && origin
    ? `<script src="${origin}/milesy-tag.js" data-site-key="${telemetry.siteKey}"${selectedPropertyId ? ` data-property="${selectedPropertyId}"` : ""} defer></script>`
    : "";

  async function copySnippet() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  async function testConnection() {
    if (!telemetry) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/telemetry/collect", {
        method: "POST",
        body: JSON.stringify({
          siteKey: telemetry.siteKey,
          propertyId: selectedPropertyId || undefined,
          type: "heartbeat",
          message: "Manual connection test from Milesymedia",
          url: window.location.href,
          occurredAt: Date.now(),
        }),
      });
      if (!response.ok) throw new Error("The connection test was not accepted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">Client operations</p>
          <h2 className="mt-2 font-serif text-3xl text-black/90">Systems</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
            One calm view of {clientName}&apos;s live products, technical health, repositories, and deployment activity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-black/65 transition hover:border-black/20 hover:text-black"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div className="overflow-hidden rounded-lg bg-[#171512] text-white shadow-[0_24px_70px_rgba(25,20,15,0.13)]">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-white/48">
              <CircleDot
                size={14}
                className={connectionState === "connected" ? "text-emerald-400" : connectionState === "quiet" ? "text-amber-300" : "text-white/30"}
                aria-hidden="true"
              />
              {connectionState === "connected"
                ? "Live connection"
                : connectionState === "quiet"
                  ? "Connection quiet"
                  : "Waiting for first signal"}
            </div>
            <p className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">
              {connectionState === "connected"
                ? "Everything is speaking."
                : "Ready when the product is."}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
              {connectionState === "waiting"
                ? "Install the Milesymedia tag once and this page will begin receiving real visits, performance samples, and browser errors."
                : `Last signal ${relativeTime(telemetry?.lastSeenAt)}. No estimated or fabricated data is shown.`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
            <span className="text-xs text-white/50">{properties.length} connected record{properties.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="grid border-t border-white/10 sm:grid-cols-2 xl:grid-cols-4">
          <DarkMetric label="Views · 24 hours" value={summary.pageviews24h} />
          <DarkMetric label="Errors · 24 hours" value={summary.errors24h} alert={summary.errors24h > 0} />
          <DarkMetric label="Average load" value={summary.averageLoadMs === undefined ? "—" : `${summary.averageLoadMs} ms`} />
          <DarkMetric label="Deployments · 30 days" value={summary.deployments30d} />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Live activity</p>
              <h3 className="mt-1 text-base font-semibold text-black/82">What the product is telling us</h3>
            </div>
            <Activity size={18} className="text-black/30" aria-hidden="true" />
          </div>
          {!telemetry ? (
            <div className="py-14 text-center text-sm text-black/42">Loading signals…</div>
          ) : telemetry.events.length === 0 ? (
            <div className="py-14 text-center">
              <Clock3 size={22} className="mx-auto text-black/22" aria-hidden="true" />
              <p className="mt-4 font-serif text-xl text-black/72">No signals yet.</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/45">
                Install the tag on the customer&apos;s site, or run a connection test. The first genuine event will appear here.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-black/8">
              {telemetry.events.slice(0, 18).map(event => (
                <li key={event.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 py-4">
                  <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                    event.type === "error" ? "bg-red-50 text-red-700" : "bg-black/[0.035] text-black/55"
                  }`}>
                    <EventIcon type={event.type} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-black/78">{EVENT_LABEL[event.type]}</p>
                    <p className="mt-1 truncate text-xs text-black/43">
                      {event.message || event.path || event.url || (event.metric ? `${event.metric}: ${event.value ?? "—"}` : "Signal received")}
                    </p>
                  </div>
                  <time className="pt-1 text-[11px] text-black/35">{relativeTime(event.receivedAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="self-start rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Connection</p>
              <h3 className="mt-1 text-base font-semibold text-black/82">Milesymedia tag</h3>
            </div>
            <Code2 size={19} className="text-black/28" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm leading-6 text-black/52">
            Add this once before the closing <code className="font-mono text-xs">&lt;/body&gt;</code> tag. It records product health without cookies or customer identity.
          </p>
          {monitorableProperties.length > 0 && (
            <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-black/48">
              Website this tag belongs to
              <select
                value={selectedPropertyId}
                onChange={event => setSelectedPropertyId(event.target.value)}
                className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm font-normal text-black/72"
              >
                {monitorableProperties.map(property => (
                  <option key={property.id} value={property.id}>{property.label}</option>
                ))}
              </select>
            </label>
          )}
          <pre className="mt-4 max-h-32 overflow-auto rounded-md bg-[#171512] p-4 text-[11px] leading-5 text-white/72">
            <code>{snippet || "Preparing secure connection…"}</code>
          </pre>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!snippet}
              onClick={() => void copySnippet()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white transition hover:bg-black/82 disabled:opacity-40"
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? "Copied" : "Copy tag"}
            </button>
            <button
              type="button"
              disabled={!telemetry || busy}
              onClick={() => void testConnection()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/68 transition hover:border-black/25 disabled:opacity-40"
            >
              <CircleDot size={14} aria-hidden="true" />
              {busy ? "Testing…" : "Test"}
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-black/36">
            Page URLs are stored without query strings or hashes. No form values, names, email addresses, or typed content are collected.
          </p>
        </aside>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Production estate</p>
            <h3 className="mt-1 text-base font-semibold text-black/82">Sites, portals, repositories, and deployments</h3>
          </div>
          <span className="text-xs text-black/38">{taggedProperties.length} tag{taggedProperties.length === 1 ? "" : "s"} marked installed</span>
        </div>
        {properties.length === 0 ? (
          <div className="py-12 text-center">
            <Server size={22} className="mx-auto text-black/20" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-black/65">No production properties connected yet.</p>
            <p className="mt-1 text-xs text-black/40">Add the website, repository, preview, or portal from Development.</p>
          </div>
        ) : (
          <div className="grid gap-x-8 md:grid-cols-2">
            {properties.map(property => (
              <article key={property.id} className="flex min-w-0 items-start gap-3 border-b border-black/8 py-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black/[0.035] text-black/48">
                  {property.kind === "repo"
                    ? <GitBranch size={17} aria-hidden="true" />
                    : property.kind === "website"
                      ? <Globe2 size={17} aria-hidden="true" />
                      : <Server size={17} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-medium text-black/78">{property.label}</h4>
                    <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] uppercase text-black/44">{property.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-black/38">
                    {property.tagStatus === "installed" ? "Monitoring installed" : property.tagStatus ? `Monitoring ${property.tagStatus}` : "Monitoring not set"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <PropertyLink href={property.liveUrl} label="Live" />
                    <PropertyLink href={property.previewUrl} label="Preview" />
                    <PropertyLink href={property.repoUrl} label="Repository" />
                    <PropertyLink href={property.vercelProject} label="Vercel" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DarkMetric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="border-t border-white/10 px-6 py-5 first:border-t-0 sm:border-l sm:first:border-l-0 xl:border-t-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34">{label}</p>
      <p className={`mt-2 text-2xl font-medium tabular-nums ${alert ? "text-red-300" : "text-white/88"}`}>{value}</p>
    </div>
  );
}

function PropertyLink({ href, label }: { href?: string; label: string }) {
  const safe = safeExternalUrl(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-medium text-black/48 transition hover:text-black"
    >
      {label}
      <ExternalLink size={10} aria-hidden="true" />
    </a>
  );
}
