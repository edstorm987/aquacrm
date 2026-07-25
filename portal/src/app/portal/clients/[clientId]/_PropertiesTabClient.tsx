"use client";

import { Check, Globe2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

export type ClientPropertyKind = "website" | "client-portal" | "dev-portal" | "repo" | "template" | "tag";
export type ClientPropertyStatus = "planning" | "building" | "review" | "live" | "redirected" | "archived";
export type ClientPropertyTagStatus = "planned" | "installed" | "missing" | "broken" | "not-needed";

export interface ClientProperty {
  id: string;
  label: string;
  kind: ClientPropertyKind;
  status: ClientPropertyStatus;
  localPath?: string;
  repoUrl?: string;
  liveUrl?: string;
  previewUrl?: string;
  vercelProject?: string;
  redirectTarget?: string;
  tagStatus?: ClientPropertyTagStatus;
  notes?: string;
  updatedAt: number;
}

const KIND_OPTIONS: { value: ClientPropertyKind; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "client-portal", label: "Client portal" },
  { value: "dev-portal", label: "Dev portal" },
  { value: "repo", label: "Repository" },
  { value: "template", label: "Template" },
  { value: "tag", label: "Milesymedia tag" },
];

const STATUS_OPTIONS: { value: ClientPropertyStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "building", label: "Building" },
  { value: "review", label: "Review" },
  { value: "live", label: "Live" },
  { value: "redirected", label: "Redirected" },
  { value: "archived", label: "Archived" },
];

const TAG_OPTIONS: { value: ClientPropertyTagStatus; label: string }[] = [
  { value: "planned", label: "Tag planned" },
  { value: "installed", label: "Tag installed" },
  { value: "missing", label: "Tag missing" },
  { value: "broken", label: "Tag broken" },
  { value: "not-needed", label: "Not needed" },
];

const EMPTY_DRAFT = {
  label: "",
  kind: "website" as ClientPropertyKind,
  status: "building" as ClientPropertyStatus,
  localPath: "",
  repoUrl: "",
  liveUrl: "",
  previewUrl: "",
  vercelProject: "",
  redirectTarget: "",
  tagStatus: "planned" as ClientPropertyTagStatus,
  notes: "",
};

type PropertyDraft = typeof EMPTY_DRAFT;

const STATUS_STYLE: Record<ClientPropertyStatus, string> = {
  planning: "bg-black/5 text-black/65",
  building: "bg-amber-50 text-amber-800",
  review: "bg-blue-50 text-blue-800",
  live: "bg-emerald-50 text-emerald-800",
  redirected: "bg-violet-50 text-violet-800",
  archived: "bg-black/10 text-black/45",
};

function prettyKind(kind: ClientPropertyKind): string {
  return KIND_OPTIONS.find(k => k.value === kind)?.label ?? kind;
}

function prettyTag(status?: ClientPropertyTagStatus): string {
  if (!status) return "Tag not tracked";
  return TAG_OPTIONS.find(t => t.value === status)?.label ?? status;
}

function externalUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return undefined;
}

function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

const CONTROL_CLASS = "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black/80 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export function PropertiesTabClient({
  clientId,
  clientName,
  initialProperties,
}: {
  clientId: string;
  clientName: string;
  initialProperties: ClientProperty[];
}) {
  const [properties, setProperties] = useState<ClientProperty[]>(initialProperties);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PropertyDraft>(EMPTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    total: properties.length,
    live: properties.filter(p => p.status === "live" || p.status === "redirected").length,
    tagInstalled: properties.filter(p => p.tagStatus === "installed").length,
    repos: properties.filter(p => p.repoUrl).length,
  }), [properties]);

  async function saveProperty() {
    setError(null);
    if (!draft.label.trim()) {
      setError("Product name required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tenants/client-properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "add", property: draft }),
      });
      const data = await res.json() as { ok: boolean; error?: string; properties?: ClientProperty[] };
      if (!data.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      setProperties(data.properties ?? []);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(property: ClientProperty, status: ClientPropertyStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "update", property: { id: property.id, status } }),
      });
      const data = await res.json() as { ok: boolean; error?: string; properties?: ClientProperty[] };
      if (!data.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setProperties(data.properties ?? []);
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(property: ClientProperty) {
    setEditingId(property.id);
    setConfirmDeleteId(null);
    setEditDraft({
      label: property.label,
      kind: property.kind,
      status: property.status,
      localPath: property.localPath ?? "",
      repoUrl: property.repoUrl ?? "",
      liveUrl: property.liveUrl ?? "",
      previewUrl: property.previewUrl ?? "",
      vercelProject: property.vercelProject ?? "",
      redirectTarget: property.redirectTarget ?? "",
      tagStatus: property.tagStatus ?? "planned",
      notes: property.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!editingId || !editDraft.label.trim()) {
      setError("Product name required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          action: "update",
          property: { id: editingId, ...editDraft },
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; properties?: ClientProperty[] };
      if (!data.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setProperties(data.properties ?? []);
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProperty(propertyId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "delete", propertyId }),
      });
      const data = await res.json() as { ok: boolean; error?: string; properties?: ClientProperty[] };
      if (!data.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }
      setProperties(data.properties ?? []);
      setConfirmDeleteId(null);
      if (editingId === propertyId) setEditingId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-black/90">Development</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-black/60">
            Keep every website, portal, preview, repository, handoff, and monitoring connection for {clientName} in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(v => !v)}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white shadow hover:opacity-90"
        >
          {adding ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          {adding ? "Cancel" : "Add website or product"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Products" value={counts.total} />
        <Metric label="Live / redirected" value={counts.live} />
        <Metric label="Repos linked" value={counts.repos} />
        <Metric label="Tags installed" value={counts.tagInstalled} />
      </div>

      {adding && (
        <form
          onSubmit={e => { e.preventDefault(); void saveProperty(); }}
          className="grid gap-4 rounded-md border border-black/10 bg-white p-5 lg:grid-cols-2"
        >
          <div className="border-b border-black/10 pb-4 lg:col-span-2">
            <p className="text-sm font-semibold text-black/82">Connect a client product</p>
            <p className="mt-1 text-xs leading-5 text-black/45">
              Start with the product and its customer-facing links. Repository and deployment details can be added below when they exist.
            </p>
          </div>
          <Field label="Product name" htmlFor="property-name">
            <input id="property-name" autoFocus value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} className={CONTROL_CLASS} placeholder="Main website" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="property-kind">
              <select id="property-kind" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value as ClientPropertyKind }))} className={CONTROL_CLASS}>
                {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Status" htmlFor="property-status">
              <select id="property-status" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value as ClientPropertyStatus }))} className={CONTROL_CLASS}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Preview URL" htmlFor="property-preview-url">
            <input id="property-preview-url" type="url" value={draft.previewUrl} onChange={e => setDraft(d => ({ ...d, previewUrl: e.target.value }))} className={CONTROL_CLASS} placeholder="https://project.vercel.app" />
          </Field>
          <Field label="Live URL" htmlFor="property-live-url">
            <input id="property-live-url" type="url" value={draft.liveUrl} onChange={e => setDraft(d => ({ ...d, liveUrl: e.target.value }))} className={CONTROL_CLASS} placeholder="https://client-domain.com" />
          </Field>
          <details className="group border-t border-black/10 pt-4 lg:col-span-2">
            <summary className="cursor-pointer text-sm font-medium text-black/62 marker:text-black/35">
              Repository, deployment and handoff details
            </summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Field label="GitHub repository" htmlFor="property-repo-url">
                <input id="property-repo-url" type="url" value={draft.repoUrl} onChange={e => setDraft(d => ({ ...d, repoUrl: e.target.value }))} className={CONTROL_CLASS} placeholder="https://github.com/..." />
              </Field>
              <Field label="Vercel project" htmlFor="property-vercel-project">
                <input id="property-vercel-project" value={draft.vercelProject} onChange={e => setDraft(d => ({ ...d, vercelProject: e.target.value }))} className={CONTROL_CLASS} placeholder="Project name or dashboard URL" />
              </Field>
              <Field label="Local project folder" htmlFor="property-local-path">
                <input id="property-local-path" value={draft.localPath} onChange={e => setDraft(d => ({ ...d, localPath: e.target.value }))} className={CONTROL_CLASS} placeholder="/Users/eds/Desktop/Projects/..." />
              </Field>
              <Field label="Portal handoff URL" htmlFor="property-redirect-target">
                <input id="property-redirect-target" type="url" value={draft.redirectTarget} onChange={e => setDraft(d => ({ ...d, redirectTarget: e.target.value }))} className={CONTROL_CLASS} placeholder="Where the customer signs in after handoff" />
              </Field>
              <Field label="Monitoring" htmlFor="property-tag-status">
                <select id="property-tag-status" value={draft.tagStatus} onChange={e => setDraft(d => ({ ...d, tagStatus: e.target.value as ClientPropertyTagStatus }))} className={CONTROL_CLASS}>
                  {TAG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Internal notes" htmlFor="property-notes">
                <textarea id="property-notes" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} className={`${CONTROL_CLASS} min-h-20 resize-y`} placeholder="What needs checking, technical context, or handoff notes." />
              </Field>
            </div>
          </details>
          <div className="flex items-center gap-3 lg:col-span-2">
            <button disabled={busy} type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
              Connect product
            </button>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </div>
        </form>
      )}

      {error && !adding && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {properties.length === 0 ? (
        <div className="rounded-md border border-dashed border-black/15 bg-white p-10 text-center">
          <Globe2 size={22} className="mx-auto text-black/24" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-black/80">No products connected yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/50">Connect the website or portal you are building, then add its preview, repository, deployment, and monitoring as they become available.</p>
          <button type="button" onClick={() => setAdding(true)} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white">
            <Plus size={15} aria-hidden="true" />
            Add first product
          </button>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {properties.map(property => (
            <article key={property.id} className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-black/90">{property.label}</h3>
                    <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/55">{prettyKind(property.kind)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLE[property.status]}`}>{property.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-black/45">Updated {formatUpdatedAt(property.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={property.status}
                    disabled={busy || editingId === property.id}
                    onChange={e => updateStatus(property, e.target.value as ClientPropertyStatus)}
                    className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs"
                    aria-label={`Status for ${property.label}`}
                  >
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => editingId === property.id ? setEditingId(null) : beginEdit(property)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/15 text-black/55 hover:bg-black/[0.03]"
                    title={editingId === property.id ? "Close editor" : "Edit product"}
                  >
                    {editingId === property.id ? <X size={14} /> : <Pencil size={14} />}
                  </button>
                </div>
              </div>

              {editingId === property.id ? (
                <form onSubmit={event => { event.preventDefault(); void saveEdit(); }} className="mt-5 grid gap-3 border-t border-black/10 pt-5">
                  <PropertyEditorFields draft={editDraft} setDraft={setEditDraft} prefix={`edit-${property.id}`} />
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    {confirmDeleteId === property.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-700">Remove this product?</span>
                        <button type="button" onClick={() => void deleteProperty(property.id)} disabled={busy} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-red-700 px-3 text-xs font-medium text-white">
                          <Trash2 size={13} /> Remove
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="min-h-9 rounded-md border border-black/15 px-3 text-xs">Keep</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDeleteId(property.id)} className="inline-flex min-h-9 items-center gap-1 text-xs text-red-700">
                        <Trash2 size={13} /> Remove product
                      </button>
                    )}
                    <button type="submit" disabled={busy || !editDraft.label.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white disabled:opacity-45">
                      <Check size={14} /> Save changes
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <PropertyLine label="Local" value={property.localPath} mono />
                    <PropertyLine label="Repo" value={property.repoUrl} href={externalUrl(property.repoUrl)} />
                    <PropertyLine label="Live" value={property.liveUrl} href={externalUrl(property.liveUrl)} />
                    <PropertyLine label="Preview" value={property.previewUrl} href={externalUrl(property.previewUrl)} />
                    <PropertyLine label="Vercel" value={property.vercelProject} href={externalUrl(property.vercelProject)} />
                    <PropertyLine label="Redirect" value={property.redirectTarget} href={externalUrl(property.redirectTarget)} />
                    <PropertyLine label="Tag" value={prettyTag(property.tagStatus)} />
                  </dl>

                  {property.notes && (
                    <p className="mt-4 whitespace-pre-wrap rounded-md bg-black/[0.02] p-3 text-sm leading-6 text-black/65">{property.notes}</p>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PropertyEditorFields({
  draft,
  setDraft,
  prefix,
}: {
  draft: PropertyDraft;
  setDraft: React.Dispatch<React.SetStateAction<PropertyDraft>>;
  prefix: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Field label="Name" htmlFor={`${prefix}-name`}>
        <input id={`${prefix}-name`} value={draft.label} onChange={event => setDraft(value => ({ ...value, label: event.target.value }))} className={CONTROL_CLASS} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${prefix}-kind`}>
          <select id={`${prefix}-kind`} value={draft.kind} onChange={event => setDraft(value => ({ ...value, kind: event.target.value as ClientPropertyKind }))} className={CONTROL_CLASS}>
            {KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor={`${prefix}-status`}>
          <select id={`${prefix}-status`} value={draft.status} onChange={event => setDraft(value => ({ ...value, status: event.target.value as ClientPropertyStatus }))} className={CONTROL_CLASS}>
            {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Local path" htmlFor={`${prefix}-local`}>
        <input id={`${prefix}-local`} value={draft.localPath} onChange={event => setDraft(value => ({ ...value, localPath: event.target.value }))} className={CONTROL_CLASS} placeholder="/Users/eds/Desktop/Projects/..." />
      </Field>
      <Field label="GitHub repo" htmlFor={`${prefix}-repo`}>
        <input id={`${prefix}-repo`} type="url" value={draft.repoUrl} onChange={event => setDraft(value => ({ ...value, repoUrl: event.target.value }))} className={CONTROL_CLASS} placeholder="https://github.com/..." />
      </Field>
      <Field label="Live URL" htmlFor={`${prefix}-live`}>
        <input id={`${prefix}-live`} type="url" value={draft.liveUrl} onChange={event => setDraft(value => ({ ...value, liveUrl: event.target.value }))} className={CONTROL_CLASS} placeholder="https://..." />
      </Field>
      <Field label="Preview URL" htmlFor={`${prefix}-preview`}>
        <input id={`${prefix}-preview`} type="url" value={draft.previewUrl} onChange={event => setDraft(value => ({ ...value, previewUrl: event.target.value }))} className={CONTROL_CLASS} placeholder="https://...vercel.app" />
      </Field>
      <Field label="Vercel project" htmlFor={`${prefix}-vercel`}>
        <input id={`${prefix}-vercel`} value={draft.vercelProject} onChange={event => setDraft(value => ({ ...value, vercelProject: event.target.value }))} className={CONTROL_CLASS} placeholder="Project name or dashboard URL" />
      </Field>
      <Field label="Portal handoff URL" htmlFor={`${prefix}-redirect`}>
        <input id={`${prefix}-redirect`} type="url" value={draft.redirectTarget} onChange={event => setDraft(value => ({ ...value, redirectTarget: event.target.value }))} className={CONTROL_CLASS} placeholder="Where the customer lands after handoff" />
      </Field>
      <Field label="Milesymedia tag" htmlFor={`${prefix}-tag`}>
        <select id={`${prefix}-tag`} value={draft.tagStatus} onChange={event => setDraft(value => ({ ...value, tagStatus: event.target.value as ClientPropertyTagStatus }))} className={CONTROL_CLASS}>
          {TAG_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <Field label="Internal notes" htmlFor={`${prefix}-notes`}>
        <textarea id={`${prefix}-notes`} value={draft.notes} onChange={event => setDraft(value => ({ ...value, notes: event.target.value }))} className={`${CONTROL_CLASS} min-h-24 resize-y`} />
      </Field>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-black/10 bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-black/90">{value}</div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-black/70">
        {label}
      </label>
      {children}
    </div>
  );
}

function PropertyLine({ label, value, href, mono }: { label: string; value?: string; href?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-black/40">{label}</dt>
      <dd className={`min-w-0 text-black/75 ${mono ? "font-mono text-xs" : ""}`}>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">{value} ↗</a>
        ) : (
          <span className="break-all">{value}</span>
        )}
      </dd>
    </div>
  );
}
