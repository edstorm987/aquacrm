"use client";

// /admin/editor — Wix / GoHighLevel-style live editor (the "super editor").
//
// Hosts the actual storefront in an iframe (with ?portal_edit=1 so the
// existing PortalEditOverlay activates inside) and wraps it in:
//   • Icon top bar          — site / page picker, mode switcher, edit/view, save, publish
//   • Right properties side — opens when an element is clicked in the iframe
//   • Mode switch           — Preview (iframe + click-to-edit), Design (drag/drop builder),
//                             Code (structure, CSS, head, and footer code)
//
// Live mode message contract with the embedded PortalEditOverlay:
//   iframe → host:  { source: "portal-edit-overlay", type: "ready" | "select" | "unsaved" | "saved", … }
//   host → iframe:  { source: "editor-host", type: "set-mode" | "patch" | "save" | "revert", … }

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Braces, Code2, FileCode2, LayoutTemplate, Paintbrush, Save } from "lucide-react";
import PluginRequired from "../lib/pluginRequired";
import DevicePreview from "../components/devicePreview";
import { confirm } from "../lib/confirm";
import { PagePickerToolbar } from "../components/editor/PagePickerToolbar";
import {
  parseEditorDeepLink, buildEditorDeepLink, pagesForVariant,
  availableVariants, resolveStartPage, slugify, uniqueSlug,
  DEFAULT_VARIANT, type PageLike,
} from "../lib/editorDeepLink";
import EditorTopBar, { type EditorMode } from "../components/editor/EditorTopBar";
import EditorPropertiesSidebar, { type SelectedElement } from "../components/editor/EditorPropertiesSidebar";
import EditorOutliner, { type EditorTarget } from "../components/editor/EditorOutliner";
import EditorFunnelStage from "../components/editor/EditorFunnelStage";
import { featureBackendGap } from "../lib/featureBackends";
import EditorBlockStage from "../components/editor/EditorBlockStage";
import { GenerateModal } from "../components/editor/GenerateModal";
import { LivePreview, useLivePreviewOpenState } from "../components/editor/LivePreview";
import {
  loadDeviceState, saveDeviceState, getDevicePreset, effectiveViewport,
  type DeviceState,
} from "../lib/devicePresets";
import {
  listPages as listEditorPages, getPage as getEditorPage,
  updatePage as updateEditorPage, publishPage as publishEditorPage,
  createPage as createEditorPage, deletePage as deleteEditorPage,
} from "../lib/editorPages";
import {
  createSite, refreshSites, getActiveSite, getSite, setActiveSiteId,
  updateSite, type Site,
} from "../lib/sites";
import { promoteSiteToGitHub, type PromoteResult } from "../lib/promote";
import { getState as getContentState, publish as publishContent } from "../lib/content";
import {
  type Funnel, listFunnels, refreshFunnels, createFunnel, onFunnelsChange,
} from "../lib/funnels";
import {
  getEditorComplexity, setEditorComplexity, onEditorComplexityChange,
  type EditorComplexity,
} from "../lib/editorMode";
import type { EditorPage } from "../types/editorPage";
import type { Block } from "../types/block";
import { PAGE_TEMPLATES } from "../components/pageTemplates";
import { makeBlockId } from "../components/canvas/blockTreeOps";

interface PageEntry {
  id: string;
  slug: string;
  title: string;
  source: "editor" | "site";
  // When set, this page is a portal variant and the topbar shows a
  // role badge so the operator knows they're editing customer-facing
  // chrome rather than a regular site page.
  portalRole?: import("../lib/portalRole").PortalRole;
}

// Plugin-page entry point. Foundation passes us PluginPageProps when it
// mounts the page at /portal/clients/[clientId]/editor — the inner
// editor pulls sites/pages from session-scoped endpoints, so we don't
// need to thread the clientId through manually here. PluginRequired is
// a pass-through (foundation handles plugin gating upstream).
export default function VisualEditorPage() {
  return <PluginRequired plugin="website"><VisualEditorPageInner /></PluginRequired>;
}

function VisualEditorPageInner() {
  // Honour ?page=<id> on first mount so listing pages can deep-link
  // into the editor with a specific page selected. Consumed once and
  // then ignored — switching sites later falls back to the first page.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialDeepLink = useMemo(() => parseEditorDeepLink(searchParams), [searchParams]);
  const deepLinkPageId = useRef<string | null>(initialDeepLink.pageId);
  const [currentVariant, setCurrentVariant] = useState<string>(initialDeepLink.variant);

  // Path may be /portal/clients/[clientId]/edit-website (T1's agency
  // shell) or the legacy /portal/admin/editor route. Either way we
  // reuse the segment up to the last `/` for router.replace below.
  const clientIdFromPath = useMemo(() => {
    if (!pathname) return null;
    const m = pathname.match(/\/portal\/clients\/([^/]+)\//);
    return m ? decodeURIComponent(m[1] ?? "") : null;
  }, [pathname]);

  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [target, setTarget] = useState<EditorTarget>({ kind: "page", id: "_home" });
  const [mode, setMode] = useState<EditorMode>(() => getEditorComplexity() === "simple" ? "live" : "block");
  const [edit, setEdit] = useState<"edit" | "view">("edit");
  const [deviceState, setDeviceState] = useState<DeviceState>(() => loadDeviceState());
  const [unsaved, setUnsaved] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  // R003 — per-page open-state persisted in localStorage; `lastSaveAt`
  // bumps trigger iframe auto-refresh on save.
  const [lastSaveAt, setLastSaveAt] = useState(0);
  const [livePreviewOpen, setLivePreviewOpen] = useLivePreviewOpenState(
    target.kind === "page" ? target.id : null,
  );
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newFunnelOpen, setNewFunnelOpen] = useState(false);
  const [pageSettingsId, setPageSettingsId] = useState<string | null>(null);
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false);
  const [history, setHistory] = useState<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false });
  const [complexity, setComplexity] = useState<EditorComplexity>(() => getEditorComplexity());
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync complexity across tabs / settings tab in /admin/customise.
  useEffect(() => onEditorComplexityChange(() => setComplexity(getEditorComplexity())), []);

  function changeComplexity(c: EditorComplexity) {
    setComplexity(c);
    setEditorComplexity(c);
    // Simple mode always lives in Live; flip the inner editor mode if
    // the operator switches to Simple while sitting on Block / Code.
    if (c === "simple" && mode !== "live") setMode("live");
  }
  // Probe whether the @aqua/plugin-ai-builder API is mounted. Used to
  // toggle the ✨ Generate button — invisible when the plugin isn't
  // installed or the operator's role can't reach it.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/portal/ai-builder/status", { cache: "no-store", credentials: "include" })
      .then(r => (r.ok ? r.json() as Promise<{ ok?: boolean; ready?: boolean }> : Promise.resolve({ ok: false } as { ok?: boolean; ready?: boolean })))
      .then(d => { if (!cancelled) setAiAvailable(Boolean(d.ok && d.ready)); })
      .catch(() => { if (!cancelled) setAiAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  // History controls registered by EditorBlockStage so the topbar's
  // ↶/↷ buttons can drive its internal undo/redo stacks.
  const historyApiRef = useRef<{
    undo: () => void; redo: () => void;
    canUndo: () => boolean; canRedo: () => boolean;
  } | null>(null);

  const loadPages = useCallback(async (siteId: string): Promise<PageEntry[]> => {
    const editorPages = await listEditorPages(siteId, true);
    const pageEntries: PageEntry[] = editorPages.map(p => ({
      id: p.id, slug: p.slug, title: p.title || p.slug, source: "editor",
      portalRole: p.portalRole,
    }));
    if (!pageEntries.some(p => p.slug === "/")) {
      pageEntries.unshift({ id: "_home", slug: "/", title: "Home", source: "site" });
    }
    return pageEntries;
  }, []);

  // Load sites + pages + funnels on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBooting(true);
      setBootError(null);
      let allSites = await refreshSites();
      if (cancelled) return;

      if (allSites.length === 0) {
        const created = await createSite({ name: "Client website", slug: "website" });
        const homepage = PAGE_TEMPLATES.find(template => template.id === "homepage");
        await createEditorPage(created.id, {
          title: homepage?.defaultTitle ?? "Home",
          slug: "/",
          blocks: homepage?.build() ?? [],
          isHomepage: true,
        });
        setActiveSiteId(created.id);
        allSites = await refreshSites();
      }

      const active = getActiveSite() ?? allSites[0] ?? null;
      if (cancelled) return;
      setSites(allSites);
      setSite(active);
      if (!active) {
        setBooting(false);
        return;
      }

      const [pageEntries, _funnels] = await Promise.all([
        loadPages(active.id),
        refreshFunnels(),
      ]);
      if (cancelled) return;

      setPages(pageEntries);
      setFunnels(_funnels);
      const requested = deepLinkPageId.current;
      const startId = requested && pageEntries.some(p => p.id === requested)
        ? requested
        : pageEntries[0]?.id ?? "_home";
      setTarget({ kind: "page", id: startId });
      deepLinkPageId.current = null;
      setBooting(false);
    }
    void load().catch(cause => {
      if (cancelled) return;
      setBootError(cause instanceof Error ? cause.message : String(cause));
      setBooting(false);
    });
    return () => { cancelled = true; };
  }, [loadPages]);

  // Re-load pages when the operator changes site. The first site is
  // hydrated by the boot effect above, so skip this effect once to avoid
  // racing and overwriting a page supplied in the deep link.
  const didBootSite = useRef(false);
  useEffect(() => {
    if (!site) return;
    if (!didBootSite.current) {
      didBootSite.current = true;
      return;
    }
    let cancelled = false;
    setActiveSiteId(site.id);
    void loadPages(site.id).then(pageEntries => {
      if (cancelled) return;
      setPages(pageEntries);
      setTarget({ kind: "page", id: pageEntries[0]?.id ?? "_home" });
    });
    return () => { cancelled = true; };
  }, [site?.id, loadPages]);

  // Subscribe to funnel mutations so the outliner stays in sync.
  useEffect(() => onFunnelsChange(() => setFunnels(listFunnels())), []);

  const currentPage   = target.kind === "page" ? pages.find(p => p.id === target.id) ?? null : null;
  const currentFunnel = target.kind === "funnel" ? funnels.find(f => f.id === target.id) ?? null : null;
  const pageSettingsPage = pageSettingsId ? pages.find(p => p.id === pageSettingsId) ?? null : null;

  // The URL we render inside the iframe in Live mode. ?portal_edit=1
  // activates PortalEditOverlay; mode=view turns it off without reload.
  // Block mode now renders inline via EditorBlockStage (no iframe).
  const iframeSrc = useMemo(() => {
    if (!currentPage) return "about:blank";
    if (clientIdFromPath && site && currentPage.source === "editor") {
      return `/client-website-preview/${encodeURIComponent(clientIdFromPath)}/${encodeURIComponent(site.id)}/${encodeURIComponent(currentPage.id)}?preview=1`;
    }
    const params = new URLSearchParams();
    if (edit === "edit") params.set("portal_edit", "1");
    params.set("editor_host", "1");
    const qs = params.toString();
    return `${currentPage.slug}${qs ? `?${qs}` : ""}`;
  }, [clientIdFromPath, currentPage, edit, site]);

  // Listen to messages from the embedded overlay.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as
        | { source?: string; type?: string; unsaved?: number; key?: string;
            elementType?: SelectedElement["type"]; value?: string;
            rect?: SelectedElement["rect"]; label?: string }
        | null;
      if (!data || data.source !== "portal-edit-overlay") return;
      if (data.type === "ready")   setIframeReady(true);
      if (data.type === "unsaved") setUnsaved(data.unsaved ?? 0);
      if (data.type === "saved")   { setUnsaved(0); setLastSaveAt(Date.now()); }
      if (data.type === "select" && data.key && data.elementType) {
        setSelected({
          key: data.key,
          type: data.elementType,
          value: data.value ?? "",
          rect: data.rect,
          label: data.label,
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Reset selected when the target / mode changes — its keys won't be in the new doc.
  // (Use scalar deps so a fresh `target` object reference doesn't refire each render.)
  useEffect(() => { setSelected(null); }, [target.kind, target.id, mode]);

  // Reset transient counters when context shifts. Otherwise the topbar
  // shows stale "N unsaved" from a previous mode after the operator
  // switches contexts.
  useEffect(() => {
    setUnsaved(0);
    setHistory({ canUndo: false, canRedo: false });
  }, [target.kind, target.id, mode]);

  // Cmd/Ctrl + S → open the publish modal. Bail when an input/textarea is
  // focused so the operator can still use the browser's text save shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setPublishOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function reloadIframe() {
    setIframeReady(false);
    setReloadKey(k => k + 1);
  }

  function postToIframe(message: unknown) {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }

  function setEditorMode(next: "edit" | "view") {
    setEdit(next);
    postToIframe({ source: "editor-host", type: "set-mode", mode: next });
  }

  function patchSelected(key: string, value: string) {
    postToIframe({ source: "editor-host", type: "patch", key, value });
  }
  function saveSelected(key: string) {
    postToIframe({ source: "editor-host", type: "save", key });
  }
  function revertSelected(key: string) {
    postToIframe({ source: "editor-host", type: "revert", key });
  }

  // Outliner callbacks — page CRUD + funnel CRUD wired to the libs.
  async function handleDeletePage(id: string) {
    if (!site) return;
    const pg = pages.find(p => p.id === id);
    if (!pg || pg.source !== "editor") return;
    if (!(await confirm({ title: `Delete "${pg.title}"?`, message: "Page + its blocks are removed. This cannot be undone.", danger: true, confirmLabel: "Delete page" }))) return;
    await deleteEditorPage(site.id, id);
    const next = await loadPages(site.id);
    setPages(next);
    if (target.kind === "page" && target.id === id) {
      setTarget({ kind: "page", id: next[0]?.id ?? "_home" });
    }
  }
  function handleSelectPage(id: string)   { setTarget({ kind: "page", id }); }
  function handleSelectFunnel(id: string) { setTarget({ kind: "funnel", id }); }

  async function handleDeleteFunnel(id: string) {
    const f = funnels.find(x => x.id === id);
    if (!f) return;
    if (!(await confirm({ title: `Delete "${f.name}"?`, message: "Funnel + its stats are removed. This cannot be undone.", danger: true, confirmLabel: "Delete funnel" }))) return;
    const { deleteFunnel } = await import("../lib/funnels");
    await deleteFunnel(id);
    setFunnels(listFunnels());
    if (target.kind === "funnel" && target.id === id) {
      setTarget({ kind: "page", id: pages[0]?.id ?? "_home" });
    }
  }

  // Resolve viewport for iframe scaling. Same maths the canvas uses.
  const spec = getDevicePreset(deviceState.deviceId) ?? null;
  const viewport = spec ? effectiveViewport(spec, deviceState) : { width: 1280, height: 800 };
  const isResponsive = deviceState.deviceId === "responsive";

  // Topbar widgets only make sense for page editing.
  const isPageTarget = target.kind === "page";
  const isSimple = complexity === "simple";

  // ── Deep-link contract (R10) ─────────────────────────────────────────
  // Pages are grouped by variant via EditorPage.variantId — pages with
  // no variantId are the "default" variant. When only one variant is
  // present, the toolbar's variant switcher hides itself.
  const pagesAsLike: PageLike[] = useMemo(() => pages.map(p => ({
    id: p.id, slug: p.slug, title: p.title, variantId: undefined,
  })), [pages]);
  const variantList = useMemo(() => availableVariants(pagesAsLike), [pagesAsLike]);
  const visiblePages = useMemo(
    () => pagesForVariant(pagesAsLike, currentVariant),
    [pagesAsLike, currentVariant],
  );

  // Push the current (clientId, page, variant) into the URL so the
  // editor is bookmarkable + shareable, matching T1's "Edit website"
  // CTA shape. router.replace keeps the back-button history intact.
  const pushDeepLink = useCallback((nextPageId: string | null, nextVariant: string) => {
    if (!clientIdFromPath) return; // legacy mount; nothing to update
    const url = buildEditorDeepLink({ clientId: clientIdFromPath, pageId: nextPageId, variant: nextVariant });
    try { router.replace(url); } catch { /* SSR / older next versions */ }
  }, [clientIdFromPath, router]);

  async function guardUnsaved(): Promise<boolean> {
    if (unsaved <= 0) return true;
    return confirm({
      title: "Discard unsaved changes?",
      message: `${unsaved} unsaved edit${unsaved === 1 ? "" : "s"} on this page will be lost.`,
      danger: true,
      confirmLabel: "Discard & switch",
    });
  }

  async function handlePickPage(nextPageId: string) {
    if (!(await guardUnsaved())) return;
    setTarget({ kind: "page", id: nextPageId });
    pushDeepLink(nextPageId, currentVariant);
  }

  async function handlePickVariant(nextVariant: string) {
    if (nextVariant === currentVariant) return;
    if (!(await guardUnsaved())) return;
    setCurrentVariant(nextVariant);
    const nextPages = pagesForVariant(pagesAsLike, nextVariant);
    const nextStart = resolveStartPage(nextPages, null);
    if (nextStart) setTarget({ kind: "page", id: nextStart });
    pushDeepLink(nextStart, nextVariant);
  }

  function cloneBlocks(blocks: Block[]): Block[] {
    return blocks.map(block => ({
      ...block,
      id: makeBlockId(),
      props: { ...block.props },
      styles: block.styles ? { ...block.styles } : undefined,
      children: block.children ? cloneBlocks(block.children) : undefined,
    }));
  }

  async function handleDuplicatePage(id: string) {
    if (!site) return;
    const source = pages.find(page => page.id === id);
    if (!source || source.source !== "editor") return;
    const document = await getEditorPage(site.id, id);
    if (!document) return;
    const title = `${source.title} copy`;
    const slug = uniqueSlug(pagesAsLike, slugify(title));
    const created = await createEditorPage(site.id, {
      title,
      slug,
      description: document.description,
      blocks: cloneBlocks(document.blocks),
      themeId: document.themeId,
    });
    if (!created) return;
    const refreshed = await loadPages(site.id);
    setPages(refreshed);
    setTarget({ kind: "page", id: created.id });
    pushDeepLink(created.id, currentVariant);
  }

  if (booting || bootError) {
    return (
      <main className="fixed inset-0 z-[80] grid place-items-center bg-[#0a0a0a] px-6">
        <div className="max-w-md text-center">
          <LayoutTemplate className="mx-auto mb-4 text-cyan-300/75" size={30} aria-hidden="true" />
          {bootError ? (
            <>
              <h1 className="text-sm font-semibold text-white">The visual builder could not start</h1>
              <p role="alert" className="mt-2 text-[12px] leading-5 text-red-300">{bootError}</p>
            </>
          ) : (
            <>
              <h1 className="text-sm font-semibold text-white">Preparing the visual builder</h1>
              <p className="mt-2 text-[12px] text-brand-cream/45">Loading your website, pages, and design tools...</p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-[80] flex flex-col bg-[#0a0a0a]">
      <EditorTopBar
        backHref={clientIdFromPath ? `/portal/clients/${encodeURIComponent(clientIdFromPath)}?tab=systems&systemView=website` : "/portal/agency/fulfilment?view=technical"}
        sites={sites.map(s => ({ id: s.id, name: s.name }))}
        siteId={site?.id ?? ""}
        onSiteChange={id => setSite(sites.find(s => s.id === id) ?? null)}
        pages={pages.map(p => ({ id: p.id, slug: p.slug, title: p.title }))}
        pageId={isPageTarget ? target.id : null}
        onPageChange={id => setTarget({ kind: "page", id })}
        mode={mode}
        onModeChange={setMode}
        edit={edit}
        onEditChange={setEditorMode}
        supportsInlineEdit={!clientIdFromPath}
        onReload={reloadIframe}
        iframeReady={mode !== "live" || iframeReady}
        unsaved={unsaved}
        onPublish={() => setPublishOpen(true)}
        onGenerate={
          aiAvailable && isPageTarget && currentPage && currentPage.source === "editor"
            ? () => setGenerateOpen(true)
            : undefined
        }
        targetKind={target.kind}
        funnelLabel={currentFunnel?.name}
        onUndo={mode === "block" ? () => historyApiRef.current?.undo() : undefined}
        onRedo={mode === "block" ? () => historyApiRef.current?.redo() : undefined}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        complexity={complexity}
        onComplexityChange={changeComplexity}
        onOpenPageSettings={
          isPageTarget && currentPage && currentPage.source === "editor"
            ? () => setPageSettingsId(currentPage.id)
            : undefined
        }
        portalRoleLabel={
          currentPage?.portalRole
            ? `${currentPage.portalRole} portal`
            : undefined
        }
      />

      {isPageTarget && (
        <PagePickerToolbar
          pages={visiblePages}
          currentPageId={isPageTarget ? target.id : null}
          variants={variantList}
          currentVariant={currentVariant}
          onSelectPage={id => void handlePickPage(id)}
          onCreatePage={() => setNewPageOpen(true)}
          onDuplicatePage={id => void handleDuplicatePage(id)}
          onDeletePage={id => void handleDeletePage(id)}
          onOpenSettings={id => setPageSettingsId(id)}
          onSelectVariant={v => void handlePickVariant(v)}
        />
      )}

      {isPageTarget && mode !== "code" && !isSimple && (
        <DevicePreview state={deviceState} onChange={s => { setDeviceState(s); saveDeviceState(s); }} />
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Outliner is full-page navigation — Simple mode hides it so the
            canvas gets the full width; the Page picker in the topbar
            stays available for switching pages. */}
        {!isSimple && (
          <div className={mode === "block" && target.kind === "page" ? "hidden 2xl:flex shrink-0" : "flex shrink-0"}>
            <EditorOutliner
              siteName={site?.name ?? "Site"}
              pages={pages}
              funnels={funnels}
              target={target}
              onSelectPage={handleSelectPage}
              onSelectFunnel={handleSelectFunnel}
              onCreatePage={() => setNewPageOpen(true)}
              onCreateFunnel={() => setNewFunnelOpen(true)}
              onDeletePage={id => void handleDeletePage(id)}
              onDeleteFunnel={id => void handleDeleteFunnel(id)}
              onPageSettings={id => setPageSettingsId(id)}
              onSiteSettings={() => setSiteSettingsOpen(true)}
            />
          </div>
        )}

        {/* Stage selection: funnels use their focused editor, Design uses
            the three-pane block workspace, and Preview/Code use the main stage. */}
        {target.kind === "funnel" ? (
          <div className="flex min-w-0 flex-1 items-start justify-center overflow-auto bg-[#050505] p-2 sm:p-4 lg:p-6">
            {currentFunnel ? (
              <EditorFunnelStage
                funnel={currentFunnel}
                onChange={next => setFunnels(fs => fs.map(f => f.id === next.id ? next : f))}
                onDeleted={() => {
                  setFunnels(listFunnels());
                  setTarget({ kind: "page", id: pages[0]?.id ?? "_home" });
                }}
              />
            ) : (
              <div className="text-center text-[12px] text-brand-cream/45 mt-12">Funnel not found.</div>
            )}
          </div>
        ) : isPageTarget && mode === "block" && currentPage?.source === "editor" && site ? (
          <EditorBlockStage
            siteId={site.id}
            pageId={currentPage.id}
            device={deviceState}
            onSavingChange={s => setUnsaved(s ? 1 : 0)}
            registerHistory={api => { historyApiRef.current = api; }}
            onHistoryChange={(canUndo, canRedo) => setHistory(prev =>
              prev.canUndo === canUndo && prev.canRedo === canRedo ? prev : { canUndo, canRedo },
            )}
          />
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-start justify-center overflow-auto bg-[#050505] p-2 sm:p-4 lg:p-6">
              {mode === "code" ? (
                <CodeStage
                  site={site}
                  page={currentPage}
                  onSavedChange={n => setUnsaved(n)}
                />
              ) : !currentPage ? (
                <div className="text-center text-[12px] text-brand-cream/45 mt-12 max-w-md">
                  <p>No pages on this site yet.</p>
                  <p className="mt-2">
                    Click <strong>+</strong> in the left rail to create one, or open{" "}
                    <Link href="/admin/sites" className="text-cyan-300 hover:text-cyan-200">/admin/sites</Link>.
                  </p>
                </div>
              ) : mode === "block" && currentPage.source !== "editor" ? (
                <div className="text-center text-[12px] text-brand-cream/45 mt-12 max-w-md">
                  <p>Block editing is only available for editor-managed pages.</p>
                  <p className="mt-2 text-brand-cream/35">
                    The storefront home is rendered from source. Switch to{" "}
                    <button onClick={() => setMode("live")} className="text-cyan-300 hover:text-cyan-200 underline">Live</button>{" "}
                    to edit it inline.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    width: isResponsive ? "100%" : viewport.width,
                    maxWidth: "100%",
                    transform: mode === "live" ? `scale(${deviceState.zoom})` : undefined,
                    transformOrigin: "top center",
                  }}
                >
                  <iframe
                    key={`${mode}-${reloadKey}`}
                    ref={iframeRef}
                    src={iframeSrc}
                    title={currentPage.title}
                    sandbox="allow-forms allow-same-origin allow-scripts allow-popups allow-modals allow-clipboard-write"
                    onLoad={() => setIframeReady(true)}
                    style={{
                      width: "100%",
                      height: mode === "live"
                        ? (isResponsive ? "calc(100vh - 220px)" : viewport.height)
                        : "calc(100vh - 120px)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      background: "#0a0a0a",
                      display: "block",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Right properties sidebar — Live mode only (Block has its own,
                Code has none). Simple mode hides it; the operator clicks
                blocks to edit them inline in the iframe instead. */}
            {isPageTarget && mode === "live" && !isSimple && !clientIdFromPath && (
              <EditorPropertiesSidebar
                selected={selected}
                onClose={() => setSelected(null)}
                onPatch={patchSelected}
                onSave={saveSelected}
                onRevert={revertSelected}
                aiAvailable={aiAvailable}
              />
            )}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-4 overflow-x-auto whitespace-nowrap border-t border-white/5 bg-brand-black-soft px-2 py-2 text-[10px] text-brand-cream/45 [scrollbar-width:thin] sm:px-4">
        {target.kind === "funnel" ? (
          <span>Funnel editor — auto-saves changes. Step paths support globs (e.g. <code className="font-mono text-brand-cream/65">/products/*</code>).</span>
        ) : mode === "live" && clientIdFromPath ? (
          <span>Client website preview · Draft</span>
        ) : mode === "live" ? (
          <>
            <span>Cmd/Ctrl+E to toggle edit mode inside the iframe</span>
            <span className="opacity-50">·</span>
            <span>Click any element marked <code className="font-mono text-brand-cream/65">data-portal-edit</code> to edit</span>
          </>
        ) : mode === "block" ? (
          <span>Block editor — drag, drop, duplicate, delete blocks. Saves are instant.</span>
        ) : (
          <span>Raw JSON view of the page's block tree. Edit carefully — invalid JSON won't save.</span>
        )}
        <div className="flex-1" />
        {target.kind === "page" && currentPage && mode !== "live" && (
          <button
            onClick={() => setLivePreviewOpen(!livePreviewOpen)}
            aria-pressed={livePreviewOpen}
            className="text-[10px] uppercase tracking-[0.18em] text-brand-cream/55 hover:text-brand-cream border border-white/10 rounded px-2 py-0.5"
          >
            {livePreviewOpen ? "Hide preview" : "Live preview"}
          </button>
        )}
        <span>{target.kind === "page" ? currentPage?.slug : currentFunnel?.steps.length + " steps"}</span>
      </footer>

      {livePreviewOpen && currentPage && mode !== "live" && (
        <div className="fixed top-[60px] bottom-[40px] right-0 z-40 shadow-2xl">
          <LivePreview
            pageSlug={iframeSrc}
            reloadKey={reloadKey}
            lastSaveAt={lastSaveAt}
            onSelectBlock={blockId => {
              setSelected({ key: blockId, type: "text", value: "" });
            }}
            onClose={() => setLivePreviewOpen(false)}
            selectedBlockId={selected?.key ?? null}
          />
        </div>
      )}

      <GenerateModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onInsert={async tree => {
          if (!site || !currentPage || currentPage.source !== "editor") return;
          const existing = await getEditorPage(site.id, currentPage.id);
          const nextBlocks = [...(existing?.blocks ?? []), ...(tree as EditorPage["blocks"])];
          await updateEditorPage(site.id, currentPage.id, { blocks: nextBlocks });
          setReloadKey(k => k + 1);
        }}
      />

      {publishOpen && site && (
        <PublishModal
          site={site}
          activePageId={currentPage?.source === "editor" ? currentPage.id : null}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {newPageOpen && site && (
        <NewPageModal
          onClose={() => setNewPageOpen(false)}
          onCreate={async input => {
            const created = await createEditorPage(site.id, input);
            if (!created) return false;
            const next = await loadPages(site.id);
            setPages(next);
            setTarget({ kind: "page", id: created.id });
            pushDeepLink(created.id, currentVariant);
            return true;
          }}
        />
      )}

      {newFunnelOpen && (
        <NewFunnelModal
          onClose={() => setNewFunnelOpen(false)}
          onCreate={async input => {
            const created = await createFunnel(input);
            if (!created) return false;
            setFunnels(listFunnels());
            setTarget({ kind: "funnel", id: created.id });
            return true;
          }}
        />
      )}

      {pageSettingsId && pageSettingsPage && site && (
        <PageSettingsModal
          siteId={site.id}
          page={pageSettingsPage}
          isPro={complexity === "pro"}
          onClose={() => setPageSettingsId(null)}
          onSaved={async () => {
            const next = await loadPages(site.id);
            setPages(next);
          }}
        />
      )}

      {siteSettingsOpen && site && (
        <SiteSettingsModal
          site={site}
          onClose={() => setSiteSettingsOpen(false)}
          onSaved={updated => {
            setSite(updated);
            setSites(ss => ss.map(s => s.id === updated.id ? updated : s));
          }}
        />
      )}
    </main>
  );
}

// ── Code stage ─────────────────────────────────────────────────────────────
//
// One code workspace for the structural block tree and the page-level
// CSS/head/footer escape hatches. Custom HTML itself remains a normal block
// so it can still be positioned visually in Design mode.

type CodePanel = "blocks" | "css" | "head" | "foot";

const CODE_PANELS: Array<{
  id: CodePanel;
  label: string;
  filename: string;
  icon: typeof Braces;
  placeholder: string;
}> = [
  { id: "blocks", label: "Structure", filename: "blocks.json", icon: Braces, placeholder: "[]" },
  { id: "css", label: "Page CSS", filename: "page.css", icon: Paintbrush, placeholder: ".hero {\n  min-height: 80vh;\n}" },
  { id: "head", label: "Head", filename: "head.html", icon: FileCode2, placeholder: "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">" },
  { id: "foot", label: "Footer code", filename: "footer.html", icon: Code2, placeholder: "<script>\n  // Runs after the page content.\n</script>" },
];

function CodeStage({
  site, page, onSavedChange,
}: {
  site: Site | null;
  page: PageEntry | null | undefined;
  onSavedChange: (n: number) => void;
}) {
  const [activePanel, setActivePanel] = useState<CodePanel>("blocks");
  const [buffers, setBuffers] = useState<Record<CodePanel, string>>({ blocks: "", css: "", head: "", foot: "" });
  const [original, setOriginal] = useState<Record<CodePanel, string>>({ blocks: "", css: "", head: "", foot: "" });
  const [pageDoc, setPageDoc] = useState<EditorPage | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    async function pull() {
      if (!site || !page || page.source !== "editor") {
        const empty = { blocks: "", css: "", head: "", foot: "" };
        setBuffers(empty);
        setOriginal(empty);
        setPageDoc(null);
        setLoaded(true);
        return;
      }
      const doc = await getEditorPage(site.id, page.id);
      if (cancelled) return;
      const next = {
        blocks: JSON.stringify(doc?.blocks ?? [], null, 2),
        css: doc?.customCss ?? doc?.customCSS ?? "",
        head: doc?.customHead ?? "",
        foot: doc?.customFoot ?? "",
      };
      setPageDoc(doc);
      setBuffers(next);
      setOriginal(next);
      setLoaded(true);
    }
    void pull();
    return () => { cancelled = true; };
  }, [site, page]);

  const dirtyPanels = CODE_PANELS.filter(panel => buffers[panel.id] !== original[panel.id]);
  const dirty = dirtyPanels.length > 0;
  useEffect(() => { onSavedChange(dirtyPanels.length); }, [dirtyPanels.length, onSavedChange]);

  async function commit() {
    if (!site || !pageDoc || !dirty) return;
    const patch: Parameters<typeof updateEditorPage>[2] = {};
    if (buffers.blocks !== original.blocks) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(buffers.blocks);
      } catch (e) {
        setActivePanel("blocks");
        setError(e instanceof Error ? e.message : "Invalid block JSON");
        return;
      }
      if (!Array.isArray(parsed)) {
        setActivePanel("blocks");
        setError("The block structure must be a top-level array.");
        return;
      }
      patch.blocks = parsed as EditorPage["blocks"];
    }
    if (buffers.css !== original.css) patch.customCss = buffers.css;
    if (buffers.head !== original.head) patch.customHead = buffers.head;
    if (buffers.foot !== original.foot) patch.customFoot = buffers.foot;
    setSaving(true);
    setError(null);
    const ok = await updateEditorPage(site.id, pageDoc.id, patch);
    setSaving(false);
    if (!ok) {
      setError("Save failed.");
      return;
    }
    setPageDoc(ok);
    setOriginal(buffers);
  }

  if (!loaded) {
    return <div className="text-center text-[12px] text-brand-cream/45 mt-12">Loading…</div>;
  }
  if (!page || page.source !== "editor") {
    return (
      <div className="text-center text-[12px] text-brand-cream/45 mt-12 max-w-md">
        <p>Code view is only available for editor-managed pages.</p>
        <p className="mt-2 text-brand-cream/35">
          Storefront source pages are rendered from React components in <code className="font-mono">src/app/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-160px)] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-white/10 bg-[#0a0e1a]">
      <div className="flex min-h-12 items-center gap-1 border-b border-white/10 px-2">
        {CODE_PANELS.map(panel => {
          const Icon = panel.icon;
          const changed = buffers[panel.id] !== original[panel.id];
          return (
            <button
              key={panel.id}
              type="button"
              onClick={() => { setActivePanel(panel.id); setError(null); }}
              aria-pressed={activePanel === panel.id}
              className={`relative inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[11px] transition ${
                activePanel === panel.id ? "bg-white/10 text-brand-cream" : "text-brand-cream/50 hover:bg-white/5 hover:text-brand-cream/80"
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {panel.label}
              {changed ? <span className="size-1.5 rounded-full bg-amber-300" aria-label="Unsaved" /> : null}
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="hidden text-[10px] font-mono text-brand-cream/35 sm:block">{pageDoc?.slug}</span>
        <button
          onClick={() => void commit()}
          disabled={!dirty || saving}
          className="ml-2 inline-flex min-h-8 items-center gap-2 rounded-md border border-cyan-400/20 bg-cyan-500/15 px-3 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
        >
          <Save size={13} aria-hidden="true" />
          {saving ? "Saving" : dirty ? `Save ${dirtyPanels.length}` : "Saved"}
        </button>
      </div>
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2">
        <span className="text-[10px] font-mono text-brand-cream/55">{CODE_PANELS.find(panel => panel.id === activePanel)?.filename}</span>
        {activePanel === "blocks" ? (
          <span className="text-[10px] text-brand-cream/35">Add and position custom HTML from Design, then edit that block here or in Properties.</span>
        ) : null}
        {error ? <span role="alert" className="ml-auto text-[11px] text-red-300">{error}</span> : null}
      </div>
      <textarea
        value={buffers[activePanel]}
        onChange={event => setBuffers(current => ({ ...current, [activePanel]: event.target.value }))}
        placeholder={CODE_PANELS.find(panel => panel.id === activePanel)?.placeholder}
        spellCheck={false}
        aria-label={`${CODE_PANELS.find(panel => panel.id === activePanel)?.label} editor`}
        className="min-h-0 flex-1 resize-none bg-[#080b14] p-5 font-mono text-[12px] leading-6 text-brand-cream outline-none placeholder:text-brand-cream/20 focus:bg-[#090d18]"
      />
    </div>
  );
}

// ── Publish modal ───────────────────────────────────────────────────────────
//
// One-click "ship to GitHub". Three steps run in sequence:
//   1. POST /api/portal/website-editor/content/publish — drafts → published
//   2. POST /api/portal/website-editor/pages/publish   — current editor page
//      (best-effort; ignored if no draft exists)
//   3. POST /api/portal/website-editor/promote          — bundles published
//      overrides + pages + per-site config into a GitHub PR
//
// ── Two things fixed here on 2026-08-30 (issue #28) ──────────────────────
//
// Steps 1 and the diff preload used to call `/api/portal/content/<siteId>`
// and `/api/portal/content/<siteId>/publish` — legacy top-level paths from the
// pre-plugin app that this module does not declare and `src/app` does not
// serve. Publishing therefore 404'd on its first step, and the preview silently
// caught the failure and showed "no unpublished changes", which reads exactly
// like a clean tree. Both now go through `lib/content.ts`, the module's own
// client for the registered `/content/*` handlers.
//
// And step 3's server is still the Round-1 stub, which answers
// `{ ok: true, pending: true }` and opens no pull request. "Pull request
// opened" was shown for that answer. A pending promote now says so — the
// content and page publishes really did happen and are reported as such; the
// PR is named as not raised.

interface PublishPreview {
  changedContentKeys: string[];
  changedPages: Array<{ id: string; slug: string; title: string }>;
  /** Halves of the diff that could not be read. Named, never shown as empty. */
  unreadable: string[];
}

function PublishModal({
  site, activePageId, onClose,
}: {
  site: Site;
  activePageId: string | null;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [step, setStep] = useState<string>("");
  const [result, setResult] = useState<PromoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublishPreview | null>(null);

  // Esc closes — but only when we're not mid-flight (don't strand the user
  // wondering whether the publish actually went through).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "running") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  // Preload a diff summary so the operator can see what's about to ship.
  // Publishing stays available if a read fails — but a failed read is SAID,
  // not shown as an empty diff, because "no unpublished changes" and "could not
  // find out" are different answers and only one of them is reassuring.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const changed: string[] = [];
      let changedPages: PublishPreview["changedPages"] = [];
      let contentPreviewFailed = false;
      let pagesPreviewFailed = false;
      try {
        const state = await getContentState(site.id);
        const draft = state.draft ?? {};
        const published = state.published ?? {};
        // `publishDraft` empties the draft bucket, so a key only sits in it
        // because it was edited since the last publish. `setDraftOverrides`
        // merges without pruning, though, so a key re-typed back to its
        // published value can linger — hence the value comparison rather than
        // mere presence.
        for (const k of Object.keys(draft)) {
          if (draft[k] !== published[k]) changed.push(k);
        }
      } catch {
        // Never let a failed read read as "nothing to publish" — that is the
        // silent-clean-tree the legacy 404 produced for months.
        contentPreviewFailed = true;
      }
      try {
        const pagesAll = await listEditorPages(site.id, true);
        changedPages = pagesAll
          .filter(p => JSON.stringify(p.blocks) !== JSON.stringify(p.publishedBlocks ?? []))
          .map(p => ({ id: p.id, slug: p.slug, title: p.title || p.slug }));
      } catch {
        pagesPreviewFailed = true;
      }

      if (cancelled) return;
      setPreview({
        changedContentKeys: changed.sort(),
        changedPages,
        unreadable: [
          ...(contentPreviewFailed ? ["content edits"] : []),
          ...(pagesPreviewFailed ? ["page blocks"] : []),
        ],
      });
    })();
    return () => { cancelled = true; };
  }, [site.id]);

  async function run() {
    setPhase("running");
    setError(null);

    // 1. Publish content drafts. An empty draft is not an error — the handler
    //    republishes the current state and clears the draft bucket.
    setStep("Publishing content drafts…");
    try {
      await publishContent(site.id, message || undefined);
    } catch (e) {
      setError(`Content publish failed: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
      return;
    }

    // 2. Publish active editor page if one is selected. Best effort.
    if (activePageId) {
      setStep("Publishing active page…");
      try {
        await publishEditorPage(site.id, activePageId);
      } catch { /* ignore — promote will still pick up published state */ }
    }

    // 3. Ask the promote endpoint to bundle the published state into a GitHub
    //    PR. Still the Round-1 stub, so the answer may be `pending`.
    setStep("Requesting GitHub promote…");
    try {
      const out = await promoteSiteToGitHub(site.id, { message });
      setResult(out);
      setPhase(out.ok ? "done" : "error");
      if (!out.ok) setError(out.error ?? "Unknown promote error");
    } catch (e) {
      setError(`Promote failed: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={phase === "running" ? undefined : onClose}
    >
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-[#0a0e1a] p-5 space-y-4">
        <header className="flex items-center justify-between">
          <p className="text-[10px] tracking-[0.32em] uppercase text-cyan-400">Publish</p>
          <button onClick={onClose} disabled={phase === "running"} className="text-brand-cream/55 hover:text-brand-cream text-lg leading-none disabled:opacity-30">×</button>
        </header>

        {phase === "idle" && (
          <>
            <h2 className="font-display text-xl text-brand-cream">Publish {site.name}</h2>

            {preview === null ? (
              <p className="text-[12px] text-brand-cream/45">Reading current state…</p>
            ) : preview.changedContentKeys.length === 0 && preview.changedPages.length === 0 ? (
              /* Only a diff that was actually READ can say "nothing pending".
                 With a half unreadable both lists are empty for a reason that
                 has nothing to do with the tree being clean, so the clean-tree
                 line is suppressed and the amber notice below is the answer. */
              preview.unreadable.length > 0 ? null : (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[12px] text-brand-cream/65">
                  No unpublished changes. Publishing again re-publishes the current
                  state inside Aqua and records a new snapshot in its history.
                </div>
              )
            ) : (
              <div className="rounded-lg border border-cyan-400/15 bg-cyan-500/5 p-3 space-y-2">
                <p className="text-[11px] tracking-wider uppercase text-cyan-300">Will publish</p>
                {preview.changedContentKeys.length > 0 && (
                  <details className="text-[12px] text-brand-cream/85">
                    <summary className="cursor-pointer hover:text-brand-cream">
                      {preview.changedContentKeys.length} content edit{preview.changedContentKeys.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-1 ml-3 space-y-0.5 font-mono text-[10px] text-brand-cream/65 max-h-32 overflow-y-auto">
                      {preview.changedContentKeys.slice(0, 50).map(k => <li key={k}>· {k}</li>)}
                      {preview.changedContentKeys.length > 50 && <li>… +{preview.changedContentKeys.length - 50} more</li>}
                    </ul>
                  </details>
                )}
                {preview.changedPages.length > 0 && (
                  <details className="text-[12px] text-brand-cream/85">
                    <summary className="cursor-pointer hover:text-brand-cream">
                      {preview.changedPages.length} page{preview.changedPages.length === 1 ? "" : "s"} with new blocks
                    </summary>
                    <ul className="mt-1 ml-3 space-y-0.5 text-[11px] text-brand-cream/65">
                      {preview.changedPages.map(p => (
                        <li key={p.id}>· <span className="text-brand-cream/85">{p.title}</span> <span className="font-mono text-brand-cream/45">{p.slug}</span></li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {preview !== null && preview.unreadable.length > 0 && (
              /* A read that failed is a blind spot, not a clean tree. */
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Could not read {preview.unreadable.join(" or ")}, so this preview is incomplete —
                there may be pending changes it does not show, and its silence is not a clean
                tree. Publishing still works; it publishes whatever is actually pending on the
                server.
              </p>
            )}

            <p className="text-[11px] text-brand-cream/55 leading-relaxed">
              Publishes your drafts inside Aqua. Bundling{" "}
              <code className="font-mono text-brand-cream/85">portal.overrides.json</code>,{" "}
              <code className="font-mono text-brand-cream/85">portal.pages.json</code> and{" "}
              <code className="font-mono text-brand-cream/85">portal.site.json</code> into a
              GitHub pull request is not built yet, so nothing will reach your repository.
            </p>
            <label className="block">
              <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Commit note (optional)</span>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={2}
                placeholder="e.g. Updated hero copy + new product photo"
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
              />
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onClose} className="text-[11px] text-brand-cream/55 hover:text-brand-cream px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={() => void run()}
                disabled={preview === null}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20 disabled:opacity-40"
              >
                Publish →
              </button>
            </div>
            <p className="text-[10px] text-brand-cream/35 leading-relaxed">
              GitHub credentials live in <Link href="/admin/portal-settings" className="text-cyan-300 hover:text-cyan-200">Portal settings</Link>{" "}
              and will be used once the promote step is built. Setting them now does not make
              this button reach GitHub.
            </p>
          </>
        )}

        {phase === "running" && (
          <div className="text-center py-6 space-y-3">
            <div className="w-8 h-8 mx-auto border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-[12px] text-brand-cream/85">{step}</p>
          </div>
        )}

        {phase === "done" && result?.ok && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] ${
                result.prUrl
                  ? "bg-emerald-500/15 border border-emerald-400/30 text-emerald-300"
                  : "bg-amber-500/15 border border-amber-400/30 text-amber-200"
              }`}>{result.prUrl ? "✓" : "!"}</span>
              <h2 className="font-display text-lg text-brand-cream">
                {result.prUrl ? "Pull request opened" : "Published here — no pull request raised"}
              </h2>
            </div>
            {result.prUrl ? (
              <p className="text-[12px] text-brand-cream/65">
                Review and merge to ship. Your host (Vercel et al.) will pick up the new content on the next build.
              </p>
            ) : (
              /* The promote handler is still the Round-1 stub: it accepts the
                 request and opens nothing. Saying "Pull request opened" for
                 that answer is a claim of delivery that did not happen — the
                 operator would go looking for a PR that does not exist. */
              <p className="text-[12px] text-amber-200/90 leading-relaxed">
                Your content and page changes were published inside Aqua and are live on the
                portal. Shipping them to GitHub is not built yet — the promote endpoint accepts
                the request and opens no pull request, so nothing has reached your repository
                and there is nothing to merge.
                {result.note ? <span className="block mt-1 text-brand-cream/45 text-[11px]">{result.note}</span> : null}
              </p>
            )}
            {result.prUrl && (
              <a
                href={result.prUrl}
                target="_blank"
                rel="noreferrer"
                className="block px-3 py-2 rounded-md text-[12px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20 text-center font-medium"
              >
                View PR #{result.prNumber} on GitHub →
              </a>
            )}
            {result.files && result.files.length > 0 && (
              <details className="text-[11px] text-brand-cream/55">
                <summary className="cursor-pointer hover:text-brand-cream/85">{result.files.length} file{result.files.length === 1 ? "" : "s"} included</summary>
                <ul className="mt-2 space-y-0.5 font-mono text-brand-cream/65">
                  {result.files.map(f => <li key={f.path}>{f.path}</li>)}
                </ul>
              </details>
            )}
            <div className="flex justify-end pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-md text-[11px] text-brand-cream/65 hover:text-brand-cream">
                Close
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-red-500/15 border border-red-400/30 text-red-300 flex items-center justify-center text-[12px]">!</span>
              <h2 className="font-display text-lg text-brand-cream">Publish failed</h2>
            </div>
            <p className="text-[12px] text-red-300 break-words">{error}</p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onClose} className="text-[11px] text-brand-cream/55 hover:text-brand-cream px-3 py-1.5">
                Close
              </button>
              <button
                onClick={() => { setPhase("idle"); setError(null); }}
                className="px-3 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-brand-cream/85"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New page modal ─────────────────────────────────────────────────────────

function NewPageModal({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { slug: string; title: string; blocks?: Block[]; isHomepage?: boolean }) => Promise<boolean>;
}) {
  const [templateId, setTemplateId] = useState("blank");
  const [title, setTitle] = useState("");
  const [slug, setSlug]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive slug from title until the operator edits it directly.
  const slugTouched = useRef(false);
  function handleTitle(v: string) {
    setTitle(v);
    if (!slugTouched.current) {
      const auto = "/" + v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setSlug(auto === "/" ? "" : auto);
    }
  }

  function chooseTemplate(id: string) {
    const template = PAGE_TEMPLATES.find(item => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setTitle(template.defaultTitle);
    setSlug(template.defaultSlug);
    slugTouched.current = false;
  }

  async function submit() {
    setError(null);
    const t = title.trim();
    let s = slug.trim();
    if (!t) { setError("Title is required."); return; }
    if (!s) { setError("Slug is required."); return; }
    if (!s.startsWith("/")) s = "/" + s;
    setBusy(true);
    const template = PAGE_TEMPLATES.find(item => item.id === templateId);
    const ok = await onCreate({
      slug: s,
      title: t,
      blocks: template?.build() ?? [],
      isHomepage: s === "/",
    });
    setBusy(false);
    if (!ok) { setError("Failed to create page. Slug may already exist."); return; }
    onClose();
  }

  return (
    <ModalShell title="New page" onClose={busy ? () => {} : onClose} wide>
      <div>
        <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Start with</span>
        <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {PAGE_TEMPLATES.map(template => (
            <button
              key={template.id}
              type="button"
              onClick={() => chooseTemplate(template.id)}
              aria-pressed={templateId === template.id}
              className={`min-h-20 rounded-md border p-2 text-left transition ${
                templateId === template.id
                  ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.02] text-brand-cream/70 hover:border-white/25"
              }`}
            >
              <span className="block text-sm" aria-hidden="true">{template.icon}</span>
              <strong className="mt-1 block text-[11px]">{template.label}</strong>
              <span className="mt-0.5 block text-[10px] leading-4 opacity-55">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Title</span>
        <input
          value={title}
          onChange={e => handleTitle(e.target.value)}
          placeholder="About us"
          autoFocus
          className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
        />
      </label>
      <label className="block">
        <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Slug</span>
        <input
          value={slug}
          onChange={e => { slugTouched.current = true; setSlug(e.target.value); }}
          placeholder="/about"
          className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
        />
      </label>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      <ModalActions
        onCancel={onClose}
        onSubmit={() => void submit()}
        submitLabel={busy ? "Creating…" : "Create"}
        disabled={busy}
      />
    </ModalShell>
  );
}

// ── New funnel modal ───────────────────────────────────────────────────────

function NewFunnelModal({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const funnelGap = featureBackendGap("funnels");

  async function submit() {
    setError(null);
    const n = name.trim();
    if (!n) { setError("Name is required."); return; }
    setBusy(true);
    const ok = await onCreate({ name: n });
    setBusy(false);
    // Name the real cause when there is one, rather than "Failed to create
    // funnel." — which reads as something worth retrying, and is not.
    if (!ok) { setError(funnelGap ? funnelGap.reason : "Failed to create funnel."); return; }
    onClose();
  }

  return (
    <ModalShell title="New funnel" onClose={busy ? () => {} : onClose}>
      {/* Said BEFORE the name field, not after a failed submit. The create
          endpoint does not exist (see featureBackends.ts), so letting somebody
          type a name and then telling them "Failed to create funnel" presents a
          permanent gap as a transient error. */}
      {funnelGap ? (
        <p className="text-[12px] leading-5 text-amber-200/90">{funnelGap.reason}</p>
      ) : (
        <p className="text-[12px] text-brand-cream/65">
          Funnels track how visitors walk a sequence of pages — landing → product → checkout.
          Add steps after creating.
        </p>
      )}
      <label className="block">
        <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Spring sale funnel"
          autoFocus
          className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
        />
      </label>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      <ModalActions
        onCancel={onClose}
        onSubmit={() => void submit()}
        submitLabel={busy ? "Creating…" : "Create"}
        disabled={busy || Boolean(funnelGap)}
      />
    </ModalShell>
  );
}

// ── Page settings modal ────────────────────────────────────────────────────

function PageSettingsModal({
  siteId, page, isPro, onClose, onSaved,
}: {
  siteId: string;
  page: PageEntry;
  isPro: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug]   = useState(page.slug);
  const [description, setDescription] = useState("");
  const [customHead, setCustomHead] = useState("");
  const [customFoot, setCustomFoot] = useState("");
  const [customCss,  setCustomCss]  = useState("");
  const [themeId,    setThemeId]    = useState<string>("");
  const [hideNav,    setHideNav]    = useState(false);
  const [hideFooter, setHideFooter] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEditorPage(siteId, page.id).then(doc => {
      if (cancelled || !doc) return;
      setDescription(doc.description ?? "");
      setCustomHead(doc.customHead ?? "");
      setCustomFoot(doc.customFoot ?? "");
      setCustomCss(doc.customCss ?? "");
      setThemeId(doc.themeId ?? "");
      setHideNav(!!doc.layoutOverrides?.hideNav);
      setHideFooter(!!doc.layoutOverrides?.hideFooter);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [siteId, page.id]);

  async function submit() {
    setError(null);
    const t = title.trim();
    let s = slug.trim();
    if (!t || !s) { setError("Title and slug are required."); return; }
    if (!s.startsWith("/")) s = "/" + s;
    setBusy(true);
    const out = await updateEditorPage(siteId, page.id, {
      title: t,
      slug: s,
      description: description.trim() || undefined,
      customHead: customHead || undefined,
      customFoot: customFoot || undefined,
      // Pro-only fields go through unconditionally so toggling complexity
      // doesn't silently drop saved values — the surface is hidden but
      // the state stays intact.
      customCss: customCss || undefined,
      themeId: themeId || undefined,
      layoutOverrides: (hideNav || hideFooter)
        ? { hideNav: hideNav || undefined, hideFooter: hideFooter || undefined }
        : undefined,
    });
    setBusy(false);
    if (!out) { setError("Save failed."); return; }
    onSaved();
    onClose();
  }

  return (
    <ModalShell title="Page settings" onClose={busy ? () => {} : onClose} wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Title</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-brand-cream focus:outline-none focus:border-cyan-400/40"
          />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Slug</span>
          <input
            value={slug}
            onChange={e => setSlug(e.target.value)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] font-mono text-brand-cream focus:outline-none focus:border-cyan-400/40"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">SEO description</span>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          placeholder="Short summary for search engines."
          className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
        />
      </label>
      <details>
        <summary className="text-[11px] text-brand-cream/55 cursor-pointer hover:text-brand-cream">Custom head / foot scripts</summary>
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Custom head</span>
            <textarea
              value={customHead}
              onChange={e => setCustomHead(e.target.value)}
              rows={3}
              placeholder="<script>…</script> or <link …>"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[11px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
            />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Custom foot</span>
            <textarea
              value={customFoot}
              onChange={e => setCustomFoot(e.target.value)}
              rows={3}
              placeholder="<script>…</script>"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[11px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
            />
          </label>
        </div>
      </details>

      {isPro && (
        <details className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 px-3 py-2">
          <summary className="text-[11px] text-cyan-200 cursor-pointer hover:text-cyan-100 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-100">Pro</span>
            Theme · layout · custom CSS
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Theme override</span>
                <select
                  value={themeId}
                  onChange={e => setThemeId(e.target.value)}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream focus:outline-none focus:border-cyan-400/40"
                >
                  <option value="">Inherit site theme</option>
                  <option value="default">Default</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <div className="block">
                <span className="text-[10px] tracking-wider uppercase text-brand-cream/45 block">Layout</span>
                <div className="mt-1 space-y-1">
                  <label className="flex items-center gap-2 text-[12px] text-brand-cream cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideNav}
                      onChange={e => setHideNav(e.target.checked)}
                      className="accent-cyan-400"
                    />
                    Hide site nav on this page
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-brand-cream cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideFooter}
                      onChange={e => setHideFooter(e.target.checked)}
                      className="accent-cyan-400"
                    />
                    Hide site footer
                  </label>
                </div>
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Page CSS</span>
              <textarea
                value={customCss}
                onChange={e => setCustomCss(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={"h1 { letter-spacing: -0.02em; }\n.cta { background: var(--brand-amber); }"}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-[11px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
              />
              <span className="block text-[10px] text-brand-cream/40 mt-1">
                Scoped to this page&rsquo;s subtree — rules don&rsquo;t leak globally. Theme tokens (e.g. <code>var(--brand-amber)</code>) are available.
              </span>
            </label>
          </div>
        </details>
      )}
      {!loaded && <p className="text-[11px] text-brand-cream/45">Loading…</p>}
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      <ModalActions
        onCancel={onClose}
        onSubmit={() => void submit()}
        submitLabel={busy ? "Saving…" : "Save"}
        disabled={busy || !loaded}
      />
    </ModalShell>
  );
}

// ── Modal shell + actions ──────────────────────────────────────────────────

function ModalShell({
  title, onClose, children, wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  // Esc closes the modal — same expectation as every native dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-2xl border border-cyan-400/20 bg-[#0a0e1a] p-5 space-y-4`}
      >
        <header className="flex items-center justify-between">
          <p className="text-[10px] tracking-[0.32em] uppercase text-cyan-400">{title}</p>
          <button onClick={onClose} className="text-brand-cream/55 hover:text-brand-cream text-lg leading-none">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onCancel, onSubmit, submitLabel, disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button onClick={onCancel} className="text-[11px] text-brand-cream/55 hover:text-brand-cream px-3 py-1.5">
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  );
}

// ── Site settings modal ────────────────────────────────────────────────────

function SiteSettingsModal({
  site, onClose, onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (next: Site) => void;
}) {
  const [name, setName]               = useState(site.name);
  const [tagline, setTagline]         = useState(site.tagline ?? "");
  const [description, setDescription] = useState(site.description ?? "");
  const [primaryDomain, setPrimaryDomain] = useState(site.primaryDomain ?? "");
  const [domainsText, setDomainsText] = useState((site.domains ?? []).join("\n"));
  const [customHead, setCustomHead]   = useState(site.customHead ?? "");
  const [customBody, setCustomBody]   = useState(site.customBody ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const n = name.trim();
    if (!n) { setError("Site name is required."); return; }
    const domains = domainsText
      .split(/\n|,/)
      .map(d => d.trim())
      .filter(Boolean);
    updateSite(site.id, {
      name: n,
      tagline: tagline.trim() || undefined,
      description: description.trim() || undefined,
      primaryDomain: primaryDomain.trim() || undefined,
      domains,
      customHead: customHead || undefined,
      customBody: customBody || undefined,
    });
    const updated = getSite(site.id);
    if (!updated) { setError("Save failed."); return; }
    onSaved(updated);
    onClose();
  }

  return (
    <ModalShell title="Site settings" onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Name</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-brand-cream focus:outline-none focus:border-cyan-400/40"
          />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Tagline</span>
          <input
            value={tagline}
            onChange={e => setTagline(e.target.value)}
            placeholder="Natural soap from Ghana"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Description</span>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          placeholder="Default meta description for SEO."
          className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
        />
      </label>
      <div className="grid grid-cols-1 gap-3">
        <label className="block">
          <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Primary domain</span>
          <input
            value={primaryDomain}
            onChange={e => setPrimaryDomain(e.target.value)}
            placeholder="luvandker.com"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
          />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">All domains (one per line)</span>
          <textarea
            value={domainsText}
            onChange={e => setDomainsText(e.target.value)}
            rows={3}
            placeholder={"luvandker.com\nwww.luvandker.com"}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[11px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
          />
        </label>
      </div>
      <details>
        <summary className="text-[11px] text-brand-cream/55 cursor-pointer hover:text-brand-cream">Site-wide custom head / body scripts</summary>
        <p className="mt-2 text-[10px] text-brand-cream/45 leading-relaxed">
          Injected into every page on this site — useful for analytics, hotjar, custom CSS,
          Meta Pixel, etc.
        </p>
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Custom head</span>
            <textarea
              value={customHead}
              onChange={e => setCustomHead(e.target.value)}
              rows={3}
              placeholder="<script>…</script> or <link rel=…>"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[11px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
            />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-wider uppercase text-brand-cream/45">Custom body</span>
            <textarea
              value={customBody}
              onChange={e => setCustomBody(e.target.value)}
              rows={3}
              placeholder="<script>…</script>"
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[11px] font-mono text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
            />
          </label>
        </div>
      </details>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
      <ModalActions onCancel={onClose} onSubmit={submit} submitLabel="Save" />
    </ModalShell>
  );
}
