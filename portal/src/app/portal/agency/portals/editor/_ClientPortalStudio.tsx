"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Monitor,
  PanelsTopLeft,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CLIENT_PORTAL_MODES, CLIENT_PORTAL_SECTIONS } from "@/lib/clientPortalDesign";
import { formatUkDate } from "@/lib/formatDateTime";
import type {
  ClientPortalDesignDocument,
  ClientPortalDesignVersion,
  ClientPortalMode,
  ClientPortalSectionId,
} from "@/server/types";

export type PortalStudioClient = {
  id: string;
  name: string;
  built: boolean;
  mode: ClientPortalMode;
};

export type PortalStudioTemplate = {
  id: string;
  name: string;
  productId?: string;
  baseTemplateVersionId?: string;
  latestMasterVersionId: string;
  active: boolean;
};

type Scope = "template" | "client";
type InspectorTab = "content" | "pages" | "brand" | "versions";
type Device = "desktop" | "mobile";

type PortalDesignRecord = {
  id: string;
  name?: string;
  clientId?: string;
  productId?: string;
  baseTemplateVersionId?: string;
  draft: ClientPortalDesignDocument;
  published: ClientPortalDesignDocument;
  publishedVersionId: string;
  versions: ClientPortalDesignVersion[];
  updatedAt: number;
  publishedAt?: number;
};

const MODE_LABELS: Record<ClientPortalMode, string> = {
  onboarding: "Onboarding",
  designing: "Designing",
  "developed-launch": "Review & delivery",
  maintenance: "Live care",
};

const SECTION_LABELS: Record<ClientPortalSectionId, string> = {
  home: "Home",
  project: "Project",
  results: "Results",
  files: "Files",
  billing: "Billing",
  support: "Support",
  resources: "Resources",
  details: "Your details",
};

const tabs: Array<{ id: InspectorTab; label: string; icon: typeof FileText }> = [
  { id: "content", label: "Content", icon: FileText },
  { id: "pages", label: "Pages", icon: Layers3 },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "versions", label: "Versions", icon: History },
];

export function ClientPortalStudio({
  clients,
  templates,
  initialClientId,
  initialTemplateId,
  initialScope,
  initialMode,
  initialSection,
  canManage,
}: {
  clients: PortalStudioClient[];
  templates: PortalStudioTemplate[];
  initialClientId: string;
  initialTemplateId: string;
  initialScope: Scope;
  initialMode: ClientPortalMode;
  initialSection: ClientPortalSectionId;
  canManage: boolean;
}) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [clientId, setClientId] = useState(initialClientId);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [previewProductIds, setPreviewProductIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ClientPortalMode>(initialMode);
  const [section, setSection] = useState<ClientPortalSectionId>(initialSection);
  const [device, setDevice] = useState<Device>("desktop");
  const [tab, setTab] = useState<InspectorTab>("content");
  const [record, setRecord] = useState<PortalDesignRecord | null>(null);
  const [portalDocument, setPortalDocument] = useState<ClientPortalDesignDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [notice, setNotice] = useState("Loading portal design...");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const selectedClient = clients.find(client => client.id === clientId) ?? clients[0];
  const selectedTemplate = templates.find(template => template.id === templateId) ?? templates[0];
  const frameUrl = useMemo(() => {
    if (!clientId) return "";
    const params = new URLSearchParams({
      embedded: "1",
      portalScope: scope,
      portalDraft: "1",
      portalMode: mode,
      section,
    });
    if (scope === "template" && templateId) params.set("templateId", templateId);
    if (scope === "template" && selectedTemplate?.productId && previewProductIds.length) {
      params.set("productIds", [selectedTemplate.productId, ...previewProductIds].join(","));
    }
    return `/client-preview/${clientId}?${params.toString()}`;
  }, [clientId, mode, previewProductIds, scope, section, selectedTemplate?.productId, templateId]);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      setNotice("Create a client before opening the portal studio.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setRecord(null);
    setPortalDocument(null);
    setDirty(false);
    setNotice("Loading portal design...");
    const designParams = new URLSearchParams({ scope, clientId });
    if (scope === "template" && templateId) designParams.set("templateId", templateId);
    fetch(`/api/portal/client-portal-design?${designParams.toString()}`, { cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as { ok?: boolean; record?: PortalDesignRecord; error?: string };
        if (!response.ok || !payload.record) throw new Error(payload.error || "Could not load portal design");
        if (cancelled) return;
        setRecord(payload.record);
        setPortalDocument(structuredClone(payload.record.draft));
        setDirty(false);
        setNotice(scope === "template" ? `Editing ${selectedTemplate?.name || "Stunning Standard"} draft` : `Editing ${selectedClient?.name || "client"}'s portal draft`);
        setFrameKey(value => value + 1);
      })
      .catch(error => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load portal design");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, scope, selectedClient?.name, selectedTemplate?.name, templateId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!mobileInspectorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileInspectorOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileInspectorOpen]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("scope", scope);
    if (clientId) url.searchParams.set("clientId", clientId);
    if (scope === "template" && templateId) {
      url.searchParams.set("templateId", templateId);
      if (selectedTemplate?.productId) url.searchParams.set("productId", selectedTemplate.productId);
      else url.searchParams.delete("productId");
    } else {
      url.searchParams.delete("templateId");
      url.searchParams.delete("productId");
    }
    url.searchParams.set("mode", mode);
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [clientId, mode, scope, section, selectedTemplate?.productId, templateId]);

  function edit(update: (current: ClientPortalDesignDocument) => void) {
    if (!portalDocument || !canManage || busy) return;
    const next = structuredClone(portalDocument);
    update(next);
    setPortalDocument(next);
    setDirty(true);
    setNotice("Unsaved draft changes");
  }

  async function mutate(action: "save-draft" | "publish" | "checkpoint" | "restore" | "refresh-product" | "reset-client", extra: Record<string, unknown> = {}) {
    if (!record) throw new Error("Portal design is not ready");
    const response = await fetch("/api/portal/client-portal-design", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, scope, clientId, templateId, recordId: record.id, ...extra }),
    });
    const payload = await response.json() as { ok?: boolean; record?: PortalDesignRecord; error?: string };
    if (!response.ok || !payload.record) throw new Error(payload.error || "Portal design could not be updated");
    setRecord(payload.record);
    setPortalDocument(structuredClone(payload.record.draft));
    return payload.record;
  }

  async function saveDraft() {
    if (!portalDocument || !record || !canManage) return;
    setBusy(true);
    setNotice("Saving portal draft...");
    try {
      await mutate("save-draft", { document: portalDocument });
      setDirty(false);
      setFrameKey(value => value + 1);
      setNotice("Draft saved and preview refreshed");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the draft");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!portalDocument || !record || !canManage) return;
    setBusy(true);
    setNotice("Publishing portal design...");
    try {
      if (dirty) await mutate("save-draft", { document: portalDocument });
      await mutate("publish");
      setDirty(false);
      setFrameKey(value => value + 1);
      setNotice(scope === "template" ? `${selectedTemplate?.name || "Template"} published` : "Client portal published");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not publish the portal");
    } finally {
      setBusy(false);
    }
  }

  async function checkpoint() {
    const label = checkpointLabel.trim();
    if (!label || !portalDocument || !record || !canManage) return;
    setBusy(true);
    setNotice("Creating named version...");
    try {
      if (dirty) await mutate("save-draft", { document: portalDocument });
      await mutate("checkpoint", { label });
      setCheckpointLabel("");
      setDirty(false);
      setNotice(`Saved version: ${label}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create the version");
    } finally {
      setBusy(false);
    }
  }

  async function restore(versionId: string) {
    if (!canManage || !window.confirm("Restore this version into the current draft? The published portal will not change until you publish.")) return;
    setBusy(true);
    setNotice("Restoring version...");
    try {
      await mutate("restore", { versionId });
      setDirty(false);
      setFrameKey(value => value + 1);
      setNotice("Version restored into the draft");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not restore the version");
    } finally {
      setBusy(false);
    }
  }

  async function resetClient() {
    if (scope !== "client" || !canManage || !window.confirm("Reset this client draft to the published master template? The live portal will remain unchanged until you publish.")) return;
    setBusy(true);
    try {
      await mutate("reset-client");
      setDirty(false);
      setFrameKey(value => value + 1);
      setNotice("Client draft reset from the master template");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reset the client portal");
    } finally {
      setBusy(false);
    }
  }

  async function refreshProductTemplate() {
    if (scope !== "template" || !record?.productId || !canManage || !portalDocument) return;
    if (!window.confirm("Rebuild this product draft from the latest published Stunning Standard? The current draft will be saved in version history and the live product portal will not change until you publish.")) return;
    setBusy(true);
    setNotice("Refreshing product draft from Stunning Standard...");
    try {
      if (dirty) await mutate("save-draft", { document: portalDocument });
      await mutate("refresh-product");
      setDirty(false);
      setFrameKey(value => value + 1);
      setNotice(`${selectedTemplate?.name || "Product"} draft refreshed from Stunning Standard`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not refresh the product template");
    } finally {
      setBusy(false);
    }
  }

  function confirmDraftDiscard() {
    return !dirty || window.confirm("Discard the unsaved changes in this draft?");
  }

  function changeScope(nextScope: Scope) {
    if (scope === nextScope || !confirmDraftDiscard()) return;
    setScope(nextScope);
  }

  function changeClient(nextClientId: string) {
    if (clientId === nextClientId || !confirmDraftDiscard()) return;
    const nextClient = clients.find(client => client.id === nextClientId);
    setClientId(nextClientId);
    setMode(nextClient?.mode ?? "onboarding");
  }

  function changeTemplate(nextTemplateId: string) {
    if (templateId === nextTemplateId || !confirmDraftDiscard()) return;
    setTemplateId(nextTemplateId);
    setPreviewProductIds([]);
  }

  function togglePreviewProduct(productId: string) {
    setPreviewProductIds(current => current.includes(productId)
      ? current.filter(id => id !== productId)
      : [...current, productId].slice(0, 7));
  }

  useEffect(() => {
    const saveOnShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (dirty && canManage && !busy) void saveDraft();
    };
    window.addEventListener("keydown", saveOnShortcut);
    return () => window.removeEventListener("keydown", saveOnShortcut);
  }, [busy, canManage, dirty, portalDocument, record]);

  if (!clients.length) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-[#111311] px-6 text-center text-white">
        <div>
          <p className="text-lg font-semibold">The portal studio needs a client record to supply preview data.</p>
          <Link href="/portal/clients" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black">Create a client</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex min-h-0 flex-col overflow-hidden bg-[#111311] text-white">
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-white/10 bg-[#151715] px-3 xl:flex xl:min-h-[68px] xl:gap-3 xl:px-4">
        <Link href="/portal/agency/portals?view=templates" onClick={event => { if (!confirmDraftDiscard()) event.preventDefault(); }} aria-label="Back to portals" title="Back to portals" className="my-2 grid size-10 shrink-0 place-items-center rounded-md border border-white/10 text-white/70 hover:bg-white/5 hover:text-white xl:my-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="hidden min-w-40 xl:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/75">Portal studio</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white/90">{scope === "template" ? selectedTemplate?.name || "Stunning Standard" : selectedClient?.name}</p>
        </div>

        <div className="col-start-2 row-start-1 inline-flex shrink-0 justify-self-start rounded-md border border-white/10 bg-black/25 p-1 xl:col-auto xl:row-auto" aria-label="Editing scope">
          <TopToggle active={scope === "template"} disabled={busy} onClick={() => changeScope("template")} label="Template" />
          <TopToggle active={scope === "client"} disabled={busy} onClick={() => changeScope("client")} label="Client" />
        </div>

        <div className="col-span-3 col-start-1 row-start-2 grid min-w-0 grid-cols-2 items-center gap-2 border-t border-white/10 py-2 sm:flex sm:overflow-x-auto sm:[scrollbar-width:none] xl:col-auto xl:row-auto xl:flex-1 xl:border-t-0">
          {scope === "template" ? (
            <select aria-label="Portal template" value={templateId} disabled={busy} onChange={event => changeTemplate(event.target.value)} className="col-span-2 h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none disabled:opacity-45 sm:col-span-1 sm:min-w-52 sm:max-w-72 sm:shrink-0">
              {templates.map(template => <option key={template.id} value={template.id} className="bg-[#1a1c1a]">{template.name}{template.active ? "" : " (archived)"}</option>)}
            </select>
          ) : null}
          <select aria-label="Preview client" value={clientId} disabled={busy} onChange={event => changeClient(event.target.value)} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none disabled:opacity-45 sm:min-w-44 sm:max-w-56 sm:shrink-0">
            {clients.map(client => <option key={client.id} value={client.id} className="bg-[#1a1c1a]">{client.name}{client.built ? "" : " (not built)"}</option>)}
          </select>
          <select aria-label="Lifecycle stage" value={mode} onChange={event => setMode(event.target.value as ClientPortalMode)} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none sm:min-w-40 sm:shrink-0">
            {CLIENT_PORTAL_MODES.map(item => <option key={item} value={item} className="bg-[#1a1c1a]">{portalDocument?.stages[item].label || MODE_LABELS[item]}</option>)}
          </select>
          <select aria-label="Portal page" value={section} onChange={event => setSection(event.target.value as ClientPortalSectionId)} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none sm:min-w-36 sm:shrink-0">
            {CLIENT_PORTAL_SECTIONS.map(item => <option key={item} value={item} className="bg-[#1a1c1a]">{portalDocument?.pages[item].label || SECTION_LABELS[item]}</option>)}
          </select>
          <div className="flex min-w-0 items-center justify-end gap-2 sm:justify-start">
            <div className="inline-flex shrink-0 rounded-md border border-white/10 bg-black/25 p-1" aria-label="Preview device">
              <IconToggle active={device === "desktop"} onClick={() => setDevice("desktop")} label="Desktop"><Monitor size={16} /></IconToggle>
              <IconToggle active={device === "mobile"} onClick={() => setDevice("mobile")} label="Mobile"><Smartphone size={16} /></IconToggle>
            </div>
            <button type="button" onClick={() => setFrameKey(value => value + 1)} title="Refresh preview" aria-label="Refresh preview" className="hidden size-10 shrink-0 place-items-center rounded-md border border-white/10 text-white/65 hover:bg-white/5 hover:text-white sm:grid"><RefreshCw size={16} /></button>
            <Link href={frameUrl.replace("embedded=1&", "")} target="_blank" rel="noreferrer" title="Open portal in new tab" aria-label="Open portal in new tab" className="grid size-10 shrink-0 place-items-center rounded-md border border-white/10 text-white/65 hover:bg-white/5 hover:text-white"><ExternalLink size={16} /></Link>
            {scope === "client" ? <Link href={`/client-preview/${clientId}?manage=1`} target="_blank" rel="noreferrer" title="Manage live product workspaces" aria-label="Manage live product workspaces" className="grid size-10 shrink-0 place-items-center rounded-md border border-cyan-300/25 text-cyan-300/75 hover:bg-cyan-300/10 hover:text-cyan-200"><PanelsTopLeft size={16} /></Link> : null}
          </div>
        </div>

        <div className="col-start-3 row-start-1 flex shrink-0 items-center justify-self-end gap-2 xl:col-auto xl:row-auto">
          <button type="button" onClick={saveDraft} disabled={!canManage || busy || !dirty} className="hidden min-h-10 items-center gap-2 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/75 enabled:hover:bg-white/5 disabled:opacity-35 md:inline-flex">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save draft</button>
          <button type="button" onClick={publish} disabled={!canManage || busy || !record} aria-label="Publish portal" aria-busy={busy} className="inline-flex size-10 items-center justify-center gap-2 rounded-md bg-cyan-300 text-xs font-bold text-[#102124] hover:bg-cyan-200 disabled:opacity-40 sm:w-auto sm:px-3">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}<span className="hidden sm:inline">Publish</span></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#242724]">
          <div className="flex min-h-10 shrink-0 items-center justify-between border-b border-white/8 bg-[#1b1e1b] px-4 text-[11px] text-white/45">
            <p className="truncate" role="status" aria-live="polite">{notice}{dirty ? " · save the draft to refresh preview" : ""}</p>
            <p className="hidden shrink-0 sm:block">{scope === "template" ? selectedTemplate?.productId ? "Product template" : "Master template" : "Client override"} · {device === "mobile" ? "390 × 844" : "Responsive desktop"}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-7">
            <div className={`mx-auto overflow-hidden rounded-md border border-white/12 bg-white shadow-[0_24px_80px_rgba(0,0,0,.35)] transition-[width] ${device === "mobile" ? "w-[390px] max-w-full" : "w-full max-w-[1440px]"}`}>
              {loading || !frameUrl ? (
                <div className="grid h-[70vh] place-items-center bg-[#f2f0eb] text-sm text-black/45">Loading the real portal...</div>
              ) : (
                <iframe key={`${frameKey}:${frameUrl}`} title="Client portal draft preview" src={frameUrl} className={`block w-full bg-white ${device === "mobile" ? "h-[844px]" : "h-[calc(100vh-180px)] min-h-[680px]"}`} />
              )}
            </div>
          </div>
        </main>

        <aside className="hidden w-[340px] shrink-0 flex-col border-l border-white/10 bg-[#141614] lg:flex xl:w-[370px]">
          <div className="grid grid-cols-4 border-b border-white/10">
            {tabs.map(item => {
              const Icon = item.icon;
              return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${tab === item.id ? "bg-white/[0.07] text-cyan-300" : "text-white/42 hover:bg-white/[0.035] hover:text-white/70"}`}><Icon size={16} /><span>{item.label}</span></button>;
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {portalDocument && record ? (
              <Inspector
                tab={tab}
                scope={scope}
                mode={mode}
                section={section}
                document={portalDocument}
                record={record}
                canManage={canManage}
                busy={busy}
                checkpointLabel={checkpointLabel}
                setCheckpointLabel={setCheckpointLabel}
                edit={edit}
                checkpoint={checkpoint}
                restore={restore}
                refreshProductTemplate={refreshProductTemplate}
                resetClient={resetClient}
                latestMasterVersionId={selectedTemplate?.latestMasterVersionId}
                compositionTemplates={templates.filter(template => template.active && Boolean(template.productId) && template.id !== selectedTemplate?.id)}
                previewProductIds={previewProductIds}
                togglePreviewProduct={togglePreviewProduct}
              />
            ) : <p className="text-sm text-white/45">{notice}</p>}
          </div>
        </aside>

        <button type="button" onClick={() => setMobileInspectorOpen(true)} aria-expanded={mobileInspectorOpen} className="fixed bottom-4 right-4 z-30 inline-flex min-h-11 items-center gap-2 rounded-md bg-cyan-300 px-4 text-xs font-bold text-[#102124] shadow-lg lg:hidden"><FileText size={16} /> Edit portal</button>
        {mobileInspectorOpen ? (
          <aside className="fixed inset-0 z-50 flex flex-col bg-[#141614] lg:hidden" aria-label="Portal editor inspector">
            <div className="grid shrink-0 grid-cols-[repeat(4,1fr)_44px] border-b border-white/10">
              {tabs.map(item => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[9px] font-semibold ${tab === item.id ? "bg-white/[0.07] text-cyan-300" : "text-white/42"}`}><Icon size={15} /><span>{item.label}</span></button>;
              })}
              <button type="button" onClick={() => setMobileInspectorOpen(false)} aria-label="Close portal inspector" className="grid place-items-center border-l border-white/10 text-white/55"><X size={17} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {portalDocument && record ? (
                <Inspector tab={tab} scope={scope} mode={mode} section={section} document={portalDocument} record={record} canManage={canManage} busy={busy} checkpointLabel={checkpointLabel} setCheckpointLabel={setCheckpointLabel} edit={edit} checkpoint={checkpoint} restore={restore} refreshProductTemplate={refreshProductTemplate} resetClient={resetClient} latestMasterVersionId={selectedTemplate?.latestMasterVersionId} compositionTemplates={templates.filter(template => template.active && Boolean(template.productId) && template.id !== selectedTemplate?.id)} previewProductIds={previewProductIds} togglePreviewProduct={togglePreviewProduct} />
              ) : <p className="text-sm text-white/45">{notice}</p>}
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 bg-[#111311] p-3">
              <button type="button" onClick={saveDraft} disabled={!canManage || busy || !dirty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/12 text-xs font-semibold text-white/75 disabled:opacity-35">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save draft</button>
              <button type="button" onClick={publish} disabled={!canManage || busy || !record} aria-busy={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 text-xs font-bold text-[#102124] disabled:opacity-40">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />} Publish</button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Inspector({
  tab,
  scope,
  mode,
  section,
  document,
  record,
  canManage,
  busy,
  checkpointLabel,
  setCheckpointLabel,
  edit,
  checkpoint,
  restore,
  refreshProductTemplate,
  resetClient,
  latestMasterVersionId,
  compositionTemplates,
  previewProductIds,
  togglePreviewProduct,
}: {
  tab: InspectorTab;
  scope: Scope;
  mode: ClientPortalMode;
  section: ClientPortalSectionId;
  document: ClientPortalDesignDocument;
  record: PortalDesignRecord;
  canManage: boolean;
  busy: boolean;
  checkpointLabel: string;
  setCheckpointLabel: (value: string) => void;
  edit: (update: (current: ClientPortalDesignDocument) => void) => void;
  checkpoint: () => void;
  restore: (versionId: string) => void;
  refreshProductTemplate: () => void;
  resetClient: () => void;
  latestMasterVersionId?: string;
  compositionTemplates: PortalStudioTemplate[];
  previewProductIds: string[];
  togglePreviewProduct: (productId: string) => void;
}) {
  const editingDisabled = !canManage || busy;

  if (tab === "content") {
    const page = document.pages[section];
    const stage = document.stages[mode];
    return (
      <div className="grid gap-6">
        <InspectorHeading eyebrow={SECTION_LABELS[section]} title="Page introduction" body="Tokens such as {firstName}, {providerName}, {projectLabel}, {stageHeading}, and {stageBody} stay dynamic." />
        <Field label="Eyebrow" value={page.eyebrow} onChange={value => edit(current => { current.pages[section].eyebrow = value; })} disabled={editingDisabled} />
        <Field label="Heading" value={page.title} onChange={value => edit(current => { current.pages[section].title = value; })} disabled={editingDisabled} />
        <Field label="Introduction" value={page.body} multiline onChange={value => edit(current => { current.pages[section].body = value; })} disabled={editingDisabled} />
        {section === "home" ? (
          <div className="grid gap-4 border-t border-white/10 pt-6">
            <InspectorHeading eyebrow="Home" title="Home panels" body="Edit the supporting labels and client-care panel beneath the main stage area." />
            <Field label="Next move label" value={document.home.nextMoveEyebrow} onChange={value => edit(current => { current.home.nextMoveEyebrow = value; })} disabled={editingDisabled} />
            <Field label="Updates label" value={document.home.recentUpdatesEyebrow} onChange={value => edit(current => { current.home.recentUpdatesEyebrow = value; })} disabled={editingDisabled} />
            <Field label="Project log title" value={document.home.projectLogTitle} onChange={value => edit(current => { current.home.projectLogTitle = value; })} disabled={editingDisabled} />
            <Field label="Care eyebrow" value={document.home.careEyebrow} onChange={value => edit(current => { current.home.careEyebrow = value; })} disabled={editingDisabled} />
            <Field label="Care title" value={document.home.careTitle} onChange={value => edit(current => { current.home.careTitle = value; })} disabled={editingDisabled} />
            <Field label="Care message" value={document.home.careBody} multiline onChange={value => edit(current => { current.home.careBody = value; })} disabled={editingDisabled} />
            <Field label="Care button" value={document.home.careButtonLabel} onChange={value => edit(current => { current.home.careButtonLabel = value; })} disabled={editingDisabled} />
          </div>
        ) : null}
        <div className="grid gap-4 border-t border-white/10 pt-6">
          <InspectorHeading eyebrow={stage.label || MODE_LABELS[mode]} title="Lifecycle stage" body="This product owns its onboarding, working, delivery, and ongoing-care stages. Changes remain inside this versioned portal template." />
          <Field label="Stage label" value={stage.label} onChange={value => edit(current => { current.stages[mode].label = value; })} disabled={editingDisabled} />
          <Field label="Eyebrow" value={stage.eyebrow} onChange={value => edit(current => { current.stages[mode].eyebrow = value; })} disabled={editingDisabled} />
          <Field label="Heading" value={stage.heading} onChange={value => edit(current => { current.stages[mode].heading = value; })} disabled={editingDisabled} />
          <Field label="Message" value={stage.body} multiline onChange={value => edit(current => { current.stages[mode].body = value; })} disabled={editingDisabled} />
          <Field label="Next action guidance" value={stage.focus} multiline onChange={value => edit(current => { current.stages[mode].focus = value; })} disabled={editingDisabled} />
          <label className="grid gap-2 text-[11px] font-semibold text-white/58">Progress · {stage.progress}%<input type="range" min="0" max="100" value={stage.progress} disabled={editingDisabled} onChange={event => edit(current => { current.stages[mode].progress = Number(event.target.value); })} className="accent-cyan-300" /></label>
        </div>
      </div>
    );
  }

  if (tab === "pages") {
    return (
      <div className="grid gap-6">
        <div>
          <InspectorHeading eyebrow="Navigation" title="Portal pages" body="Rename or hide portal destinations. Operational data remains untouched when a page is hidden." />
          <div className="mt-5 grid gap-2">
            {CLIENT_PORTAL_SECTIONS.map(item => (
              <div key={item} className="grid grid-cols-[34px_1fr] items-center gap-2 rounded-md border border-white/10 bg-white/[0.025] p-2">
                <input aria-label={`Show ${SECTION_LABELS[item]}`} type="checkbox" checked={document.pages[item].visible} disabled={editingDisabled || item === "home"} onChange={event => edit(current => { current.pages[item].visible = event.target.checked; })} className="size-4 accent-cyan-300" />
                <input aria-label={`${SECTION_LABELS[item]} navigation label`} value={document.pages[item].label} disabled={editingDisabled} onChange={event => edit(current => { current.pages[item].label = event.target.value; })} className="h-9 min-w-0 rounded-sm border border-white/10 bg-black/20 px-2 text-xs text-white/75 outline-none focus:border-cyan-300/45" />
              </div>
            ))}
          </div>
        </div>
        {scope === "template" && record.productId ? (
          <div className="border-t border-white/10 pt-6">
            <InspectorHeading eyebrow="Bundle preview" title="Preview product composition" body="Temporarily add other product systems to this preview. This does not change the template or any client." />
            <div className="mt-4 grid max-h-72 gap-1.5 overflow-y-auto pr-1">
              {compositionTemplates.map(template => (
                <label key={template.id} className="grid min-h-11 cursor-pointer grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-md border border-white/10 bg-white/[0.025] px-3 text-xs font-medium text-white/70 hover:bg-white/[0.05]">
                  <input
                    type="checkbox"
                    checked={Boolean(template.productId && previewProductIds.includes(template.productId))}
                    onChange={() => template.productId && togglePreviewProduct(template.productId)}
                    className="size-4 accent-cyan-300"
                  />
                  <span className="truncate">{template.name}</span>
                </label>
              ))}
            </div>
            {previewProductIds.length ? <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-300/55">Previewing {previewProductIds.length + 1} products together</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (tab === "brand") {
    const colors: Array<{ key: keyof ClientPortalDesignDocument["theme"]; label: string }> = [
      { key: "accentColor", label: "Accent" },
      { key: "backgroundColor", label: "Canvas" },
      { key: "surfaceColor", label: "Panels" },
      { key: "darkColor", label: "Sidebar" },
      { key: "heroColor", label: "Feature panels" },
    ];
    return (
      <div className="grid gap-6">
        <div>
          <InspectorHeading eyebrow="Visual system" title="Portal colours" body="The real portal uses these colours across every lifecycle stage and page." />
          <div className="mt-5 grid gap-2">
            {colors.map(color => <ColorField key={color.key} label={color.label} value={document.theme[color.key]} disabled={editingDisabled} onChange={value => edit(current => { current.theme[color.key] = value; })} />)}
          </div>
        </div>
        <div className="grid gap-4 border-t border-white/10 pt-6">
          <InspectorHeading eyebrow="Portal chrome" title="Shared labels" body="These labels appear in the sidebar and top bar for every page." />
          <Field label="Service label" value={document.chrome.serviceLabel} onChange={value => edit(current => { current.chrome.serviceLabel = value; })} disabled={editingDisabled} />
          <Field label="Prepared for label" value={document.chrome.preparedForLabel} onChange={value => edit(current => { current.chrome.preparedForLabel = value; })} disabled={editingDisabled} />
          <Field label="Current stage label" value={document.chrome.currentStageLabel} onChange={value => edit(current => { current.chrome.currentStageLabel = value; })} disabled={editingDisabled} />
          <Field label="Top bar label" value={document.chrome.privateHomeLabel} onChange={value => edit(current => { current.chrome.privateHomeLabel = value; })} disabled={editingDisabled} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <InspectorHeading eyebrow="Version history" title="Drafts and releases" body="Restoring changes the draft only. Publish separately when it is ready for the client." />
      <form className="mt-5 flex gap-2" onSubmit={event => { event.preventDefault(); void checkpoint(); }}>
        <input value={checkpointLabel} onChange={event => setCheckpointLabel(event.target.value)} placeholder="Version name" disabled={!canManage || busy} className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-cyan-300/45" />
        <button type="submit" disabled={!checkpointLabel.trim() || !canManage || busy} title="Create named version" aria-label="Create named version" className="grid size-10 shrink-0 place-items-center rounded-md bg-white text-black disabled:opacity-35"><Check size={16} /></button>
      </form>
      {scope === "template" && record.productId ? <div className="mt-3 border-y border-white/10 py-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-white/72">Stunning Standard inheritance</p><p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/34">{record.baseTemplateVersionId === latestMasterVersionId ? "Draft uses latest master" : "Master update available"}</p></div><span className={`size-2 shrink-0 rounded-full ${record.baseTemplateVersionId === latestMasterVersionId ? "bg-emerald-300" : "bg-amber-300"}`} /></div><p className="mt-3 text-xs leading-5 text-white/38">Rebuild the draft from the latest master while preserving the current draft in version history. The live portal stays unchanged.</p><button type="button" onClick={refreshProductTemplate} disabled={!canManage || busy} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 text-xs font-semibold text-white/65 hover:bg-white/5 disabled:opacity-35"><RefreshCw size={14} /> Refresh draft from master</button></div> : null}
      {scope === "client" ? <button type="button" onClick={resetClient} disabled={!canManage || busy} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 text-xs font-semibold text-white/60 hover:bg-white/5 disabled:opacity-35"><RotateCcw size={14} /> Reset draft from template</button> : null}
      <div className="mt-6 grid gap-2">
        {record.versions.map(version => (
          <article key={version.id} className="rounded-md border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white/78">{version.label || (version.source === "autosave" ? "Draft save" : "Saved version")}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/32">{version.source} · {formatUkDate(version.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              {version.id === record.publishedVersionId ? <span className="rounded-full bg-emerald-400/12 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-300">Live</span> : null}
            </div>
            <button type="button" onClick={() => restore(version.id)} disabled={!canManage || busy} className="mt-3 inline-flex min-h-8 items-center gap-1.5 text-[11px] font-semibold text-cyan-300/80 hover:text-cyan-200 disabled:opacity-35"><RotateCcw size={12} /> Restore to draft</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function InspectorHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/65">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-white/88">{title}</h2><p className="mt-2 text-xs leading-5 text-white/38">{body}</p></div>;
}

function Field({ label, value, onChange, disabled, multiline = false }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; multiline?: boolean }) {
  const className = "w-full rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs leading-5 text-white/78 outline-none placeholder:text-white/25 focus:border-cyan-300/45 disabled:opacity-50";
  return <label className="grid gap-2 text-[11px] font-semibold text-white/58"><span>{label}</span>{multiline ? <textarea rows={4} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={`${className} py-2 resize-y`} /> : <input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={`${className} h-10`} />}</label>;
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="grid grid-cols-[36px_1fr_82px] items-center gap-2 rounded-md border border-white/10 bg-white/[0.025] p-2 text-[11px] font-semibold text-white/58"><input type="color" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="size-8 cursor-pointer rounded-sm border-0 bg-transparent p-0" /><span>{label}</span><input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="h-8 min-w-0 rounded-sm border border-white/10 bg-black/20 px-2 font-mono text-[10px] text-white/65 outline-none" /></label>;
}

function TopToggle({ active, disabled, onClick, label }: { active: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`min-h-8 rounded-sm px-2 text-xs font-semibold disabled:opacity-40 sm:px-3 ${active ? "bg-white text-black" : "text-white/48 hover:text-white"}`}>{label}</button>;
}

function IconToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={`grid size-8 place-items-center rounded-sm ${active ? "bg-white text-black" : "text-white/48 hover:text-white"}`}>{children}</button>;
}
