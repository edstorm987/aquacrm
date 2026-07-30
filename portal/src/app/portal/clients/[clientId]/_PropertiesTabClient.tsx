"use client";

import { Check, FolderGit2, Globe2, LoaderCircle, LockKeyhole, Pencil, Plus, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";

export type ClientPropertyKind = "website" | "client-portal" | "dev-portal" | "software" | "lead-magnet" | "repo" | "template" | "tag";
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
  projectSlug?: string;
  starterId?: string;
  repositoryStatus?: "not-created" | "local" | "connected";
  deploymentStatus?: "not-deployed" | "preview" | "production";
  initialCommit?: string;
  provisionedAt?: number;
  vercelDeploymentId?: string;
  deploymentReadyState?: string;
  lastDeployedAt?: number;
  updatedAt: number;
}

const KIND_OPTIONS: { value: ClientPropertyKind; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "client-portal", label: "Client portal" },
  { value: "dev-portal", label: "Dev portal" },
  { value: "software", label: "Software" },
  { value: "lead-magnet", label: "Lead magnet" },
  { value: "repo", label: "Repository" },
  { value: "template", label: "Template" },
  { value: "tag", label: "Aqua tag" },
];

const STATUS_OPTIONS: { value: ClientPropertyStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "building", label: "Building" },
  { value: "review", label: "Review" },
  { value: "live", label: "Live" },
  { value: "redirected", label: "Handed over" },
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
  githubPublishingConfigured,
  vercelDeploymentConfigured,
}: {
  clientId: string;
  clientName: string;
  initialProperties: ClientProperty[];
  githubPublishingConfigured: boolean;
  vercelDeploymentConfigured: boolean;
}) {
  const [properties, setProperties] = useState<ClientProperty[]>(initialProperties);
  const [adding, setAdding] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [projectName, setProjectName] = useState(`${clientName} website`);
  const [starterId, setStarterId] = useState("luxury-service-site");
  const [provisionedPath, setProvisionedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PropertyDraft>(EMPTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    total: properties.length,
    live: properties.filter(p => p.status === "live" || p.status === "redirected").length,
    tagInstalled: properties.filter(p => p.tagStatus === "installed").length,
    repos: properties.filter(p => p.repoUrl || p.repositoryStatus === "local" || p.repositoryStatus === "connected").length,
  }), [properties]);

  async function provisionProject() {
    setError(null);
    setProvisionedPath(null);
    if (!projectName.trim()) {
      setError("Project name required.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/tenants/client-projects/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, projectName, starterId }),
      });
      const data = await response.json() as {
        ok: boolean;
        error?: string;
        properties?: ClientProperty[];
        workspace?: { localPath?: string };
      };
      if (!data.ok) {
        setError(data.error ?? "Project provisioning failed.");
        return;
      }
      setProperties(data.properties ?? []);
      setProvisionedPath(data.workspace?.localPath ?? null);
      setProvisioning(false);
      setProjectName(`${clientName} website`);
    } catch {
      setError("Project provisioning failed. Check the local server and try again.");
    } finally {
      setBusy(false);
    }
  }

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

  async function publishRepository(property: ClientProperty) {
    if (!githubPublishingConfigured) {
      setError("GitHub is not connected. Add a fresh GITHUB_TOKEN to the server environment first.");
      return;
    }
    setPublishingId(property.id);
    setError(null);
    try {
      const response = await fetch("/api/tenants/client-projects/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, propertyId: property.id }),
      });
      const data = await response.json() as { ok: boolean; error?: string; properties?: ClientProperty[] };
      if (!data.ok) {
        setError(data.error ?? "Repository publishing failed.");
        return;
      }
      setProperties(data.properties ?? []);
    } catch {
      setError("Repository publishing failed. Check the server connection and try again.");
    } finally {
      setPublishingId(null);
    }
  }

  async function deployPreview(property: ClientProperty) {
    if (!vercelDeploymentConfigured) {
      setError("Vercel is not connected. Add VERCEL_TOKEN to the server environment first.");
      return;
    }
    setDeployingId(property.id);
    setError(null);
    try {
      const response = await fetch("/api/tenants/client-projects/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, propertyId: property.id }),
      });
      const data = await response.json() as { ok: boolean; error?: string; properties?: ClientProperty[] };
      if (!data.ok) {
        setError(data.error ?? "Preview deployment failed.");
        return;
      }
      setProperties(data.properties ?? []);
    } catch {
      setError("Preview deployment failed. Check the server connection and try again.");
    } finally {
      setDeployingId(null);
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setProvisioning(value => !value);
              setAdding(false);
              setError(null);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white shadow hover:opacity-90"
          >
            {provisioning ? <X size={15} aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
            {provisioning ? "Cancel" : "Provision project"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(value => !value);
              setProvisioning(false);
              setError(null);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-white px-4 text-sm font-medium text-black/72 hover:bg-black/[0.03]"
          >
            {adding ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            {adding ? "Cancel" : "Connect existing"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Products" value={counts.total} />
        <Metric label="Live / redirected" value={counts.live} />
        <Metric label="Repositories" value={counts.repos} />
        <Metric label="Tags installed" value={counts.tagInstalled} />
      </div>

      {provisioning && (
        <form
          onSubmit={event => {
            event.preventDefault();
            void provisionProject();
          }}
          className="grid gap-5 rounded-md bg-[#171613] p-5 text-white lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)_auto] lg:items-end"
        >
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 text-[#c9ab76]">
              <FolderGit2 size={17} aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wide">New client project</p>
            </div>
            <h3 className="mt-3 text-xl font-medium">Create the working site, not a placeholder.</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/58">
              Milesymedia will create an editable project folder, install the starter, connect the client portal and monitoring tag, then make the first Git commit.
            </p>
          </div>
          <Field label="Project name" htmlFor="provision-project-name" dark>
            <input
              id="provision-project-name"
              value={projectName}
              onChange={event => setProjectName(event.target.value)}
              className="rounded-md border border-white/16 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none transition focus:border-[#c9ab76] focus:ring-2 focus:ring-[#c9ab76]/20"
              placeholder={`${clientName} website`}
              autoFocus
            />
          </Field>
          <Field label="Starting point" htmlFor="provision-starter" dark>
            <select
              id="provision-starter"
              value={starterId}
              onChange={event => setStarterId(event.target.value)}
              className="rounded-md border border-white/16 bg-[#24231f] px-3 py-2 text-sm text-white outline-none transition focus:border-[#c9ab76] focus:ring-2 focus:ring-[#c9ab76]/20"
            >
              <option value="luxury-service-site">Luxury service website</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={busy || !projectName.trim()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#f4f0e8] px-4 text-sm font-semibold text-[#171613] disabled:opacity-45"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
            {busy ? "Creating project" : "Create project"}
          </button>
          {error && <p role="alert" className="text-sm text-red-200 lg:col-span-3">{error}</p>}
        </form>
      )}

      {provisionedPath && (
        <div className="flex flex-wrap items-start gap-3 border-l-2 border-emerald-600 bg-emerald-50/65 px-4 py-3 text-sm text-emerald-950">
          <Check size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Project created with its first Git commit.</p>
            <p className="mt-0.5 break-all font-mono text-xs text-emerald-900/72">{provisionedPath}</p>
          </div>
        </div>
      )}

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
              Repository, deployment and client login
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
              <Field label="Finished client portal URL" htmlFor="property-redirect-target">
                <input id="property-redirect-target" type="url" value={draft.redirectTarget} onChange={e => setDraft(d => ({ ...d, redirectTarget: e.target.value }))} className={CONTROL_CLASS} placeholder="Where this client should land after sign-in" />
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
                  <ReleaseRail property={property} />
                  <dl className="mt-4 grid gap-2 text-sm">
                    <PropertyLine label="Starter" value={property.starterId ? property.starterId.replaceAll("-", " ") : undefined} />
                    <PropertyLine label="Project" value={property.projectSlug} mono />
                    <PropertyLine label="Local" value={property.localPath} mono />
                    <PropertyLine label="Repo" value={property.repoUrl} href={externalUrl(property.repoUrl)} />
                    <PropertyLine label="Live" value={property.liveUrl} href={externalUrl(property.liveUrl)} />
                    <PropertyLine label="Preview" value={property.previewUrl} href={externalUrl(property.previewUrl)} />
                    <PropertyLine label="Vercel" value={property.vercelProject} href={externalUrl(property.vercelProject)} />
                    <PropertyLine label="Redirect" value={property.redirectTarget} href={externalUrl(property.redirectTarget)} />
                    <PropertyLine label="Tag" value={prettyTag(property.tagStatus)} />
                    <PropertyLine
                      label="Git"
                      value={property.repositoryStatus === "local"
                        ? `Local repository · ${property.initialCommit?.slice(0, 8) ?? "ready"}`
                        : property.repositoryStatus === "connected" ? "GitHub connected" : undefined}
                      mono
                    />
                    <PropertyLine
                      label="Deploy"
                      value={property.deploymentStatus === "not-deployed"
                        ? "Not deployed yet"
                        : `${property.deploymentStatus}${property.deploymentReadyState ? ` · ${property.deploymentReadyState.toLowerCase()}` : ""}`}
                    />
                    <PropertyLine label="Deploy ID" value={property.vercelDeploymentId} mono />
                    <PropertyLine label="Last deploy" value={property.lastDeployedAt ? formatUpdatedAt(property.lastDeployedAt) : undefined} />
                  </dl>

                  {property.notes && (
                    <p className="mt-4 whitespace-pre-wrap rounded-md bg-black/[0.02] p-3 text-sm leading-6 text-black/65">{property.notes}</p>
                  )}

                  {property.localPath && (property.repositoryStatus === "local" || property.deploymentStatus === "not-deployed") && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-4">
                      <div className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-md bg-black/[0.04] text-black/48">
                          <LockKeyhole size={15} aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-black/72">Local repository ready</p>
                          <p className="text-[11px] text-black/42">Remote repositories are private by default.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {property.repositoryStatus === "local" && !property.repoUrl && (
                          <button
                            type="button"
                            disabled={!githubPublishingConfigured || publishingId === property.id}
                            onClick={() => void publishRepository(property)}
                            title={githubPublishingConfigured ? "Create and push a private GitHub repository" : "Add GITHUB_TOKEN to connect GitHub"}
                            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/68 hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {publishingId === property.id
                              ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                              : <UploadCloud size={14} aria-hidden="true" />}
                            {publishingId === property.id
                              ? "Publishing"
                              : githubPublishingConfigured ? "Publish private repo" : "GitHub setup required"}
                          </button>
                        )}
                        {property.deploymentStatus === "not-deployed" && (
                          <button
                            type="button"
                            disabled={!vercelDeploymentConfigured || deployingId === property.id}
                            onClick={() => void deployPreview(property)}
                            title={vercelDeploymentConfigured ? "Upload a private review preview to Vercel" : "Add VERCEL_TOKEN to connect Vercel"}
                            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {deployingId === property.id
                              ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                              : <Globe2 size={14} aria-hidden="true" />}
                            {deployingId === property.id
                              ? "Deploying"
                              : vercelDeploymentConfigured ? "Deploy review preview" : "Vercel setup required"}
                          </button>
                        )}
                      </div>
                    </div>
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
      <Field label="Finished client portal URL" htmlFor={`${prefix}-redirect`}>
        <input id={`${prefix}-redirect`} type="url" value={draft.redirectTarget} onChange={event => setDraft(value => ({ ...value, redirectTarget: event.target.value }))} className={CONTROL_CLASS} placeholder="Where this client should land after sign-in" />
      </Field>
      <Field label="Aqua tag" htmlFor={`${prefix}-tag`}>
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

function ReleaseRail({ property }: { property: ClientProperty }) {
  const steps = [
    { label: "Workspace", complete: Boolean(property.localPath) },
    { label: "Repository", complete: property.repositoryStatus === "connected" },
    { label: "Review", complete: property.deploymentStatus === "preview" || property.deploymentStatus === "production" },
    { label: "Live", complete: property.status === "live" || property.status === "redirected" || property.deploymentStatus === "production" },
  ];
  const activeIndex = Math.min(
    steps.findIndex(step => !step.complete) === -1 ? steps.length - 1 : steps.findIndex(step => !step.complete),
    steps.length - 1,
  );
  return (
    <ol className="mt-4 grid grid-cols-4 border-y border-black/8 py-3" aria-label={`Release progress for ${property.label}`}>
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex min-w-0 flex-col items-center gap-1 text-center">
          {index > 0 && (
            <span className={`absolute right-1/2 top-[5px] h-px w-full ${steps[index - 1].complete ? "bg-emerald-600/55" : "bg-black/10"}`} aria-hidden="true" />
          )}
          <span className={[
            "relative z-[1] block size-[11px] rounded-full border-2 bg-white",
            step.complete
              ? "border-emerald-600 bg-emerald-600"
              : index === activeIndex ? "border-brand" : "border-black/16",
          ].join(" ")} aria-hidden="true" />
          <span className={`truncate text-[10px] font-medium ${step.complete ? "text-black/68" : index === activeIndex ? "text-brand" : "text-black/32"}`}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, htmlFor, children, dark = false }: { label: string; htmlFor: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className={`text-sm font-medium ${dark ? "text-white/72" : "text-black/70"}`}>
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
