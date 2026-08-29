"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Code2, FileSearch, Globe2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { mapScannedForm } from "@/lib/enquiries/clientFormMapping";

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
interface ScannedField { name: string; label?: string }
interface FormSummary { label: string; capturable: boolean; fieldCount: number; fields: ScannedField[] }

// The API returns full field schemas. The chips only need a count — but the
// FIELDS are kept now too, because the mapping below is computed from them
// right here rather than through another round trip. `mapScannedForm` has no
// server dependency (it imports only `isCoreField`), so asking the server to
// run it would be a request whose whole purpose is to call a pure function.
function toSummaries(schemas: unknown): FormSummary[] {
  if (!Array.isArray(schemas)) return [];
  return schemas.map(schema => {
    const s = schema as { label?: unknown; capturable?: unknown; fields?: unknown };
    const fields = Array.isArray(s.fields)
      ? s.fields.flatMap(field => {
          const f = field as { name?: unknown; label?: unknown };
          return typeof f.name === "string" && f.name
            ? [{ name: f.name, label: typeof f.label === "string" ? f.label : undefined }]
            : [];
        })
      : [];
    return {
      label: typeof s.label === "string" ? s.label : "Form",
      capturable: s.capturable === true,
      fieldCount: fields.length,
      fields,
    };
  });
}

const ROLE_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  message: "Message",
  submittedAt: "Submitted",
};

/**
 * What the Tag scanned, mapped onto Aqua's own enquiry fields.
 *
 * Ed, 2026-08-27: *"press a button instant mapping."* The mapping is shown
 * rather than applied — it is a proposal, and the fields it could NOT place are
 * listed beside it. A preview that quietly dropped three questions is how
 * somebody approves a mapping that loses them.
 */
function FormMapping({ fields, clientId }: { fields: ScannedField[]; clientId?: string }) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mapped = mapScannedForm(fields);
  const placed = (Object.entries(mapped.roles) as Array<[string, { column?: string; source: string }]>)
    .filter(([, role]) => Boolean(role.column) && role.source !== "absent");

  async function keep() {
    if (!clientId) return;
    setSaving(true);
    setNote(null);
    try {
      const roles = mapped.roles as Record<string, { column?: string } | undefined>;
      const response = await fetch("/api/portal/website-sources/mapping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          columnName: roles.name?.column ?? "",
          columnEmail: roles.email?.column ?? "",
          columnPhone: roles.phone?.column ?? "",
          columnMessage: roles.message?.column ?? "",
          columnSubmittedAt: roles.submittedAt?.column ?? "",
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      // 409 is the ordinary case of "no Supabase connected yet", and the server
      // sends the sentence to say so. Anything else gets a generic line rather
      // than an internal error string.
      setNote(payload?.ok
        ? "Saved. Enquiries from this form will be read with these columns."
        : payload?.message || "Could not save this mapping.");
    } catch {
      setNote("Could not save this mapping.");
    } finally {
      setSaving(false);
    }
  }

  if (!placed.length && !mapped.unmapped.length) return null;
  return (
    <div className="mt-2 rounded-md border border-black/10 bg-black/[0.02] p-2 text-[10px]">
      <p className="mb-1 font-semibold uppercase tracking-wide text-black/45">Detected mapping</p>
      <ul className="grid gap-0.5">
        {placed.map(([role, detail]) => (
          <li key={role} className="flex items-center gap-1.5 text-black/70">
            <span className="font-medium">{ROLE_LABELS[role] ?? role}</span>
            <span className="text-black/35">←</span>
            <code className="rounded bg-black/[0.06] px-1">{detail.column}</code>
          </li>
        ))}
      </ul>
      {mapped.unmapped.length ? (
        <p className="mt-1.5 text-black/45">
          Kept as extra answers: {mapped.unmapped.map((field: ScannedField) => field.name).join(", ")}
        </p>
      ) : null}
      {/* Only for a site routed to a CLIENT. The mapping is stored on that
          client's own Supabase connection, so there is nowhere to put one for a
          site that goes to our own inbox — those merge into the internal fields
          instead, which is the distinction Ed drew on 2026-08-27. */}
      {clientId ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/8 pt-2">
          <button
            type="button"
            onClick={() => void keep()}
            disabled={saving}
            className="inline-flex min-h-6 items-center gap-1 rounded border border-black/15 bg-white px-2 py-0.5 font-medium text-black/70 transition hover:bg-black/[0.04] disabled:opacity-50"
          >
            {saving ? <LoaderCircle size={11} className="animate-spin" aria-hidden="true" /> : null}
            {saving ? "Saving…" : "Use this mapping"}
          </button>
          {note ? <span className="text-black/50" role="status">{note}</span> : null}
        </div>
      ) : null}
    </div>
  );
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
    const confirmed = window.confirm(
      `Permanently remove ${source.host}? This deletes its registration, tool injections and imported form schemas. This cannot be undone.`,
    );
    if (!confirmed) return;
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
                    title="Seed this tagged site into Dev Editor Engine — discover its repo, edit, publish"
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
                  aria-label={`Permanently remove ${source.host}`}
                  title="Delete this registered site, its tool injections and imported form schemas"
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
              {/* Only for forms the Tag would actually capture — mapping a
                  login or a search box is noise about something that will never
                  produce an enquiry. */}
              {formsBySource[source.id]?.filter(form => form.capturable && form.fields.length).map((form, index) => (
                <FormMapping key={`map-${index}`} fields={form.fields} clientId={source.destinationClientId} />
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
