"use client";

import Link from "next/link";
import { PORTAL_PHASE_LABELS } from "@/lib/portal/portalProducts";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Code2, Copy, ExternalLink, FileText, FolderGit2, Gauge, GripVertical, History, Layers3, LayoutTemplate, LoaderCircle, Monitor, MousePointerClick, Palette, PanelRightClose, PanelRightOpen, PanelsTopLeft, Plus, RefreshCw, RotateCcw, Save, Smartphone, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CLIENT_PORTAL_MODES, CLIENT_PORTAL_SECTIONS, portalCustomCode } from "@/lib/portal/clientPortalDesign";
import {
  CLIENT_PORTAL_BLOCK_REGISTRY,
  createPortalBlock,
  createPortalCustomPage,
  portalBuilder,
  portalPageBlocks,
  portalBuilderId,
  portalSlug,
  uniquePortalSlug,
} from "@/lib/portal/clientPortalBuilder";
import { EDITING_MODES, editingMode, tabForMode, type EditingMode } from "@/engines/editor/editing/modes";
import { RepositoryPanel } from "@/components/editing/RepositoryPanel";
import { AquaEditorAI } from "@/components/editing/AquaEditorAI";
import { EditorCodeCanvas } from "@/components/editing/EditorCodeCanvas";
import { AddMenu, fileAddOptions, type AddOption } from "@/components/editing/AddMenu";
import { BreakpointControl, DEFAULT_BREAKPOINT, breakpointLabel, breakpointSize, type Breakpoint } from "@/components/editing/BreakpointControl";
import type { EditorAssistantProps } from "@/engines/editor/server/editorAssistant";
import { elementSource, repoRelativePath } from "@/engines/editor/editing/elementSource";
import { PORTAL_SCOPE, scopeForSection } from "@/engines/editor/editing/fileRelevance";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type {
  ClientPortalDesignDocument,
  ClientPortalDesignVersion,
  ClientPortalMode,
  ClientPortalPageBlock,
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
type InspectorTab = "assistant" | "builder" | "content" | "pages" | "brand" | "code" | "repository" | "versions";

/** A Dev Editor Engine project, as the picker needs it. */
interface StudioDevProject {
  id: string;
  name: string;
  kind: "software" | "website" | "portal";
  repository: string;
  ref: string;
}
type CanvasView = "live" | "code" | "split" | "compare";

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

const MODE_LABELS: Record<ClientPortalMode, string> = PORTAL_PHASE_LABELS;

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

/**
 * Which tabs this mode offers, in its own order.
 *
 * The tabs answer "what am I changing?"; the mode answers "how deep am I
 * going?". Collapsing the two is why an editor feels intimidating to one
 * person and restrictive to the next.
 */
const tabs: Array<{ id: InspectorTab; label: string; icon: typeof FileText }> = [
  // Aqua Editor AI — the shallowest depth: describe it instead of building it.
  { id: "assistant", label: "Assistant", icon: Sparkles },
  { id: "builder", label: "Builder", icon: LayoutTemplate },
  { id: "content", label: "Content", icon: FileText },
  { id: "pages", label: "Pages", icon: Layers3 },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "code", label: "Code", icon: Code2 },
  // The site's own source, as opposed to the sandboxed portal component above.
  { id: "repository", label: "Repo", icon: FolderGit2 },
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
  backHref = "/portal/agency/portals?view=templates",
  backLabel = "Back to portals",
  lockToClient = false,
  assistant,
  initialProjectId = "",
  projectName,
}: {
  clients: PortalStudioClient[];
  templates: PortalStudioTemplate[];
  initialClientId: string;
  initialTemplateId: string;
  initialScope: Scope;
  initialMode: ClientPortalMode;
  initialSection: ClientPortalSectionId;
  canManage: boolean;
  backHref?: string;
  backLabel?: string;
  lockToClient?: boolean;
  /** Aqua Editor AI's server payload. Absent = the tab is not offered. */
  assistant?: EditorAssistantProps;
  /** Opened FOR a Dev project — its repo/token drive Code and Repo. */
  initialProjectId?: string;
  /** Shown in the identity block, so you can see which project you are in. */
  projectName?: string;
}) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [clientId, setClientId] = useState(initialClientId);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [previewProductIds, setPreviewProductIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ClientPortalMode>(initialMode);
  const [section, setSection] = useState<ClientPortalSectionId>(initialSection);
  const [customPageId, setCustomPageId] = useState("");
  // What the CANVAS shows. "live" is the running portal; "code" is the file
  // tree + open file; "split" is both, which is how you actually work — see a
  // change and the source that made it at the same time.
  const [canvasView, setCanvasView] = useState<CanvasView>("live");
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(DEFAULT_BREAKPOINT);
  // How the split is divided, as a fraction of the canvas given to the LEFT
  // pane. Dragged, not fixed — sometimes you want a sliver of preview beside
  // a wide file, sometimes the reverse.
  const [splitRatio, setSplitRatio] = useState(0.5);
  // The inspector can be put away entirely — the rail stays, so the way
  // back is always visible — and widened when a tool needs the room.
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorWidth] = useState(380);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<InspectorTab>("content");
  // Defaults to the visual mode: a first-time opener should meet a designer's
  // tool rather than a developer's.
  const [editingModeId, setEditingModeId] = useState<EditingMode>("visual");
  const [repository, setRepository] = useState("");
  // The Dev Editor Engine project being worked on. Selecting one points the
  // Code/Repo inspectors at THAT repository, read through that project's own
  // connection — "plug in any repo" without the browser holding a token.
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projects, setProjects] = useState<StudioDevProject[]>([]);
  const selectedProject = projects.find(item => item.id === projectId) ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/dev/projects", { cache: "no-store" })
      .then(response => response.json())
      .then(payload => { if (!cancelled && payload?.ok) setProjects(payload.projects ?? []); })
      // Dev Mode only — a 403 here just means no project picker, never an error.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [sourceFocus, setSourceFocus] = useState<{ path: string; line?: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  /**
   * Set the moment a pick resolves, cleared shortly after.
   *
   * The preview already posts a block selection back to the Studio, which
   * switches to Builder — the right behaviour for clicking a block, and the
   * wrong one when the click was asking "where is this in the code?". Both
   * fire for the same click and the message arrives second, so without this
   * the picker appeared to do nothing at all.
   */
  const pickedAt = useRef(0);
  const allowedTabs = tabs.filter(item => editingMode(editingModeId).tabs.includes(item.id));

  /**
   * Clicking the preview to find the code behind it.
   *
   * The preview is same-origin, so the iframe's document is reachable and
   * React's own debug source can be read off the clicked node. Listening in
   * the capture phase and stopping the event means the click finds the code
   * rather than following a link or submitting something.
   */
  useEffect(() => {
    if (!picking) return;
    const frame = previewRef.current;
    if (!frame) return;

    let attached: Document | null = null;

    function onClick(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
      const source = elementSource(event.target as Element);
      const path = source ? repoRelativePath(source.fileName) : null;
      setSourceFocus(path ? { path, line: source?.lineNumber } : null);
      setPicking(false);
      pickedAt.current = event.timeStamp || 1;
      setTab("repository");
    }

    function attach() {
      const doc = frame?.contentDocument;
      // Same document as last time — nothing to do. Re-adding would be
      // harmless but the cursor bookkeeping below would not be.
      if (!doc || doc === attached) return;
      detach();
      doc.addEventListener("click", onClick, true);
      doc.body?.style.setProperty("cursor", "crosshair");
      attached = doc;
    }

    function detach() {
      if (!attached) return;
      attached.removeEventListener("click", onClick, true);
      attached.body?.style.removeProperty("cursor");
      attached = null;
    }

    attach();
    // The preview is keyed on the client, stage and section, so it remounts
    // and navigates underneath us. A single attempt at attach time is why the
    // picker silently did nothing: if the document was not ready — or the
    // frame reloaded a moment later — the listener was never there and
    // nothing said so. Polling is crude but it is the behaviour somebody
    // expects: arm the picker, click the page, it works.
    frame.addEventListener("load", attach);
    const poll = window.setInterval(attach, 250);

    return () => {
      window.clearInterval(poll);
      frame.removeEventListener("load", attach);
      detach();
    };
  }, [picking]);

  function changeMode(next: EditingMode) {
    setEditingModeId(next);
    // Switching to "Just the words" while sitting on the code tab must land
    // somewhere real rather than on a blank panel.
    setTab(tabForMode(next, tab) as InspectorTab);
  }
  const [record, setRecord] = useState<PortalDesignRecord | null>(null);
  const [portalDocument, setPortalDocument] = useState<ClientPortalDesignDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [notice, setNotice] = useState("Loading portal design...");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const selectedClient = clients.find(client => client.id === clientId) ?? clients[0];
  const selectedTemplate = templates.find(template => template.id === templateId) ?? templates[0];
  const selectedCustomPage = portalDocument ? portalBuilder(portalDocument).customPages.find(page => page.id === customPageId) : undefined;
  const frameUrl = useMemo(() => {
    if (!clientId) return "";
    const params = new URLSearchParams({
      embedded: "1",
      portalScope: scope,
      portalDraft: "1",
      portalMode: mode,
      section: selectedCustomPage ? "custom" : section,
    });
    if (selectedCustomPage) params.set("customPage", selectedCustomPage.slug);
    if (scope === "template" && templateId) params.set("templateId", templateId);
    if (scope === "template" && selectedTemplate?.productId && previewProductIds.length) {
      params.set("productIds", [selectedTemplate.productId, ...previewProductIds].join(","));
    }
    return `/client-preview/${clientId}?${params.toString()}`;
  }, [clientId, mode, previewProductIds, scope, section, selectedCustomPage, selectedTemplate?.productId, templateId]);

  // The same view WITHOUT the draft flag — what a client sees right now.
  // Comparison is draft vs live, which is the question you actually have
  // before publishing.
  // What the universal "+" offers, by what you are looking at.
  //
  // Visual: the real block library (the same registry the Builder palette
  // uses) — selecting one adds it to the page and selects it, so the panel
  // immediately shows its settings. Code: file/folder/upload, which are
  // deliberately NOT selectable yet — the engine's write path (patch +
  // confirmed publish) is a separate piece of work, and an "add file" that
  // silently does nothing is worse than one that says why.
  const addOptions: AddOption[] = useMemo(() => {
    if (canvasView === "code") {
      return fileAddOptions("Needs the repository write path — not wired yet.");
    }
    if (!canManage || !portalDocument) {
      return [{ id: "readonly", group: "Blocks", label: "Editing is read-only here", unavailableReason: "You do not have permission to change this portal." }];
    }
    const groupLabel: Record<string, string> = {
      content: "Content blocks",
      "live-data": "Live data",
      layout: "Layout",
    };
    return CLIENT_PORTAL_BLOCK_REGISTRY.map(item => ({
      id: item.type,
      group: groupLabel[item.category] ?? "Blocks",
      label: item.label,
      description: item.description,
      onSelect: () => {
        const block = createPortalBlock(item.type);
        edit(current => {
          const blocks = customPageId
            ? portalBuilder(current).customPages.find(page => page.id === customPageId)?.blocks
            : portalBuilder(current).pages[section];
          blocks?.push(block);
        });
        setSelectedBlockId(block.id);
        setTab("content");
      },
    }));
  }, [canManage, canvasView, customPageId, portalDocument, section]);

  const publishedFrameUrl = useMemo(() => frameUrl.replace("portalDraft=1&", "").replace("&portalDraft=1", ""), [frameUrl]);

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
        setCustomPageId(current => payload.record?.draft.builder?.customPages.some(page => page.id === current) ? current : "");
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
    const receivePreviewSelection = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string; blockId?: string } | null;
      if (payload?.type !== "aqua:portal-block-select" || !payload.blockId) return;
      setSelectedBlockId(payload.blockId);
      // A pick is still a selection worth keeping — it just must not drag the
      // operator away from the file they asked to see.
      if (pickedAt.current) { pickedAt.current = 0; return; }
      setTab("builder");
      if (window.matchMedia("(max-width: 1023px)").matches) setMobileInspectorOpen(true);
    };
    window.addEventListener("message", receivePreviewSelection);
    return () => window.removeEventListener("message", receivePreviewSelection);
  }, []);

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
    url.searchParams.set("section", selectedCustomPage ? "custom" : section);
    if (selectedCustomPage) url.searchParams.set("customPage", selectedCustomPage.slug);
    else url.searchParams.delete("customPage");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [clientId, mode, scope, section, selectedCustomPage, selectedTemplate?.productId, templateId]);

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
    if (lockToClient) return;
    if (scope === nextScope || !confirmDraftDiscard()) return;
    setScope(nextScope);
  }

  function changeClient(nextClientId: string) {
    if (lockToClient) return;
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
        <Link href={backHref} onClick={event => { if (!confirmDraftDiscard()) event.preventDefault(); }} aria-label={backLabel} title={backLabel} className="my-2 grid size-10 shrink-0 place-items-center rounded-md border border-white/10 text-white/70 hover:bg-white/5 hover:text-white xl:my-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="hidden min-w-40 xl:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/75">Dev Editor</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white/90">{projectName || (scope === "template" ? selectedTemplate?.name || "Stunning Standard" : selectedClient?.name)}</p>
        </div>

        {/* The primary switch is what the CANVAS shows — the live thing, its
            code, or both. Template vs Client is a narrower question (which
            portal am I previewing) and moves down to the secondary row. */}
        <div className="col-start-2 row-start-1 inline-flex shrink-0 justify-self-start rounded-md border border-white/10 bg-black/25 p-1 xl:col-auto xl:row-auto" aria-label="Canvas view">
          <TopToggle active={canvasView === "live"} onClick={() => setCanvasView("live")} label="Live" />
          <TopToggle active={canvasView === "code"} onClick={() => setCanvasView("code")} label="Code" />
          <TopToggle active={canvasView === "split"} onClick={() => setCanvasView("split")} label="Both" />
          <TopToggle active={canvasView === "compare"} onClick={() => setCanvasView("compare")} label="Compare" />
        </div>

        <div className="col-span-3 col-start-1 row-start-2 grid min-w-0 grid-cols-2 items-center gap-2 border-t border-white/10 py-2 sm:flex sm:overflow-x-auto sm:[scrollbar-width:none] xl:col-auto xl:row-auto xl:flex-1 xl:border-t-0">
          {canvasView !== "code" && !lockToClient ? (
            <div className="inline-flex shrink-0 rounded-md border border-white/10 bg-black/25 p-1" aria-label="Editing scope">
              <TopToggle active={scope === "template"} disabled={busy} onClick={() => changeScope("template")} label="Template" />
              <TopToggle active={scope === "client"} disabled={busy} onClick={() => changeScope("client")} label="Client" />
            </div>
          ) : null}
          {scope === "template" ? (
            <select aria-label="Portal template" value={templateId} disabled={busy} onChange={event => changeTemplate(event.target.value)} className="col-span-2 h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none disabled:opacity-45 sm:col-span-1 sm:min-w-52 sm:max-w-72 sm:shrink-0">
              {templates.map(template => <option key={template.id} value={template.id} className="bg-[#1a1c1a]">{template.name}{template.active ? "" : " (archived)"}</option>)}
            </select>
          ) : null}
          {lockToClient ? (
            <div className="flex h-10 min-w-0 items-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white/80 sm:min-w-44 sm:max-w-56 sm:shrink-0" title={selectedClient?.name}>
              <span className="truncate">{selectedClient?.name}</span>
            </div>
          ) : (
            <select aria-label="Preview client" value={clientId} disabled={busy} onChange={event => changeClient(event.target.value)} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none disabled:opacity-45 sm:min-w-44 sm:max-w-56 sm:shrink-0">
              {clients.map(client => <option key={client.id} value={client.id} className="bg-[#1a1c1a]">{client.name}{client.built ? "" : " (not built)"}</option>)}
            </select>
          )}
          <select aria-label="Lifecycle stage" value={mode} onChange={event => setMode(event.target.value as ClientPortalMode)} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none sm:min-w-40 sm:shrink-0">
            {CLIENT_PORTAL_MODES.map(item => <option key={item} value={item} className="bg-[#1a1c1a]">{portalDocument?.stages[item].label || MODE_LABELS[item]}</option>)}
          </select>
          <select aria-label="Portal page" value={selectedCustomPage ? `custom:${selectedCustomPage.id}` : section} onChange={event => {
            const value = event.target.value;
            if (value.startsWith("custom:")) {
              setCustomPageId(value.slice(7));
              setTab("builder");
            } else {
              setCustomPageId("");
              setSection(value as ClientPortalSectionId);
            }
          }} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none sm:min-w-36 sm:shrink-0">
            <optgroup label="Core pages" className="bg-[#1a1c1a]">{CLIENT_PORTAL_SECTIONS.map(item => <option key={item} value={item}>{portalDocument?.pages[item].label || SECTION_LABELS[item]}</option>)}</optgroup>
            {portalDocument && portalBuilder(portalDocument).customPages.length ? <optgroup label="Custom pages" className="bg-[#1a1c1a]">{portalBuilder(portalDocument).customPages.map(page => <option key={page.id} value={`custom:${page.id}`}>{page.label}</option>)}</optgroup> : null}
          </select>
          {/* The engine's project. Selecting one points Code/Repo at that
              repository, read through the project's own connection. Hidden
              entirely when no projects exist, so nothing changes until one is
              created. */}
          {projects.length ? (
            <select
              aria-label="Dev project"
              value={projectId}
              onChange={event => {
                const next = event.target.value;
                setProjectId(next);
                const project = projects.find(item => item.id === next);
                // Keep the typed field in step so the Repo tab shows what it reads.
                setRepository(project?.repository ?? "");
              }}
              className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none sm:min-w-40 sm:shrink-0"
            >
              <option value="" className="bg-[#1a1c1a]">This workspace</option>
              {projects.map(project => (
                <option key={project.id} value={project.id} className="bg-[#1a1c1a]">
                  {project.name}{project.repository ? ` · ${project.repository}` : ""}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex min-w-0 items-center justify-end gap-2 sm:justify-start">
            {canvasView !== "code" ? <BreakpointControl value={breakpoint} onChange={setBreakpoint} /> : null}
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
          <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-white/8 bg-[#1b1e1b] px-3 text-[11px] text-white/45">
            {/* ONE add affordance. What it offers depends on what you are
                looking at: blocks and saved components in a visual view, files
                and folders in the code view. Every future "add" belongs here
                rather than as another control elsewhere in the chrome. */}
            <AddMenu
              options={addOptions}
              label={canvasView === "code" ? "Add to the repository" : "Add to this page"}
              title={canvasView === "code" ? "Add to the repository" : "Add to this page"}
            />
            <p className="min-w-0 flex-1 truncate" role="status" aria-live="polite">{notice}{dirty ? " · save the draft to refresh preview" : ""}</p>
            <p className="hidden shrink-0 sm:block">
              {canvasView === "code"
                ? (selectedProject?.repository || "This workspace")
                : `${scope === "template" ? selectedTemplate?.productId ? "Product template" : "Master template" : "Client override"} · ${breakpointLabel(breakpoint)}`}
            </p>
          </div>

          {/* The canvas is DYNAMIC: live, code, both (with a divider you drag),
              or two live views compared. Nothing here is a fixed proportion —
              sometimes you want a sliver of preview beside a wide file, and
              sometimes the reverse. */}
          <div ref={splitRef} className="flex min-h-0 flex-1">
            {canvasView !== "code" ? (
              <div
                className="min-h-0 overflow-auto p-4 lg:p-6"
                style={canvasView === "split" || canvasView === "compare"
                  ? { width: `${splitRatio * 100}%`, flexShrink: 0 }
                  : { flex: 1 }}
              >
                <PreviewFrame
                  label={canvasView === "compare" ? "Draft — your unpublished changes" : undefined}
                  loading={loading}
                  url={frameUrl}
                  frameKey={frameKey}
                  breakpoint={breakpoint}
                  innerRef={previewRef}
                />
              </div>
            ) : null}

            {/* The divider. Drag it; double-click to even the panes. */}
            {canvasView === "split" || canvasView === "compare" ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize the panes"
                tabIndex={0}
                onDoubleClick={() => setSplitRatio(0.5)}
                onKeyDown={event => {
                  if (event.key === "ArrowLeft") setSplitRatio(value => Math.max(0.2, value - 0.04));
                  if (event.key === "ArrowRight") setSplitRatio(value => Math.min(0.8, value + 0.04));
                }}
                onPointerDown={event => {
                  event.preventDefault();
                  const host = splitRef.current;
                  if (!host) return;
                  const move = (moveEvent: PointerEvent) => {
                    const bounds = host.getBoundingClientRect();
                    const ratio = (moveEvent.clientX - bounds.left) / bounds.width;
                    setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)));
                  };
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
                className="group relative w-1.5 shrink-0 cursor-col-resize bg-white/8 transition hover:bg-cyan-300/40 focus:bg-cyan-300/50 focus:outline-none"
              >
                <span aria-hidden className="absolute inset-y-0 -left-1.5 -right-1.5" />
              </div>
            ) : null}

            {canvasView === "compare" ? (
              <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
                <PreviewFrame
                  label="Live — what the client sees now"
                  loading={loading}
                  url={publishedFrameUrl}
                  frameKey={frameKey}
                  breakpoint={breakpoint}
                />
              </div>
            ) : null}

            {canvasView === "code" || canvasView === "split" ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <EditorCodeCanvas projectId={projectId || undefined} repository={repository} focus={sourceFocus} />
              </div>
            ) : null}
          </div>
        </main>

        {/* ── The inspector ────────────────────────────────────────────────
            Reworked as an ACTIVITY RAIL + panel, the way an editor with a
            growing number of tools has to be built.

            A horizontal tab strip was the wrong primitive: every tool added
            steals width from the one before it, seven tools already overflowed
            at 360px, and the labels were the first thing sacrificed. A vertical
            rail costs 48px once and then scales to any number of tools without
            truncating anything — and it hands the whole panel width back to
            the controls, which is what people are actually here to use.

            Collapsing it gives the canvas the full screen; the rail stays, so
            the way back is always visible. */}
        {inspectorOpen ? (
        <aside className="hidden shrink-0 border-l border-white/10 bg-[#141614] lg:flex" style={{ width: inspectorWidth }}>
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Panel header: what this tool is, and what it is pointed at. */}
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight text-white/90">
                  {allowedTabs.find(item => item.id === tab)?.label ?? "Inspector"}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-white/35">
                  {scope === "template" ? selectedTemplate?.name || "Template" : selectedClient?.name || "Client"}
                  {tab === "repository" || tab === "code" ? "" : ` · ${selectedCustomPage?.label ?? SECTION_LABELS[section] ?? section}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                aria-label="Collapse the inspector"
                title="Collapse the inspector"
                className="grid size-7 shrink-0 place-items-center rounded text-white/35 hover:bg-white/10 hover:text-white/85"
              >
                <PanelRightClose size={14} aria-hidden />
              </button>
            </div>

            {/* Depth sits with the panel it governs, on one quiet row. */}
            <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-3 py-1.5">
              <Gauge size={12} aria-hidden className="shrink-0 text-white/25" />
              <select
                aria-label="How deep do you want to go?"
                title={editingMode(editingModeId).summary}
                value={editingModeId}
                onChange={event => changeMode(event.target.value as EditingMode)}
                className="min-h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[11px] font-medium text-white/65 outline-none hover:border-white/12 hover:bg-white/[0.04] focus:border-cyan-300/40"
              >
                {EDITING_MODES.map(option => (
                  <option key={option.id} value={option.id} className="bg-[#141614]">{option.label}</option>
                ))}
              </select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {portalDocument && record ? (
              <Inspector
                assistant={assistant}
                assistantTarget={scope === "template" ? (selectedTemplate?.name || "a portal template") : (selectedClient?.name || "a client portal")}
                repository={repository}
                onRepositoryChange={setRepository}
                sourceFocus={sourceFocus}
                picking={picking}
                onPickElement={() => { setPicking(value => !value); }}
                tab={tab}
                scope={scope}
                mode={mode}
                section={section}
                customPageId={customPageId}
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
                productOptions={templates.filter(template => Boolean(template.productId))}
                previewProductIds={previewProductIds}
                togglePreviewProduct={togglePreviewProduct}
                selectCustomPage={setCustomPageId}
                selectedBlockId={selectedBlockId}
                selectBlock={setSelectedBlockId}
              />
            ) : <p className="text-sm text-white/45">{notice}</p>}
            </div>
          </div>
        </aside>
        ) : null}

        {/* The activity rail. Always present, so a collapsed inspector is one
            click from coming back, and adding an eighth tool costs nothing. */}
        <nav aria-label="Inspector tools" className="hidden w-12 shrink-0 flex-col items-center gap-0.5 border-l border-white/10 bg-[#101210] py-2 lg:flex">
          {allowedTabs.map(item => {
            const Icon = item.icon;
            const active = inspectorOpen && tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { setTab(item.id); setInspectorOpen(true); }}
                aria-current={active ? "true" : undefined}
                aria-label={item.label}
                title={item.label}
                className={`relative grid size-10 place-items-center rounded-md transition ${
                  active ? "bg-white/[0.08] text-cyan-300" : "text-white/35 hover:bg-white/[0.05] hover:text-white/80"
                }`}
              >
                <Icon size={17} aria-hidden />
                {active ? <span aria-hidden className="absolute -left-1.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-300" /> : null}
              </button>
            );
          })}
          <span aria-hidden className="my-1 h-px w-6 bg-white/10" />
          <button
            type="button"
            onClick={() => setInspectorOpen(value => !value)}
            aria-label={inspectorOpen ? "Collapse the inspector" : "Open the inspector"}
            title={inspectorOpen ? "Collapse the inspector" : "Open the inspector"}
            className="grid size-10 place-items-center rounded-md text-white/35 transition hover:bg-white/[0.05] hover:text-white/80"
          >
            {inspectorOpen ? <PanelRightClose size={16} aria-hidden /> : <PanelRightOpen size={16} aria-hidden />}
          </button>
        </nav>

        <button type="button" onClick={() => setMobileInspectorOpen(true)} aria-expanded={mobileInspectorOpen} className="fixed bottom-4 right-4 z-30 inline-flex min-h-11 items-center gap-2 rounded-md bg-cyan-300 px-4 text-xs font-bold text-[#102124] shadow-lg lg:hidden"><FileText size={16} /> Edit portal</button>
        {mobileInspectorOpen ? (
          <aside className="fixed inset-0 z-50 flex flex-col bg-[#141614] lg:hidden" aria-label="Dev Editor Engine inspector">
            <div className="grid shrink-0 border-b border-white/10" style={{ gridTemplateColumns: `repeat(${allowedTabs.length}, 1fr) 44px` }}>
              {allowedTabs.map(item => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[9px] font-semibold ${tab === item.id ? "bg-white/[0.07] text-cyan-300" : "text-white/42"}`}><Icon size={15} /><span>{item.label}</span></button>;
              })}
              <button type="button" onClick={() => setMobileInspectorOpen(false)} aria-label="Close portal inspector" className="grid place-items-center border-l border-white/10 text-white/55"><X size={17} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {portalDocument && record ? (
                <Inspector assistant={assistant} assistantTarget={scope === "template" ? (selectedTemplate?.name || "a portal template") : (selectedClient?.name || "a client portal")} repository={repository} projectId={projectId} onRepositoryChange={setRepository} sourceFocus={sourceFocus} picking={picking} onPickElement={() => setPicking(value => !value)} tab={tab} scope={scope} mode={mode} section={section} customPageId={customPageId} document={portalDocument} record={record} canManage={canManage} busy={busy} checkpointLabel={checkpointLabel} setCheckpointLabel={setCheckpointLabel} edit={edit} checkpoint={checkpoint} restore={restore} refreshProductTemplate={refreshProductTemplate} resetClient={resetClient} latestMasterVersionId={selectedTemplate?.latestMasterVersionId} compositionTemplates={templates.filter(template => template.active && Boolean(template.productId) && template.id !== selectedTemplate?.id)} productOptions={templates.filter(template => Boolean(template.productId))} previewProductIds={previewProductIds} togglePreviewProduct={togglePreviewProduct} selectCustomPage={setCustomPageId} selectedBlockId={selectedBlockId} selectBlock={setSelectedBlockId} />
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
  assistant,
  assistantTarget,
  repository,
  projectId,
  onRepositoryChange,
  sourceFocus,
  picking,
  onPickElement,
  tab,
  scope,
  mode,
  section,
  customPageId,
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
  productOptions,
  previewProductIds,
  togglePreviewProduct,
  selectCustomPage,
  selectedBlockId,
  selectBlock,
}: {
  assistant?: EditorAssistantProps;
  assistantTarget: string;
  repository: string;
  projectId?: string;
  onRepositoryChange: (value: string) => void;
  sourceFocus: { path: string; line?: number } | null;
  picking: boolean;
  onPickElement: () => void;
  tab: InspectorTab;
  scope: Scope;
  mode: ClientPortalMode;
  section: ClientPortalSectionId;
  customPageId: string;
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
  productOptions: PortalStudioTemplate[];
  previewProductIds: string[];
  togglePreviewProduct: (productId: string) => void;
  selectCustomPage: (pageId: string) => void;
  selectedBlockId: string;
  selectBlock: (blockId: string) => void;
}) {
  const editingDisabled = !canManage || busy;

  if (tab === "assistant") {
    // No payload (assistant not wired on this route) — say so plainly rather
    // than render an empty panel that looks broken.
    if (!assistant) {
      return <p className="px-1 py-3 text-xs text-white/45">Aqua Editor AI is not available on this screen.</p>;
    }
    return (
      <AquaEditorAI
        initialWorkspace={assistant.initialWorkspace}
        configured={assistant.configured}
        model={assistant.model}
        userName={assistantTarget}
        coverage={assistant.coverage}
        context={{ target: assistantTarget, section, element: sourceFocus }}
        picking={picking}
        onPickElement={onPickElement}
      />
    );
  }

  if (tab === "builder") {
    return <PortalBuilderInspector section={section} customPageId={customPageId} document={document} disabled={editingDisabled} edit={edit} productOptions={productOptions} selectCustomPage={selectCustomPage} selectedBlockId={selectedBlockId} selectBlock={selectBlock} />;
  }

  if (tab === "content") {
    // ── Selection drives this panel ──────────────────────────────────────
    // Agreed with Ed (docs/development/plans/dev-editor-inspector.md): you
    // select a thing on the canvas and the panel shows THAT thing. The page
    // is the default selection, so its introduction stays reachable without
    // scrolling past every block on it.
    const pageBlocks: ClientPortalPageBlock[] = customPageId
      ? portalBuilder(document).customPages.find(page => page.id === customPageId)?.blocks ?? []
      : portalPageBlocks(document, section);
    const selectedBlock = selectedBlockId
      ? pageBlocks.find(item => item.id === selectedBlockId)
      : undefined;

    if (selectedBlock) {
      const name = selectedBlock.type === "system-content"
        ? "Live workspace"
        : CLIENT_PORTAL_BLOCK_REGISTRY.find(item => item.type === selectedBlock.type)?.label ?? selectedBlock.type;
      return (
        <div className="grid gap-4">
          {/* What is selected, and the way back out of it. */}
          <div className="flex items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/[0.06] px-2.5 py-2">
            <MousePointerClick size={13} aria-hidden className="shrink-0 text-cyan-300/80" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-cyan-100">{name}</span>
            <button
              type="button"
              onClick={() => selectBlock("")}
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200/70 hover:bg-cyan-300/10 hover:text-cyan-100"
            >
              Edit the page instead
            </button>
          </div>
          <PortalBlockEditor
            block={selectedBlock}
            disabled={editingDisabled}
            update={updater => edit(current => {
              const blocks: ClientPortalPageBlock[] = customPageId
                ? portalBuilder(current).customPages.find(page => page.id === customPageId)?.blocks ?? []
                : portalPageBlocks(current, section);
              const target = blocks.find(item => item.id === selectedBlock.id);
              if (target) updater(target);
            })}
            duplicate={() => {}}
            remove={() => {}}
            productOptions={productOptions}
          />
        </div>
      );
    }

    if (customPageId) {
      return <div><InspectorHeading eyebrow="Custom page" title="Compose this page in Builder" body="Custom pages are assembled from ordered blocks. Open Builder to edit content, live data, layout and destinations together." /></div>;
    }
    const page = document.pages[section];
    const stage = document.stages[mode];
    return (
      <div className="grid gap-6">
        <InspectorHeading eyebrow={SECTION_LABELS[section]} title="Page introduction" body="Tokens such as {firstName}, {providerName}, {projectLabel}, {stageHeading}, and {stageBody} stay dynamic." />
        <p className="-mt-3 flex items-center gap-1.5 text-[10px] text-white/30">
          <MousePointerClick size={11} aria-hidden /> Click anything on the page to edit just that piece.
        </p>
        {/* Named by what you can see, not by the design term for it. */}
        <Field label="Small label above" value={page.eyebrow} onChange={value => edit(current => { current.pages[section].eyebrow = value; })} disabled={editingDisabled} />
        <Field label="Headline" value={page.title} onChange={value => edit(current => { current.pages[section].title = value; })} disabled={editingDisabled} />
        <Field label="Paragraph" value={page.body} multiline onChange={value => edit(current => { current.pages[section].body = value; })} disabled={editingDisabled} />
        {section === "home" ? (
          <div className="grid gap-4 border-t border-white/10 pt-6">
            <InspectorHeading eyebrow="Home" title="Home panels" body="Edit the supporting labels and client-care panel beneath the main stage area." />
            <Field label="Button text" value={document.home.nextMoveEyebrow} onChange={value => edit(current => { current.home.nextMoveEyebrow = value; })} disabled={editingDisabled} />
            <Field label="Updates label" value={document.home.recentUpdatesEyebrow} onChange={value => edit(current => { current.home.recentUpdatesEyebrow = value; })} disabled={editingDisabled} />
            <Field label="Project log title" value={document.home.projectLogTitle} onChange={value => edit(current => { current.home.projectLogTitle = value; })} disabled={editingDisabled} />
            <Field label="Small label above" value={document.home.careEyebrow} onChange={value => edit(current => { current.home.careEyebrow = value; })} disabled={editingDisabled} />
            <Field label="Headline" value={document.home.careTitle} onChange={value => edit(current => { current.home.careTitle = value; })} disabled={editingDisabled} />
            <Field label="Paragraph" value={document.home.careBody} multiline onChange={value => edit(current => { current.home.careBody = value; })} disabled={editingDisabled} />
            <Field label="Button text" value={document.home.careButtonLabel} onChange={value => edit(current => { current.home.careButtonLabel = value; })} disabled={editingDisabled} />
          </div>
        ) : null}
        <div className="grid gap-4 border-t border-white/10 pt-6">
          <InspectorHeading eyebrow={stage.label || MODE_LABELS[mode]} title="Lifecycle stage" body="This product owns its onboarding, working, delivery, and ongoing-care stages. Changes remain inside this versioned portal template." />
          <Field label="Stage label" value={stage.label} onChange={value => edit(current => { current.stages[mode].label = value; })} disabled={editingDisabled} />
          <Field label="Small label above" value={stage.eyebrow} onChange={value => edit(current => { current.stages[mode].eyebrow = value; })} disabled={editingDisabled} />
          <Field label="Headline" value={stage.heading} onChange={value => edit(current => { current.stages[mode].heading = value; })} disabled={editingDisabled} />
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

  if (tab === "repository") {
    // Scoped to the portal, and narrowed again to the page on screen — the
    // question somebody actually has is "what renders this", not "show me
    // the repository".
    return <RepositoryPanel repository={repository} projectId={projectId} onRepositoryChange={onRepositoryChange} focus={sourceFocus} picking={picking} onPickElement={onPickElement} scope={scopeForSection(PORTAL_SCOPE, section)} />;
  }

  if (tab === "code") {
    const customCode = portalCustomCode(document);
    const editCode = (update: (current: typeof customCode) => void) => edit(current => {
      const next = portalCustomCode(current);
      update(next);
      current.customCode = next;
    });
    return (
      <div className="grid gap-6">
        <div>
          <InspectorHeading
            eyebrow={scope === "template" && record.productId ? "Product code" : scope === "client" ? "Client override" : "Shared shell"}
            title="Custom portal layer"
            body="Scoped CSS can restyle the portal shell. HTML, CSS and JavaScript run inside an isolated extension frame with portal context, but no session or database access."
          />
          <label className="mt-5 flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.035] px-4">
            <span>
              <span className="block text-xs font-semibold text-white/78">Enable custom code</span>
              <span className="mt-1 block text-[10px] text-white/35">Draft and live releases remain independently versioned.</span>
            </span>
            <input type="checkbox" checked={customCode.enabled} disabled={editingDisabled} onChange={event => editCode(current => { current.enabled = event.target.checked; })} className="size-4 accent-cyan-300" />
          </label>
        </div>

        <div className="grid gap-4 border-t border-white/10 pt-6">
          <InspectorHeading eyebrow="Portal shell" title="Scoped styling" body="Selectors are contained by the portal root. Use the normal portal classes or your own data attributes without affecting AquaCRM." />
          <CodeField label="Portal CSS" value={customCode.scopedCss} rows={9} language="CSS" disabled={editingDisabled} onChange={value => editCode(current => { current.scopedCss = value; })} placeholder={".mm-private-sidebar {\n  width: 19rem;\n}\n\n[data-portal-extension] {\n  margin-top: 1.5rem;\n}"} />
        </div>

        <div className="grid gap-4 border-t border-white/10 pt-6">
          <InspectorHeading eyebrow="Extension slot" title="Custom component" body="Build a bespoke panel, calculator, interactive guide or product-specific tool. JavaScript receives read-only context through window.AQUA_PORTAL." />
          <Field label="Accessible extension name" value={customCode.title} onChange={value => editCode(current => { current.title = value; })} disabled={editingDisabled} />
          <label className="grid gap-2 text-[11px] font-semibold text-white/58">
            <span>Placement</span>
            <select value={customCode.placement} disabled={editingDisabled} onChange={event => editCode(current => { current.placement = event.target.value === "before-content" ? "before-content" : "after-content"; })} className="h-10 rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs text-white/78 outline-none focus:border-cyan-300/45 disabled:opacity-50">
              <option value="before-content" className="bg-[#1a1c1a]">Before page content</option>
              <option value="after-content" className="bg-[#1a1c1a]">After page content</option>
            </select>
          </label>
          <label className="grid gap-2 text-[11px] font-semibold text-white/58">
            <span>Minimum height · {customCode.minHeight}px</span>
            <input type="range" min="120" max="1200" step="20" value={customCode.minHeight} disabled={editingDisabled} onChange={event => editCode(current => { current.minHeight = Number(event.target.value); })} className="accent-cyan-300" />
          </label>
          <CodeField label="HTML" value={customCode.html} rows={10} language="HTML" disabled={editingDisabled} onChange={value => editCode(current => { current.html = value; })} placeholder={'<section class="product-console">\n  <h2>Your custom workspace</h2>\n  <p id="portal-client"></p>\n</section>'} />
          <CodeField label="Extension CSS" value={customCode.css} rows={9} language="CSS" disabled={editingDisabled} onChange={value => editCode(current => { current.css = value; })} placeholder={".product-console {\n  padding: 24px;\n  border: 1px solid #d7d1c7;\n  background: #fff;\n}"} />
          <CodeField label="JavaScript" value={customCode.javascript} rows={10} language="JS" disabled={editingDisabled} onChange={value => editCode(current => { current.javascript = value; })} placeholder={'document.querySelector("#portal-client").textContent =\n  `Prepared for ${window.AQUA_PORTAL.clientName}`;'} />
          <div className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.035] p-3 text-[10px] leading-5 text-white/42">
            Available context: <code className="text-cyan-200/75">clientName</code>, <code className="text-cyan-200/75">providerName</code>, <code className="text-cyan-200/75">mode</code> and <code className="text-cyan-200/75">productId</code>. Network requests and parent-app access are blocked inside the extension.
          </div>
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

function PortalBuilderInspector({
  section,
  customPageId,
  document,
  disabled,
  edit,
  productOptions,
  selectCustomPage,
  selectedBlockId,
  selectBlock,
}: {
  section: ClientPortalSectionId;
  customPageId: string;
  document: ClientPortalDesignDocument;
  disabled: boolean;
  edit: (update: (current: ClientPortalDesignDocument) => void) => void;
  productOptions: PortalStudioTemplate[];
  selectCustomPage: (pageId: string) => void;
  selectedBlockId: string;
  selectBlock: (blockId: string) => void;
}) {
  const builder = portalBuilder(document);
  const customPage = builder.customPages.find(page => page.id === customPageId);
  const blocks = customPage?.blocks ?? builder.pages[section] ?? [createPortalBlock("system-content", `system-${section}`)];
  const [draggingId, setDraggingId] = useState("");
  const selectedBlock = blocks.find(block => block.id === selectedBlockId) ?? blocks[0];

  useEffect(() => {
    if (blocks.some(block => block.id === selectedBlockId)) return;
    selectBlock(blocks.find(block => block.type !== "system-content")?.id ?? blocks[0]?.id ?? "");
  }, [blocks, selectBlock, selectedBlockId]);

  function mutateBlocks(update: (blocks: ClientPortalPageBlock[]) => void) {
    edit(current => {
      const currentBuilder = ensurePortalBuilder(current);
      const currentCustomPage = currentBuilder.customPages.find(page => page.id === customPageId);
      if (currentCustomPage) update(currentCustomPage.blocks);
      else {
        const currentBlocks = currentBuilder.pages[section] ?? [createPortalBlock("system-content", `system-${section}`)];
        currentBuilder.pages[section] = currentBlocks;
        update(currentBlocks);
      }
    });
  }

  function addBlock(type: ClientPortalPageBlock["type"]) {
    const block = createPortalBlock(type);
    mutateBlocks(current => current.push(block));
    selectBlock(block.id);
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    mutateBlocks(current => {
      const from = current.findIndex(block => block.id === blockId);
      const to = Math.max(0, Math.min(current.length - 1, from + direction));
      if (from < 0 || from === to) return;
      const [block] = current.splice(from, 1);
      current.splice(to, 0, block);
    });
  }

  function reorderBlock(blockId: string, targetId: string) {
    if (!blockId || blockId === targetId) return;
    mutateBlocks(current => {
      const from = current.findIndex(block => block.id === blockId);
      const to = current.findIndex(block => block.id === targetId);
      if (from < 0 || to < 0) return;
      const [block] = current.splice(from, 1);
      current.splice(to, 0, block);
    });
  }

  function duplicateBlock(block: ClientPortalPageBlock) {
    const copy = structuredClone(block);
    copy.id = portalBuilderId("block");
    copy.title = `${copy.title} copy`;
    copy.items = copy.items.map(item => ({ ...item, id: portalBuilderId("item") }));
    mutateBlocks(current => {
      const index = current.findIndex(item => item.id === block.id);
      current.splice(index < 0 ? current.length : index + 1, 0, copy);
    });
    selectBlock(copy.id);
  }

  function removeBlock(blockId: string) {
    mutateBlocks(current => {
      const index = current.findIndex(block => block.id === blockId);
      if (index < 0 || current[index].type === "system-content") return;
      current.splice(index, 1);
      selectBlock(current[index]?.id ?? current[index - 1]?.id ?? "");
    });
  }

  function addCustomPage() {
    const page = createPortalCustomPage();
    page.slug = uniquePortalSlug(page.slug, builder.customPages.map(item => item.slug));
    edit(current => { ensurePortalBuilder(current).customPages.push(page); });
    selectCustomPage(page.id);
    selectBlock(page.blocks[0]?.id ?? "");
  }

  function removeCustomPage() {
    if (!customPage || !window.confirm(`Delete ${customPage.label} from this draft? The live portal will not change until you publish.`)) return;
    edit(current => {
      const currentBuilder = ensurePortalBuilder(current);
      currentBuilder.customPages = currentBuilder.customPages.filter(page => page.id !== customPage.id);
    });
    selectCustomPage("");
  }

  return (
    <div className="grid gap-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <InspectorHeading eyebrow={customPage ? "Custom page" : "Visual composition"} title={customPage?.label ?? document.pages[section].label} body="Drag blocks into order, bind approved live data, and publish the result through the existing portal release history." />
          <button type="button" onClick={addCustomPage} disabled={disabled} title="Add custom page" aria-label="Add custom page" className="grid size-9 shrink-0 place-items-center rounded-md border border-cyan-300/25 text-cyan-300 hover:bg-cyan-300/10 disabled:opacity-35"><Plus size={15} /></button>
        </div>
        {customPage ? (
          <div className="mt-5 grid gap-3 rounded-md border border-cyan-300/16 bg-cyan-300/[0.035] p-3">
            <Field label="Name in the menu" value={customPage.label} disabled={disabled} onChange={value => edit(current => {
              const page = ensurePortalBuilder(current).customPages.find(item => item.id === customPage.id);
              if (page) page.label = value;
            })} />
            <Field label="Page URL" value={customPage.slug} disabled={disabled} onChange={value => edit(current => {
              const currentBuilder = ensurePortalBuilder(current);
              const page = currentBuilder.customPages.find(item => item.id === customPage.id);
              if (page) page.slug = uniquePortalSlug(portalSlug(value), currentBuilder.customPages.filter(item => item.id !== page.id).map(item => item.slug));
            })} />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-white/58"><input type="checkbox" checked={customPage.visible} disabled={disabled} onChange={event => edit(current => {
                const page = ensurePortalBuilder(current).customPages.find(item => item.id === customPage.id);
                if (page) page.visible = event.target.checked;
              })} className="size-4 accent-cyan-300" /> Show in client navigation</label>
              <button type="button" onClick={removeCustomPage} disabled={disabled} title="Delete custom page" aria-label="Delete custom page" className="grid size-8 place-items-center rounded-md border border-red-300/20 text-red-300/70 hover:bg-red-300/10 disabled:opacity-35"><Trash2 size={14} /></button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 pt-6">
        <InspectorHeading eyebrow="Canvas" title={`${blocks.length} page blocks`} body="The live workspace block carries the real operational page. It can move, but cannot be deleted or disconnected." />
        <div className="mt-4 grid gap-2">
          {blocks.map((block, index) => {
            const system = block.type === "system-content";
            const label = system ? "Live workspace" : CLIENT_PORTAL_BLOCK_REGISTRY.find(item => item.type === block.type)?.label ?? block.type;
            return (
              <div
                key={block.id}
                draggable={!disabled}
                onDragStart={() => setDraggingId(block.id)}
                onDragEnd={() => setDraggingId("")}
                onDragOver={event => event.preventDefault()}
                onDrop={() => { reorderBlock(draggingId, block.id); setDraggingId(""); }}
                className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-2 transition ${selectedBlock?.id === block.id ? "border-cyan-300/45 bg-cyan-300/[0.07]" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.045]"} ${draggingId === block.id ? "opacity-40" : ""}`}
              >
                <button type="button" onClick={() => selectBlock(block.id)} title={`Drag ${label}`} aria-label={`Select ${label}`} className="grid size-7 cursor-grab place-items-center text-white/32 active:cursor-grabbing"><GripVertical size={14} /></button>
                <button type="button" onClick={() => selectBlock(block.id)} className="min-w-0 py-1 text-left"><span className="block truncate text-xs font-semibold text-white/75">{label}</span><span className="mt-0.5 block truncate text-[9px] uppercase text-white/28">{block.width} · {block.visible || system ? visibilityRuleLabel(block.visibilityRule) : "hidden"}</span></button>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveBlock(block.id, -1)} disabled={disabled || index === 0} title="Move block up" aria-label={`Move ${label} up`} className="grid size-7 place-items-center rounded-sm text-white/35 hover:bg-white/5 hover:text-white disabled:opacity-15"><ArrowUp size={12} /></button>
                  <button type="button" onClick={() => moveBlock(block.id, 1)} disabled={disabled || index === blocks.length - 1} title="Move block down" aria-label={`Move ${label} down`} className="grid size-7 place-items-center rounded-sm text-white/35 hover:bg-white/5 hover:text-white disabled:opacity-15"><ArrowDown size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/10 pt-6">
        <InspectorHeading eyebrow="Library" title="Add a portal component" body="Live-data blocks are read-only views of approved portal records. Content blocks remain fully editable per template or client." />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {CLIENT_PORTAL_BLOCK_REGISTRY.map(item => (
            <button key={item.type} type="button" onClick={() => addBlock(item.type)} disabled={disabled} className="min-h-20 rounded-md border border-white/10 bg-white/[0.025] p-3 text-left hover:border-cyan-300/25 hover:bg-cyan-300/[0.045] disabled:opacity-35"><span className="block text-xs font-semibold text-white/72">{item.label}</span><span className="mt-1 block text-[10px] leading-4 text-white/30">{item.description}</span></button>
          ))}
        </div>
      </div>

      {selectedBlock ? (
        <PortalBlockEditor
          block={selectedBlock}
          disabled={disabled}
          update={update => mutateBlocks(current => {
            const block = current.find(item => item.id === selectedBlock.id);
            if (block) update(block);
          })}
          productOptions={productOptions}
          duplicate={() => duplicateBlock(selectedBlock)}
          remove={() => removeBlock(selectedBlock.id)}
        />
      ) : null}
    </div>
  );
}

function PortalBlockEditor({ block, disabled, update, duplicate, remove, productOptions }: {
  block: ClientPortalPageBlock;
  disabled: boolean;
  update: (update: (block: ClientPortalPageBlock) => void) => void;
  duplicate: () => void;
  remove: () => void;
  productOptions: PortalStudioTemplate[];
}) {
  const system = block.type === "system-content";
  const contentBlock = block.type === "hero" || block.type === "rich-text" || block.type === "callout";
  const interactionBlock = block.type === "request-form" || block.type === "approval-panel" || block.type === "file-upload";
  return (
    <div className="border-t border-white/10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <InspectorHeading eyebrow="Selected block" title={system ? "Live portal workspace" : CLIENT_PORTAL_BLOCK_REGISTRY.find(item => item.type === block.type)?.label ?? block.type} body={system ? "This protected block renders the operational page and its authenticated data." : "Configure this block without affecting any underlying CRM record."} />
        {!system ? <div className="flex gap-1"><button type="button" onClick={duplicate} disabled={disabled} title="Duplicate block" aria-label="Duplicate block" className="grid size-8 place-items-center rounded-md border border-white/10 text-white/45 hover:text-white disabled:opacity-35"><Copy size={13} /></button><button type="button" onClick={remove} disabled={disabled} title="Delete block" aria-label="Delete block" className="grid size-8 place-items-center rounded-md border border-red-300/20 text-red-300/65 hover:bg-red-300/10 disabled:opacity-35"><Trash2 size={13} /></button></div> : null}
      </div>
      {!system ? (
        <div className="mt-5 grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Width" value={block.width} disabled={disabled} options={[{ value: "full", label: "Full width" }, { value: "half", label: "Half width" }]} onChange={value => update(current => { current.width = value === "half" ? "half" : "full"; })} />
            <SelectField label="Tone" value={block.tone} disabled={disabled} options={[{ value: "surface", label: "Surface" }, { value: "dark", label: "Dark" }, { value: "accent", label: "Accent" }, { value: "quiet", label: "Quiet" }]} onChange={value => update(current => { current.tone = value as ClientPortalPageBlock["tone"]; })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Spacing" value={block.responsive.spacing} disabled={disabled} options={[{ value: "none", label: "None" }, { value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "spacious", label: "Spacious" }]} onChange={value => update(current => { current.responsive.spacing = value as ClientPortalPageBlock["responsive"]["spacing"]; })} />
            <SelectField label="Alignment" value={block.responsive.alignment} disabled={disabled} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centred" }]} onChange={value => update(current => { current.responsive.alignment = value === "center" ? "center" : "left"; })} />
          </div>
          <label className="flex items-center gap-2 text-[11px] font-semibold text-white/58"><input type="checkbox" checked={block.visible} disabled={disabled} onChange={event => update(current => { current.visible = event.target.checked; })} className="size-4 accent-cyan-300" /> Visible in the published portal</label>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-white/10 bg-white/[0.025] p-3"><label className="flex items-center gap-2 text-[10px] font-semibold text-white/52"><input type="checkbox" checked={block.responsive.hideOnMobile} disabled={disabled} onChange={event => update(current => { current.responsive.hideOnMobile = event.target.checked; if (event.target.checked) current.responsive.hideOnDesktop = false; })} className="size-4 accent-cyan-300" /> Hide on mobile</label><label className="flex items-center gap-2 text-[10px] font-semibold text-white/52"><input type="checkbox" checked={block.responsive.hideOnDesktop} disabled={disabled} onChange={event => update(current => { current.responsive.hideOnDesktop = event.target.checked; if (event.target.checked) current.responsive.hideOnMobile = false; })} className="size-4 accent-cyan-300" /> Mobile only</label></div>
          <SelectField label="Show this block" value={block.visibilityRule} disabled={disabled} options={[{ value: "always", label: "For every client" }, { value: "with-products", label: "When any product is assigned" }, { value: "without-products", label: "Until a product is assigned" }, { value: "single-product", label: "For one-product portals" }, { value: "multiple-products", label: "For multi-product bundles" }, { value: "specific-products", label: "For selected products" }]} onChange={value => update(current => { current.visibilityRule = value as ClientPortalPageBlock["visibilityRule"]; })} />
          {block.visibilityRule === "specific-products" ? <PortalProductTargeting block={block} productOptions={productOptions} disabled={disabled} update={update} /> : null}
          {block.type !== "divider" ? <><Field label="Small label above" value={block.eyebrow} disabled={disabled} onChange={value => update(current => { current.eyebrow = value; })} /><Field label="Title" value={block.title} disabled={disabled} onChange={value => update(current => { current.title = value; })} /></> : null}
          {contentBlock ? <><Field label="Paragraph" value={block.body} multiline disabled={disabled} onChange={value => update(current => { current.body = value; })} /><Field label="Action label" value={block.actionLabel} disabled={disabled} onChange={value => update(current => { current.actionLabel = value; })} /><Field label="Action URL" value={block.actionHref} disabled={disabled} onChange={value => update(current => { current.actionHref = value; })} /></> : null}
          {interactionBlock ? <Field label="Supporting copy" value={block.body} multiline disabled={disabled} onChange={value => update(current => { current.body = value; })} /> : null}
          {block.type === "request-form" ? <><SelectField label="Request flow" value={block.requestType ?? "choose"} disabled={disabled} options={[{ value: "choose", label: "Let the client choose" }, { value: "support-ticket", label: "Support only" }, { value: "design-feedback", label: "Design feedback" }, { value: "suggestion", label: "Ideas and requests" }, { value: "move-provider", label: "Provider handover" }, { value: "cancel", label: "Cancellation" }]} onChange={value => update(current => { current.requestType = value as ClientPortalPageBlock["requestType"]; })} /><Field label="Submit button" value={block.actionLabel} disabled={disabled} onChange={value => update(current => { current.actionLabel = value; })} /></> : null}
          {block.type === "approval-panel" ? <SelectField label="Decisions shown" value={block.approvalType ?? "all"} disabled={disabled} options={[{ value: "all", label: "All approvals" }, { value: "design", label: "Design approvals" }, { value: "launch", label: "Launch approvals" }]} onChange={value => update(current => { current.approvalType = value as ClientPortalPageBlock["approvalType"]; })} /> : null}
          {block.type === "file-upload" ? <><SelectField label="File category" value={block.uploadCategory ?? "brief"} disabled={disabled} options={[{ value: "brief", label: "Brief" }, { value: "inspiration", label: "Inspiration" }, { value: "design-feedback", label: "Design feedback" }, { value: "recording", label: "Recording" }, { value: "misc", label: "Other" }]} onChange={value => update(current => { current.uploadCategory = value as ClientPortalPageBlock["uploadCategory"]; })} /><Field label="Upload button" value={block.actionLabel} disabled={disabled} onChange={value => update(current => { current.actionLabel = value; })} /></> : null}
          {block.type === "metrics" ? <SelectField label="Live data source" value={block.dataSource ?? "portal-summary"} disabled={disabled} options={[{ value: "portal-summary", label: "Portal summary" }, { value: "delivery", label: "Delivery" }, { value: "billing", label: "Billing" }, { value: "results", label: "Results" }]} onChange={value => update(current => { current.dataSource = value as ClientPortalPageBlock["dataSource"]; })} /> : null}
          {block.type === "image" || block.type === "video" ? <PortalMediaBlockEditor block={block} disabled={disabled} update={update} /> : null}
          {block.type === "product-hub" ? <div className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.035] p-3 text-[10px] leading-5 text-white/42">This hub is generated from the products assigned to the client. Each product retains its own bespoke pages, lifecycle and accent while joining the shared portal cleanly.</div> : null}
          {block.type === "link-list" ? <PortalLinkItems block={block} disabled={disabled} update={update} /> : null}
          {block.type === "custom-extension" ? <PortalExtensionBlockEditor block={block} disabled={disabled} update={update} /> : null}
        </div>
      ) : <p className="mt-4 rounded-md border border-emerald-300/15 bg-emerald-300/[0.035] p-3 text-xs leading-5 text-white/42">Move this block to place designed content before or after the real workspace. Its CRM connection remains protected.</p>}
    </div>
  );
}

function PortalProductTargeting({ block, productOptions, disabled, update }: {
  block: ClientPortalPageBlock;
  productOptions: PortalStudioTemplate[];
  disabled: boolean;
  update: (update: (block: ClientPortalPageBlock) => void) => void;
}) {
  const knownProductIds = new Set(productOptions.flatMap(option => option.productId ? [option.productId] : []));
  const retainedArchived = block.productIds.filter(productId => !knownProductIds.has(productId)).length;
  return (
    <div className="grid gap-3 rounded-md border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
      <SelectField label="Product matching" value={block.productMatch} disabled={disabled} options={[{ value: "any", label: "Any selected product" }, { value: "all", label: "Every selected product" }]} onChange={value => update(current => { current.productMatch = value === "all" ? "all" : "any"; })} />
      <div>
        <p className="text-[11px] font-semibold text-white/58">Products</p>
        <div className="mt-2 grid max-h-52 gap-1.5 overflow-y-auto pr-1">
          {productOptions.map(option => option.productId ? <label key={option.productId} className="grid min-h-10 cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-sm border border-white/8 bg-black/10 px-2.5 text-[10px] font-medium text-white/62 hover:bg-white/[0.035]"><input type="checkbox" checked={block.productIds.includes(option.productId)} disabled={disabled} onChange={event => update(current => { current.productIds = event.target.checked ? [...new Set([...current.productIds, option.productId!])] : current.productIds.filter(productId => productId !== option.productId); })} className="size-4 accent-cyan-300" /><span className="truncate">{option.name}{option.active ? "" : " · archived"}</span></label> : null)}
          {!productOptions.length ? <p className="py-2 text-[10px] leading-5 text-white/35">Create a portal-enabled product before using this condition.</p> : null}
        </div>
      </div>
      <p className={`text-[10px] leading-5 ${block.productIds.length ? "text-cyan-200/55" : "text-amber-200/60"}`}>{block.productIds.length ? `${block.productIds.length} product${block.productIds.length === 1 ? "" : "s"} selected.${retainedArchived ? ` ${retainedArchived} unavailable catalogue reference${retainedArchived === 1 ? " is" : "s are"} retained safely.` : ""}` : "Select at least one product. Until then, this block remains hidden."}</p>
    </div>
  );
}

function PortalMediaBlockEditor({ block, disabled, update }: { block: ClientPortalPageBlock; disabled: boolean; update: (update: (block: ClientPortalPageBlock) => void) => void }) {
  const media = block.media ?? createPortalBlock(block.type === "video" ? "video" : "image").media!;
  function editMedia(change: (current: NonNullable<ClientPortalPageBlock["media"]>) => void) {
    update(current => {
      if (!current.media) current.media = structuredClone(createPortalBlock(current.type === "video" ? "video" : "image").media!);
      change(current.media);
    });
  }
  return <div className="grid gap-4 border-t border-white/10 pt-4"><Field label={block.type === "video" ? "Video, YouTube or Vimeo URL" : "Image URL"} value={media.url} disabled={disabled} onChange={value => editMedia(current => { current.url = value; })} /><Field label={block.type === "video" ? "Accessible video label" : "Alternative text"} value={media.alt} disabled={disabled} onChange={value => editMedia(current => { current.alt = value; })} /><Field label="Caption" value={media.caption} multiline disabled={disabled} onChange={value => editMedia(current => { current.caption = value; })} /><div className="grid grid-cols-2 gap-2"><SelectField label="Aspect" value={media.aspect} disabled={disabled} options={[{ value: "landscape", label: "Landscape 16:9" }, { value: "square", label: "Square 1:1" }, { value: "portrait", label: "Portrait 4:5" }]} onChange={value => editMedia(current => { current.aspect = value as NonNullable<ClientPortalPageBlock["media"]>["aspect"]; })} /><SelectField label="Fit" value={media.fit} disabled={disabled} options={[{ value: "cover", label: "Fill frame" }, { value: "contain", label: "Show complete media" }]} onChange={value => editMedia(current => { current.fit = value === "contain" ? "contain" : "cover"; })} /></div><p className="text-[10px] leading-5 text-white/32">Use an HTTPS asset URL. Videos accept direct media files, standard YouTube links and Vimeo links.</p></div>;
}

function PortalExtensionBlockEditor({ block, disabled, update }: { block: ClientPortalPageBlock; disabled: boolean; update: (update: (block: ClientPortalPageBlock) => void) => void }) {
  const extension = block.extension ?? createPortalBlock("custom-extension").extension!;
  function editExtension(change: (current: NonNullable<ClientPortalPageBlock["extension"]>) => void) {
    update(current => {
      if (!current.extension) current.extension = structuredClone(createPortalBlock("custom-extension").extension!);
      change(current.extension);
    });
  }
  return <div className="grid gap-4 border-t border-white/10 pt-4"><div className="rounded-md border border-emerald-300/15 bg-emerald-300/[0.035] p-3 text-[10px] leading-5 text-white/42">Runs inside an isolated iframe. It receives read-only client, provider, lifecycle and assigned-product context, while network access and parent-app access remain blocked.</div><Field label="Accessible component name" value={extension.title} disabled={disabled} onChange={value => editExtension(current => { current.title = value; })} /><label className="grid gap-2 text-[11px] font-semibold text-white/58"><span>Minimum height · {extension.minHeight}px</span><input type="range" min="120" max="1200" step="20" value={extension.minHeight} disabled={disabled} onChange={event => editExtension(current => { current.minHeight = Number(event.target.value); })} className="accent-cyan-300" /></label><CodeField label="HTML" value={extension.html} rows={10} language="HTML" disabled={disabled} onChange={value => editExtension(current => { current.html = value; })} placeholder={'<section class="portal-component">\n  <h2>Your custom workspace</h2>\n</section>'} /><CodeField label="CSS" value={extension.css} rows={9} language="CSS" disabled={disabled} onChange={value => editExtension(current => { current.css = value; })} placeholder={".portal-component {\n  padding: 24px;\n  background: #fff;\n}"} /><CodeField label="JavaScript" value={extension.javascript} rows={10} language="JS" disabled={disabled} onChange={value => editExtension(current => { current.javascript = value; })} placeholder={'document.querySelector("#portal-client").textContent =\n  window.AQUA_PORTAL.clientName;'} /><p className="text-[10px] leading-5 text-white/32">Context keys: <code className="text-cyan-200/70">clientName</code>, <code className="text-cyan-200/70">providerName</code>, <code className="text-cyan-200/70">mode</code>, <code className="text-cyan-200/70">productId</code> and <code className="text-cyan-200/70">productIds</code>.</p></div>;
}

function PortalLinkItems({ block, disabled, update }: { block: ClientPortalPageBlock; disabled: boolean; update: (update: (block: ClientPortalPageBlock) => void) => void }) {
  return <div className="grid gap-2"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-semibold text-white/58">Links</span><button type="button" disabled={disabled} onClick={() => update(current => { current.items.push({ id: portalBuilderId("item"), label: "New link", detail: "", href: "https://" }); })} title="Add link" aria-label="Add link" className="grid size-8 place-items-center rounded-md border border-white/10 text-cyan-300 disabled:opacity-35"><Plus size={13} /></button></div>{block.items.map(item => <div key={item.id} className="grid gap-2 rounded-md border border-white/10 bg-black/15 p-3"><input value={item.label} disabled={disabled} aria-label="Link label" onChange={event => update(current => { const row = current.items.find(value => value.id === item.id); if (row) row.label = event.target.value; })} className="h-9 rounded-sm border border-white/10 bg-white/[0.04] px-2 text-xs text-white/75 outline-none" /><input value={item.detail} disabled={disabled} aria-label="Link detail" onChange={event => update(current => { const row = current.items.find(value => value.id === item.id); if (row) row.detail = event.target.value; })} className="h-9 rounded-sm border border-white/10 bg-white/[0.04] px-2 text-xs text-white/75 outline-none" /><div className="grid grid-cols-[minmax(0,1fr)_32px] gap-2"><input value={item.href ?? ""} disabled={disabled} aria-label="Link URL" onChange={event => update(current => { const row = current.items.find(value => value.id === item.id); if (row) row.href = event.target.value; })} className="h-9 min-w-0 rounded-sm border border-white/10 bg-white/[0.04] px-2 text-xs text-white/75 outline-none" /><button type="button" disabled={disabled} onClick={() => update(current => { current.items = current.items.filter(value => value.id !== item.id); })} title="Remove link" aria-label="Remove link" className="grid size-8 place-items-center rounded-sm text-red-300/60 hover:bg-red-300/10 disabled:opacity-35"><Trash2 size={12} /></button></div></div>)}</div>;
}

function ensurePortalBuilder(document: ClientPortalDesignDocument) {
  if (!document.builder) document.builder = { pages: {}, customPages: [] };
  return document.builder;
}

function visibilityRuleLabel(rule: ClientPortalPageBlock["visibilityRule"]): string {
  if (rule === "with-products") return "with products";
  if (rule === "without-products") return "before assignment";
  if (rule === "single-product") return "single product";
  if (rule === "multiple-products") return "bundles only";
  if (rule === "specific-products") return "selected products";
  return "always visible";
}

/**
 * One preview surface, sized to the chosen breakpoint.
 *
 * Extracted because the canvas can now show TWO of them at once (compare:
 * draft against what the client is actually looking at right now), and two
 * copies of the same iframe markup is how they drift apart.
 */
function PreviewFrame({ label, loading, url, frameKey, breakpoint, innerRef }: {
  label?: string;
  loading: boolean;
  url: string;
  frameKey: number;
  breakpoint: Breakpoint;
  innerRef?: React.RefObject<HTMLIFrameElement | null>;
}) {
  const fluid = breakpoint.id === "responsive" || breakpoint.id === "custom";
  return (
    <div className="mx-auto" style={{ width: Math.min(breakpointSize(breakpoint).width, 1440), maxWidth: "100%" }}>
      {label ? <p className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-wide text-white/35">{label}</p> : null}
      <div className="overflow-hidden rounded-md border border-white/12 bg-white shadow-[0_24px_80px_rgba(0,0,0,.35)] transition-[width]">
        {loading || !url ? (
          <div className="grid h-[70vh] place-items-center bg-[#f2f0eb] text-sm text-black/45">Loading the real portal...</div>
        ) : (
          <iframe
            ref={innerRef}
            key={`${frameKey}:${url}`}
            title={label ?? "Client portal draft preview"}
            src={url}
            className="block w-full bg-white"
            style={{ height: fluid ? "calc(100vh - 200px)" : breakpointSize(breakpoint).height }}
          />
        )}
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

function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="grid gap-2 text-[11px] font-semibold text-white/58"><span>{label}</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="h-10 min-w-0 rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs text-white/78 outline-none focus:border-cyan-300/45 disabled:opacity-50">{options.map(option => <option key={option.value} value={option.value} className="bg-[#1a1c1a]">{option.label}</option>)}</select></label>;
}

function CodeField({ label, language, value, onChange, disabled, rows, placeholder }: { label: string; language: string; value: string; onChange: (value: string) => void; disabled: boolean; rows: number; placeholder: string }) {
  return <label className="grid gap-2 text-[11px] font-semibold text-white/58"><span className="flex items-center justify-between gap-3"><span>{label}</span><span className="font-mono text-[9px] uppercase text-cyan-300/45">{language}</span></span><textarea rows={rows} value={value} disabled={disabled} placeholder={placeholder} spellCheck={false} onChange={event => onChange(event.target.value)} className="w-full resize-y rounded-md border border-white/10 bg-[#090b0a] px-3 py-2 font-mono text-[11px] leading-5 text-cyan-50/75 outline-none placeholder:text-white/18 focus:border-cyan-300/45 disabled:opacity-50" /></label>;
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
