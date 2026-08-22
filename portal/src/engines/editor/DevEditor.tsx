"use client";

// ─── The Dev Editor — ONE universal editor ───────────────────────────────────
//
// This is the whole editor: a live canvas over whatever it is pointed at, the
// depth selector, and the Assistant/Settings/Builder/Content/Pages/Brand/Code/
// Repo/Versions inspectors. It adapts to its target — a client portal, a
// website, a plain repository, a game — and no surface owns it.
//
// WHY IT LIVES HERE: it used to sit at
// `src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`, inside the
// client-portal route that happened to mount it first. Being addressed as a
// portal file kept dragging portal assumptions back in, so portal-only copy and
// behaviour repeatedly leaked out at people editing a repository. Lifting it
// into the editor engine makes it universal by construction: the portals route
// is now just one of its doors, not its home.
//
// The lift was structural only — same component, same props, same behaviour.
// Only the location and the exported name changed
// (`ClientPortalStudio` -> `DevEditor`).

import Link from "next/link";
import { PORTAL_PHASE_LABELS } from "@/lib/portal/portalProducts";
import { BookOpenText, ArrowDown, ArrowLeft, ArrowUp, Check, Code2, Copy, ExternalLink, FileText, FolderGit2, Gauge, GitBranch, GripVertical, History, Layers3, LayoutTemplate, LoaderCircle, Columns2, Globe, Monitor, MousePointerClick, Palette, PanelRightClose, PanelRightOpen, PanelsTopLeft, Plus, RefreshCw, RotateCcw, Save, ScrollText, Search, Settings, Smartphone, Sparkles, StickyNote, Trash2, Upload, X } from "lucide-react";
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
import { inspectorTabsFor, tabForMode, type EditingMode, type InspectorTab } from "@/engines/editor/editing/modes";
// The palette. ONE registry, filtered by surface — see `elements/palette.ts`
// for why "which vocabulary?" is a different question from "is there a portal
// document?", and `elements/websiteElements.ts` for how the 70 website
// definitions get into this bundle without being in its first paint.
import {
  elementLibrarySentence,
  elementPalette,
  elementPaletteGroups,
  elementSurfaceFor,
  type ElementPaletteItem,
} from "@/engines/editor/elements/palette";
import { ensureWebsiteElements } from "@/engines/editor/elements/websiteElements";
import { getElementDefinition } from "@/engines/editor/elements/registry";
import type { ElementSurface } from "@/engines/editor/elements/definition";
import {
  AQUA_TAG_MESSAGES,
  AQUA_TAG_STYLE_PROPERTIES,
  acceptAquaTagMessage,
  aquaTagBrowserUrl,
  aquaTagDisable,
  aquaTagEnable,
  aquaTagOrigin,
  aquaTagPatchMessage,
  aquaTagPing,
  aquaTagReset,
  aquaTagThrottle,
  type AquaTagElement,
  type AquaTagStyleProperty,
  type AquaTagThrottleProfile,
} from "@/engines/editor/editing/aquaTagBridge";
// The safe id this codebase already has. `crypto.randomUUID` is a
// secure-context-only API, so it is simply undefined on a LAN-served http dev
// build — see `pingTag`.
import { makeId } from "@/engines/editor/elements/ids";
import { routeTagSelection, type SelectionRoute } from "@/engines/editor/editing/selectionRouting";
import { RepositoryPanel } from "@/components/editing/RepositoryPanel";
import { AquaEditorAI } from "@/components/editing/AquaEditorAI";
import { LibrarianPanel } from "@/components/editing/LibrarianPanel";
import { NetworkThrottleControl } from "@/components/editing/NetworkThrottleControl";
import { DraftsPanel, HistoryPanel, NotesPanel } from "@/components/editing/WorkLifecyclePanel";
import { EditorCodeCanvas } from "@/components/editing/EditorCodeCanvas";
import { DEV_PROJECTS_CHANGED_EVENT, DevEditorProjectSettings } from "@/app/portal/dev-team/editor/setup/_DevEditorSetup";
import { AddMenu, fileAddOptions, type AddOption } from "@/components/editing/AddMenu";
import { ElementInsertPanel } from "@/components/editing/ElementInsertPanel";
import { EditorModeSwitch, modeSkin } from "@/components/editing/EditorModeSwitch";
// The REAL device system — 26 presets with width AND height, rotation, zoom,
// custom W×H, per-project persistence — reaching the editor through its one
// door. The maths (`effectiveViewport`) lives in the website-editor module's
// `devicePresets.ts` and is re-exported, never forked.
import {
  DEFAULT_DEVICE_STATE,
  DEVICE_PRESETS,
  DeviceControl,
  clampDeviceSize,
  deviceLabel,
  effectiveViewport,
  getDevicePreset,
  loadDeviceState,
  saveDeviceState,
  type DeviceState,
} from "@/components/editing/DeviceControl";
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

/** A Dev Editor Engine project, as the picker needs it. */
interface StudioDevProject {
  id: string;
  name: string;
  kind: "software" | "website" | "portal";
  repository: string;
  ref: string;
  /**
   * Set once an Aqua Tag is mapped to this project. THE gate for the browser —
   * `kind` decides nothing (see `devProjectVisualEditorUnlocked`).
   */
  aquaTagId?: string;
  /** The address the tag is installed on, as somebody typed it. */
  siteUrl?: string;
  /**
   * The last MAP run, as the projects endpoint returns it.
   *
   * Only `tag.finalUrl` is read here, and it is the field that matters: it is
   * the page MAP actually reached after following redirects, so it — not
   * `siteUrl` — is where the browser must point and which origin the editor
   * must trust. See `aquaTagBrowserUrl`.
   */
  map?: { tag?: { finalUrl?: string } | null } | null;
}

/** `devProjectMapStatus` as the projects endpoint returns it. */
interface StudioProjectStatus {
  browserAvailable: boolean;
  tagVerified: boolean;
  neverMapped: boolean;
  missing: string[];
}

/** Whether the tagged page has answered, so the editor can say which. */
type TagBridgeState = "idle" | "checking" | "connected" | "unavailable";

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
 * What each tab is CALLED and what it looks like.
 *
 * Which tabs are offered is a rule, and it lives in `editing/modes.ts`
 * (`inspectorTabsFor`) with the order — because it depends on the depth AND on
 * what is connected, and because a rule buried in a 2,000-line component cannot
 * be tested. This is only the label/icon registry it renders through.
 *
 * The tabs answer "what am I changing?"; the mode answers "how deep am I
 * going?". Collapsing the two is why an editor feels intimidating to one
 * person and restrictive to the next.
 */
const TAB_META: Record<InspectorTab, { label: string; icon: typeof FileText }> = {
  // Aqua Editor AI — the shallowest depth: describe it instead of building it.
  assistant: { label: "Assistant", icon: Sparkles },
  // Configuring what the editor points AT belongs inside the editor — going
  // out to another screen to change a branch loses your place.
  settings: { label: "Settings", icon: Settings },
  builder: { label: "Builder", icon: LayoutTemplate },
  // Where a click on the tagged page lands. Ed: "i get the exact text i can
  // change it on the right menu for just the words". This is that menu.
  element: { label: "Element", icon: MousePointerClick },
  content: { label: "Content", icon: FileText },
  pages: { label: "Pages", icon: Layers3 },
  brand: { label: "Brand", icon: Palette },
  code: { label: "Code", icon: Code2 },
  // The site's own source, as opposed to the sandboxed portal component above.
  librarian: { label: "Librarian", icon: BookOpenText },
  repository: { label: "Repo", icon: FolderGit2 },
  // The work lifecycle (phase 14). The draft IS the edit branch; History is
  // that branch's commits + the Dev Team's check-ins; Notes are per project.
  drafts: { label: "Drafts", icon: GitBranch },
  history: { label: "History", icon: ScrollText },
  notes: { label: "Notes", icon: StickyNote },
  versions: { label: "Versions", icon: History },
};

export function DevEditor({
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
  projectKind,
  projectTagged = false,
  projectBrowserUrl = "",
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
  /**
   * What the project IS. A "software" project has no client portal, so every
   * portal-shaped part of this screen — the client selector, the lifecycle,
   * the portal pages, the draft/publish pair and the Builder/Content/Pages/
   * Brand inspectors — is not just irrelevant, it is misleading. It also must
   * not FETCH a portal design: loading somebody's portal draft because you
   * opened a repository is the bug this prop exists to kill.
   *
   * It does NOT decide whether there is a browser. That question is the Aqua
   * Tag's — see `projectTagged` — and conflating the two is the bug that made
   * the browser unreachable on every project Ed creates.
   */
  projectKind?: "software" | "website" | "portal";
  /**
   * `devProjectMapStatus(project).browserAvailable` for the project this editor
   * was opened FOR — i.e. an Aqua Tag is mapped.
   *
   * Passed from the server rather than waited for, because the projects list
   * loads asynchronously and a browser that appears two seconds after the
   * screen does reads as a bug. The list refreshes it when the operator
   * switches project in the picker.
   */
  projectTagged?: boolean;
  /**
   * Where the browser opens, so it lands on the page instead of a blank box.
   *
   * `aquaTagBrowserUrl(project)` — the MAPPED `finalUrl` when MAP recorded one,
   * falling back to the typed `siteUrl`. NOT the raw `siteUrl`: a project whose
   * address redirects (bare domain → www, the common case) lands the frame on
   * one origin while the editor trusted another, and every message from the tag
   * was then rejected as untrusted.
   */
  projectBrowserUrl?: string;
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
  // The MODE decides the base layout; two toggles decide what rides along.
  // (This replaces a Live/Code/Both/Compare view picker that duplicated the
  // mode choice and hid the browser behind a mode named "Both".)
  //   • showBrowser — bring the live page in, at any mode
  //   • splitBrowsers — a second browser beside the first, for comparing
  // Open by default wherever a browser is actually possible: an Aqua-hosted
  // portal, or a project with a tag mapped.
  const [showBrowser, setShowBrowser] = useState(projectKind !== "software" || projectTagged);
  const [splitBrowsers, setSplitBrowsers] = useState(false);
  // Where the browser points when there is no client portal behind it. Seeded
  // from the page the tag actually ANSWERS on (the mapped `finalUrl`), because
  // that is both the page you want to look at and the one origin this editor
  // will trust — see `aquaTagBrowserUrl`.
  const [browserUrl, setBrowserUrl] = useState(projectBrowserUrl);
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
  // A repository's tools (code, repo) live at the developer depth, so opening
  // one in "Design it" left a rail with nothing but the assistant in it.
  const [editingModeId, setEditingModeId] = useState<EditingMode>(projectKind === "software" ? "developer" : "visual");
  const [repository, setRepository] = useState("");
  // The Dev Editor Engine project being worked on. Selecting one points the
  // Code/Repo inspectors at THAT repository, read through that project's own
  // connection — "plug in any repo" without the browser holding a token.
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projects, setProjects] = useState<StudioDevProject[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<Record<string, StudioProjectStatus>>({});
  const selectedProject = projects.find(item => item.id === projectId) ?? null;

  // ── Real device sizing (dev-editor-finish phase 10) ─────────────────────────
  //
  // The browser renders at EXACTLY the chosen device's CSS pixels — see
  // `PreviewFrame`, which also grows the Responsive drag handles. The choice
  // persists PER PROJECT: localStorage under `lk_editor_device_v1:<projectId>`
  // (`:portal` on the portals door, which opens with no project), so a phone-
  // first site and a desktop game each remember their own device.
  //
  // Loaded in an effect rather than the initializer so the server render and
  // the first client render agree (this component hydrates), and saved only
  // once THIS scope's state has actually loaded: `deviceScopeReady` is the
  // guard that stops the default — or the previous project's device — being
  // written over a stored one. Without it, Strict Mode's double effect pass
  // saves the default before the load's setState commits, and the stored
  // device is gone (the React-19 one-shot-effect trap, again).
  const [deviceState, setDeviceState] = useState<DeviceState>(DEFAULT_DEVICE_STATE);
  const [deviceScopeReady, setDeviceScopeReady] = useState<string | null>(null);
  const deviceScope = projectId || "portal";
  useEffect(() => {
    setDeviceState(loadDeviceState(deviceScope));
    setDeviceScopeReady(deviceScope);
  }, [deviceScope]);
  useEffect(() => {
    if (deviceScopeReady === deviceScope) saveDeviceState(deviceState, deviceScope);
  }, [deviceState, deviceScopeReady, deviceScope]);
  /** The drag handles' write-back: the dragged size IS the custom dimensions. */
  function resizeDevice(width: number, height: number) {
    const size = clampDeviceSize(width, height);
    setDeviceState(current => ({ ...current, customWidth: size.width, customHeight: size.height }));
  }

  // ── THREE different questions. Keep them apart. ─────────────────────────────
  //
  // (The third, `elementSurface`, is declared just below `browserAvailable` —
  // it needs nothing from this block, and it was the missing one.)
  //
  //   portalTarget      — is there an Aqua-hosted PORTAL DOCUMENT behind this?
  //                       Owns: portal pages, the lifecycle stage, the
  //                       draft/publish pair, the portal CONTENT editor, and
  //                       the client and template selectors. All genuinely
  //                       portal-only. It does NOT own the Builder tab — that
  //                       is the vocabulary question, and every target has a
  //                       vocabulary.
  //
  //   browserAvailable  — can a live page be shown and CLICKED?
  //                       Owned by the Aqua Tag, and by nothing else. Ed:
  //                       "the aqua tag must be connected for browser to work.
  //                        or anything to work really other than the dev since
  //                        it can just use repo files directly".
  //
  // These were the same flag (`portalTarget = projectKind !== "software"`), and
  // because every project Ed creates defaults to kind "software", that gated
  // the browser off everything he builds. They are not the same question and
  // must not be collapsed back together: a tagged game build has a browser and
  // no portal; an Aqua portal has a portal and needs no tag.
  const portalTarget = projectKind !== "software";
  // The tag, read from the project. The server-computed status wins when the
  // list has arrived; the prop covers the moment before it does.
  const projectTagStatus = projectId ? projectStatuses[projectId] : undefined;
  const tagMapped = selectedProject
    ? Boolean(projectTagStatus?.browserAvailable ?? selectedProject.aquaTagId)
    : (projectId === initialProjectId ? projectTagged : false);
  // The Aqua-hosted portal preview is the one page the editor renders itself,
  // and it reports selections through the portal-block protocol below — the
  // tag's job, done by our own renderer. That is why it needs no tag, and it is
  // the ONLY exemption.
  const browserAvailable = portalTarget || tagMapped;

  // ── A THIRD question, and the one this editor used to get wrong ────────────
  //
  //   elementSurface — WHICH VOCABULARY does this target speak?
  //
  // Every target has one. A portal speaks the portal's 16 block names; a site,
  // a repository or a game build speaks the website's 70 elements. It was
  // never asked: the editor imported `CLIENT_PORTAL_BLOCK_REGISTRY` and only
  // that, so on anything but a portal the palette was empty and the Builder
  // tab was hidden as well. Ed: "the visual editor components are lost … i
  // cant select and build anything what the hell is going on."
  //
  // Do not fold this back into `portalTarget`. That flag answers "is there a
  // portal DOCUMENT behind this?", which is false for every project Ed
  // creates, and using it to pick a vocabulary is what emptied the palette.
  const elementSurface = elementSurfaceFor({ portalTarget });
  // The website definitions register by import side effect, so they exist in
  // this bundle only once the chunk has loaded. Re-render when it lands.
  //
  // Starts `false` unconditionally rather than seeded from
  // `websiteElementsReady()`, and that is a hydration rule, not a style: the
  // registry is a module-level Map shared by the whole server process, so a
  // visitor who opened SOP Library first (it imports `blockRegistry`
  // statically) would have it populated server-side while the browser's first
  // render still has nothing — two different trees for the same markup. The
  // effect below settles it, and resolves immediately when the chunk is
  // already there.
  const [vocabularyReady, setVocabularyReady] = useState(false);
  useEffect(() => {
    if (elementSurface === "portal") return;
    let cancelled = false;
    void ensureWebsiteElements().then(() => { if (!cancelled) setVocabularyReady(true); });
    return () => { cancelled = true; };
  }, [elementSurface]);
  /** The palette for THIS target, grouped, in that surface's own order. */
  const paletteGroups = useMemo(
    () => elementPaletteGroups(elementSurface),
    // `vocabularyReady` is the dependency that matters on the website surface:
    // the registry is a module-level Map, so nothing else tells React that the
    // answer changed.
    [elementSurface, vocabularyReady],
  );
  /**
   * The same palette, FLAT and in the surface's own order.
   *
   * Not `paletteGroups.flatMap(...)`: grouping reorders, and the portal's
   * order is load-bearing (see `PORTAL_ELEMENT_PAIRINGS` — "ORDER IS
   * LOAD-BEARING"). `AddMenu` does its own first-seen grouping, so handing it
   * the flat list reproduces exactly what it rendered before this change.
   */
  const paletteItems = useMemo(
    () => elementPalette(elementSurface),
    [elementSurface, vocabularyReady],
  );
  /** Which element of the palette is being looked at. Not a page selection. */
  const [selectedElementType, setSelectedElementType] = useState("");
  // Dev shows code; the other two are page-first. The browser can always be
  // brought in or put away on top of that — where there is one to bring in.
  const codePane = editingModeId === "developer";
  const browserPane = showBrowser && browserAvailable;

  // The Settings tab (`DevEditorProjectSettings`) mutates projects from INSIDE this
  // editor and announces every successful mutation on `window`
  // (`DEV_PROJECTS_CHANGED_EVENT`). Without that listener this list was read
  // exactly once on mount — so a tag connected and verified in Settings left
  // `tagMapped` false and the browser off until a full page reload.
  //
  // Refs rather than deps: the listener must survive the whole life of the
  // editor without re-subscribing on every render, and the handler needs the
  // CURRENT open project and the statuses of the PREVIOUS fetch to tell
  // "just became verified" from "was verified all along".
  const projectIdRef = useRef(projectId);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);
  const projectStatusesRef = useRef<Record<string, StudioProjectStatus>>({});
  useEffect(() => {
    let cancelled = false;
    const load = (fromChange: boolean) => {
      fetch("/api/portal/dev/projects", { cache: "no-store" })
        .then(response => response.json())
        .then(payload => {
          if (cancelled || !payload?.ok) return;
          const nextProjects: StudioDevProject[] = payload.projects ?? [];
          const nextStatuses: Record<string, StudioProjectStatus> = payload.statuses ?? {};
          // The OPEN project's tag just became verified: point the browser at
          // the page the tag actually ANSWERS on — `aquaTagBrowserUrl`, the
          // MAPPED finalUrl with the typed address only as fallback — the same
          // rule the project picker applies. Only on a change announcement:
          // the mount fetch merely records what already was.
          const openId = projectIdRef.current;
          if (fromChange && openId) {
            const wasVerified = projectStatusesRef.current[openId]?.tagVerified ?? false;
            const isVerified = nextStatuses[openId]?.tagVerified ?? false;
            const openProject = nextProjects.find(item => item.id === openId);
            if (!wasVerified && isVerified && openProject) setBrowserUrl(aquaTagBrowserUrl(openProject));
          }
          projectStatusesRef.current = nextStatuses;
          setProjects(nextProjects);
          setProjectStatuses(nextStatuses);
        })
        // Dev Mode only — a 403 here just means no project picker, never an error.
        .catch(() => {});
    };
    load(false);
    const onProjectsChanged = () => load(true);
    window.addEventListener(DEV_PROJECTS_CHANGED_EVENT, onProjectsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(DEV_PROJECTS_CHANGED_EVENT, onProjectsChanged);
    };
  }, []);
  const [sourceFocus, setSourceFocus] = useState<{ path: string; line?: number } | null>(null);
  /**
   * "Resume" (phase 14) and the Librarian's Open: put a file in front of the
   * operator. Focusing the path is what opens it in the code canvas, and the
   * canvas is on screen in Dev mode unless the second browser replaced it —
   * so that toggle drops. The lifecycle tabs are Dev-only, so there is no
   * mode to switch.
   */
  function openFileInCanvas(path: string) {
    setSourceFocus({ path });
    setSplitBrowsers(false);
  }
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

  // ── The Aqua Tag bridge ─────────────────────────────────────────────────────
  //
  // The tag has already mapped the page, so a click resolves to an exact
  // element and it posts that element up. All the editor has to do is listen
  // correctly, and for a long time it did not: it listened only for
  // `aqua:portal-block-select` with a block id, and dropped everything whose
  // origin was not its own — which is every tagged site there will ever be.
  //
  // The protocol itself lives in `editing/aquaTagBridge.ts` (parsers, builders
  // and the origin policy). Nothing here retypes a message name.
  /** What the tag reported was clicked. Null = nothing selected. */
  const [tagElement, setTagElement] = useState<AquaTagElement | null>(null);
  const [tagBridge, setTagBridge] = useState<TagBridgeState>("idle");
  /** Whether the tag is highlighting and reporting clicks. On by default. */
  const [tagSelecting, setTagSelecting] = useState(true);
  /** Throttling actually IN FORCE — only ever set from the tag's own ack. */
  const [throttleActive, setThrottleActive] = useState<AquaTagThrottleProfile | null>(null);
  /** The operator's INTENT — a ref: nothing re-renders on it, it only feeds
   *  re-apply on reconnect (sticky across navigations, the DevTools model). */
  const throttleWanted = useRef<AquaTagThrottleProfile | null>(null);
  /** The exact words, as the operator is editing them. */
  const [wordsDraft, setWordsDraft] = useState("");
  /**
   * The words the PAGE had when this element was picked.
   *
   * Kept apart from `wordsDraft` (what is being typed) and from
   * `tagElement.text` (what the tag reports now, which the preview patch has
   * already changed). Only this one is the needle the source search uses, and
   * only it stays still while somebody types.
   */
  const [wordsOriginal, setWordsOriginal] = useState("");
  const tagPingId = useRef("");
  const tagTimeout = useRef<number | null>(null);
  /**
   * Read at event time rather than closed over.
   *
   * The message listener is mounted once. Closing over the origin would pin it
   * to whatever the preview showed at mount and then silently reject every
   * message after the first navigation — a failure that looks exactly like "the
   * tag is not installed", which is the wrong thing to go and check.
   */
  const tagOriginRef = useRef<string | null>(null);
  const tagElementRef = useRef<AquaTagElement | null>(null);

  // Which tabs this depth offers on THIS target. The rule (including the
  // Element tab's gate on `tagMapped` rather than `browserAvailable`) lives in
  // `inspectorTabsFor`, where it can be tested.
  const allowedTabs = inspectorTabsFor(editingModeId, { portalTarget, tagMapped })
    .map(id => ({ id, ...TAB_META[id] }));

  // A tab can stop being offered underneath you — switching mode, or opening a
  // repository where the portal tools do not apply. Land on a real one rather
  // than leaving the panel showing a tab nothing can reach.
  useEffect(() => {
    if (allowedTabs.length && !allowedTabs.some(item => item.id === tab)) {
      setTab(allowedTabs[0].id);
    }
  }, [allowedTabs, tab]);

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
      pickedAt.current = event.timeStamp || 1;
      if (editingModeId === "assist") {
        // "Just tell it": clicking IS how you point at what you mean, so the
        // capture goes to the assistant and the picker STAYS armed — you will
        // click several things while describing one change.
        setTab("assistant");
      } else {
        // Elsewhere it is a one-shot jump-to-source.
        setPicking(false);
        setTab("repository");
      }
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
    // Switching to a shallower depth while sitting on the code tab must land
    // somewhere real rather than on a blank panel.
    setTab(tabForMode(next, tab) as InspectorTab);
    if (next === "assist") {
      // You cannot point at something you cannot see: "Just tell it" needs the
      // visual pane, and the picker armed so a click captures straight away
      // rather than after finding a button first.
      // "Just tell it" is the page AND the assistant together — bring the
      // browser in so there is something to point at. Gated on whether a
      // browser is POSSIBLE, not on whether this is a portal: a tagged game
      // build has a page to point at, and that is the whole point.
      if (browserAvailable) setShowBrowser(true);
      setPicking(true);
    } else {
      setPicking(false);
    }
  }
  const [record, setRecord] = useState<PortalDesignRecord | null>(null);
  const [portalDocument, setPortalDocument] = useState<ClientPortalDesignDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [notice, setNotice] = useState("Loading...");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const selectedClient = clients.find(client => client.id === clientId) ?? clients[0];
  const selectedTemplate = templates.find(template => template.id === templateId) ?? templates[0];
  /**
   * What the assistant is pointed at, in words that are TRUE of this target.
   *
   * This is not decoration. It becomes the model's own sentence ("I am
   * editing …"), so on a software project "a client portal" does not merely
   * read oddly — it MISINFORMS the model about what it has been asked to
   * change. A repository has no portal and no client; the honest answer is
   * the repository, or failing that the project, that is actually open.
   */
  const assistantTarget = !portalTarget
    ? (selectedProject?.repository || projectName || selectedProject?.name || "this project")
    : scope === "template"
      ? (selectedTemplate?.name || "a portal template")
      : (selectedClient?.name || "a client portal");
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
    const builderOffered = allowedTabs.some(item => item.id === "builder");
    /**
     * The vocabulary rows, for a target that is not an Aqua-hosted portal.
     *
     * ONE selection mechanism: the click resolves to the exact element, and
     * the destination is the Builder — which is where what can and cannot be
     * done with it is said out loud, once.
     */
    const websiteElementOptions = (): AddOption[] => {
      if (!builderOffered) {
        return [{
          id: "no-builder",
          group: "Elements",
          label: "Elements live in the builder",
          unavailableReason: "This depth changes what is already on the page. Switch to Visual builder or Dev to open the element library.",
        }];
      }
      if (!paletteItems.length) {
        return [{ id: "loading-elements", group: "Elements", label: "Loading the element library…" }];
      }
      return paletteItems.map(item => ({
        id: item.type,
        group: item.group,
        label: item.label,
        description: item.isContainer ? "Holds other elements." : undefined,
        onSelect: () => { setSelectedElementType(item.type); setTab("builder"); },
      }));
    };

    if (codePane) {
      // A repository-backed project is never written to this server — a new
      // file or folder is a COMMIT on the project's draft branch, through the
      // same machinery a code-canvas save uses (/api/portal/dev/repo-write).
      // This used to be the disabled "create the file there and publish" row;
      // now it IS the create-the-file-there path.
      //
      // Dev is CUMULATIVE — Ed: "now for dev its all of them + the vs way" —
      // so on a site or a repository the same "+" carries the element library
      // underneath the file rows rather than making Dev the one depth with no
      // vocabulary. On a portal it does not: there the code pane is the
      // portal's own custom CSS/JS layer and its blocks belong to the page,
      // which is the branch below. That path is unchanged.
      const withElements = (files: AddOption[]) =>
        portalTarget ? files : [...files, ...websiteElementOptions()];
      if (selectedProject?.repository) {
        return withElements(fileAddOptions(kind => {
          const suggestion = kind === "folder" ? "src/new-folder" : "src/new-file.ts";
          const path = window.prompt(`Path for the new ${kind} in ${selectedProject.repository}:`, suggestion)?.trim();
          if (!path) return;
          void fetch("/api/portal/dev/repo-write", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "create", project: projectId, path, kind, confirm: true }),
          })
            .then(response => response.json())
            .then(payload => {
              // Honest on both counts: it landed on the DRAFT branch, not the
              // site — and a "folder" is really its .gitkeep, because git has
              // no empty directories.
              setNotice(payload.ok
                ? payload.created === "folder"
                  ? `Created ${payload.committedPath} on the draft branch — git only keeps a folder that has a file in it, so it holds a .gitkeep.`
                  : `Created ${payload.path} on the draft branch — publish opens the pull request.`
                : payload.error ?? "That could not be created.");
              // The same announcement a landed GitHub connection makes — the
              // code canvas listens and re-reads the tree, so the new path
              // appears without a reload.
              if (payload.ok) window.dispatchEvent(new CustomEvent(DEV_PROJECTS_CHANGED_EVENT));
            })
            .catch(() => setNotice("That could not be created."));
        }));
      }
      return withElements(fileAddOptions(kind => {
        const suggestion = kind === "folder" ? "src/new-folder" : "src/new-file.ts";
        const path = window.prompt(`Path for the new ${kind}:`, suggestion)?.trim();
        if (!path) return;
        void fetch("/api/portal/site-editor/files", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // `project` is what lets the server refuse a write to a repository-backed
          // project (files/route.ts). Omitting it bypassed that backstop entirely and
          // created the file in THIS working tree instead. Same key the code canvas sends.
          body: JSON.stringify({ path, create: kind, contents: "", project: projectId || undefined }),
        })
          .then(response => response.json())
          .then(payload => {
            setNotice(payload.ok ? `Created ${path}` : payload.error ?? "That could not be created.");
            // Nudge the code canvas to re-read the tree. The event is what it
            // actually listens for — `setFrameKey` only remounts the preview
            // iframe, so bumping it here never refreshed the tree at all.
            if (payload.ok) window.dispatchEvent(new CustomEvent(DEV_PROJECTS_CHANGED_EVENT));
          })
          .catch(() => setNotice("That could not be created."));
      }));
    }
    // ── A non-code view on a site or a repository ────────────────────────
    //
    // This used to be one disabled row reading "No page to add blocks to",
    // because the only vocabulary the editor had loaded was the portal's. That
    // was the visible half of Ed's complaint. The website surface has 70
    // elements and they belong here — what is genuinely missing is somewhere
    // to PUT one, which is a different sentence and is written once, in
    // `elementLibrarySentence`, next to the library itself.
    if (!portalTarget) return websiteElementOptions();
    if (!canManage || !portalDocument) {
      return [{ id: "readonly", group: "Blocks", label: "Editing is read-only here", unavailableReason: "You do not have permission to change this portal." }];
    }
    // The portal branch is unchanged in behaviour — same entries, same group
    // headers, same order — but the list is now the shared palette rather than
    // a second import of the portal registry beside it.
    return paletteItems.map(item => ({
      id: item.type,
      group: item.group,
      label: item.label,
      description: item.description,
      onSelect: () => {
        const block = createPortalBlock(item.type as Parameters<typeof createPortalBlock>[0]);
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
  }, [allowedTabs, canManage, codePane, customPageId, paletteItems, portalDocument, portalTarget, projectId, section, selectedProject?.repository]);

  /**
   * What the one "+" says it is. "Add to this page" was written when the only
   * thing it could ever offer was a portal page block; off a portal there is
   * no page, and calling it one is how the empty menu read as a bug rather
   * than as a missing vocabulary.
   */
  const addMenuTitle = codePane
    ? (portalTarget ? "Add to the repository" : "The repository and the element library")
    : (portalTarget ? "Add to this page" : "The element library");

  const publishedFrameUrl = useMemo(() => frameUrl.replace("portalDraft=1&", "").replace("&portalDraft=1", ""), [frameUrl]);

  // Where "open in a new tab" actually goes. `frameUrl` is "" without a
  // client, so on a repository that control pointed at nothing — renaming it
  // from "Open portal in new tab" to "Open preview in new tab" only hid that.
  // The browser pane already knows where a non-portal target lives, so send
  // it there, and offer nothing when there is nothing to open. Same principle
  // as the draft/publish pair: do not offer something that does nothing.
  const openInTabUrl = portalTarget ? frameUrl.replace("embedded=1&", "") : browserUrl.trim();

  // ── The tagged browser ──────────────────────────────────────────────────────
  //
  // What the pane the tag talks through is actually showing. One value, so the
  // origin policy, the handshake and every patch all agree about which page is
  // on the other end.
  const previewSrc = portalTarget ? frameUrl : browserUrl.trim();

  /**
   * The single origin the editor will hear from and post to.
   *
   * Derived in an effect rather than during render because it needs
   * `window.location.href` as the base (so a same-origin relative preview path
   * resolves to this app's own origin) and this component is server-rendered
   * first. `aquaTagOrigin` returns null — never "*" — for anything it cannot
   * pin down, and null means the bridge stays shut.
   */
  const [tagOrigin, setTagOrigin] = useState<string | null>(null);
  useEffect(() => {
    const origin = aquaTagOrigin(previewSrc, window.location.href);
    tagOriginRef.current = origin;
    setTagOrigin(origin);
  }, [previewSrc]);

  /** Post one message to the tag, or do nothing at all. Never posts to "*". */
  function sendToTag(payload: object) {
    const target = previewRef.current?.contentWindow;
    const origin = tagOriginRef.current;
    if (!target || !origin) return false;
    try {
      target.postMessage(payload, origin);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Say hello, and complete the tag's half of the handshake.
   *
   * `aquaTagSource.ts` pins `explorerParentOrigin` from the first inbound
   * message it answers — and only `ping` and `inspect` go through the code that
   * does the pinning. So until the editor pings, the tag's replies go out to
   * "*" and its selections are broadcast to whatever is listening. Pinging is
   * therefore not just a liveness check: it is what stops the page shouting the
   * operator's selections at the whole browser.
   *
   * The id comes from `makeId`, NOT `crypto.randomUUID()`. `randomUUID` is a
   * secure-context-only API, so on a dev build served over plain http to
   * anything but localhost — a phone on the LAN looking at the editor — it is
   * simply undefined, and calling it threw a TypeError out of an iframe `onLoad`
   * handler before a single line of state was set. `makeId` uses
   * `crypto.getRandomValues`, which has no secure-context requirement, and
   * degrades to `Math.random` when even that is missing. A request id is a
   * correlation token, not a secret.
   */
  function pingTag() {
    const requestId = makeId("aquaping");
    tagPingId.current = requestId;
    tagElementRef.current = null;
    setTagElement(null);
    setWordsDraft("");
    setWordsOriginal("");
    if (!tagOriginRef.current) { setTagBridge("idle"); return; }
    setTagBridge("checking");
    if (!sendToTag(aquaTagPing(requestId))) { setTagBridge("unavailable"); return; }
    if (tagTimeout.current) window.clearTimeout(tagTimeout.current);
    // No answer means no tag on that page — a real, common, sayable state, not
    // an error. The panel names it and points at Dev mode.
    tagTimeout.current = window.setTimeout(() => {
      if (tagPingId.current === requestId) setTagBridge("unavailable");
    }, 2_000);
  }

  // A new page is a new handshake: ids, capabilities and the selection all
  // belong to the document that has just been replaced.
  useEffect(() => {
    setTagBridge("idle");
    tagElementRef.current = null;
    setTagElement(null);
    setWordsDraft("");
    setWordsOriginal("");
    // A fresh page starts unwrapped: the amber drops NOW and only returns when
    // the new page's tag confirms via throttle-applied. Intent survives in the
    // ref; truth is re-earned per page.
    setThrottleActive(null);
    return () => { if (tagTimeout.current) window.clearTimeout(tagTimeout.current); };
  }, [previewSrc, frameKey]);

  // Selection on or off. Sent whenever either changes, and on disconnect —
  // leaving a page highlighted after the editor stopped listening is worse than
  // never highlighting it.
  useEffect(() => {
    if (tagBridge !== "connected") return;
    sendToTag(tagSelecting ? aquaTagEnable() : aquaTagDisable());
  }, [tagBridge, tagSelecting]);

  // Throttling is STICKY across navigations (the DevTools model): the intent
  // survives in the ref and is re-asked of every page's tag. The icon still
  // only shows what the ACK confirms, so between reload and answer the UI
  // truthfully shows nothing in force.
  useEffect(() => {
    if (tagBridge !== "connected") return;
    if (throttleWanted.current) sendToTag(aquaTagThrottle(throttleWanted.current));
  }, [tagBridge]);

  /**
   * Change the words on the page.
   *
   * Ed: "i get the exact text i can change it on the right menu". This is that
   * change, and it is real — the tag rewrites the element in place. It is a
   * PREVIEW change: it lives in the loaded page and is gone on reload. Writing
   * it back into the source is the publish step, which does not exist yet (see
   * the panel's own note, and the caveats).
   */
  function editWords(next: string) {
    setWordsDraft(next);
    if (tagElement) sendToTag(aquaTagPatchMessage(tagElement.id, { text: next }));
  }

  function editStyle(property: AquaTagStyleProperty, value: string) {
    if (!tagElement) return;
    // Optimistic locally so the field does not lag a round trip behind typing;
    // the tag's own report confirms it.
    setTagElement({ ...tagElement, styles: { ...tagElement.styles, [property]: value } });
    sendToTag(aquaTagPatchMessage(tagElement.id, { styles: { [property]: value } }));
  }

  function editImage(patch: { src?: string; alt?: string }) {
    if (!tagElement) return;
    setTagElement({ ...tagElement, ...patch });
    sendToTag(aquaTagPatchMessage(tagElement.id, patch));
  }

  /** Put every previewed change back. The tag remembers the originals. */
  function resetTagPreview() {
    sendToTag(aquaTagReset());
  }

  // Where a selection goes at this depth, and what the panel may do with it
  // once it arrives. Computed once so the listener and the panel cannot
  // disagree about which of the four destinations is in play.
  const selectionRoute = routeTagSelection(editingModeId, { portalTarget });
  const tagPanel = {
    element: tagElement,
    bridge: tagBridge,
    selecting: tagSelecting,
    onSelectingChange: setTagSelecting,
    words: wordsDraft,
    onWordsChange: editWords,
    onStyleChange: editStyle,
    onImageChange: editImage,
    onReset: resetTagPreview,
    route: selectionRoute,
    sourceFocus,
    // What it takes to write the words back. All three are needed together:
    // a repository to commit to, a project whose vault connection holds the
    // token, and the words as the page had them before the preview patch.
    projectId,
    repository: selectedProject?.repository ?? "",
    portalTarget,
    originalWords: wordsOriginal,
  };

  useEffect(() => {
    if (!portalTarget) {
      // Nothing to load: this project is a repository. Say what IS open.
      setLoading(false);
      setRecord(null);
      setPortalDocument(null);
      setNotice("");
      return;
    }
    if (!clientId) {
      setLoading(false);
      setNotice("Create a client before opening the editor on this project.");
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

  /**
   * ONE listener, TWO protocols, and they are not the same protocol.
   *
   *   1. `aqua:portal-block-select` — the Aqua-hosted portal preview. Our own
   *      renderer, posting the id of a BLOCK in a portal document only this app
   *      holds. Same-origin by construction and it stays that way: widening it
   *      would let any page name a block in somebody's portal.
   *
   *   2. `aqua-explorer:*` — the Aqua Tag, on whatever page it is installed on.
   *      A client's website, Ed's game, a staging build. It reports an ELEMENT,
   *      not a block, and it is by definition NOT same-origin.
   *
   * The editor used to implement only (1) and reject (2) twice over — wrong
   * message name, and an origin check that threw away exactly the messages that
   * were supposed to arrive. Both paths now work; (1) is untouched in behaviour.
   */
  useEffect(() => {
    const receivePreviewSelection = (event: MessageEvent) => {
      // ── 1. The Aqua-hosted portal preview ──
      if (event.origin === window.location.origin) {
        const payload = event.data as { type?: string; blockId?: string } | null;
        if (payload?.type === "aqua:portal-block-select" && payload.blockId) {
          setSelectedBlockId(payload.blockId);
          // A pick is still a selection worth keeping — it just must not drag
          // the operator away from the file they asked to see.
          if (pickedAt.current) { pickedAt.current = 0; return; }
          setTab("builder");
          if (window.matchMedia("(max-width: 1023px)").matches) setMobileInspectorOpen(true);
          return;
        }
        // Not a block message — fall through, because a same-origin preview can
        // also carry the tag.
      }

      // ── 2. A tagged page ──
      // Trust then parse, in one call, against the origin the editor itself
      // pointed the frame at and the frame's own window. Fails closed.
      const message = acceptAquaTagMessage(
        { origin: event.origin, source: event.source, data: event.data },
        { allowedOrigin: tagOriginRef.current, frameWindow: previewRef.current?.contentWindow ?? null },
      );
      if (!message) return;

      if (message.type === AQUA_TAG_MESSAGES.ready) {
        // Only the answer to OUR ping. An unsolicited "ready" is not a handshake.
        if (message.requestId !== tagPingId.current) return;
        if (tagTimeout.current) window.clearTimeout(tagTimeout.current);
        setTagBridge("connected");
        return;
      }

      if (message.type === AQUA_TAG_MESSAGES.throttleApplied) {
        // The tag's word on what is ACTUALLY in force — the icon renders this,
        // never the intent.
        setThrottleActive(message.profile);
        return;
      }

      if (message.type !== AQUA_TAG_MESSAGES.selected) return;

      const element = message.element;
      const changed = element?.id !== tagElementRef.current?.id;
      tagElementRef.current = element;
      setTagElement(element);
      // Adopt the page's text ONLY when the selection actually changed. The tag
      // re-reports after every patch, so adopting it each time would overwrite
      // what is being typed, one round trip behind the keystrokes.
      // The words as the PAGE had them when this element was picked. Captured
      // separately from `tagElement.text`, which the tag rewrites after every
      // preview patch — so by the time somebody presses save, `element.text`
      // is already the new words and searching the source for it would find
      // nothing. This is the needle.
      if (changed) { setWordsDraft(element?.text ?? ""); setWordsOriginal(element?.text ?? ""); }
      if (!element || !changed) return;

      // ── The four destinations ──
      const route = routeTagSelection(editingModeId, { portalTarget });
      setTab(route.tab as InspectorTab);
      setInspectorOpen(true);
      if (window.matchMedia("(max-width: 1023px)").matches) setMobileInspectorOpen(true);
    };
    window.addEventListener("message", receivePreviewSelection);
    return () => window.removeEventListener("message", receivePreviewSelection);
  }, [editingModeId, portalTarget]);

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

  if (!clients.length && portalTarget) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-[#111311] px-6 text-center text-white">
        <div>
          <p className="text-lg font-semibold">The editor needs a client record to supply preview data for this project.</p>
          <Link href="/portal/clients" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black">Create a client</Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex min-h-0 flex-col overflow-hidden bg-[#111311] text-white"
      data-editing-mode={editingModeId}
      // Every accent in the editor reads from these, so a mode change repaints
      // the whole surface rather than one control.
      style={{
        ["--mode-accent" as string]: modeSkin(editingModeId).accent,
        ["--mode-soft" as string]: modeSkin(editingModeId).soft,
        ["--mode-line" as string]: modeSkin(editingModeId).line,
      }}
    >
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 border-b bg-[#151715] px-3 xl:flex xl:min-h-[68px] xl:gap-3 xl:px-4" style={{ borderBottomColor: "var(--mode-line)" }}>
        <Link href={backHref} onClick={event => { if (!confirmDraftDiscard()) event.preventDefault(); }} aria-label={backLabel} title={backLabel} className="my-2 grid size-10 shrink-0 place-items-center rounded-md border border-white/10 text-white/70 hover:bg-white/5 hover:text-white xl:my-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="hidden min-w-40 xl:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--mode-accent)" }}>Dev Editor</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white/90">{projectName || (scope === "template" ? selectedTemplate?.name || "Stunning Standard" : selectedClient?.name)}</p>
        </div>

        {/* WHERE you are comes before HOW DEEP you go — the switcher leads the
            mode switch. It is scoped on purpose: THIS project (and, once
            `parentProjectId` exists, its children) plus the workspace when the
            door is not locked to a client — never the whole agency. Jumping to
            an unrelated project is the Projects workspace's job, which is what
            "All projects" is for. Compact: fixed width, truncating, the same
            min-height as the mode buttons — it must never eat the header the
            way the old `w-full` select did. */}
        {projects.length && !lockToClient ? (
          <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
            <select
              aria-label="Dev project"
              value={projectId}
              onChange={event => {
                const next = event.target.value;
                setProjectId(next);
                const project = projects.find(item => item.id === next);
                // Keep the typed field in step so the Repo tab shows what it reads.
                setRepository(project?.repository ?? "");
                // …and the browser in step with where THAT project's tag lives.
                // Blanked rather than left behind: the previous project's site
                // is not this project's site, and a stale address in the box is
                // how somebody edits the wrong website. The MAPPED address, not
                // the typed one, so a redirecting site still lands on the origin
                // the editor trusts.
                setBrowserUrl(aquaTagBrowserUrl(project));
              }}
              className="min-h-9 w-40 truncate rounded-md border border-white/10 bg-white/[0.06] px-2.5 text-xs font-medium text-white outline-none"
            >
              <option value="" className="bg-[#1a1c1a]">This workspace</option>
              {projectId ? (
                <option value={projectId} className="bg-[#1a1c1a]">
                  {selectedProject?.name ?? projectName ?? "This project"}
                </option>
              ) : null}
            </select>
            <Link
              href="/portal/dev-team/editor"
              onClick={event => { if (!confirmDraftDiscard()) event.preventDefault(); }}
              className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/40 hover:text-white/80"
            >
              All projects
            </Link>
          </div>
        ) : null}

        {/* How deep you want to go: the single most important choice in the
            editor, and it used to be a small select buried in the right rail. */}
        <span aria-hidden className="mx-1 hidden h-7 w-px shrink-0 bg-white/10 xl:block" />
        <EditorModeSwitch
          mode={editingModeId}
          onChange={next => changeMode(next)}
        />

        {/* The primary switch is what the CANVAS shows — the live thing, its
            code, or both. Template vs Client is a narrower question (which
            portal am I previewing) and moves down to the secondary row. */}
        {/* The browser is a TOGGLE, not a mode. Dev with the page beside it is
            the same Dev — it should not need a mode called "Both". */}
        {(
          <div className="col-start-2 row-start-1 inline-flex shrink-0 items-center gap-0.5 justify-self-start rounded-md border border-white/10 bg-black/25 p-1 xl:col-auto xl:row-auto">
            {/* Gated on the Aqua Tag, not on what kind of thing this is.
                Disabled rather than hidden: "there is no browser here and this
                is why" is information; a missing control is a mystery. */}
            <button
              type="button"
              onClick={() => setShowBrowser(value => !value)}
              aria-pressed={browserPane}
              disabled={!browserAvailable}
              title={browserAvailable
                ? (showBrowser ? "Hide the browser" : "Show the browser")
                : "No Aqua Tag connected, so there is no browser. Dev mode reads the repo files directly."}
              aria-label={browserAvailable
                ? (showBrowser ? "Hide the browser" : "Show the browser")
                : "The browser needs an Aqua Tag"}
              className={`grid size-8 place-items-center rounded disabled:cursor-not-allowed disabled:text-white/20 ${browserPane ? "text-white" : "text-white/40 enabled:hover:text-white/75"}`}
              style={browserPane ? { background: "var(--mode-soft)", boxShadow: "inset 0 0 0 1px var(--mode-line)" } : undefined}
            >
              <Globe size={15} aria-hidden />
            </button>
            {/* Selection on the tagged page. ONE mechanism — this is the switch
                for it at every depth, because what changes per mode is only
                where the selection is sent, never how it is made. Offered only
                where the tag actually answered. */}
            {tagBridge === "connected" ? (
              <button
                type="button"
                onClick={() => setTagSelecting(value => !value)}
                aria-pressed={tagSelecting}
                title={tagSelecting ? "Stop selecting — let the page be used normally" : "Click anything on the page to select it"}
                aria-label={tagSelecting ? "Stop selecting on the page" : "Select on the page"}
                className={`grid size-8 place-items-center rounded ${tagSelecting ? "text-white" : "text-white/40 hover:text-white/75"}`}
                style={tagSelecting ? { background: "var(--mode-soft)", boxShadow: "inset 0 0 0 1px var(--mode-line)" } : undefined}
              >
                <MousePointerClick size={15} aria-hidden />
              </button>
            ) : null}
            {tagBridge === "connected" ? (
              <NetworkThrottleControl
                send={sendToTag}
                active={throttleActive}
                onChange={next => { throttleWanted.current = next; }}
              />
            ) : null}
            {/* The second browser is DRAFT versus LIVE — a portal comparison.
                A repository has no published portal URL to put in it, so the
                toggle is only offered where the comparison exists. */}
            {portalTarget ? (
              <button
                type="button"
                onClick={() => { setSplitBrowsers(value => !value); setShowBrowser(true); }}
                aria-pressed={splitBrowsers}
                title={splitBrowsers ? "One browser" : "Two browsers side by side"}
                aria-label={splitBrowsers ? "One browser" : "Two browsers side by side"}
                className={`grid size-8 place-items-center rounded ${splitBrowsers ? "text-white" : "text-white/40 hover:text-white/75"}`}
                style={splitBrowsers ? { background: "var(--mode-soft)", boxShadow: "inset 0 0 0 1px var(--mode-line)" } : undefined}
              >
                <Columns2 size={15} aria-hidden />
              </button>
            ) : null}
          </div>
        )}

        <div className="col-span-3 col-start-1 row-start-2 grid min-w-0 grid-cols-2 items-center gap-2 border-t border-white/10 py-2 sm:flex sm:overflow-x-auto sm:[scrollbar-width:none] xl:col-auto xl:row-auto xl:flex-1 xl:border-t-0">
          {portalTarget && browserPane && !lockToClient ? (
            <div className="inline-flex shrink-0 rounded-md border border-white/10 bg-black/25 p-1" aria-label="Editing scope">
              <TopToggle active={scope === "template"} disabled={busy} onClick={() => changeScope("template")} label="Template" />
              <TopToggle active={scope === "client"} disabled={busy} onClick={() => changeScope("client")} label="Client" />
            </div>
          ) : null}
          {portalTarget && scope === "template" ? (
            <select aria-label="Portal template" value={templateId} disabled={busy} onChange={event => changeTemplate(event.target.value)} className="col-span-2 h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none disabled:opacity-45 sm:col-span-1 sm:min-w-52 sm:max-w-72 sm:shrink-0">
              {templates.map(template => <option key={template.id} value={template.id} className="bg-[#1a1c1a]">{template.name}{template.active ? "" : " (archived)"}</option>)}
            </select>
          ) : null}
          {!portalTarget ? null : lockToClient ? (
            <div className="flex h-10 min-w-0 items-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white/80 sm:min-w-44 sm:max-w-56 sm:shrink-0" title={selectedClient?.name}>
              <span className="truncate">{selectedClient?.name}</span>
            </div>
          ) : (
            <select aria-label="Preview client" value={clientId} disabled={busy} onChange={event => changeClient(event.target.value)} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none disabled:opacity-45 sm:min-w-44 sm:max-w-56 sm:shrink-0">
              {clients.map(client => <option key={client.id} value={client.id} className="bg-[#1a1c1a]">{client.name}{client.built ? "" : " (not built)"}</option>)}
            </select>
          )}
          {portalTarget ? <select aria-label="Lifecycle stage" value={mode} onChange={event => setMode(event.target.value as ClientPortalMode)} className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white outline-none sm:min-w-40 sm:shrink-0">
            {CLIENT_PORTAL_MODES.map(item => <option key={item} value={item} className="bg-[#1a1c1a]">{portalDocument?.stages[item].label || MODE_LABELS[item]}</option>)}
          </select> : null}
          {portalTarget ? <select aria-label="Portal page" value={selectedCustomPage ? `custom:${selectedCustomPage.id}` : section} onChange={event => {
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
          </select> : null}
          {/* The project switcher used to sit here as a `w-full` select over
              EVERY project in the agency — it now leads the top bar, compact
              and scoped to the project this editor is in. */}
          <div className="flex min-w-0 items-center justify-end gap-2 sm:justify-start">
            {browserPane ? <DeviceControl value={deviceState} onChange={setDeviceState} /> : null}
            <button type="button" onClick={() => setFrameKey(value => value + 1)} title="Refresh preview" aria-label="Refresh preview" className="hidden size-10 shrink-0 place-items-center rounded-md border border-white/10 text-white/65 hover:bg-white/5 hover:text-white sm:grid"><RefreshCw size={16} /></button>
            {openInTabUrl ? <Link href={openInTabUrl} target="_blank" rel="noreferrer" title="Open preview in new tab" aria-label="Open preview in new tab" className="grid size-10 shrink-0 place-items-center rounded-md border border-white/10 text-white/65 hover:bg-white/5 hover:text-white"><ExternalLink size={16} /></Link> : null}
            {/* Live product workspaces belong to a client's portal — a
                repository has no client, and `scope` still defaults to
                "client", so this offered a stranger's portal to a game. */}
            {portalTarget && scope === "client" ? <Link href={`/client-preview/${clientId}?manage=1`} target="_blank" rel="noreferrer" title="Manage live product workspaces" aria-label="Manage live product workspaces" className="grid size-10 shrink-0 place-items-center rounded-md border border-cyan-300/25 text-cyan-300/75 hover:bg-cyan-300/10 hover:text-cyan-200"><PanelsTopLeft size={16} /></Link> : null}
          </div>
        </div>

        {/* Draft and Publish move a PORTAL between draft and live. A repository
            has neither, and its saves happen per file in the code canvas, so
            offering them here would be offering something that does nothing. */}
        {portalTarget ? (
          <div className="col-start-3 row-start-1 flex shrink-0 items-center justify-self-end gap-2 xl:col-auto xl:row-auto">
            <button type="button" onClick={saveDraft} disabled={!canManage || busy || !dirty} className="hidden min-h-10 items-center gap-2 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/75 enabled:hover:bg-white/5 disabled:opacity-35 md:inline-flex">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save draft</button>
            <button type="button" onClick={publish} disabled={!canManage || busy || !record} aria-label="Publish portal" aria-busy={busy} style={{ background: "var(--mode-accent)" }} className="inline-flex size-10 items-center justify-center gap-2 rounded-md text-xs font-bold text-[#0d120f] hover:brightness-110 disabled:opacity-40 sm:w-auto sm:px-3">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}<span className="hidden sm:inline">Publish</span></button>
          </div>
        ) : null}
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
              label={addMenuTitle}
              title={addMenuTitle}
            />
            <p className="min-w-0 flex-1 truncate" role="status" aria-live="polite">{notice}{dirty ? " · save the draft to refresh preview" : ""}</p>
            {/* Template / Client override is a PORTAL scope. A repository has
                no such scope, so this used to sit over a game's preview
                reading "Client override" for as long as it was open. The
                device size is true of any target; the scope word is not.
                (`deviceLabel` reports TRUE device pixels — zoom is stated
                beside them, never multiplied in.) */}
            <p className="hidden shrink-0 sm:block">
              {codePane
                ? (selectedProject?.repository || "This workspace")
                : !portalTarget
                  ? `${selectedProject?.repository || projectName || "This workspace"} · ${deviceLabel(deviceState)}`
                  : `${scope === "template" ? selectedTemplate?.productId ? "Product template" : "Master template" : "Client override"} · ${deviceLabel(deviceState)}`}
            </p>
          </div>

          {/* The canvas is DYNAMIC: live, code, both (with a divider you drag),
              or two live views compared. Nothing here is a fixed proportion —
              sometimes you want a sliver of preview beside a wide file, and
              sometimes the reverse. */}
          <div ref={splitRef} className="flex min-h-0 flex-1">
            {/* Browser pane(s). Present at any mode when the browser is on —
                in Dev it sits beside the code, which is what the old "Both"
                view was for. */}
            {browserPane ? (
              <div
                className="min-h-0 overflow-auto p-4 lg:p-6"
                style={codePane || splitBrowsers ? { width: `${splitRatio * 100}%`, flexShrink: 0 } : { flex: 1 }}
              >
                {portalTarget ? (
                  /* NO tag handshake here, deliberately. This frame shows
                     `/client-preview/…`, which is ours and which never carries
                     `/aqua-tag.js` — that script is injected by the
                     `(website)` layout alone. The Aqua-hosted preview reports
                     selections through the first-party block protocol instead,
                     which is the whole reason it needs no tag.
                     Pinging it anyway meant the handshake timed out after two
                     seconds on every load, refresh and section change, and the
                     Element panel then told the operator to go and install a tag
                     on a page that must never have one — on a door that passes
                     no project, so there was nothing to Map either. */
                  <PreviewFrame
                    label={splitBrowsers ? "Draft — your unpublished changes" : undefined}
                    loading={loading}
                    url={frameUrl}
                    frameKey={frameKey}
                    device={deviceState}
                    onDeviceResize={resizeDevice}
                    innerRef={previewRef}
                  />
                ) : (
                  <div className="grid gap-2">
                    {/* A UNIVERSAL editor: the thing you are building might be a
                        site, an app, a game, an API console — anything with a
                        URL. So the browser just asks where to point, and never
                        assumes what you are making. */}
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={event => { event.preventDefault(); setFrameKey(value => value + 1); }}
                    >
                      <Globe size={13} aria-hidden className="shrink-0 text-white/30" />
                      <input
                        value={browserUrl}
                        onChange={event => setBrowserUrl(event.target.value)}
                        placeholder="http://localhost:3000 — anything you are running"
                        aria-label="Preview URL"
                        className="h-8 min-w-0 flex-1 rounded-md border border-white/12 bg-white/[0.05] px-2.5 text-[11px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-300/40"
                      />
                      <TagBridgeBadge state={tagBridge} />
                    </form>
                    {browserUrl.trim() ? (
                      <PreviewFrame
                        loading={false}
                        url={browserUrl.trim()}
                        frameKey={frameKey}
                        device={deviceState}
                        onDeviceResize={resizeDevice}
                        innerRef={previewRef}
                        onLoad={pingTag}
                      />
                    ) : (
                      <p className="rounded-md border border-dashed border-white/12 px-3 py-6 text-center text-[11px] text-white/35">
                        Point the browser at the page your Aqua Tag is installed on.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* Drag to re-balance whenever two things share the canvas. */}
            {browserPane && (codePane || splitBrowsers) ? (
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
                    setSplitRatio(Math.min(0.8, Math.max(0.2, (moveEvent.clientX - bounds.left) / bounds.width)));
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

            {/* The SECOND browser — draft against what the client sees now.
                Portal-only: `publishedFrameUrl` derives from the client
                preview URL, which is empty without a client. */}
            {browserPane && splitBrowsers && portalTarget ? (
              <div className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
                <PreviewFrame
                  label="Live — what the client sees now"
                  loading={loading}
                  url={publishedFrameUrl}
                  frameKey={frameKey}
                  device={deviceState}
                  onDeviceResize={resizeDevice}
                />
              </div>
            ) : null}

            {/* Dev's code canvas. */}
            {codePane && !splitBrowsers ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <EditorCodeCanvas projectId={projectId || undefined} repository={repository} focus={sourceFocus} />
              </div>
            ) : null}

            {/* No tag, so no browser — and SAY so, with the way forward.
                A greyed-out control with no explanation is how somebody spends
                an afternoon concluding the editor is broken. Ed's rule, stated
                to the operator: the tag is what makes a browser, and Dev works
                without one because it reads the repo files directly. */}
            {!browserAvailable && !codePane ? (
              <div className="grid flex-1 place-items-center px-6 text-center">
                <div className="max-w-md">
                  <Globe size={22} aria-hidden className="mx-auto text-white/20" />
                  <p className="mt-3 text-sm font-semibold text-white/70">No Aqua Tag on this project, so there is no browser.</p>
                  <p className="mt-2 text-xs leading-5 text-white/40">
                    The tag is what maps the page — it is how a click knows which item you meant.
                    Connect it in Settings, give the project the address it is installed on, then press <strong className="font-semibold text-white/60">Map</strong>.
                  </p>
                  <p className="mt-3 text-xs leading-5 text-white/40">
                    Dev mode works right now without one: it reads the repository files directly.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => { changeMode("developer"); setInspectorOpen(true); }}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-bold text-[#0d120f]"
                      style={{ background: "var(--mode-accent)" }}
                    >
                      <Code2 size={14} aria-hidden /> Open Dev
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTab("settings"); setInspectorOpen(true); }}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/12 px-3 text-xs font-semibold text-white/70 hover:bg-white/5"
                    >
                      <Settings size={14} aria-hidden /> Connect a tag
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Nothing to show: a page-first mode with the browser put away. */}
            {browserAvailable && !browserPane && !codePane ? (
              <div className="grid flex-1 place-items-center px-6 text-center">
                <div>
                  <Globe size={22} aria-hidden className="mx-auto text-white/20" />
                  <p className="mt-2 text-xs text-white/40">The browser is hidden.</p>
                  <button
                    type="button"
                    onClick={() => setShowBrowser(true)}
                    className="mt-2 text-[11px] font-semibold"
                    style={{ color: "var(--mode-accent)" }}
                  >
                    Bring it back
                  </button>
                </div>
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
                  {!portalTarget
                    ? (selectedProject?.repository || projectName || "This workspace")
                    : `${scope === "template" ? selectedTemplate?.name || "Template" : selectedClient?.name || "Client"}${
                        tab === "repository" || tab === "code" ? "" : ` · ${selectedCustomPage?.label ?? SECTION_LABELS[section] ?? section}`
                      }`}
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


            <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {(portalDocument && record) || !portalTarget ? (
              <Inspector
                assistant={assistant}
                assistantTarget={assistantTarget}
                repository={repository}
                projectId={projectId}
                onRepositoryChange={setRepository}
                sourceFocus={sourceFocus}
                onOpenFile={openFileInCanvas}
                picking={picking}
                onPickElement={() => { setPicking(value => !value); }}
                tagPanel={tagPanel}
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
                elementSurface={elementSurface}
                paletteGroups={paletteGroups}
                paletteCount={paletteItems.length}
                selectedElementType={selectedElementType}
                selectElementType={setSelectedElementType}
                tagMapped={tagMapped}
              />
            ) : <p className="text-sm text-white/45">{notice}</p>}
            </div>
          </div>
        </aside>
        ) : null}

        {/* The activity rail. Always present, so a collapsed inspector is one
            click from coming back, and adding an eighth tool costs nothing. */}
        <nav aria-label="Inspector tools" className="hidden w-12 shrink-0 flex-col items-center gap-0.5 border-l border-white/10 bg-[#101210] py-2 lg:flex">
          {/* The SAME universal "+" the canvas header carries — same options,
              same per-target offer. The rail is where the eye already is when
              the inspector is open, and a control that exists in one corner of
              a full-screen editor is a control that gets lost. `align="end"`
              so the panel opens INTO the canvas rather than off-screen. */}
          <AddMenu
            options={addOptions}
            label={addMenuTitle}
            title={addMenuTitle}
            align="end"
          />
          <span aria-hidden className="my-1 h-px w-6 bg-white/10" />
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
                  active ? "bg-white/[0.08]" : "text-white/35 hover:bg-white/[0.05] hover:text-white/80"
                }`}
                style={active ? { color: "var(--mode-accent)" } : undefined}
              >
                <Icon size={17} aria-hidden />
                {active ? <span aria-hidden className="absolute -left-1.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full" style={{ background: "var(--mode-accent)" }} /> : null}
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

        <button type="button" onClick={() => setMobileInspectorOpen(true)} aria-expanded={mobileInspectorOpen} className="fixed bottom-4 right-4 z-30 inline-flex min-h-11 items-center gap-2 rounded-md bg-cyan-300 px-4 text-xs font-bold text-[#102124] shadow-lg lg:hidden"><FileText size={16} /> Inspector</button>
        {mobileInspectorOpen ? (
          <aside className="fixed inset-0 z-50 flex flex-col bg-[#141614] lg:hidden" aria-label="Dev Editor Engine inspector">
            <div className="grid shrink-0 border-b border-white/10" style={{ gridTemplateColumns: `repeat(${allowedTabs.length}, 1fr) 44px` }}>
              {allowedTabs.map(item => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[9px] font-semibold ${tab === item.id ? "bg-white/[0.07] text-cyan-300" : "text-white/42"}`}><Icon size={15} /><span>{item.label}</span></button>;
              })}
              <button type="button" onClick={() => setMobileInspectorOpen(false)} aria-label="Close the inspector" className="grid place-items-center border-l border-white/10 text-white/55"><X size={17} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {(portalDocument && record) || !portalTarget ? (
                <Inspector assistant={assistant} assistantTarget={assistantTarget} repository={repository} projectId={projectId} onRepositoryChange={setRepository} sourceFocus={sourceFocus} onOpenFile={openFileInCanvas} picking={picking} onPickElement={() => setPicking(value => !value)} tagPanel={tagPanel} tab={tab} scope={scope} mode={mode} section={section} customPageId={customPageId} document={portalDocument} record={record} canManage={canManage} busy={busy} checkpointLabel={checkpointLabel} setCheckpointLabel={setCheckpointLabel} edit={edit} checkpoint={checkpoint} restore={restore} refreshProductTemplate={refreshProductTemplate} resetClient={resetClient} latestMasterVersionId={selectedTemplate?.latestMasterVersionId} compositionTemplates={templates.filter(template => template.active && Boolean(template.productId) && template.id !== selectedTemplate?.id)} productOptions={templates.filter(template => Boolean(template.productId))} previewProductIds={previewProductIds} togglePreviewProduct={togglePreviewProduct} selectCustomPage={setCustomPageId} selectedBlockId={selectedBlockId} selectBlock={setSelectedBlockId} elementSurface={elementSurface} paletteGroups={paletteGroups} paletteCount={paletteItems.length} selectedElementType={selectedElementType} selectElementType={setSelectedElementType} tagMapped={tagMapped} />
              ) : <p className="text-sm text-white/45">{notice}</p>}
            </div>
            {/* The same gate as the desktop pair above: a repository has no
                draft and no live release, so offering them here would be
                offering something that does nothing. */}
            {portalTarget ? (
              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 bg-[#111311] p-3">
                <button type="button" onClick={saveDraft} disabled={!canManage || busy || !dirty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/12 text-xs font-semibold text-white/75 disabled:opacity-35">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save draft</button>
                <button type="button" onClick={publish} disabled={!canManage || busy || !record} aria-busy={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan-300 text-xs font-bold text-[#102124] disabled:opacity-40">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />} Publish</button>
              </div>
            ) : null}
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
  onOpenFile,
  picking,
  onPickElement,
  tagPanel,
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
  elementSurface,
  paletteGroups,
  paletteCount,
  selectedElementType,
  selectElementType,
  tagMapped,
}: {
  assistant?: EditorAssistantProps;
  assistantTarget: string;
  repository: string;
  projectId?: string;
  onRepositoryChange: (value: string) => void;
  sourceFocus: { path: string; line?: number } | null;
  /** Opens a file in the code canvas — Drafts' resume, the Librarian's Open. */
  onOpenFile: (path: string) => void;
  picking: boolean;
  onPickElement: () => void;
  /** The Aqua Tag selection and what this depth may do with it. */
  tagPanel: TagPanelProps;
  tab: InspectorTab;
  scope: Scope;
  mode: ClientPortalMode;
  section: ClientPortalSectionId;
  customPageId: string;
  /** Absent for a repository — it has no portal document. */
  document: ClientPortalDesignDocument | null;
  record: PortalDesignRecord | null;
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
  /** Which vocabulary this target speaks. Never absent — every target has one. */
  elementSurface: ElementSurface;
  paletteGroups: Array<{ group: string; items: ElementPaletteItem[] }>;
  paletteCount: number;
  /** The palette entry being LOOKED at. Not a selection on a page. */
  selectedElementType: string;
  selectElementType: (type: string) => void;
  /** An Aqua Tag answers on this project's page. */
  tagMapped: boolean;
}) {
  const editingDisabled = !canManage || busy;

  if (tab === "settings") {
    // The PROJECT-SCOPED panel, not the projects workspace. This used to
    // mount the whole `<DevEditorSetup />` screen — every project's card,
    // "Add a project", an "Open editor" button INSIDE the editor, all wearing
    // cream `--dt-*` cards in a dark inspector. Ed's rule: settings configure
    // ONLY the project you are in, in the editor's own clothes.
    return (
      <div className="mm-editor-settings grid gap-3 text-white/80">
        <InspectorHeading
          eyebrow="This project"
          title="Settings"
          body="What the editor is pointed at — repository, branch, connections, Aqua Tag and keys. Only this project; the Projects workspace holds the rest."
        />
        <DevEditorProjectSettings projectId={projectId ?? ""} aiConfigured={Boolean(assistant?.configured)} />
      </div>
    );
  }

  if (tab === "assistant") {
    // No payload (assistant not wired on this route) — say so plainly rather
    // than render an empty panel that looks broken.
    if (!assistant) {
      return <p className="px-1 py-3 text-xs text-white/45">Aqua Editor AI is not available on this screen.</p>;
    }
    return (
      <AquaEditorAI
        // The panel is per PROJECT — key, model, brief and conversation all
        // scope to this id. Without it the panel renders its not-scoped state,
        // which is exactly what happened when this mount lagged the rewrite.
        projectId={assistant.projectId}
        projectName={assistant.projectName}
        initialConversation={assistant.initialConversation}
        historyLimits={assistant.historyLimits}
        editorAi={assistant.editorAi}
        reason={assistant.reason}
        configured={assistant.configured}
        model={assistant.model}
        // The greeting is "What do you need, {first word}?" — it wants the
        // PERSON, not the thing being edited. Handing it the target rendered
        // "What do you need, a?" (from "a client portal"), so it now reads the
        // signed-in user the same way the Advisor and Librarian skins do.
        userName={assistant.userName}
        // `section` is a PORTAL page id. Without a portal document there is no
        // such page, and passing one told the model "the overview page" about
        // a repository.
        context={{
          target: assistantTarget,
          section: document ? section : undefined,
          element: sourceFocus,
          // The "assist" destination: same browser, same click, handed to the
          // AI instead of to an editable field.
          words: tagPanel.element ? {
            label: tagPanel.element.label,
            kind: tagPanel.element.kind,
            tagName: tagPanel.element.tagName,
            text: tagPanel.element.text,
            src: tagPanel.element.src,
            alt: tagPanel.element.alt,
          } : null,
        }}
        picking={picking}
        onPickElement={onPickElement}
      />
    );
  }

  // The element panel sits ABOVE the portal-document guard below, because a
  // selection on a tagged page is exactly the case where there is no portal
  // document — a client's website, a game build. Putting it after the guard is
  // how it would have shown "these tools apply to an Aqua-hosted portal" to
  // somebody who had just clicked their own homepage.
  if (tab === "element") {
    return <TagElementInspector {...tagPanel} />;
  }

  // ── The BUILDER — a vocabulary question, not a portal question ─────────
  //
  // Above the portal-document guard on purpose, and for the same reason the
  // Element panel is: the case that matters most is exactly the one with no
  // portal document — Ed's own project, a client's site, a game build. Below
  // the guard it rendered "these tools apply to an Aqua-hosted portal" at
  // somebody who had opened their own repository and pressed Builder, which is
  // the visible half of "i cant select and build anything".
  //
  // Which palette appears is `elementSurface`'s answer, and it is driven by
  // `listElementDefinitions(surface)` through `elementPalette` — never a list
  // written out here.
  if (tab === "builder") {
    if (!document || !record) {
      return (
        <ElementLibraryInspector
          surface={elementSurface}
          groups={paletteGroups}
          count={paletteCount}
          tagMapped={tagMapped}
          selectedType={selectedElementType}
          onSelect={selectElementType}
          // What it takes to WRITE the selected element into the source
          // (phase 7): the project whose vault connection holds the token,
          // the repository the commit lands in, and the selection's file+line
          // as the suggested spot. Same trio the words editor needs, for the
          // same reason.
          projectId={projectId ?? ""}
          repository={tagPanel.repository}
          sourceFocus={sourceFocus}
        />
      );
    }
    return <PortalBuilderInspector section={section} customPageId={customPageId} document={document} disabled={editingDisabled} edit={edit} productOptions={productOptions} selectCustomPage={selectCustomPage} selectedBlockId={selectedBlockId} selectBlock={selectBlock} />;
  }

  // Off a portal, "content" means the WORDS on the tagged page, and the panel
  // that holds them already exists — this is the same one the Element tab
  // renders, not a second implementation of it. `inspectorTabsFor` only offers
  // content here in the one depth that has no Element tab ("assist"), so the
  // two can never both be on screen.
  if (tab === "content" && (!document || !record)) {
    return <TagElementInspector {...tagPanel} />;
  }

  if (tab === "librarian") {
    // The file-finding skill's own surface — "where does X live / what can I
    // reuse". Scoped to the open project; the editor AI EDITS, the Librarian
    // FINDS, and both stand on the same findFiles() under the route.
    // `onOpenFile` is the seam its own footer promised: Open puts a repo hit
    // in front of the Code tab.
    return <LibrarianPanel projectId={projectId} onOpenFile={onOpenFile} />;
  }

  // ── The work lifecycle (phase 14) — Dev mode only, like the Librarian ──
  //
  // Above the portal-document guard for the same reason Repo is: the case
  // that matters is exactly the one with no portal document. The draft IS
  // the project's edit branch — the repository is the draft store, never a
  // second one — so Drafts DESCRIBES what the write path created, resume is
  // `onOpenFile` into the code canvas, and publish posts the same
  // `action: "publish"` the canvas strip does. A project with no repository
  // is told so in the panel's own words.
  if (tab === "drafts") {
    return <DraftsPanel projectId={projectId ?? ""} onOpenFile={onOpenFile} />;
  }
  if (tab === "history") {
    return <HistoryPanel projectId={projectId ?? ""} />;
  }
  if (tab === "notes") {
    return <NotesPanel projectId={projectId ?? ""} />;
  }

  if (tab === "repository") {
    // Scoped to the portal, and narrowed again to the page on screen — the
    // question somebody actually has is "what renders this", not "show me
    // the repository".
    return <RepositoryPanel repository={repository} projectId={projectId} onRepositoryChange={onRepositoryChange} focus={sourceFocus} picking={picking} onPickElement={onPickElement} scope={scopeForSection(PORTAL_SCOPE, section)} />;
  }

  // Everything below edits a PORTAL, so it needs one. A repository has no
  // portal document (the "code" tab here is the portal's own custom CSS/JS,
  // not the repository — that is the Repo tab, handled above).
  if (!document || !record) {
    return <p className="px-1 py-3 text-xs text-white/45">These tools apply to an Aqua-hosted portal. This project is not one — use Repo, Code or the Assistant.</p>;
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

/**
 * The element library — the Builder tab on anything that is not an Aqua-hosted
 * portal.
 *
 * What it is NOT: a second block registry. Every entry comes from
 * `elementPalette(surface)`, which reads `listElementDefinitions(surface)` —
 * the same shared registry the website editor's own canvas reads. Adding an
 * element to the library is done in one place and appears here for free.
 *
 * What it deliberately does not pretend: there is nowhere to DROP one yet. A
 * repository has no block document, and the Aqua Tag protocol carries
 * selections and text patches, not inserts. Rather than hide that behind a
 * button that quietly does nothing, the sentence under the heading says it —
 * and it is `elementLibrarySentence`'s sentence, printed verbatim, so the
 * words and the rule cannot drift apart.
 */
function ElementLibraryInspector({ surface, groups, count, tagMapped, selectedType, onSelect, projectId, repository, sourceFocus }: {
  surface: ElementSurface;
  groups: Array<{ group: string; items: ElementPaletteItem[] }>;
  count: number;
  tagMapped: boolean;
  selectedType: string;
  onSelect: (type: string) => void;
  projectId: string;
  repository: string;
  sourceFocus: { path: string; line?: number } | null;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? groups
      .map(group => ({ group: group.group, items: group.items.filter(item => item.label.toLowerCase().includes(needle) || item.type.includes(needle)) }))
      .filter(group => group.items.length)
    : groups;
  const selected = selectedType ? getElementDefinition(selectedType) : undefined;
  const sentence = elementLibrarySentence({ surface, hasPortalDocument: false, tagMapped, count });

  return (
    <div className="grid gap-5">
      <InspectorHeading
        eyebrow="Element library"
        title={count ? `${count} elements` : "Element library"}
        body={sentence}
      />

      {count ? (
        <div className="relative">
          <Search size={12} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search elements"
            aria-label="Search the element library"
            className="h-9 w-full rounded-md border border-white/10 bg-white/[0.045] pl-7 pr-2 text-[11px] text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-300/45"
          />
        </div>
      ) : null}

      {count && !shown.length ? <p className="text-[11px] text-white/40">Nothing matches that.</p> : null}

      {shown.map(group => (
        <div key={group.group}>
          <p className="pb-2 text-[9px] font-semibold uppercase tracking-wide text-white/30">{group.group}</p>
          <div className="grid grid-cols-2 gap-2">
            {group.items.map(item => (
              <button
                key={item.type}
                type="button"
                onClick={() => onSelect(item.type)}
                aria-pressed={selectedType === item.type}
                title={item.type}
                className={`flex min-h-14 items-start gap-2 rounded-md border p-2.5 text-left transition ${
                  selectedType === item.type
                    ? "border-cyan-300/45 bg-cyan-300/[0.07]"
                    : "border-white/10 bg-white/[0.025] hover:border-cyan-300/25 hover:bg-cyan-300/[0.045]"
                }`}
              >
                <span aria-hidden className="mt-0.5 shrink-0 text-[13px] leading-none text-white/40">{item.icon ?? "\u25AB"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-white/78">{item.label}</span>
                  <span className="mt-0.5 block truncate font-mono text-[9px] text-white/25">{item.type}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* What the selected element actually IS — read off the definition
          rather than described here, so a field added to the registry shows up
          without this panel being edited. */}
      {selected ? (
        <div className="border-t border-white/10 pt-5">
          <InspectorHeading
            eyebrow="Selected element"
            title={selected.label}
            body={`${selected.category}${selected.isContainer ? " · holds other elements" : ""} · ${selected.fields.length} ${selected.fields.length === 1 ? "setting" : "settings"}`}
          />
          {selected.fields.length ? (
            <ul className="mt-4 grid gap-1.5">
              {selected.fields.map(field => (
                <li key={field.key} className="flex items-baseline justify-between gap-3 rounded-md border border-white/8 bg-white/[0.02] px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[11px] text-white/68">{field.label}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase text-cyan-300/45">{field.type}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-[11px] text-white/35">This element takes no settings.</p>}

          {/* Phase 7: the library inserts real code. The panel owns the whole
              flow — where, the exact preview, the confirmed commit to the
              draft branch — and refuses unsafe spots with the server's own
              sentence. Off a repository it explains itself instead. */}
          <div className="mt-4">
            <ElementInsertPanel
              projectId={projectId}
              repository={repository}
              elementType={selected.type}
              sourceFocus={sourceFocus}
            />
          </div>
        </div>
      ) : null}
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
 * One preview surface, at EXACTLY the chosen device's size.
 *
 * Extracted because the canvas can now show TWO of them at once (compare:
 * draft against what the client is actually looking at right now), and two
 * copies of the same iframe markup is how they drift apart.
 *
 * EXACT means exact (dev-editor-finish phase 10). The iframe lays out at the
 * device's true CSS pixels — `effectiveViewport`, the same maths every other
 * consumer of `devicePresets.ts` uses — and is never squashed: the old
 * `maxWidth: "100%"` made a preset mean "as much of 393px as the pane
 * allows", which is a different number on every screen. When the device is
 * bigger than the pane, the pane SCROLLS (it is `overflow-auto`) rather than
 * auto-zooming: scroll keeps the page at 1:1, so text renders at the size the
 * device would really show, while auto-zoom would quietly shrink the view and
 * lie about legibility. Zoom exists, but as the operator's explicit choice in
 * the toolbar — a transform over the box, with the true size still stated.
 *
 * In Responsive mode THE BOX GROWS DRAG HANDLES — Ed: "it lives inside a box
 * but the draggable thing is the box the browser sits in". Right edge for
 * width, bottom for height, corner for both; the dragged size is written back
 * as the custom dimensions, clamped through the same `clampDeviceSize` the
 * typed inputs use. Pointer capture keeps the drag alive when the pointer
 * outruns the handle, and the iframe drops pointer events for the duration —
 * a cross-origin document would otherwise swallow the move mid-drag.
 *
 * The iframe's key stays `${frameKey}:${url}` — a preset switch, rotation,
 * zoom or drag changes STYLE VALUES on the same element, never its identity,
 * so the loaded page (and the tag handshake riding it) survives every resize.
 * The no-remount rule from the walkthrough pass applies to sizing too.
 */
function PreviewFrame({ label, loading, url, frameKey, device, onDeviceResize, innerRef, onLoad }: {
  label?: string;
  loading: boolean;
  url: string;
  frameKey: number;
  /** The chosen device — the frame renders at exactly its CSS pixels. */
  device: DeviceState;
  /** Present = the Responsive box grows its drag handles, writing back here. */
  onDeviceResize?: (width: number, height: number) => void;
  innerRef?: React.RefObject<HTMLIFrameElement | null>;
  /**
   * Fired once the frame has a document — where the Aqua Tag handshake starts.
   *
   * It has to be the load event rather than a timer: the tag's message listener
   * does not exist until its script has run, and a ping sent before then is not
   * answered late, it is simply lost.
   */
  onLoad?: () => void;
}) {
  const spec = getDevicePreset(device.deviceId) ?? DEVICE_PRESETS[0]!;
  const viewport = effectiveViewport(spec, device);
  const zoom = device.zoom;
  const scaled = { width: Math.round(viewport.width * zoom), height: Math.round(viewport.height * zoom) };
  const draggable = spec.category === "responsive" && Boolean(onDeviceResize);
  // Which axis a drag is moving, or null. State rather than only a ref because
  // the iframe must drop pointer events while a drag crosses it, and the
  // readout chip appears with it. The drag's own numbers live in a ref — a
  // pointermove can arrive before the pointerdown's render commits.
  const [resizeAxis, setResizeAxis] = useState<"x" | "y" | "both" | null>(null);
  const dragFrom = useRef<{ axis: "x" | "y" | "both"; x: number; y: number; width: number; height: number } | null>(null);

  /** The handle wiring, once — three handles differ only in axis and cursor. */
  function grip(axis: "x" | "y" | "both") {
    return {
      onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
        event.preventDefault();
        // Capture, or the drag dies the moment the pointer outruns this
        // 6px-wide handle — and permanently the moment it enters the iframe.
        event.currentTarget.setPointerCapture(event.pointerId);
        dragFrom.current = { axis, x: event.clientX, y: event.clientY, width: viewport.width, height: viewport.height };
        setResizeAxis(axis);
      },
      onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
        const drag = dragFrom.current;
        if (!drag || drag.axis !== axis || !onDeviceResize) return;
        // Deltas are visual pixels over a scaled box: divide by zoom so the
        // handle stays glued to the pointer at 50% just as it does at 100%.
        const width = axis === "y" ? drag.width : drag.width + (event.clientX - drag.x) / zoom;
        const height = axis === "x" ? drag.height : drag.height + (event.clientY - drag.y) / zoom;
        onDeviceResize(width, height);
      },
      onPointerUp() {
        dragFrom.current = null;
        setResizeAxis(null);
      },
      onPointerCancel() {
        dragFrom.current = null;
        setResizeAxis(null);
      },
      onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        if (!onDeviceResize) return;
        const step = event.shiftKey ? 1 : 16;
        let { width, height } = viewport;
        if (event.key === "ArrowLeft" && axis !== "y") width -= step;
        else if (event.key === "ArrowRight" && axis !== "y") width += step;
        else if (event.key === "ArrowUp" && axis !== "x") height -= step;
        else if (event.key === "ArrowDown" && axis !== "x") height += step;
        else return;
        event.preventDefault();
        onDeviceResize(width, height);
      },
    };
  }

  return (
    // Explicit width, and NEVER a maxWidth: in the pane's `overflow-auto` this
    // is what makes a too-big device scrollable instead of squashed. The 14px
    // gutter keeps the handles inside the box's own footprint.
    <div className="mx-auto" style={{ width: scaled.width + (draggable ? 14 : 0) }}>
      {label ? <p className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-wide text-white/35">{label}</p> : null}
      <div className="relative" style={{ width: scaled.width, height: scaled.height }}>
        {/* The box the browser sits in: laid out at TRUE device pixels, then
            composited down (or up) by the zoom transform. Layout size is what
            the page sees; the transform is only what the operator sees. */}
        <div
          className="overflow-hidden rounded-md border border-white/12 bg-white shadow-[0_24px_80px_rgba(0,0,0,.35)]"
          style={{ width: viewport.width, height: viewport.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          {loading || !url ? (
            <div className="grid h-full place-items-center bg-[#f2f0eb] text-sm text-black/45">Loading the real portal...</div>
          ) : (
            <iframe
              ref={innerRef}
              key={`${frameKey}:${url}`}
              title={label ?? "Client portal draft preview"}
              src={url}
              onLoad={onLoad}
              className="block h-full w-full bg-white"
              style={resizeAxis ? { pointerEvents: "none" } : undefined}
            />
          )}
        </div>
        {draggable ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Drag to set the width"
              tabIndex={0}
              {...grip("x")}
              className="absolute inset-y-0 -right-2.5 w-1.5 cursor-ew-resize rounded-full bg-white/10 transition hover:bg-cyan-300/40 focus:bg-cyan-300/50 focus:outline-none"
              style={{ touchAction: "none" }}
            />
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Drag to set the height"
              tabIndex={0}
              {...grip("y")}
              className="absolute inset-x-0 -bottom-2.5 h-1.5 cursor-ns-resize rounded-full bg-white/10 transition hover:bg-cyan-300/40 focus:bg-cyan-300/50 focus:outline-none"
              style={{ touchAction: "none" }}
            />
            <div
              role="separator"
              aria-label="Drag to set the size"
              tabIndex={0}
              {...grip("both")}
              className="absolute -bottom-2.5 -right-2.5 size-3 cursor-nwse-resize rounded-[3px] bg-white/20 transition hover:bg-cyan-300/60 focus:bg-cyan-300/70 focus:outline-none"
              style={{ touchAction: "none" }}
            />
            {resizeAxis ? (
              /* Live W×H readout — TRUE device pixels, tracking the drag. */
              <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/90">
                {viewport.width} × {viewport.height}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Whether the tag on the page has answered.
 *
 * Four states rather than a boolean because they need four different reactions:
 * nothing pointed at yet, waiting, talking, and "that page has no tag on it" —
 * which is the common one and is not an error.
 */
function TagBridgeBadge({ state }: { state: TagBridgeState }) {
  if (state === "idle") return null;
  const text = state === "connected" ? "Tag connected"
    : state === "checking" ? "Checking for the tag…"
      : "No tag on this page";
  const tone = state === "connected" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200/90"
    : state === "checking" ? "border-white/12 bg-white/[0.05] text-white/50"
      : "border-amber-300/25 bg-amber-300/[0.08] text-amber-200/80";
  return (
    <span
      title={state === "unavailable"
        ? "The page loaded but nothing answered the Aqua Tag handshake. Clicking it cannot select anything until the tag is installed there."
        : undefined}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${tone}`}
    >
      {state === "checking" ? <LoaderCircle size={10} className="animate-spin" aria-hidden /> : null}
      {text}
    </span>
  );
}

/** Everything the element panel needs, bundled so the Inspector's call sites stay readable. */
interface TagPanelProps {
  element: AquaTagElement | null;
  bridge: TagBridgeState;
  selecting: boolean;
  onSelectingChange: (value: boolean) => void;
  /** The exact words, as being edited. Separate from `element.text`, which is what the page currently has. */
  words: string;
  onWordsChange: (value: string) => void;
  onStyleChange: (property: AquaTagStyleProperty, value: string) => void;
  onImageChange: (patch: { src?: string; alt?: string }) => void;
  onReset: () => void;
  /** Where this depth sends a selection, and what it offers once it arrives. */
  route: SelectionRoute;
  /** The same-origin source lookup, when one resolved. */
  sourceFocus: { path: string; line?: number } | null;
  /** The open project. Empty when none is selected — then nothing can be saved. */
  projectId: string;
  /** `owner/repo`, or empty for a project reading the local working tree. */
  repository: string;
  /** An Aqua-hosted portal saves through its own document, not through this path. */
  portalTarget: boolean;
  /** The words as the page had them at selection — the needle, held still while typing. */
  originalWords: string;
}

const STYLE_LABELS: Record<AquaTagStyleProperty, string> = {
  color: "Text colour",
  backgroundColor: "Background",
  fontSize: "Font size",
  fontWeight: "Font weight",
  textAlign: "Alignment",
};

/**
 * The right menu Ed has been asking for.
 *
 * "i get a browser and the right menu when i click on an item aqua tag knows
 *  the exact item since its mapped everything then i get the exact text i can
 *  change it on the right menu for just the words"
 *
 * One panel, filled by the one selection mechanism. What it OFFERS varies by
 * depth (read-only at "Just tell it", where the selection is described to the
 * assistant; the words and the styling in the visual builder — the merged
 * "Just the words"; both plus the source at Dev) — but the click that fills it
 * is always the same click.
 */
function TagElementInspector({
  element, bridge, selecting, onSelectingChange, words, onWordsChange,
  onStyleChange, onImageChange, onReset, route, sourceFocus,
  projectId, repository, portalTarget, originalWords,
}: TagPanelProps) {
  if (!element) {
    return (
      <div className="grid gap-3">
        <InspectorHeading
          eyebrow="Selection"
          title="Click something on the page"
          body="The Aqua Tag has mapped the page, so a click resolves to the exact item — and what you clicked appears here."
        />
        {bridge === "unavailable" ? (
          <p className="rounded-md border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2.5 text-[11px] leading-5 text-amber-100/80">
            Nothing answered on that page, so clicking it cannot select anything.
            Install the Aqua Tag there, then press Map in Settings.
          </p>
        ) : null}
        {bridge === "connected" ? (
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3">
            <span className="text-[11px] font-semibold text-white/70">Selecting on the page</span>
            <input type="checkbox" checked={selecting} onChange={event => onSelectingChange(event.target.checked)} className="size-4 accent-cyan-300" />
          </label>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/65">Selected</p>
        <h2 className="mt-1 break-words text-base font-semibold text-white/88">{element.label}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-white/35">
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-cyan-200/70">&lt;{element.tagName}&gt;</code>
          <span>{element.kind === "image" ? "Image" : "Text"}</span>
        </p>
        <p className="mt-2 text-[11px] leading-5 text-white/38">{route.reason}</p>
      </div>

      {element.kind === "image" ? (
        <div className="grid gap-3 border-t border-white/10 pt-4">
          <Field label="Image source" value={element.src ?? ""} disabled={false} onChange={value => onImageChange({ src: value })} />
          <Field label="Alt text" value={element.alt ?? ""} disabled={false} onChange={value => onImageChange({ alt: value })} />
        </div>
      ) : route.editWords ? (
        <div className="grid gap-2 border-t border-white/10 pt-4">
          {/* THE thing. The exact text of the exact item, editable, and the
              edit lands on the page as you type. */}
          <label className="grid gap-2 text-[11px] font-semibold text-white/58">
            <span>The words</span>
            <textarea
              rows={5}
              value={words}
              spellCheck
              onChange={event => onWordsChange(event.target.value)}
              className="w-full resize-y rounded-md border border-white/10 bg-white/[0.045] px-3 py-2 text-xs leading-5 text-white/85 outline-none focus:border-cyan-300/45"
            />
          </label>
          <WordsSourceSave
            projectId={projectId}
            repository={repository}
            portalTarget={portalTarget}
            originalWords={originalWords}
            newWords={words}
          />
        </div>
      ) : (
        <div className="grid gap-2 border-t border-white/10 pt-4">
          <p className="text-[11px] font-semibold text-white/58">The words</p>
          <p className="whitespace-pre-wrap break-words rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/70">{element.text || "—"}</p>
          <p className="text-[10px] leading-4 text-white/32">Read-only at this depth — this selection went to the assistant. Switch to &ldquo;Visual builder&rdquo; to edit it here.</p>
        </div>
      )}

      {route.editStyles ? (
        <div className="grid gap-2 border-t border-white/10 pt-4">
          <p className="text-[11px] font-semibold text-white/58">Styling</p>
          {/* Driven off the protocol's own list, so a property the tag learns to
              carry cannot go missing here. */}
          {AQUA_TAG_STYLE_PROPERTIES.map(property => (
            <Field
              key={property}
              label={STYLE_LABELS[property]}
              value={element.styles[property] ?? ""}
              disabled={false}
              onChange={value => onStyleChange(property, value)}
            />
          ))}
        </div>
      ) : null}

      {route.revealSource ? (
        <div className="grid gap-2 border-t border-white/10 pt-4">
          <p className="text-[11px] font-semibold text-white/58">Where it came from</p>
          {sourceFocus ? (
            <p className="font-mono text-[11px] text-cyan-200/70">{sourceFocus.path}{sourceFocus.line ? `:${sourceFocus.line}` : ""}</p>
          ) : (
            // Honest rather than blank. `elementSource.ts` reads React's own
            // debug fibers out of the previewed DOCUMENT, which a browser will
            // not hand across an origin — so on a tagged external site there is
            // no element→file answer to give, and pretending otherwise would
            // send somebody looking for a file that was never named.
            <p className="text-[10px] leading-4 text-white/32">
              No file recorded. Element-to-source reads React&rsquo;s debug data inside the page, which is only readable when the preview is on this app&rsquo;s own origin — so it works on an Aqua-hosted portal and not on an external tagged site. Use Repo to search the source.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/12 px-3 text-[11px] font-semibold text-white/70 hover:bg-white/5"
        >
          <RotateCcw size={13} aria-hidden /> Undo preview changes
        </button>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-white/12 px-3 text-[11px] font-semibold text-white/70">
          <input type="checkbox" checked={selecting} onChange={event => onSelectingChange(event.target.checked)} className="size-3.5 accent-cyan-300" />
          Keep selecting
        </label>
      </div>

      {/* Said plainly, because the alternative is somebody editing a client's
          copy for an hour and losing it on refresh. The WORDS can now be saved
          — see the panel above — and nothing else here can, so this says
          exactly that rather than one blanket sentence covering both. */}
      <p className="rounded-md border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[10px] leading-4 text-amber-100/70">
        {element.kind === "image"
          ? "Changes to the image are live in the browser above and are lost when the page reloads. Saving an image back to the repository is not built yet."
          : "Styling changes are live in the browser above and are lost when the page reloads — only the words can be saved back to the repository so far."}
      </p>
    </div>
  );
}

/**
 * Saving the words back to the source, and committing them.
 *
 * The other half of "i get the exact text i can change it on the right menu".
 * The textarea above changes the LOADED page through the tag and that change
 * dies on reload; this is what makes it survive.
 *
 * ── Two presses, because the first one is a guess ───────────────────────────
 *
 * A tag selection carries no file and no line (`sourceMatch.ts` explains why),
 * so the only way back to the source is to search it for the words. That
 * search can land on more than one line, and it can land on the wrong one. So
 * the flow is Ed's own rule for anything that matches one thing to another:
 * GUESS, then a human CONFIRMS.
 *
 *   1. Find it   — the server reads the repository and lists every line those
 *                  words are on, with the line itself shown.
 *   2. Pick one  — a dry run comes back with the exact before and after.
 *   3. Save it   — that, and only that, commits.
 *
 * Nothing is written before step 3, and step 2 shows the literal line that
 * would change rather than a summary of it — approving a description and
 * getting something else is the accident this shape exists to prevent.
 */
interface FoundCandidate {
  file: string;
  line: number;
  column: number;
  lineText: string;
  expectedHash: string;
  start: number;
  end: number;
  occurrences: number;
  kind: "literal" | "dynamic";
}

interface FoundWords {
  commitSha: string;
  candidates: FoundCandidate[];
  scanned: number;
  skipped: Array<{ file: string; reason: string }>;
  cappedAt?: number;
}

interface SavedWords {
  published: boolean;
  summary: string;
  branch: string;
  commitSha?: string;
  pullRequestUrl?: string;
}

function WordsSourceSave({ projectId, repository, portalTarget, originalWords, newWords }: {
  projectId: string;
  repository: string;
  portalTarget: boolean;
  originalWords: string;
  newWords: string;
}) {
  const [busy, setBusy] = useState<"" | "find" | "preview" | "save">("");
  const [found, setFound] = useState<FoundWords | null>(null);
  const [chosen, setChosen] = useState<FoundCandidate | null>(null);
  const [preview, setPreview] = useState<{ before: string; after: string } | null>(null);
  const [saved, setSaved] = useState<SavedWords | null>(null);
  const [problem, setProblem] = useState("");

  // A new selection, or a new project, is a new search. Reset rather than
  // leave the previous element's candidates on screen next to these words —
  // that is exactly how somebody commits an edit to the wrong line.
  useEffect(() => {
    setFound(null); setChosen(null); setPreview(null); setSaved(null); setProblem(""); setBusy("");
  }, [originalWords, projectId]);

  const changed = newWords !== originalWords;

  // Said before anything is attempted, because "why is the button off" is a
  // worse question than a sentence explaining it.
  const blocker = portalTarget
    ? "This is an Aqua-hosted portal, so its words are saved with the page itself rather than committed to a repository."
    : !projectId
      ? "No project is selected, so there is no repository to save to."
      : !repository
        ? "This project has no repository. Give it one in Settings, or edit the file directly in Dev mode."
        : !originalWords.trim()
          ? "There are no original words to find in the source."
          : "";

  async function call(payload: Record<string, unknown>) {
    const response = await fetch("/api/portal/dev/source-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: projectId, ...payload }),
    });
    return await response.json().catch(() => ({ ok: false, error: "That could not be read." }));
  }

  async function findIt() {
    setBusy("find"); setProblem(""); setFound(null); setChosen(null); setPreview(null); setSaved(null);
    try {
      const payload = await call({ action: "find", text: originalWords });
      if (!payload.ok) { setProblem(payload.error ?? "Those words could not be looked for."); return; }
      if (!payload.candidates?.length) { setProblem(payload.detail ?? "Those words are not in the source."); return; }
      setFound({
        commitSha: payload.commitSha,
        candidates: payload.candidates,
        scanned: payload.scanned ?? 0,
        skipped: payload.skipped ?? [],
        cappedAt: payload.cappedAt,
      });
    } catch {
      setProblem("Those words could not be looked for.");
    } finally {
      setBusy("");
    }
  }

  /** The dry run. `confirm` is absent, so `publishEdits` cannot write. */
  async function choose(candidate: FoundCandidate) {
    if (!found) return;
    setChosen(candidate); setPreview(null); setProblem(""); setBusy("preview");
    try {
      const payload = await call({
        action: "publish",
        file: candidate.file,
        line: candidate.line,
        expectedHash: candidate.expectedHash,
        commitSha: found.commitSha,
        originalText: originalWords,
        newText: newWords,
      });
      if (!payload.ok) { setProblem(payload.error ?? "That line could not be prepared."); return; }
      if (payload.refusal) { setProblem(payload.refusal.detail); return; }
      const file = payload.outcome?.files?.[0];
      if (!file) {
        setProblem(payload.outcome?.rejected?.[0]?.rejection?.detail ?? payload.outcome?.summary ?? "That edit could not be applied.");
        return;
      }
      setPreview({ before: file.before, after: file.after });
    } catch {
      setProblem("That line could not be prepared.");
    } finally {
      setBusy("");
    }
  }

  /** The one call that writes. `confirm: true` literally, never a coerced value. */
  async function saveIt() {
    if (!found || !chosen) return;
    setBusy("save"); setProblem("");
    try {
      const payload = await call({
        action: "publish",
        file: chosen.file,
        line: chosen.line,
        expectedHash: chosen.expectedHash,
        commitSha: found.commitSha,
        originalText: originalWords,
        newText: newWords,
        confirm: true,
      });
      if (!payload.ok) { setProblem(payload.error ?? "That could not be saved."); return; }
      if (payload.refusal) { setProblem(payload.refusal.detail); return; }
      if (!payload.outcome?.published) {
        setProblem(payload.outcome?.rejected?.[0]?.rejection?.detail ?? payload.outcome?.summary ?? "Nothing was saved.");
        return;
      }
      setSaved({
        published: true,
        summary: payload.outcome.summary,
        branch: payload.branch,
        commitSha: payload.outcome.commitSha,
        pullRequestUrl: payload.pullRequest?.url,
      });
    } catch {
      setProblem("That could not be saved.");
    } finally {
      setBusy("");
    }
  }

  if (blocker) {
    return (
      <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-4 text-white/40">
        <span className="font-semibold text-white/55">Not saved.</span> {blocker} The change above is live in the browser only and goes when the page reloads.
      </p>
    );
  }

  if (saved) {
    return (
      <div className="grid gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/[0.07] px-3 py-2.5 text-[10px] leading-4 text-emerald-100/85">
        <p className="text-[11px] font-semibold text-emerald-200/90">Committed to {repository}</p>
        <p>{saved.summary}</p>
        <p className="font-mono text-emerald-200/60">{saved.branch}{saved.commitSha ? ` · ${saved.commitSha.slice(0, 7)}` : ""}</p>
        {saved.pullRequestUrl ? (
          <a href={saved.pullRequestUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-200 underline underline-offset-2">
            Open the pull request
          </a>
        ) : null}
        <p className="text-emerald-100/50">
          It is on a branch, not on {"main"} — so it is in git and reviewable, and it is not live until that pull request is merged.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-white/[0.025] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/60">Save it for real</p>
        <button
          type="button"
          onClick={findIt}
          disabled={!changed || busy !== ""}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/15 disabled:opacity-40"
        >
          {busy === "find" ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : null}
          {found ? "Look again" : "Find it in the source"}
        </button>
      </div>

      {!changed ? (
        <p className="text-[10px] leading-4 text-white/35">Change the words above first. Until they are saved, the edit lives in the loaded page only.</p>
      ) : !found ? (
        <p className="text-[10px] leading-4 text-white/35">
          The tag knows the exact element but not which file wrote it, so the repository is searched for these words. You pick the line; nothing is committed until you press save.
        </p>
      ) : null}

      {problem ? (
        <p className="rounded-md border border-amber-300/25 bg-amber-300/[0.07] px-2.5 py-2 text-[10px] leading-4 text-amber-100/80">{problem}</p>
      ) : null}

      {found ? (
        <div className="grid gap-1.5">
          <p className="text-[10px] leading-4 text-white/40">
            {found.candidates.length === 1 ? "One line matches" : `${found.candidates.length} lines match`} across {found.scanned} file{found.scanned === 1 ? "" : "s"}. Pick the one you clicked.
          </p>
          {found.candidates.map(candidate => {
            const active = chosen?.file === candidate.file && chosen?.line === candidate.line;
            return (
              <button
                key={`${candidate.file}:${candidate.line}`}
                type="button"
                aria-pressed={active}
                onClick={() => void choose(candidate)}
                disabled={busy !== ""}
                className={`grid gap-1 rounded-md border px-2.5 py-2 text-left disabled:opacity-50 ${active ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}
              >
                <span className="font-mono text-[10px] text-cyan-200/70">{candidate.file}:{candidate.line}</span>
                <span className="truncate font-mono text-[10px] text-white/45">{candidate.lineText.trim() || "—"}</span>
                {candidate.kind === "dynamic" ? (
                  <span className="text-[9px] leading-3 text-amber-200/70">
                    This line builds its text from code, so the words on the page may not be the words in the file — the edit can appear to work and come back on the next render.
                  </span>
                ) : null}
                {candidate.occurrences > 1 ? (
                  <span className="text-[9px] leading-3 text-amber-200/70">Those words appear {candidate.occurrences} times on this one line, so this one cannot be saved.</span>
                ) : null}
              </button>
            );
          })}
          {found.cappedAt ? (
            <p className="text-[9px] leading-3 text-white/30">Only the first {found.cappedAt} files were read, so a match further in would not be listed.</p>
          ) : null}
          {found.skipped.length ? (
            <p className="text-[9px] leading-3 text-white/30">{found.skipped.length} file{found.skipped.length === 1 ? "" : "s"} could not be read and {found.skipped.length === 1 ? "was" : "were"} not searched.</p>
          ) : null}
        </div>
      ) : null}

      {busy === "preview" ? (
        <p className="text-[10px] leading-4 text-white/35">Reading that line…</p>
      ) : null}

      {preview ? (
        <div className="grid gap-1.5 border-t border-white/10 pt-2">
          <p className="text-[10px] font-semibold text-white/55">Exactly this will change</p>
          <p className="overflow-x-auto whitespace-pre rounded-sm bg-rose-400/[0.07] px-2 py-1 font-mono text-[10px] text-rose-200/70">- {preview.before}</p>
          <p className="overflow-x-auto whitespace-pre rounded-sm bg-emerald-400/[0.07] px-2 py-1 font-mono text-[10px] text-emerald-200/75">+ {preview.after}</p>
          <button
            type="button"
            onClick={() => void saveIt()}
            disabled={busy !== ""}
            className="mt-1 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-white px-3 text-[11px] font-semibold text-black hover:bg-white/90 disabled:opacity-50"
          >
            {busy === "save" ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : null}
            Save it to {repository}
          </button>
          <p className="text-[9px] leading-3 text-white/30">
            Commits to a branch and opens a pull request. It is in git straight away and it is not live until that pull request is merged.
          </p>
        </div>
      ) : null}
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
