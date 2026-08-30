"use client";

import { ChevronDown, Download, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Pagination } from "@/components/ui/Pagination";
import { formatUkDateTime, isoDateTimeValue } from "@/lib/shared/formatDateTime";

interface ActivityEntry {
  id: string;
  ts: number;
  clientId?: string;
  actorEmail?: string;
  actorUserId?: string;
  category: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface ActivityResponse {
  ok: boolean;
  entries: ActivityEntry[];
  total: number;
  agencyTotal: number;
  categories: string[];
  actions: string[];
  actors: string[];
  hasMore: boolean;
  error?: string;
}

interface Filters {
  q: string;
  category: string;
  action: string;
  clientId: string;
  actor: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { q: "", category: "", action: "", clientId: "", actor: "", from: "", to: "" };

export function ActivityLogPanel({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [data, setData] = useState<ActivityResponse | null>(null);
  // Ed, 2026-08-30: *"show like 10 results and be pages ... or you can change
  // it to show all or show 50 per page or 10 or 25 or 100."* Ten by default;
  // "All" is an explicit huge limit, NEVER an omitted param — the route's
  // missing-param fallback used to return one record, and omitting the value
  // is how that class of bug comes back.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useMemo(() => buildParams(applied), [applied]);

  useEffect(() => {
    const timer = window.setTimeout(() => setApplied(filters), 250);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    setPage(0);
    void load(0, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable per params/pageSize
  }, [params, pageSize]);

  async function load(toPage: number, size: number | "all") {
    setLoading(true);
    setError("");
    const limit = size === "all" ? 50_000 : size;
    const offset = size === "all" ? 0 : toPage * size;
    try {
      const response = await fetch(`/api/portal/settings/activity-log?${params}&limit=${limit}&offset=${offset}`, { cache: "no-store" });
      const json = await response.json() as ActivityResponse;
      if (!response.ok || !json.ok) throw new Error(json.error || "Could not load activity.");
      setData(json);
      setEntries(json.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  const exportUrl = (format: "csv" | "json") => `/api/portal/settings/activity-log?${params}&format=${format}`;

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-black/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-black/85">Complete business activity</h3>
          <p className="mt-1 text-xs leading-5 text-black/50">Forms, client actions, assistant use, support, finance, delivery, access, and system changes in one audit trail.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href={exportUrl("csv")} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-xs font-medium text-black/65 hover:border-black/30"><Download size={13} />CSV</a>
          <a href={exportUrl("json")} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-xs font-medium text-black/65 hover:border-black/30"><Download size={13} />JSON</a>
        </div>
      </div>

      <div className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative md:col-span-2">
          <Search size={15} className="pointer-events-none absolute left-3 top-3 text-black/35" />
          <input value={filters.q} onChange={event => set("q", event.target.value)} placeholder="Search messages and metadata" className={`${control} pl-9`} />
        </label>
        <select value={filters.category} onChange={event => set("category", event.target.value)} className={control} aria-label="Filter by category">
          <option value="">All categories</option>
          {(data?.categories ?? []).map(category => <option key={category} value={category}>{friendly(category)}</option>)}
        </select>
        <select value={filters.action} onChange={event => set("action", event.target.value)} className={control} aria-label="Filter by event">
          <option value="">All events</option>
          {(data?.actions ?? []).map(action => <option key={action} value={action}>{friendly(action)}</option>)}
        </select>
        <select value={filters.clientId} onChange={event => set("clientId", event.target.value)} className={control} aria-label="Filter by client">
          <option value="">All clients</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <input value={filters.actor} onChange={event => set("actor", event.target.value)} placeholder="Actor email or user" className={control} aria-label="Filter by actor" />
        <input type="date" value={filters.from} onChange={event => set("from", event.target.value)} className={control} aria-label="Activity from date" />
        <input type="date" value={filters.to} onChange={event => set("to", event.target.value)} className={control} aria-label="Activity to date" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-black/10 py-3">
        <p className="text-xs text-black/50">
          <strong className="font-semibold text-black/75">{data?.total ?? 0}</strong> matching events
          <span className="mx-2 text-black/20">·</span>
          {data?.agencyTotal ?? 0} recorded
        </p>
        <button type="button" onClick={() => { setPage(0); void load(0, pageSize); }} className="inline-flex items-center gap-2 text-xs font-medium text-black/55 hover:text-black">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh
        </button>
      </div>

      {error ? <p role="alert" className="py-5 text-sm text-red-700">{error}</p> : null}
      {!error && !loading && entries.length === 0 ? <p className="py-10 text-center text-sm text-black/45">No activity matches these filters.</p> : null}

      <div className="divide-y divide-black/10">
        {entries.map(entry => <ActivityRow key={entry.id} entry={entry} clientName={clients.find(client => client.id === entry.clientId)?.name} />)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
        <Pagination
          label="Activity log pages"
          page={page}
          pageCount={pageSize === "all" ? 1 : Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))}
          disabled={loading}
          onPage={next => { setPage(next); void load(next, pageSize); }}
        />
        <label className="flex items-center gap-2 text-xs text-black/55">
          Per page
          <select
            value={String(pageSize)}
            onChange={event => {
              const value = event.target.value === "all" ? "all" as const : Number(event.target.value);
              setPageSize(value);
            }}
            className="min-h-9 rounded-md border border-black/15 bg-white px-2 text-sm text-black/70"
            aria-label="Results per page"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function ActivityRow({ entry, clientName }: { entry: ActivityEntry; clientName?: string }) {
  const [open, setOpen] = useState(false);
  const hasMetadata = Boolean(entry.metadata && Object.keys(entry.metadata).length);
  return (
    <article className="py-4">
      <button type="button" onClick={() => hasMetadata && setOpen(value => !value)} className="grid w-full gap-2 text-left md:grid-cols-[150px_minmax(0,1fr)_180px_20px] md:items-start">
        <time className="text-xs tabular-nums text-black/40" dateTime={isoDateTimeValue(entry.ts)}>{formatTime(entry.ts)}</time>
        <span>
          <span className="block text-sm font-medium text-black/80">{entry.message}</span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-black/45">
            <span>{friendly(entry.category)}</span>
            <span>{friendly(entry.action)}</span>
            {clientName ? <span>{clientName}</span> : null}
          </span>
        </span>
        <span className="truncate text-xs text-black/45">{entry.actorEmail || entry.actorUserId || "System"}</span>
        <ChevronDown size={15} className={`text-black/35 transition ${open ? "rotate-180" : ""} ${hasMetadata ? "" : "invisible"}`} />
      </button>
      {open && hasMetadata ? (
        <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-black/[0.04] p-3 text-xs leading-5 text-black/65">{JSON.stringify(entry.metadata, null, 2)}</pre>
      ) : null}
    </article>
  );
}

function buildParams(filters: Filters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key === "clientId" ? "clientId" : key, value);
  });
  return params.toString();
}

function friendly(value: string): string {
  return value.replaceAll(".", " ").replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatTime(value: number): string {
  return formatUkDateTime(value);
}

const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none focus:border-black/35";
