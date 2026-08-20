"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Code2, FileSearch, Globe2, LoaderCircle, Plus, Trash2 } from "lucide-react";

/**
 * Where each tagged website's submissions land.
 *
 * The control panel behind the routing: register a site by its address and
 * point it at the agency inbox, a specific client, or one of your own trading
 * companies. This is the answer to "I tagged my new company's site — how do I
 * make its enquiries come to the right place, not a client?": add it here and
 * choose.
 *
 * A site has one home. The destination dropdown carries the kind alongside the
 * id (`client:…` / `company:…`, or the inbox sentinel) so choosing a company
 * clears any client and vice-versa — mirroring the server's client-XOR-company
 * rule, and never silently dropping a company route the way a client-only
 * control would.
 *
 * Fetches its own data so it can be dropped into the Channels view without the
 * inbox page having to carry it.
 */

interface WebsiteSource {
  id: string;
  host: string;
  label: string;
  destinationClientId?: string;
  destinationCompanyId?: string;
}
interface ClientOption { id: string; name: string }
interface CompanyOption { id: string; name: string }
interface FormSummary { label: string; capturable: boolean; fieldCount: number }

// The API returns full field schemas; the panel only needs each form's name, its
// field count and whether the tag would capture it.
function toSummaries(schemas: unknown): FormSummary[] {
  if (!Array.isArray(schemas)) return [];
  return schemas.map(schema => {
    const s = schema as { label?: unknown; capturable?: unknown; fields?: unknown };
    return {
      label: typeof s.label === "string" ? s.label : "Form",
      capturable: s.capturable === true,
      fieldCount: Array.isArray(s.fields) ? s.fields.length : 0,
    };
  });
}

const AGENCY = "__agency__";

// The dropdown value encodes the destination kind so a client and a company id
// can never be confused. `add`/`reroute` translate it back into the single
// field the routing API expects.
type Routing = { destinationClientId?: string; destinationCompanyId?: string };
function decodeDestination(value: string): Routing {
  if (value.startsWith("client:")) return { destinationClientId: value.slice(7) };
  if (value.startsWith("company:")) return { destinationCompanyId: value.slice(8) };
  return {};
}
function encodeDestination(source: Pick<WebsiteSource, "destinationClientId" | "destinationCompanyId">): string {
  if (source.destinationCompanyId) return `company:${source.destinationCompanyId}`;
  if (source.destinationClientId) return `client:${source.destinationClientId}`;
  return AGENCY;
}

export function WebsiteSourcesConfig() {
  const [sources, setSources] = useState<WebsiteSource[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [destination, setDestination] = useState(AGENCY);
  const [busy, setBusy] = useState(false);
  const [formsBySource, setFormsBySource] = useState<Record<string, FormSummary[]>>({});
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        const data = await (await fetch("/api/portal/website-sources")).json() as { ok: boolean; sources?: WebsiteSource[]; clients?: ClientOption[]; companies?: CompanyOption[]; formSchemasBySource?: Record<string, unknown> };
        if (data.ok) {
          setSources(data.sources ?? []); setClients(data.clients ?? []); setCompanies(data.companies ?? []);
          const map: Record<string, FormSummary[]> = {};
          for (const [id, schemas] of Object.entries(data.formSchemasBySource ?? {})) map[id] = toSummaries(schemas);
          setFormsBySource(map);
        }
      } catch { /* leave the empty state */ }
      finally { setLoading(false); }
    })();
  }, []);

  const clientName = (id?: string) => clients.find(c => c.id === id)?.name;
  const companyName = (id?: string) => companies.find(c => c.id === id)?.name;
  const describe = (source: WebsiteSource) =>
    source.destinationCompanyId
      ? `Enquiries go to ${companyName(source.destinationCompanyId) ?? "one of your companies"} · your company`
      : source.destinationClientId
        ? `Enquiries go to ${clientName(source.destinationClientId) ?? "a client"}`
        : "Enquiries go to your inbox";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!host.trim()) { setError("Enter the website address."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", host, ...decodeDestination(destination) }),
      });
      const data = await response.json() as { ok: boolean; error?: string; source?: WebsiteSource };
      if (!response.ok || !data.ok || !data.source) throw new Error(data.error ?? "That could not be added.");
      setSources(current => [...current, data.source!].sort((a, b) => a.host.localeCompare(b.host)));
      setHost(""); setDestination(AGENCY);
    } catch (err) { setError(err instanceof Error ? err.message : "That could not be added."); }
    finally { setBusy(false); }
  }

  async function reroute(source: WebsiteSource, routing: Routing) {
    setError(null);
    const previous = { destinationClientId: source.destinationClientId, destinationCompanyId: source.destinationCompanyId };
    // Clear both homes then set the chosen one, so the row never shows two for a beat.
    setSources(current => current.map(s => s.id === source.id ? { ...s, destinationClientId: undefined, destinationCompanyId: undefined, ...routing } : s));
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id: source.id, ...routing }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setSources(current => current.map(s => s.id === source.id ? { ...s, ...previous } : s));
      setError("That change could not be saved.");
    }
  }

  async function remove(source: WebsiteSource) {
    setError(null);
    setSources(current => current.filter(s => s.id !== source.id));
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", id: source.id }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setError("That could not be removed.");
      setSources(current => [...current, source].sort((a, b) => a.host.localeCompare(b.host)));
    }
  }

  // Import forms — read the site's real forms so enquiries mirror them (plan
  // Phase 2). Server-side, SSRF-safe; here we just show what came back.
  async function importForms(source: WebsiteSource) {
    setImportingId(source.id);
    setImportNote(current => ({ ...current, [source.id]: "" }));
    try {
      const response = await fetch("/api/portal/website-sources", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import-forms", id: source.id }),
      });
      const data = await response.json() as { ok: boolean; error?: string; schemas?: unknown };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "The forms could not be imported.");
      const summaries = toSummaries(data.schemas);
      setFormsBySource(current => ({ ...current, [source.id]: summaries }));
      setImportNote(current => ({
        ...current,
        [source.id]: summaries.length ? `${summaries.length} form${summaries.length === 1 ? "" : "s"} found.` : "No forms found on the page.",
      }));
    } catch (err) {
      setImportNote(current => ({ ...current, [source.id]: err instanceof Error ? err.message : "The forms could not be imported." }));
    } finally {
      setImportingId(null);
    }
  }

  return (
    <section className="mm-surface-card rounded-md p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 pb-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-brand/10 text-brand"><Globe2 size={18} aria-hidden /></span>
          <div>
            <h2 className="text-sm font-semibold text-black/80">Website sources &amp; routing</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-black/50">
              Where each tagged site&rsquo;s submissions land — your inbox, a specific client&rsquo;s, or one of
              your own companies. Set up and tag your own sites over in the Command Centre.
            </p>
          </div>
        </div>
        <Link href="/portal/agency/fulfilment?view=tags" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.04]">
          Master tags <ArrowRight size={13} aria-hidden />
        </Link>
      </div>

      <form onSubmit={add} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-start">
        <input
          value={host}
          onChange={event => setHost(event.target.value)}
          placeholder="cedar-dental.com"
          className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm outline-none focus:border-black/30"
        />
        <select
          value={destination}
          onChange={event => setDestination(event.target.value)}
          aria-label="Where submissions from this site go"
          className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm"
        >
          <option value={AGENCY}>→ Your inbox</option>
          {clients.length > 0 && (
            <optgroup label="Clients">
              {clients.map(client => <option key={client.id} value={`client:${client.id}`}>→ {client.name}</option>)}
            </optgroup>
          )}
          {companies.length > 0 && (
            <optgroup label="Your companies">
              {companies.map(company => <option key={company.id} value={`company:${company.id}`}>→ {company.name}</option>)}
            </optgroup>
          )}
        </select>
        <button
          type="submit"
          disabled={busy || !host.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-45"
        >
          {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
          Add site
        </button>
      </form>
      {error ? <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-xs text-black/40">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-black/12 bg-black/[0.015] px-3 py-4 text-xs leading-5 text-black/50">
          No sites registered yet — so everything routes to your inbox. Add a client&rsquo;s or company&rsquo;s
          tagged site above to send its enquiries straight there instead.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {sources.map(source => (
            <li key={source.id} className="rounded-md border border-black/10 bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-black/80">
                  {source.destinationCompanyId ? <Building2 size={13} className="shrink-0 text-brand" aria-hidden /> : null}
                  {source.host}
                </p>
                <p className="text-[11px] text-black/45">{describe(source)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void importForms(source)}
                  disabled={importingId === source.id}
                  title="Read this site's forms so its enquiries mirror them field-for-field"
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/12 px-2 text-xs font-semibold text-black/60 hover:border-black/25 hover:text-black disabled:opacity-50"
                >
                  {importingId === source.id ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <FileSearch size={13} aria-hidden />} Import forms
                </button>
                {source.destinationClientId ? (
                  <Link
                    href={`/portal/clients/${source.destinationClientId}/sites`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black/12 px-2 text-xs font-semibold text-black/60 hover:border-black/25 hover:text-black"
                    title="Seed this tagged site into Aqua Engine — discover its repo, edit, publish"
                  >
                    <Code2 size={13} aria-hidden /> Editor
                  </Link>
                ) : null}
                <select
                  value={encodeDestination(source)}
                  onChange={event => void reroute(source, decodeDestination(event.target.value))}
                  aria-label={`Where ${source.host} routes`}
                  className="min-h-9 rounded-md border border-black/12 bg-white px-2 text-xs"
                >
                  <option value={AGENCY}>→ Your inbox</option>
                  {clients.length > 0 && (
                    <optgroup label="Clients">
                      {clients.map(client => <option key={client.id} value={`client:${client.id}`}>→ {client.name}</option>)}
                    </optgroup>
                  )}
                  {companies.length > 0 && (
                    <optgroup label="Your companies">
                      {companies.map(company => <option key={company.id} value={`company:${company.id}`}>→ {company.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => void remove(source)}
                  aria-label={`Remove ${source.host}`}
                  className="grid size-9 place-items-center rounded-md border border-black/10 text-black/35 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                ><Trash2 size={14} aria-hidden /></button>
              </div>
              </div>
              {importNote[source.id] ? <p className="mt-1.5 text-[11px] text-black/50">{importNote[source.id]}</p> : null}
              {formsBySource[source.id]?.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {formsBySource[source.id].map((form, index) => (
                    <li
                      key={index}
                      title={`${form.fieldCount} field${form.fieldCount === 1 ? "" : "s"}${form.capturable ? " · captured" : " · not captured"}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${form.capturable ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-black/50"}`}
                    >
                      {form.label} · {form.fieldCount} field{form.fieldCount === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
