"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check as CheckIcon,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitBranch,
  Globe2,
  Image as ImageIcon,
  Laptop,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorPlay,
  MousePointer2,
  RadioTower,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  Type,
  Undo2,
  Wifi,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEVICE_PRESETS,
  effectiveViewport,
  getDevicePreset,
  loadDeviceState,
  saveDeviceState,
  type DeviceCategory,
  type DeviceState,
} from "@/built-ins/modules/website-editor/src/lib/devicePresets";
import {
  AQUA_EXPLORER_MESSAGES,
  AQUA_EXPLORER_PROTOCOL_VERSION,
  explorerTargetOrigin,
  isAquaExplorerDiagnosticsMessage,
  isAquaExplorerReadyMessage,
  isAquaExplorerSelectedMessage,
  type AquaExplorerCapabilities,
  type AquaExplorerDiagnostics,
  type AquaExplorerElement,
  type AquaExplorerPatch,
} from "@/lib/aquaExplorerBridge";
import type { FirstPartyDevelopmentProject } from "@/lib/firstPartyDevelopmentProjects";

type WorkspaceMode = "preview" | "explorer" | "dev";
type EnvironmentMode = "preview" | "public";
type BridgeState = "checking" | "connected" | "unavailable";

const DEFAULT_DEVICE_STATE: DeviceState = {
  deviceId: "responsive",
  rotated: false,
  zoom: 0.75,
  showChrome: false,
  customWidth: 1280,
  customHeight: 800,
};

const ZOOM_STEPS = [0.35, 0.5, 0.65, 0.75, 1, 1.25];

export function FirstPartyProjectWorkspace({
  project,
  githubWriteConfigured,
}: {
  project: FirstPartyDevelopmentProject;
  githubWriteConfigured: boolean;
}) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("preview");
  const [environment, setEnvironment] = useState<EnvironmentMode>("preview");
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [deviceState, setDeviceState] = useState<DeviceState>(DEFAULT_DEVICE_STATE);
  const [deviceReady, setDeviceReady] = useState(false);
  const [bridgeState, setBridgeState] = useState<BridgeState>("checking");
  const [capabilities, setCapabilities] = useState<AquaExplorerCapabilities | null>(null);
  const [diagnostics, setDiagnostics] = useState<AquaExplorerDiagnostics | null>(null);
  const [selectedElement, setSelectedElement] = useState<AquaExplorerElement | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const explorerRef = useRef<HTMLElement | null>(null);
  const loadStartedAt = useRef(0);
  const bridgeRequestId = useRef("");
  const inspectRequestId = useRef("");
  const bridgeTimeout = useRef<number | null>(null);

  const frameUrl = environment === "preview" ? project.previewUrl : project.publicUrl;
  const activePreset = getDevicePreset(deviceState.deviceId) ?? DEVICE_PRESETS[0]!;
  const viewport = effectiveViewport(activePreset, deviceState);
  const scaledViewport = {
    width: Math.round(viewport.width * deviceState.zoom),
    height: Math.round(viewport.height * deviceState.zoom),
  };
  const tagSnippet = project.telemetrySiteKey && project.telemetryPropertyId
    ? `<script src="https://aqua-crm.com/aqua-tag.js" data-site-key="${project.telemetrySiteKey}" data-property="${project.telemetryPropertyId}" defer></script>`
    : "";

  const groupedPresets = useMemo(() => {
    const order: DeviceCategory[] = ["responsive", "phone", "tablet", "laptop", "desktop"];
    return order.map(category => ({
      category,
      devices: DEVICE_PRESETS.filter(device => device.category === category),
    }));
  }, []);

  useEffect(() => {
    setDeviceState({ ...DEFAULT_DEVICE_STATE, ...loadDeviceState() });
    setDeviceReady(true);
  }, []);

  useEffect(() => {
    if (deviceReady) saveDeviceState(deviceState);
  }, [deviceReady, deviceState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (isAquaExplorerReadyMessage(event.data) && event.data.requestId === bridgeRequestId.current) {
        if (bridgeTimeout.current) window.clearTimeout(bridgeTimeout.current);
        setBridgeState("connected");
        setCapabilities(event.data.capabilities);
        requestDiagnostics(event.origin);
        return;
      }
      if (isAquaExplorerDiagnosticsMessage(event.data) && event.data.requestId === inspectRequestId.current) {
        setDiagnostics(event.data.diagnostics);
        return;
      }
      if (isAquaExplorerSelectedMessage(event.data)) {
        setSelectedElement(event.data.element);
      }
    };
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === explorerRef.current);
    window.addEventListener("message", onMessage);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (bridgeTimeout.current) window.clearTimeout(bridgeTimeout.current);
    };
  }, []);

  useEffect(() => {
    loadStartedAt.current = performance.now();
    setLoadMs(null);
    setDiagnostics(null);
    setCapabilities(null);
    setSelectedElement(null);
    setBridgeState("checking");
  }, [frameUrl, previewKey]);

  useEffect(() => {
    if (bridgeState !== "connected") return;
    sendExplorerMessage(workspaceMode === "explorer" ? AQUA_EXPLORER_MESSAGES.enable : AQUA_EXPLORER_MESSAGES.disable);
  }, [bridgeState, workspaceMode, frameUrl]);

  async function copyTag() {
    if (!tagSnippet) return;
    await navigator.clipboard.writeText(tagSnippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function onFrameLoad() {
    setLoadMs(Math.max(0, Math.round(performance.now() - loadStartedAt.current)));
    pingBridge();
  }

  function pingBridge() {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    const requestId = crypto.randomUUID();
    bridgeRequestId.current = requestId;
    setBridgeState("checking");
    target.postMessage({
      type: AQUA_EXPLORER_MESSAGES.ping,
      version: AQUA_EXPLORER_PROTOCOL_VERSION,
      requestId,
    }, explorerTargetOrigin(frameUrl));
    if (bridgeTimeout.current) window.clearTimeout(bridgeTimeout.current);
    bridgeTimeout.current = window.setTimeout(() => {
      if (bridgeRequestId.current === requestId) setBridgeState("unavailable");
    }, 1_500);
  }

  function requestDiagnostics(origin?: string) {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    const requestId = crypto.randomUUID();
    inspectRequestId.current = requestId;
    target.postMessage({
      type: AQUA_EXPLORER_MESSAGES.inspect,
      version: AQUA_EXPLORER_PROTOCOL_VERSION,
      requestId,
    }, origin && origin !== "null" ? origin : explorerTargetOrigin(frameUrl));
  }

  function sendExplorerMessage(type: string, payload: Record<string, unknown> = {}) {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage({
      type,
      version: AQUA_EXPLORER_PROTOCOL_VERSION,
      ...payload,
    }, explorerTargetOrigin(frameUrl));
  }

  function applyPreviewPatch(elementId: string, patch: AquaExplorerPatch) {
    sendExplorerMessage(AQUA_EXPLORER_MESSAGES.patch, { elementId, patch });
  }

  function resetPreviewPatches() {
    sendExplorerMessage(AQUA_EXPLORER_MESSAGES.reset);
  }

  function refreshPreview() {
    loadStartedAt.current = performance.now();
    setPreviewKey(value => value + 1);
  }

  function updateDevice(patch: Partial<DeviceState>) {
    setDeviceState(current => ({ ...current, ...patch }));
  }

  function changeZoom(direction: -1 | 1) {
    const currentIndex = ZOOM_STEPS.indexOf(deviceState.zoom);
    const fallbackIndex = ZOOM_STEPS.findIndex(step => step >= deviceState.zoom);
    const index = currentIndex >= 0 ? currentIndex : Math.max(0, fallbackIndex);
    const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + direction));
    updateDevice({ zoom: ZOOM_STEPS[next] });
  }

  async function toggleFullscreen() {
    if (!explorerRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await explorerRef.current.requestFullscreen();
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <Link href="/portal/agency/development" className="inline-flex items-center gap-1.5 text-xs font-medium text-black/45 hover:text-black/75">
            <ArrowLeft size={13} />Development control centre
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Project Explorer</p>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-[10px] font-semibold uppercase text-brand">{project.brand}</span>
            <span className="rounded-full bg-black/[0.05] px-2 py-1 text-[10px] font-semibold uppercase text-black/45">{statusLabel(project.status)}</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">{project.name}</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">{project.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={frameUrl} target="_blank" rel="noreferrer" className={secondary}><MonitorPlay size={15} />Open build</a>
          <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className={primary}><GitBranch size={15} />Repository</a>
        </div>
      </header>

      <section className="grid border-y border-black/10 sm:grid-cols-3">
        <Summary icon={<ShieldCheck size={16} />} label="Release" value={statusLabel(project.status)} />
        <Summary icon={<FolderGit2 size={16} />} label="Project" value={project.folder} />
        <Summary icon={<FileCode2 size={16} />} label="Source" value={project.sourcePath} />
      </section>

      <section ref={explorerRef} aria-label="Project Explorer" className="overflow-hidden border border-black/15 bg-[#151716] shadow-sm fullscreen:h-screen fullscreen:w-screen">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#111312] px-3 py-2.5 text-white">
          <div className="inline-flex min-h-10 items-center rounded-md border border-white/10 bg-white/[0.04] p-1">
            <ModeButton active={workspaceMode === "preview"} icon={<Monitor size={14} />} label="Preview" onClick={() => setWorkspaceMode("preview")} />
            <ModeButton active={workspaceMode === "explorer"} icon={<MousePointer2 size={14} />} label="Explorer" onClick={() => setWorkspaceMode("explorer")} />
            <ModeButton active={workspaceMode === "dev"} icon={<Code2 size={14} />} label="Dev" onClick={() => setWorkspaceMode("dev")} />
          </div>

          <div className="inline-flex min-h-10 items-center rounded-md border border-white/10 bg-white/[0.04] p-1">
            <ToolbarTextButton active={environment === "preview"} label="Local" onClick={() => setEnvironment("preview")} />
            <ToolbarTextButton active={environment === "public"} label="Live" onClick={() => setEnvironment("public")} />
          </div>

          <div className="min-w-[180px] flex-1 md:max-w-[330px]">
            <label className="sr-only" htmlFor="explorer-device">Preview device</label>
            <select id="explorer-device" value={deviceState.deviceId} onChange={event => updateDevice({ deviceId: event.target.value })} className={darkSelect}>
              {groupedPresets.map(group => (
                <optgroup key={group.category} label={deviceCategoryLabel(group.category)}>
                  {group.devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-white/65">
            {activePreset.id === "responsive" ? (
              <>
                <ViewportInput label="Width" value={viewport.width} onChange={value => updateDevice({ customWidth: value })} />
                <span aria-hidden className="text-white/25">x</span>
                <ViewportInput label="Height" value={viewport.height} onChange={value => updateDevice({ customHeight: value })} />
              </>
            ) : <span className="min-w-[76px] text-center font-mono text-[11px]">{viewport.width} x {viewport.height}</span>}
            {activePreset.id !== "responsive" ? (
              <IconButton label="Rotate preview" onClick={() => updateDevice({ rotated: !deviceState.rotated })}><RotateCw size={14} /></IconButton>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Zoom out" onClick={() => changeZoom(-1)}><ZoomOut size={14} /></IconButton>
            <label className="sr-only" htmlFor="explorer-zoom">Preview zoom</label>
            <select id="explorer-zoom" value={deviceState.zoom} onChange={event => updateDevice({ zoom: Number(event.target.value) })} className="h-9 rounded-md border border-white/10 bg-white/[0.05] px-2 text-[11px] font-medium text-white outline-none">
              {ZOOM_STEPS.map(step => <option key={step} value={step}>{Math.round(step * 100)}%</option>)}
            </select>
            <IconButton label="Zoom in" onClick={() => changeZoom(1)}><ZoomIn size={14} /></IconButton>
            <IconButton label="Refresh preview" onClick={refreshPreview}><RefreshCw size={14} /></IconButton>
            <IconButton label={isFullscreen ? "Exit full screen" : "Enter full screen"} onClick={() => void toggleFullscreen()}>{isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconButton>
            <a href={frameUrl} target="_blank" rel="noreferrer" aria-label="Open preview in a new tab" title="Open in new tab" className={darkIconButton}><ExternalLink size={14} /></a>
          </div>
        </header>

        <div className="flex min-h-[720px] flex-col xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col bg-[#d9d9d5]">
            <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 border-b border-black/10 bg-[#f4f3ef] px-3 py-2 text-[11px] text-black/50">
              <span className="inline-flex items-center gap-1.5 font-semibold text-black/65">{deviceIcon(activePreset.category)}{activePreset.name}</span>
              <span>{viewport.width} x {viewport.height}</span>
              <span>{Math.round(deviceState.zoom * 100)}%</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px]">{frameUrl}</span>
              <BridgeBadge state={bridgeState} />
            </div>

            <div className="h-[670px] overflow-auto p-4 sm:p-7">
              <div className="mx-auto" style={{ width: scaledViewport.width, minWidth: scaledViewport.width, height: scaledViewport.height }}>
                <div className="relative overflow-hidden bg-white shadow-[0_18px_55px_rgba(0,0,0,0.18)]" style={{ width: viewport.width, height: viewport.height, transform: `scale(${deviceState.zoom})`, transformOrigin: "top left" }}>
                  <iframe
                    ref={iframeRef}
                    key={`${environment}:${previewKey}`}
                    src={frameUrl}
                    title={`${project.name} ${environment === "preview" ? "local build" : "public site"}`}
                    onLoad={onFrameLoad}
                    className="h-full w-full border-0 bg-white"
                  />
                  {workspaceMode === "explorer" && bridgeState !== "connected" ? (
                    <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-amber-300/40 bg-amber-50/95 px-3 py-2 text-center text-[11px] font-medium text-amber-900 shadow-sm">
                      Explorer is read-only until this build answers through the Aqua tag bridge.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <footer className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2 border-t border-black/10 bg-[#f4f3ef] px-3 py-2 text-[11px] text-black/48">
              <span>Frame load <strong className="font-semibold text-black/70">{loadMs === null ? "Waiting" : `${loadMs} ms`}</strong></span>
              <span>Environment <strong className="font-semibold text-black/70">{environment === "preview" ? "Local" : "Live"}</strong></span>
              <span>Network <strong className="font-semibold text-black/70">{diagnostics?.connection?.effectiveType ?? "Native"}</strong></span>
              {diagnostics?.performance.firstContentfulPaintMs !== undefined ? <span>FCP <strong className="font-semibold text-black/70">{diagnostics.performance.firstContentfulPaintMs} ms</strong></span> : null}
            </footer>
          </div>

          {workspaceMode !== "preview" ? (
            <ExplorerInspector
              mode={workspaceMode}
              bridgeState={bridgeState}
              capabilities={capabilities}
              diagnostics={diagnostics}
              selectedElement={selectedElement}
              project={project}
              githubWriteConfigured={githubWriteConfigured}
              onInspect={() => requestDiagnostics()}
              onApplyPatch={applyPreviewPatch}
              onResetPatches={resetPreviewPatches}
            />
          ) : null}
        </div>
      </section>

      <section className="border-y border-black/10 py-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <Connection
            icon={<RadioTower size={17} />}
            label="Aqua tag"
            state={tagSnippet ? "Installed" : "Not required"}
            detail={tagSnippet
              ? "Telemetry is consent-aware. Explorer uses the same tag for diagnostics and temporary in-browser design drafts without collecting form values."
              : "This internal project does not need a browser monitoring tag."}
          >
            {tagSnippet ? (
              <div className="mt-3 flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-black/[0.045] px-2 py-2 text-[10px] text-black/55">{tagSnippet}</code>
                <button type="button" onClick={() => void copyTag()} aria-label="Copy Aqua tag" title="Copy Aqua tag" className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/55 hover:bg-black/[0.04]">
                  {copied ? <CheckIcon size={14} /> : <Copy size={14} />}
                </button>
              </div>
            ) : null}
          </Connection>
          <Connection
            icon={<GitBranch size={17} />}
            label="Repository"
            state={githubWriteConfigured ? "Write connection ready" : project.repositoryUrl ? "Repository linked" : "Not connected"}
            detail={githubWriteConfigured
              ? "The server-side GitHub connection is ready. V0 keeps permanent writes locked until branch, diff and rollback safeguards land."
              : "Connect a fine-grained GitHub credential before enabling controlled source changes."}
          >
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Open repository <ExternalLink size={12} /></a>
              {!githubWriteConfigured ? <Link href="/portal/agency/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Connect write access <ExternalLink size={12} /></Link> : null}
            </div>
          </Connection>
          <Connection
            icon={<Globe2 size={17} />}
            label="Analytics services"
            state="Separate authorisation"
            detail="Search Console and provider data connect server-to-server. Visitor consent continues to control browser telemetry."
          >
            <Link href="/portal/agency/settings" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">Manage integrations <ExternalLink size={12} /></Link>
          </Connection>
        </div>
      </section>
    </div>
  );
}

function ExplorerInspector({
  mode,
  bridgeState,
  capabilities,
  diagnostics,
  selectedElement,
  project,
  githubWriteConfigured,
  onInspect,
  onApplyPatch,
  onResetPatches,
}: {
  mode: Exclude<WorkspaceMode, "preview">;
  bridgeState: BridgeState;
  capabilities: AquaExplorerCapabilities | null;
  diagnostics: AquaExplorerDiagnostics | null;
  selectedElement: AquaExplorerElement | null;
  project: FirstPartyDevelopmentProject;
  githubWriteConfigured: boolean;
  onInspect: () => void;
  onApplyPatch: (elementId: string, patch: AquaExplorerPatch) => void;
  onResetPatches: () => void;
}) {
  return (
    <aside className="w-full shrink-0 border-t border-white/10 bg-[#111312] text-white xl:w-[330px] xl:border-l xl:border-t-0">
      <header className="border-b border-white/10 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/80">{mode === "explorer" ? "Visual workspace" : "Developer diagnostics"}</p>
        <h2 className="mt-1 text-sm font-semibold">{mode === "explorer" ? "Explorer" : "Dev mode"}</h2>
        <p className="mt-1 text-xs leading-5 text-white/48">{mode === "explorer" ? "Inspect the live build and discover safe editable surfaces." : "See the project, runtime and repository state in one place."}</p>
      </header>

      <div className="space-y-5 p-4">
        <InspectorSection title="Runtime">
          <InspectorRow label="Aqua bridge" value={bridgeLabel(bridgeState)} tone={bridgeState === "connected" ? "good" : bridgeState === "unavailable" ? "warn" : "muted"} />
          <InspectorRow label="Route" value={diagnostics?.path ?? "Waiting for bridge"} />
          <InspectorRow label="Page state" value={diagnostics?.readyState ?? "Unknown"} />
          <button type="button" onClick={onInspect} disabled={bridgeState !== "connected"} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/75 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-35">
            <RefreshCw size={13} />Refresh diagnostics
          </button>
        </InspectorSection>

        {mode === "explorer" ? (
          <>
            <InspectorSection title="Editable surface">
              <InspectorRow label="Detected elements" value={String(diagnostics?.counts.editableElements ?? capabilities?.editableElements ?? 0)} />
              <InspectorRow label="Visual editing" value={capabilities?.visualEditing ? "Preview draft ready" : "Unavailable"} tone={capabilities?.visualEditing ? "good" : "muted"} />
              <p className="mt-3 text-[11px] leading-5 text-white/42">Click text or an image in the preview. Changes stay inside this browser frame and never touch source files.</p>
            </InspectorSection>
            <SelectedElementEditor element={selectedElement} onApply={onApplyPatch} />
            <InspectorSection title="Preview draft">
              <button type="button" onClick={onResetPatches} disabled={bridgeState !== "connected"} className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/75 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-35">
                <Undo2 size={13} />Reset all preview changes
              </button>
              <p className="mt-2 text-[10px] leading-4 text-white/32">Source commits, approvals and rollback arrive with the authenticated repository layer.</p>
            </InspectorSection>
            <InspectorSection title="Page map">
              <InspectorRow label="Links" value={diagnostics ? String(diagnostics.counts.links) : "-"} />
              <InspectorRow label="Images" value={diagnostics ? String(diagnostics.counts.images) : "-"} />
              <InspectorRow label="Forms" value={diagnostics ? String(diagnostics.counts.forms) : "-"} />
            </InspectorSection>
          </>
        ) : (
          <>
            <InspectorSection title="Performance">
              <InspectorRow label="Response" value={metric(diagnostics?.performance.responseMs)} />
              <InspectorRow label="DOM ready" value={metric(diagnostics?.performance.domContentLoadedMs)} />
              <InspectorRow label="Page load" value={metric(diagnostics?.performance.loadMs)} />
              <InspectorRow label="FCP" value={metric(diagnostics?.performance.firstContentfulPaintMs)} />
              <InspectorRow label="Resources" value={diagnostics ? String(diagnostics.counts.resources) : "-"} />
            </InspectorSection>
            <InspectorSection title="Repository">
              <InspectorRow label="Connection" value={githubWriteConfigured ? "Ready" : "Read-only"} tone={githubWriteConfigured ? "good" : "warn"} />
              <InspectorRow label="Folder" value={project.folder} />
              <InspectorRow label="Default workflow" value="Branch and pull request" />
              <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-200 hover:underline">Open repository <ExternalLink size={12} /></a>
            </InspectorSection>
            <InspectorSection title="Recent browser errors">
              {diagnostics?.recentErrors.length ? diagnostics.recentErrors.map((error, index) => <p key={`${error}:${index}`} className="border-l-2 border-red-400/50 pl-2 text-[11px] leading-5 text-red-100/70">{error}</p>) : <p className="text-[11px] text-white/38">No errors reported by the bridge.</p>}
            </InspectorSection>
          </>
        )}
      </div>
    </aside>
  );
}

function SelectedElementEditor({
  element,
  onApply,
}: {
  element: AquaExplorerElement | null;
  onApply: (elementId: string, patch: AquaExplorerPatch) => void;
}) {
  const [text, setText] = useState("");
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [color, setColor] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [fontSize, setFontSize] = useState("");
  const [fontWeight, setFontWeight] = useState("");
  const [textAlign, setTextAlign] = useState("");

  useEffect(() => {
    setText(element?.text ?? "");
    setSrc(element?.src ?? "");
    setAlt(element?.alt ?? "");
    setColor(element?.styles.color ?? "");
    setBackgroundColor(element?.styles.backgroundColor ?? "");
    setFontSize(element?.styles.fontSize ?? "");
    setFontWeight(element?.styles.fontWeight ?? "");
    setTextAlign(element?.styles.textAlign ?? "");
  }, [element]);

  if (!element) {
    return (
      <InspectorSection title="Selection">
        <div className="border border-dashed border-white/15 bg-white/[0.025] px-3 py-4 text-center">
          <MousePointer2 className="mx-auto text-cyan-200/55" size={18} />
          <p className="mt-2 text-xs font-semibold text-white/65">Choose something on the page</p>
          <p className="mt-1 text-[10px] leading-4 text-white/35">Headings, paragraphs, links, buttons and images can be previewed.</p>
        </div>
      </InspectorSection>
    );
  }

  function applyDraft() {
    if (!element) return;
    onApply(element.id, {
      ...(element.kind === "image" ? { src, alt } : { text }),
      styles: { color, backgroundColor, fontSize, fontWeight, textAlign },
    });
  }

  return (
    <InspectorSection title="Selection">
      <div className="flex items-start gap-2 border-b border-white/10 pb-3">
        <span className="grid size-8 shrink-0 place-items-center rounded border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">{element.kind === "image" ? <ImageIcon size={14} /> : <Type size={14} />}</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white/75">{element.label}</p>
          <p className="mt-0.5 font-mono text-[9px] uppercase text-white/30">{element.tagName} · preview only</p>
        </div>
      </div>

      {element.kind === "image" ? (
        <>
          <InspectorField label="Image URL"><input value={src} onChange={event => setSrc(event.target.value)} className={inspectorInput} /></InspectorField>
          <InspectorField label="Alt text"><input value={alt} onChange={event => setAlt(event.target.value)} className={inspectorInput} /></InspectorField>
        </>
      ) : (
        <InspectorField label="Text"><textarea value={text} onChange={event => setText(event.target.value)} rows={4} className={`${inspectorInput} resize-y py-2`} /></InspectorField>
      )}

      <div className="grid grid-cols-2 gap-2">
        <InspectorField label="Text colour"><input value={color} onChange={event => setColor(event.target.value)} className={inspectorInput} /></InspectorField>
        <InspectorField label="Background"><input value={backgroundColor} onChange={event => setBackgroundColor(event.target.value)} className={inspectorInput} /></InspectorField>
        <InspectorField label="Font size"><input value={fontSize} onChange={event => setFontSize(event.target.value)} className={inspectorInput} /></InspectorField>
        <InspectorField label="Weight"><input value={fontWeight} onChange={event => setFontWeight(event.target.value)} className={inspectorInput} /></InspectorField>
      </div>
      <InspectorField label="Alignment">
        <select value={textAlign} onChange={event => setTextAlign(event.target.value)} className={inspectorInput}>
          <option value="start">Start</option>
          <option value="left">Left</option>
          <option value="center">Centre</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </InspectorField>
      <button type="button" onClick={applyDraft} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-3 text-xs font-semibold text-[#082f35] hover:bg-cyan-200">
        <MousePointer2 size={13} />Apply to preview
      </button>
    </InspectorSection>
  );
}

function InspectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[9px] font-semibold uppercase text-white/30">{label}</span>{children}</label>;
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${active ? "bg-white text-black shadow-sm" : "text-white/55 hover:text-white"}`}>{icon}{label}</button>;
}

function ToolbarTextButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`min-h-8 rounded px-2.5 text-xs font-semibold transition ${active ? "bg-white text-black shadow-sm" : "text-white/55 hover:text-white"}`}>{label}</button>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={darkIconButton}>{children}</button>;
}

function ViewportInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <input aria-label={label} title={label} type="number" min={240} max={4000} value={value} onChange={event => onChange(Math.min(4000, Math.max(240, Number(event.target.value) || 240)))} className="h-9 w-[66px] rounded-md border border-white/10 bg-white/[0.05] px-2 text-center font-mono text-[11px] text-white outline-none focus:border-cyan-300/40" />;
}

function BridgeBadge({ state }: { state: BridgeState }) {
  return <span className={`inline-flex items-center gap-1.5 font-semibold ${state === "connected" ? "text-emerald-700" : state === "unavailable" ? "text-amber-700" : "text-black/45"}`}><span className={`size-1.5 rounded-full ${state === "connected" ? "bg-emerald-500" : state === "unavailable" ? "bg-amber-500" : "animate-pulse bg-black/30"}`} />{bridgeLabel(state)}</span>;
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-white/10 pb-5 last:border-b-0 last:pb-0"><h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-white/35">{title}</h3><div className="space-y-2">{children}</div></section>;
}

function InspectorRow({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "good" | "warn" }) {
  const colour = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-200" : "text-white/68";
  return <div className="flex items-start justify-between gap-4 text-[11px]"><span className="text-white/35">{label}</span><span className={`max-w-[190px] break-words text-right font-medium ${colour}`}>{value}</span></div>;
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-center gap-3 border-b border-black/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-brand">{icon}</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 truncate text-sm font-semibold text-black/70">{value}</p></div></div>;
}

function Connection({ icon, label, state, detail, children }: { icon: React.ReactNode; label: string; state: string; detail: string; children?: React.ReactNode }) {
  return <div className="min-w-0 border-b border-black/10 pb-5 last:border-b-0 last:pb-0 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5 lg:last:border-r-0 lg:last:pr-0"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold text-black/80"><span className="text-brand">{icon}</span>{label}</span><span className="text-[10px] font-semibold uppercase text-black/40">{state}</span></div><p className="mt-2 text-xs leading-5 text-black/50">{detail}</p>{children}</div>;
}

function deviceIcon(category: DeviceCategory) {
  if (category === "phone") return <Smartphone size={13} />;
  if (category === "tablet") return <Tablet size={13} />;
  if (category === "laptop") return <Laptop size={13} />;
  if (category === "desktop") return <Monitor size={13} />;
  return <Wifi size={13} />;
}

function deviceCategoryLabel(category: DeviceCategory) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function statusLabel(status: FirstPartyDevelopmentProject["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function bridgeLabel(state: BridgeState) {
  if (state === "connected") return "Tag bridge connected";
  if (state === "unavailable") return "Tag bridge not detected";
  return "Checking tag bridge";
}

function metric(value?: number) {
  return value === undefined ? "-" : `${value} ms`;
}

const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-black/65 hover:bg-black/[0.03]";
const darkIconButton = "grid size-9 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.1] hover:text-white";
const darkSelect = "h-10 w-full rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-white outline-none focus:border-cyan-300/40";
const inspectorInput = "min-h-9 w-full rounded-md border border-white/10 bg-white/[0.05] px-2 text-[11px] text-white/75 outline-none focus:border-cyan-300/40";
