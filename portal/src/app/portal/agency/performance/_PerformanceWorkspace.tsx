"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, ChevronRight, CircleGauge, Code2, ExternalLink, FileCheck2, FolderOpen, Gauge, Globe2, HeartPulse, Image, MousePointerClick, Plus, Search, Server, Target, Trash2, UsersRound, X } from "lucide-react";
import type { ClientMilestone, ClientMilestoneStatus, PerformanceExperiment } from "@/server/types";
import type { PerformanceAnalytics } from "@/lib/performanceAnalytics";
import { ExperimentsPanel } from "./_ExperimentsPanel";

export interface PerformanceProduct {
  id: string;
  name: string;
  catalogKey?: string;
}

export interface PerformanceProperty {
  id: string;
  label: string;
  kind: string;
  status: string;
  repoUrl?: string;
  liveUrl?: string;
  previewUrl?: string;
  tagStatus?: string;
  repositoryStatus?: string;
  deploymentStatus?: string;
  lastDeployedAt?: number;
  pageviews24h: number;
  errors24h: number;
  deployments30d: number;
  averageLoadMs?: number;
  lastSeenAt?: number;
  heartbeats24h: number;
}

export interface PerformanceClient {
  id: string;
  scope: "agency" | "client";
  name: string;
  stage: string;
  stageProgress: number;
  health: "healthy" | "attention";
  healthNotes: string[];
  products: PerformanceProduct[];
  revenueCents: number;
  costCents: number;
  pageviews24h: number;
  errors24h: number;
  averageLoadMs?: number;
  lastSeenAt?: number;
  deployments30d: number;
  properties: PerformanceProperty[];
  files: { total: number; brand: number; inspiration: number; feedback: number; deliverables: number };
  approvals: { pending: number; approved: number; changesRequested: number };
  requests: { open: number; closed: number };
  milestones: ClientMilestone[];
  analyticsByPeriod: Record<"7" | "28" | "90", PerformanceAnalytics>;
  experiments: PerformanceExperiment[];
}

export function PerformanceWorkspace({ initialClients }: { initialClients: PerformanceClient[] }) {
  const [clients, setClients] = useState(initialClients);
  const [selectedId, setSelectedId] = useState("all");
  const [period, setPeriod] = useState<7 | 28 | 90>(28);
  const [adding, setAdding] = useState(false);
  const selected = clients.find(client => client.id === selectedId);
  const ranked = useMemo(() => [...clients].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)), [clients]);
  const clientRows = clients.filter(client => client.scope === "client");
  const periodAnalytics = clients.map(client => client.analyticsByPeriod[String(period) as "7" | "28" | "90"].current);
  const totalViews = periodAnalytics.reduce((sum, item) => sum + item.views, 0);
  const totalConversions = periodAnalytics.reduce((sum, item) => sum + item.conversions, 0);

  function updateMilestone(clientId: string, milestone: ClientMilestone) {
    setClients(current => current.map(client => client.id === clientId
      ? { ...client, milestones: client.milestones.some(item => item.id === milestone.id) ? client.milestones.map(item => item.id === milestone.id ? milestone : item) : [...client.milestones, milestone] }
      : client));
  }

  function removeMilestone(clientId: string, id: string) {
    setClients(current => current.map(client => client.id === clientId ? { ...client, milestones: client.milestones.filter(item => item.id !== id) } : client));
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Performance</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black/90">Every result, clearly.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Compare Milesymedia and every client across visibility, conversions, progress, live signals, and milestones.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={period} onChange={event => setPeriod(Number(event.target.value) as 7 | 28 | 90)} aria-label="Choose reporting period" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/75">
            <option value="7">Last 7 days</option><option value="28">Last 28 days</option><option value="90">Last 90 days</option>
          </select>
          <select value={selectedId} onChange={event => setSelectedId(event.target.value)} aria-label="Choose account" className="min-h-11 min-w-56 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-black/75">
            <option value="all">Everyone</option>
            {clients.map(client => <option key={client.id} value={client.id}>{client.scope === "agency" ? "Milesymedia · " : ""}{client.name}</option>)}
          </select>
        </div>
      </header>

      <dl className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-4">
        <Metric label="Active clients" value={String(clientRows.length)} />
        <Metric label={`Views · ${period}d`} value={String(totalViews)} />
        <Metric label={`Conversions · ${period}d`} value={String(totalConversions)} />
        <Metric label="Need attention" value={String(clientRows.filter(client => client.health === "attention").length)} bad={clientRows.some(client => client.health === "attention")} />
      </dl>

      {selected ? (
        <ClientPerformance
          client={selected}
          adding={adding}
          setAdding={setAdding}
          onUpdate={milestone => updateMilestone(selected.id, milestone)}
          onDelete={id => removeMilestone(selected.id, id)}
          period={period}
        />
      ) : (
        <PortfolioTable clients={ranked} onSelect={setSelectedId} />
      )}
    </div>
  );
}

function PortfolioTable({ clients, onSelect }: { clients: PerformanceClient[]; onSelect: (id: string) => void }) {
  if (!clients.length) return <Empty title="No clients to compare yet" detail="Create your first client and their performance will appear here." />;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-black/85">Progress leaderboard</h2><p className="mt-1 text-sm text-black/45">Closest to completing their current work appears first.</p></div>
        <span className="text-xs text-black/40">Select any row for detail</span>
      </div>
      <div className="overflow-x-auto border-y border-black/10">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="border-b border-black/10 text-left text-[11px] font-semibold uppercase tracking-wide text-black/45">
            <tr><th className="px-2 py-3">Client</th><th className="px-2 py-3">Progress</th><th className="px-2 py-3">Next milestone</th><th className="px-2 py-3">Health</th><th className="px-2 py-3 text-right">Revenue</th><th className="px-2 py-3">Live</th><th /></tr>
          </thead>
          <tbody>
            {clients.map((client, index) => {
              const next = nextMilestone(client);
              return <tr key={client.id} className="border-b border-black/[0.07] hover:bg-black/[0.015]">
                <td className="px-2 py-4"><div className="flex items-center gap-3"><span className="text-xs font-semibold text-black/30">{index + 1}</span><div><p className="font-semibold text-black/80">{client.name}</p><p className="mt-0.5 text-xs text-black/40">{client.stage} · {client.products.map(product => product.name).join(", ") || "No product assigned"}</p></div></div></td>
                <td className="px-2 py-4"><Progress value={score(client)} /></td>
                <td className="px-2 py-4"><p className="font-medium text-black/70">{next?.title ?? "Add a milestone"}</p><p className="mt-0.5 text-xs text-black/40">{next?.targetAt ? dueLabel(next.targetAt) : `${client.milestones.filter(item => item.status === "complete").length}/${client.milestones.length} complete`}</p></td>
                <td className="px-2 py-4"><Health client={client} /></td>
                <td className="px-2 py-4 text-right font-mono font-medium">{money(client.revenueCents)}</td>
                <td className="px-2 py-4 text-xs text-black/55">{client.lastSeenAt ? `${client.pageviews24h} views · ${client.errors24h} errors` : "Not connected"}</td>
                <td className="px-2 py-4 text-right"><button type="button" onClick={() => onSelect(client.id)} aria-label={`Open ${client.name} performance`} className="rounded-md border border-black/10 p-2 text-black/50 hover:bg-black/[0.03]"><ChevronRight size={15} /></button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClientPerformance({ client, adding, setAdding, onUpdate, onDelete, period }: { client: PerformanceClient; adding: boolean; setAdding: (value: boolean) => void; onUpdate: (item: ClientMilestone) => void; onDelete: (id: string) => void; period: 7 | 28 | 90 }) {
  const [productId, setProductId] = useState(client.products[0]?.id ?? "overview");
  const selectedProduct = client.products.find(product => product.id === productId);
  const analytics = client.analyticsByPeriod[String(period) as "7" | "28" | "90"];
  return (
    <>
      <section className="grid gap-4 border-y border-black/10 py-5 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(120px,0.35fr))]">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-black/90">{client.name}</h2><Health client={client} /></div><p className="mt-2 text-sm text-black/50">{client.stage} · {client.products.map(product => product.name).join(", ") || "No products assigned"}</p>{client.scope === "client" ? <Link href={`/portal/clients/${client.id}`} className="mt-3 inline-flex text-xs font-semibold text-black/60 hover:text-black">Open client record →</Link> : <Link href="/portal/agency/development/website" className="mt-3 inline-flex text-xs font-semibold text-black/60 hover:text-black">Open website control →</Link>}</div>
        <SmallMetric label="Progress" value={`${score(client)}%`} />
        <SmallMetric label="Gross profit" value={money(client.revenueCents - client.costCents)} />
        <SmallMetric label={`${period}d result`} value={`${analytics.current.conversions} conversions`} />
      </section>

      <GrowthPerformance analytics={analytics} />

      {client.scope === "client" ? <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-black/85">Product performance</h2><p className="mt-1 text-sm text-black/45">The measures change with the work being delivered.</p></div>
          {client.products.length > 1 ? (
            <select value={productId} onChange={event => setProductId(event.target.value)} aria-label="Choose product performance" className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm font-medium">
              {client.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          ) : null}
        </div>
        {selectedProduct ? <ProductPerformance client={client} product={selectedProduct} /> : <Empty title="No product assigned" detail="Assign a product to this client to see the measures that matter for it." />}
      </section> : null}

      <ExperimentsPanel
        initialExperiments={client.experiments}
        clientId={client.scope === "client" ? client.id : undefined}
        liveVariants={analytics.variants}
      />

      {client.scope === "client" ? <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-black/85">Milestones</h2><p className="mt-1 text-sm text-black/45">Custom outcomes for this client, ordered by what is closest.</p></div>
          {client.scope === "client" ? <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><Plus size={15} />Add milestone</button> : null}
        </div>
        {client.milestones.length ? <div className="divide-y divide-black/10 border-y border-black/10">{client.milestones.map(item => <MilestoneRow key={item.id} clientId={client.id} item={item} onUpdate={onUpdate} onDelete={onDelete} />)}</div> : <Empty title="No milestones yet" detail="Add a custom target such as launch approved, 50 enquiries, first booking, or photography delivered." />}
      </section> : null}
      {adding && client.scope === "client" ? <NewMilestone clientId={client.id} onClose={() => setAdding(false)} onCreated={item => { onUpdate(item); setAdding(false); }} /> : null}
    </>
  );
}

function GrowthPerformance({ analytics }: { analytics: PerformanceAnalytics }) {
  const maxSeries = Math.max(1, ...analytics.series.map(item => item.views));
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-black/85">Visibility and conversions</h2>
        <p className="mt-1 text-sm text-black/45">First-party traffic and enquiry data, compared with the previous {analytics.days} days.</p>
      </div>
      <div className="grid grid-cols-2 border-y border-black/10 lg:grid-cols-4">
        <GrowthMetric label="Visitors" value={analytics.current.visitors} change={analytics.changes.visitors} icon={<UsersRound size={15} />} />
        <GrowthMetric label="Views" value={analytics.current.views} change={analytics.changes.views} icon={<Activity size={15} />} />
        <GrowthMetric label="Conversions" value={analytics.current.conversions} change={analytics.changes.conversions} icon={<MousePointerClick size={15} />} />
        <GrowthMetric label="Conversion rate" value={`${analytics.current.conversionRate.toFixed(1)}%`} change={analytics.changes.conversionRate} icon={<Target size={15} />} />
      </div>

      <div className="mt-5 border-b border-black/10 pb-5">
        <div className="flex h-36 items-end gap-1" aria-label={`Daily views over ${analytics.days} days`}>
          {analytics.series.map(item => (
            <div key={item.date} className="group relative flex h-full min-w-0 flex-1 items-end">
              <div className="w-full rounded-t-sm bg-brand/55 transition hover:bg-brand" style={{ height: `${Math.max(item.views ? 8 : 2, (item.views / maxSeries) * 100)}%` }} />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-[10px] text-white group-hover:block">{item.date} · {item.views} views · {item.conversions} conversions</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-black/35"><span>{shortDate(analytics.series[0]?.date)}</span><span>{shortDate(analytics.series.at(-1)?.date)}</span></div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <PerformanceTable
          title="Top pages"
          icon={<Globe2 size={15} />}
          headers={["Page", "Views", "Conversions", "Rate"]}
          rows={analytics.pages.map(row => [row.path, String(row.views), String(row.conversions), `${row.conversionRate.toFixed(1)}%`])}
          empty="Page activity will appear once the Milesymedia tag is connected."
        />
        <PerformanceTable
          title="Conversion points"
          icon={<MousePointerClick size={15} />}
          headers={["Form or action", "Conversions", "Value"]}
          rows={analytics.forms.map(row => [row.name, String(row.submissions), row.valueCents ? money(row.valueCents) : "—"])}
          empty="Forms and tagged conversion actions will appear here automatically."
        />
        <PerformanceTable
          title="Traffic sources"
          icon={<Activity size={15} />}
          headers={["Source", "Views", "Conversions"]}
          rows={analytics.sources.map(row => [row.source, String(row.views), String(row.conversions)])}
          empty="Referrers will appear as visits arrive."
        />
        <PerformanceTable
          title="Search visibility"
          icon={<Search size={15} />}
          headers={["Query", "Clicks", "Impressions", "Position"]}
          rows={analytics.queries.map(row => [row.query, String(row.clicks), String(row.impressions), row.position?.toFixed(1) ?? "—"])}
          empty="Search queries appear when Search Console or another search data source sends search signals."
        />
      </div>
    </section>
  );
}

function GrowthMetric({ label, value, change, icon }: { label: string; value: string | number; change: number | null; icon: React.ReactNode }) {
  const positive = change != null && change > 0;
  const negative = change != null && change < 0;
  return (
    <div className="min-h-24 border-b border-r border-black/10 px-4 py-4 lg:border-b-0 last:border-r-0">
      <div className="flex items-center gap-2 text-black/40">{icon}<span className="text-[10px] font-semibold uppercase">{label}</span></div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2"><strong className="text-2xl font-semibold text-black/85">{value}</strong><span className={`text-xs font-medium ${positive ? "text-emerald-700" : negative ? "text-red-700" : "text-black/35"}`}>{change == null ? "New" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</span></div>
    </div>
  );
}

function PerformanceTable({ title, icon, headers, rows, empty }: { title: string; icon: React.ReactNode; headers: string[]; rows: string[][]; empty: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-black/10 pb-2 text-sm font-semibold text-black/75">{icon}{title}</div>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-xs"><thead className="text-left text-black/35"><tr>{headers.map((header, index) => <th key={header} className={`py-2 font-medium ${index ? "text-right" : ""}`}>{header}</th>)}</tr></thead><tbody className="divide-y divide-black/[0.07]">{rows.slice(0, 8).map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`py-2.5 ${cellIndex ? "text-right tabular-nums text-black/55" : "max-w-56 truncate font-medium text-black/70"}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="py-8 text-center text-xs leading-5 text-black/40">{empty}</p>}
    </div>
  );
}

type ProductKind = "website" | "software" | "automation" | "google-profile" | "creative" | "care" | "advisory" | "other";

function ProductPerformance({ client, product }: { client: PerformanceClient; product: PerformanceProduct }) {
  const kind = productKind(product);
  if (kind === "website" || kind === "software" || kind === "automation") {
    return <DigitalPerformance client={client} product={product} kind={kind} />;
  }
  if (kind === "creative") return <CreativePerformance client={client} product={product} />;
  if (kind === "care") return <CarePerformance client={client} />;
  if (kind === "google-profile") return <GoogleProfilePerformance client={client} />;
  return <OutcomePerformance client={client} advisory={kind === "advisory"} />;
}

function DigitalPerformance({ client, product, kind }: { client: PerformanceClient; product: PerformanceProduct; kind: "website" | "software" | "automation" }) {
  const digitalProperties = client.properties.filter(property => {
    if (kind === "website") return ["website", "repo", "tag"].includes(property.kind);
    if (kind === "software") return ["client-portal", "dev-portal", "website", "repo", "tag"].includes(property.kind);
    return ["website", "client-portal", "tag", "repo"].includes(property.kind);
  });
  const connected = digitalProperties.filter(property => property.lastSeenAt || property.tagStatus === "installed").length;
  const heading = kind === "website" ? "Website and server analytics" : kind === "software" ? "Product and server analytics" : "Automation health";
  const detail = kind === "automation"
    ? "Live heartbeats, failures, releases and linked workflow properties."
    : "Traffic, speed, errors, deployments and monitoring status from connected properties.";
  return (
    <div className="border-y border-black/10">
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><div className="flex items-center gap-2">{kind === "website" ? <Globe2 size={17} /> : kind === "software" ? <Code2 size={17} /> : <Activity size={17} />}<h3 className="font-semibold text-black/85">{heading}</h3></div><p className="mt-1 text-sm text-black/45">{detail}</p></div>
        <Link href={client.scope === "agency" ? "/portal/agency/development/website" : `/portal/clients/${client.id}?tab=properties`} className="inline-flex items-center gap-1 text-xs font-semibold text-black/60 hover:text-black">{client.scope === "agency" ? "Open website control" : "Manage properties"} <ChevronRight size={13} /></Link>
      </div>
      <div className="grid grid-cols-2 border-y border-black/[0.08] md:grid-cols-5">
        <Signal label="Connected" value={`${connected}/${digitalProperties.length}`} icon={<Server size={15} />} />
        <Signal label="Views · 24h" value={String(client.pageviews24h)} icon={<Activity size={15} />} />
        <Signal label="Errors · 24h" value={String(client.errors24h)} icon={<AlertTriangle size={15} />} bad={client.errors24h > 0} />
        <Signal label="Average load" value={client.averageLoadMs == null ? "No data" : `${client.averageLoadMs} ms`} icon={<Gauge size={15} />} />
        <Signal label="Deployments · 30d" value={String(client.deployments30d)} icon={<Code2 size={15} />} />
      </div>
      {digitalProperties.length ? (
        <div className="divide-y divide-black/[0.08]">
          {digitalProperties.map(property => <PropertyRow key={property.id} property={property} />)}
        </div>
      ) : (
        <div className="py-8 text-center"><p className="font-semibold text-black/70">No property connected to {product.name}</p><p className="mt-1 text-sm text-black/45">Add the website, repo or portal, then install its Milesymedia monitoring tag.</p></div>
      )}
    </div>
  );
}

function PropertyRow({ property }: { property: PerformanceProperty }) {
  const destination = property.liveUrl || property.previewUrl || property.repoUrl;
  return (
    <div className="grid gap-4 py-4 md:grid-cols-[minmax(180px,1fr)_repeat(4,minmax(90px,0.45fr))] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-black/80">{property.label}</p><span className="rounded border border-black/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-black/45">{property.status}</span></div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-black/45">
          <span>{property.kind.replaceAll("-", " ")}</span>
          <span className={property.tagStatus === "broken" || property.tagStatus === "missing" ? "text-red-700" : property.tagStatus === "installed" ? "text-emerald-700" : ""}>Tag: {property.tagStatus?.replaceAll("-", " ") ?? "not set"}</span>
          {destination ? <a href={destination} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-black">Open <ExternalLink size={11} /></a> : null}
        </div>
      </div>
      <PropertySignal label="Views" value={String(property.pageviews24h)} />
      <PropertySignal label="Errors" value={String(property.errors24h)} bad={property.errors24h > 0} />
      <PropertySignal label="Load" value={property.averageLoadMs == null ? "—" : `${property.averageLoadMs} ms`} />
      <PropertySignal label="Last signal" value={property.lastSeenAt ? relativeTime(property.lastSeenAt) : "Not connected"} />
    </div>
  );
}

function CreativePerformance({ client, product }: { client: PerformanceClient; product: PerformanceProduct }) {
  return (
    <div className="border-y border-black/10">
      <PerformanceHeading icon={<Image size={17} />} title={`${product.name} delivery`} detail="Assets, feedback and approvals in one clear production picture." href={`/portal/clients/${client.id}?tab=files`} action="Open files" />
      <div className="grid grid-cols-2 border-t border-black/[0.08] md:grid-cols-5">
        <Signal label="Deliverables" value={String(client.files.deliverables)} icon={<FolderOpen size={15} />} />
        <Signal label="Inspiration" value={String(client.files.inspiration)} icon={<Image size={15} />} />
        <Signal label="Feedback" value={String(client.files.feedback)} icon={<Activity size={15} />} />
        <Signal label="Approved" value={String(client.approvals.approved)} icon={<FileCheck2 size={15} />} />
        <Signal label="Needs a decision" value={String(client.approvals.pending + client.approvals.changesRequested)} icon={<AlertTriangle size={15} />} bad={client.approvals.changesRequested > 0} />
      </div>
    </div>
  );
}

function CarePerformance({ client }: { client: PerformanceClient }) {
  return (
    <div className="border-y border-black/10">
      <PerformanceHeading icon={<HeartPulse size={17} />} title="Support health" detail="Open client requests and live monitoring signals across maintained properties." href={`/portal/clients/${client.id}?tab=fulfilment`} action="Open support" />
      <div className="grid grid-cols-2 border-t border-black/[0.08] md:grid-cols-5">
        <Signal label="Open requests" value={String(client.requests.open)} icon={<AlertTriangle size={15} />} bad={client.requests.open > 0} />
        <Signal label="Resolved" value={String(client.requests.closed)} icon={<Check size={15} />} />
        <Signal label="Live errors" value={String(client.errors24h)} icon={<Activity size={15} />} bad={client.errors24h > 0} />
        <Signal label="Connected properties" value={String(client.properties.filter(property => property.lastSeenAt).length)} icon={<Server size={15} />} />
        <Signal label="Last signal" value={client.lastSeenAt ? relativeTime(client.lastSeenAt) : "Not connected"} icon={<CircleGauge size={15} />} />
      </div>
    </div>
  );
}

function GoogleProfilePerformance({ client }: { client: PerformanceClient }) {
  return (
    <div className="border-y border-black/10">
      <PerformanceHeading icon={<Globe2 size={17} />} title="Local visibility" detail="Track the profile work now; live Google reporting will appear when a data source is connected." href={`/portal/clients/${client.id}?tab=files`} action="Open client work" />
      <div className="grid grid-cols-2 border-t border-black/[0.08] md:grid-cols-4">
        <Signal label="Google reporting" value="Not connected" icon={<CircleGauge size={15} />} />
        <Signal label="Brand assets" value={String(client.files.brand)} icon={<Image size={15} />} />
        <Signal label="Deliverables" value={String(client.files.deliverables)} icon={<FolderOpen size={15} />} />
        <Signal label="Milestones complete" value={`${client.milestones.filter(item => item.status === "complete").length}/${client.milestones.length}`} icon={<Target size={15} />} />
      </div>
    </div>
  );
}

function OutcomePerformance({ client, advisory }: { client: PerformanceClient; advisory: boolean }) {
  return (
    <div className="border-y border-black/10">
      <PerformanceHeading icon={<Target size={17} />} title={advisory ? "Outcome progress" : "Delivery progress"} detail="Use client milestones and delivered work as the measure of success." href={`/portal/clients/${client.id}?tab=files`} action="Open client work" />
      <div className="grid grid-cols-2 border-t border-black/[0.08] md:grid-cols-4">
        <Signal label="Progress" value={`${score(client)}%`} icon={<CircleGauge size={15} />} />
        <Signal label="Milestones complete" value={`${client.milestones.filter(item => item.status === "complete").length}/${client.milestones.length}`} icon={<Target size={15} />} />
        <Signal label="Files" value={String(client.files.total)} icon={<FolderOpen size={15} />} />
        <Signal label="Approvals pending" value={String(client.approvals.pending)} icon={<FileCheck2 size={15} />} bad={client.approvals.pending > 0} />
      </div>
    </div>
  );
}

function PerformanceHeading({ icon, title, detail, href, action }: { icon: React.ReactNode; title: string; detail: string; href: string; action: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 py-4"><div><div className="flex items-center gap-2">{icon}<h3 className="font-semibold text-black/85">{title}</h3></div><p className="mt-1 text-sm text-black/45">{detail}</p></div><Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-black/60 hover:text-black">{action} <ChevronRight size={13} /></Link></div>;
}

function Signal({ label, value, icon, bad }: { label: string; value: string; icon: React.ReactNode; bad?: boolean }) {
  return <div className="min-h-24 border-b border-r border-black/[0.08] p-3 last:border-r-0 md:border-b-0"><div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-black/40">{icon}{label}</div><p className={`mt-3 text-lg font-semibold ${bad ? "text-red-700" : "text-black/80"}`}>{value}</p></div>;
}

function PropertySignal({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className={`mt-1 text-sm font-semibold ${bad ? "text-red-700" : "text-black/70"}`}>{value}</p></div>;
}

function productKind(product: PerformanceProduct): ProductKind {
  const value = `${product.catalogKey ?? ""} ${product.id} ${product.name}`.toLowerCase();
  if (/(ongoing-care|maintenance|support|care plan)/.test(value)) return "care";
  if (/(google-profile|google profile|local seo|google business)/.test(value)) return "google-profile";
  if (/(photograph|brand|logo|content|creative|video)/.test(value)) return "creative";
  if (/(custom-software|software|portal|app|saas)/.test(value)) return "software";
  if (/(automat|workflow|integration)/.test(value)) return "automation";
  if (/(website|web design|web build|ecommerce|e-commerce)/.test(value)) return "website";
  if (/(business-os|health-check|health check|audit|strategy|consult)/.test(value)) return "advisory";
  return "other";
}

function MilestoneRow({ clientId, item, onUpdate, onDelete }: { clientId: string; item: ClientMilestone; onUpdate: (item: ClientMilestone) => void; onDelete: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function save(patch: Partial<ClientMilestone>) {
    setBusy(true);
    const response = await fetch("/api/tenants/client-milestones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", clientId, milestoneId: item.id, ...patch }) });
    const json = await response.json().catch(() => null) as { milestone?: ClientMilestone } | null;
    if (response.ok && json?.milestone) onUpdate(json.milestone);
    setBusy(false);
  }
  async function remove() {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    const response = await fetch("/api/tenants/client-milestones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", clientId, milestoneId: item.id }) });
    if (response.ok) onDelete(item.id);
  }
  return (
    <div className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_180px_150px_auto] md:items-center">
      <div><div className="flex items-center gap-2"><Target size={15} className={item.status === "complete" ? "text-emerald-700" : item.status === "blocked" ? "text-red-700" : "text-black/35"} /><p className="font-semibold text-black/80">{item.title}</p></div><p className="mt-1 text-xs text-black/45">{item.autoTrack && item.metric ? `${item.currentValue ?? 0} of ${item.targetValue ?? 0} ${metricLabel(item.metric)} · updates automatically` : item.description || (item.targetAt ? dueLabel(item.targetAt) : "No due date")}</p></div>
      <label className="grid gap-1 text-[10px] font-medium uppercase text-black/40">Progress<input aria-label={`${item.title} progress`} type="range" min="0" max="100" step="5" value={item.progress} disabled={busy} onChange={event => void save({ progress: Number(event.target.value), status: Number(event.target.value) === 100 ? "complete" : item.status === "complete" ? "in-progress" : item.status })} /><span className="text-xs font-semibold text-black/60">{item.progress}%</span></label>
      <select aria-label={`${item.title} status`} value={item.status} disabled={busy} onChange={event => void save({ status: event.target.value as ClientMilestoneStatus })} className="min-h-10 rounded-md border border-black/15 bg-white px-2 text-xs">
        <option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="blocked">Blocked</option><option value="complete">Complete</option>
      </select>
      <button type="button" onClick={() => void remove()} aria-label={`Delete ${item.title}`} className="grid size-9 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button>
    </div>
  );
}

function NewMilestone({ clientId, onClose, onCreated }: { clientId: string; onClose: () => void; onCreated: (item: ClientMilestone) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const target = String(data.get("targetAt") || "");
    const metric = String(data.get("metric") || "");
    const targetValue = Number(data.get("targetValue"));
    const response = await fetch("/api/tenants/client-milestones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", clientId, title: data.get("title"), description: data.get("description"), targetAt: target ? new Date(`${target}T12:00:00`).getTime() : undefined, metric: metric || undefined, targetValue: metric && targetValue > 0 ? targetValue : undefined, autoTrack: Boolean(metric && targetValue > 0) }) });
    const json = await response.json().catch(() => null) as { milestone?: ClientMilestone } | null;
    if (response.ok && json?.milestone) onCreated(json.milestone);
    setBusy(false);
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="presentation"><form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="new-milestone-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-black/10 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-brand">Custom milestone</p><h2 id="new-milestone-title" className="mt-1 text-xl font-semibold">What does success look like?</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="mt-5 grid gap-4"><label className="grid gap-1 text-xs font-medium">Title<input name="title" required autoFocus className="min-h-11 rounded-md border border-black/15 px-3 text-sm" placeholder="Reach 50 website enquiries" /></label><label className="grid gap-1 text-xs font-medium">What counts as complete?<textarea name="description" rows={3} className="rounded-md border border-black/15 px-3 py-2 text-sm" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium">Track automatically<select name="metric" className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm"><option value="">No · update manually</option><option value="pageviews">Website views</option><option value="visitors">Visitors</option><option value="conversions">Conversions</option><option value="search-clicks">Search clicks</option></select></label><label className="grid gap-1 text-xs font-medium">Target number<input name="targetValue" type="number" min="1" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" placeholder="50" /></label></div><label className="grid gap-1 text-xs font-medium">Target date<input name="targetAt" type="date" className="min-h-11 rounded-md border border-black/15 px-3 text-sm" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 px-3 text-sm">Cancel</button><button disabled={busy} className="min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white">{busy ? "Adding..." : "Add milestone"}</button></div></form></div>;
}

function score(client: PerformanceClient): number {
  return client.milestones.length
    ? Math.round(client.milestones.reduce((sum, item) => sum + item.progress, 0) / client.milestones.length)
    : client.stageProgress;
}
function nextMilestone(client: PerformanceClient) { return [...client.milestones].filter(item => item.status !== "complete").sort((a, b) => b.progress - a.progress || (a.targetAt ?? Number.MAX_SAFE_INTEGER) - (b.targetAt ?? Number.MAX_SAFE_INTEGER))[0]; }
function Progress({ value }: { value: number }) { return <div className="flex min-w-32 items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-[#8E7340]" style={{ width: `${value}%` }} /></div><span className="w-9 text-right text-xs font-semibold">{value}%</span></div>; }
function Health({ client }: { client: PerformanceClient }) { return client.health === "healthy" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={13} />Healthy</span> : <span title={client.healthNotes.join(" · ")} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle size={13} />Attention</span>; }
function Metric({ label, value, bad }: { label: string; value: string; bad?: boolean }) { return <div className="min-h-24 border-b border-black/10 px-3 py-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"><dt className="text-[11px] font-semibold uppercase text-black/45">{label}</dt><dd className={`mt-2 text-2xl font-semibold ${bad ? "text-red-700" : "text-black/90"}`}>{value}</dd></div>; }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase text-black/40">{label}</p><p className="mt-2 text-lg font-semibold text-black/85">{value}</p></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="border-y border-dashed border-black/15 py-10 text-center"><Target className="mx-auto text-black/25" /><p className="mt-3 font-semibold text-black/70">{title}</p><p className="mt-1 text-sm text-black/45">{detail}</p></div>; }
function money(cents: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100); }
function dueLabel(targetAt: number) { const days = Math.ceil((targetAt - Date.now()) / 86_400_000); return days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d remaining`; }
function relativeTime(value: number) { const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000)); return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`; }
function shortDate(value?: string) { return value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)) : ""; }
function metricLabel(value: NonNullable<ClientMilestone["metric"]>) { return value === "pageviews" ? "views" : value === "search-clicks" ? "search clicks" : value; }
