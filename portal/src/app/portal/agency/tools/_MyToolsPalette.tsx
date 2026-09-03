"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPen,
  FolderPlus,
  ImageUp,
  Info,
  LoaderCircle,
  PenLine,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { chosenNavIcon, SAVED_TAB_ICON_CHOICES } from "@/components/chrome/navIcons";
import { normalizeTools, useChromeLayout, type SavedTool, type SavedToolFolder } from "@/components/chrome/pinnedTabsStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { prepareSavedToolIcon } from "@/lib/chrome/savedToolIcon";
import { checkSavedToolUrl } from "@/lib/chrome/savedToolUrl";

const MAX_TOOLS = 48;
const MAX_FOLDERS = 24;
type FolderView = "all" | "unfiled" | string;

function toolIconUrl(tool: SavedTool, retry = 0): string {
  const version = `${tool.iconAsset?.uploadedAt ?? 0}-${tool.iconAsset?.size ?? 0}`;
  return `/api/portal/chrome/tools/${encodeURIComponent(tool.id)}/icon?v=${version}&retry=${retry}`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

function ToolArtwork({ tool }: { tool: SavedTool }) {
  const [broken, setBroken] = useState(false);
  const [retry, setRetry] = useState(0);
  const hasUploadedIcon = Boolean(tool.iconAsset);
  const iconIdentity = tool.iconAsset
    ? [
      tool.iconAsset.storageProvider,
      tool.iconAsset.storageKey,
      tool.iconAsset.uploadedAt,
      tool.iconAsset.size,
      tool.iconAsset.contentType,
    ].join(":")
    : "";

  useEffect(() => {
    setBroken(false);
    setRetry(0);
  }, [iconIdentity]);

  useEffect(() => {
    if (!broken || !hasUploadedIcon) return;
    const retryIcon = () => {
      setRetry(attempt => attempt + 1);
      setBroken(false);
    };
    // One bounded retry recovers a transient route/provider wobble even when
    // the browser never went offline. Later connectivity changes remain an
    // explicit retry signal without creating a permanent polling loop.
    const timer = retry === 0 ? window.setTimeout(retryIcon, 2_000) : undefined;
    window.addEventListener("online", retryIcon);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("online", retryIcon);
    };
  }, [broken, hasUploadedIcon, iconIdentity, retry]);

  if (tool.iconAsset && !broken) {
    return <img src={toolIconUrl(tool, retry)} alt="" className="size-full rounded-md object-cover" onError={() => setBroken(true)} />;
  }
  const Icon = chosenNavIcon(tool.icon) ?? ExternalLink;
  return <Icon size={20} aria-hidden />;
}

function authoritativeToolsAfterIconDelete(payload: unknown, toolId: string): SavedTool[] | null {
  if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) return null;
  const layout = (payload as { layout?: unknown }).layout;
  if (!layout || typeof layout !== "object") return null;
  const revision = (layout as { updatedAt?: unknown }).updatedAt;
  const rawTools = (layout as { savedTools?: unknown }).savedTools;
  if (typeof revision !== "number" || !Number.isFinite(revision) || revision < 0 || !Array.isArray(rawTools)) return null;
  const tools = normalizeTools(rawTools);
  // The route returns a canonical server record. If client normalisation has to
  // drop even one row, fail closed rather than treating malformed data as a
  // deliberate deletion — especially an empty palette.
  if (tools.length !== rawTools.length || !tools.some(candidate => candidate.id === toolId)) return null;
  return tools;
}

/** Ed's personal, account-synced palette of external tools. */
export function MyToolsPalette() {
  const { savedTools, savedToolFolders, saveAndWait, refresh, ready } = useChromeLayout();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("https://");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState("");
  const [icon, setIcon] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState("");
  const previewRef = useRef("");
  const [removeUploadedIcon, setRemoveUploadedIcon] = useState(false);
  const [preparingIcon, setPreparingIcon] = useState(false);
  const preparingIconRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [toolProblem, setToolProblem] = useState("");
  const [folderProblem, setFolderProblem] = useState("");
  const [paletteProblem, setPaletteProblem] = useState("");
  const [view, setView] = useState<FolderView>("all");
  const [folderEditor, setFolderEditor] = useState<{ id?: string; name: string } | null>(null);
  const [toolToDelete, setToolToDelete] = useState<SavedTool | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<SavedToolFolder | null>(null);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  useEffect(() => {
    if (view === "all" || view === "unfiled" || savedToolFolders.some(folder => folder.id === view)) return;
    setView("all");
  }, [savedToolFolders, view]);

  const orderedTools = useMemo(() => [...savedTools].sort((left, right) => left.order - right.order), [savedTools]);
  const visibleTools = useMemo(() => orderedTools.filter(tool => {
    if (view === "all") return true;
    if (view === "unfiled") return !tool.folderId;
    return tool.folderId === view;
  }), [orderedTools, view]);
  const counts = useMemo(() => new Map(savedToolFolders.map(folder => [
    folder.id,
    orderedTools.filter(tool => tool.folderId === folder.id).length,
  ])), [orderedTools, savedToolFolders]);
  const unfiledCount = orderedTools.filter(tool => !tool.folderId).length;
  const editingTool = editing ? savedTools.find(tool => tool.id === editing) : undefined;
  const interactionLocked = busy || preparingIcon;

  function isInteractionLocked() {
    return busyRef.current || preparingIconRef.current;
  }

  function beginMutation(): boolean {
    if (busyRef.current || preparingIconRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }

  function finishMutation() {
    busyRef.current = false;
    setBusy(false);
  }

  function clearPreview() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setIconPreview("");
    setIconFile(null);
  }

  function resetForm() {
    clearPreview();
    setLabel("");
    setUrl("https://");
    setDescription("");
    setFolderId("");
    setIcon("");
    setRemoveUploadedIcon(false);
    setToolProblem("");
    setAdding(false);
    setEditing(null);
  }

  function startAdd() {
    if (isInteractionLocked()) return;
    resetForm();
    setFolderEditor(null);
    setFolderProblem("");
    setPaletteProblem("");
    setFolderId(view !== "all" && view !== "unfiled" ? view : "");
    setAdding(true);
  }

  function startEdit(tool: SavedTool) {
    if (isInteractionLocked()) return;
    clearPreview();
    setFolderEditor(null);
    setFolderProblem("");
    setPaletteProblem("");
    setEditing(tool.id);
    setAdding(true);
    setLabel(tool.label);
    setUrl(tool.url);
    setDescription(tool.note ?? "");
    setFolderId(tool.folderId ?? "");
    setIcon(tool.icon ?? "");
    setRemoveUploadedIcon(false);
    setToolProblem("");
  }

  function startFolderAdd() {
    if (isInteractionLocked()) return;
    resetForm();
    setFolderProblem("");
    setPaletteProblem("");
    setFolderEditor({ name: "" });
  }

  function startFolderEdit(folder: SavedToolFolder) {
    if (isInteractionLocked()) return;
    resetForm();
    setFolderProblem("");
    setPaletteProblem("");
    setFolderEditor({ id: folder.id, name: folder.name });
  }

  function cancelToolEditor() {
    if (isInteractionLocked()) return;
    resetForm();
  }

  function cancelFolderEditor() {
    if (isInteractionLocked()) return;
    setFolderEditor(null);
    setFolderProblem("");
  }

  async function commit(tools: SavedTool[], folders?: SavedToolFolder[]): Promise<boolean> {
    if (!ready) return false;
    return saveAndWait({
      savedTools: tools.map((tool, index) => ({ ...tool, order: index })),
      ...(folders ? { savedToolFolders: folders.map((folder, index) => ({ ...folder, order: index })) } : {}),
    });
  }

  async function chooseIcon(file: File) {
    if (isInteractionLocked()) return;
    preparingIconRef.current = true;
    setPreparingIcon(true);
    setToolProblem("");
    try {
      const prepared = await prepareSavedToolIcon(file);
      clearPreview();
      const preview = URL.createObjectURL(prepared);
      previewRef.current = preview;
      setIconPreview(preview);
      setIconFile(prepared);
      setRemoveUploadedIcon(false);
    } catch (error) {
      setToolProblem(error instanceof Error ? error.message : "This image could not be prepared.");
    } finally {
      preparingIconRef.current = false;
      setPreparingIcon(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isInteractionLocked()) return;
    const name = label.trim();
    if (!name) { setToolProblem("Give the tool a name — it is what the card says."); return; }
    const checked = checkSavedToolUrl(url);
    if (!checked.ok || !checked.url) { setToolProblem(checked.reason ?? "That address cannot be saved."); return; }
    if (!editing && savedTools.length >= MAX_TOOLS) {
      setToolProblem(`The palette holds ${MAX_TOOLS} tools. Remove one you no longer use first.`);
      return;
    }

    if (!beginMutation()) return;
    setToolProblem("");
    const now = Date.now();
    const toolId = editing ?? `tool_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const previous = savedTools.find(tool => tool.id === toolId);
    const nextTool: SavedTool = {
      ...(previous ?? { id: toolId, order: savedTools.length, createdAt: now, updatedAt: now }),
      label: name,
      url: checked.url,
      note: description.trim() || undefined,
      icon: icon || undefined,
      folderId: folderId || undefined,
      updatedAt: now,
    };
    const nextTools = previous
      ? savedTools.map(tool => tool.id === toolId ? nextTool : tool)
      : [...savedTools, nextTool];

    try {
      if (!await commit(nextTools)) {
        await refresh();
        setToolProblem("The tool could not be saved. Check your connection and try again.");
        return;
      }

      if (iconFile) {
        const form = new FormData();
        form.set("file", iconFile);
        const response = await fetch(`/api/portal/chrome/tools/${encodeURIComponent(toolId)}/icon`, { method: "POST", body: form });
        const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; warning?: string } | null;
        if (!response.ok || !payload?.ok) {
          await refresh();
          setEditing(toolId);
          setToolProblem(payload?.error || "The tool was saved, but its icon could not be uploaded. Try the icon again.");
          return;
        }
        await refresh();
        if (payload.warning) setPaletteProblem(payload.warning);
      } else if (removeUploadedIcon) {
        const response = await fetch(`/api/portal/chrome/tools/${encodeURIComponent(toolId)}/icon`, { method: "DELETE" });
        const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
        if (!response.ok || !payload?.ok) {
          await refresh();
          setToolProblem(payload?.error || "The uploaded icon could not be removed. Try again.");
          return;
        }
        await refresh();
      }
      resetForm();
    } finally {
      finishMutation();
    }
  }

  async function move(id: string, delta: -1 | 1) {
    if (isInteractionLocked()) return;
    const visibleIndex = visibleTools.findIndex(tool => tool.id === id);
    const other = visibleTools[visibleIndex + delta];
    if (visibleIndex < 0 || !other) return;
    const next = [...orderedTools];
    const from = next.findIndex(tool => tool.id === id);
    const to = next.findIndex(tool => tool.id === other.id);
    [next[from], next[to]] = [next[to]!, next[from]!];
    if (!beginMutation()) return;
    setPaletteProblem("");
    try {
      if (!await commit(next)) {
        await refresh();
        setPaletteProblem("That order could not be saved. Try again.");
      }
    } finally {
      finishMutation();
    }
  }

  async function saveFolder(event: React.FormEvent) {
    event.preventDefault();
    if (isInteractionLocked()) return;
    if (!folderEditor) return;
    const name = folderEditor.name.trim();
    if (!name) { setFolderProblem("Give the folder a name."); return; }
    if (savedToolFolders.some(folder => folder.id !== folderEditor.id && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setFolderProblem("A folder with that name already exists.");
      return;
    }
    if (!folderEditor.id && savedToolFolders.length >= MAX_FOLDERS) {
      setFolderProblem(`You can keep up to ${MAX_FOLDERS} tool folders.`);
      return;
    }
    const now = Date.now();
    const existing = folderEditor.id ? savedToolFolders.find(candidate => candidate.id === folderEditor.id) : undefined;
    if (folderEditor.id && !existing) { setFolderProblem("That folder no longer exists."); return; }
    const folder: SavedToolFolder = existing
      ? { ...existing, name, updatedAt: now }
      : { id: `toolfolder_${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, name, order: savedToolFolders.length, createdAt: now, updatedAt: now };
    const next = existing
      ? savedToolFolders.map(candidate => candidate.id === folder.id ? folder : candidate)
      : [...savedToolFolders, folder];
    if (!beginMutation()) return;
    setFolderProblem("");
    try {
      if (!await commit(savedTools, next)) {
        await refresh();
        setFolderProblem("The folder could not be saved. Try again.");
        return;
      }
      setFolderEditor(null);
      setView(folder.id);
    } finally {
      finishMutation();
    }
  }

  async function deleteFolder(folder: SavedToolFolder) {
    if (!beginMutation()) return;
    setFolderToDelete(null);
    setFolderProblem("");
    try {
      const nextFolders = savedToolFolders.filter(candidate => candidate.id !== folder.id);
      const nextTools = savedTools.map(tool => tool.folderId === folder.id ? { ...tool, folderId: undefined, updatedAt: Date.now() } : tool);
      if (!await commit(nextTools, nextFolders)) {
        await refresh();
        setFolderProblem("The folder could not be deleted. Try again.");
        return;
      }
      if (view === folder.id) setView("unfiled");
    } finally {
      finishMutation();
    }
  }

  async function deleteTool(tool: SavedTool) {
    if (!beginMutation()) return;
    setToolToDelete(null);
    setPaletteProblem("");
    try {
      // Always visit the lifecycle route. A previous attempt may already have
      // detached the visible icon while retaining an older failed cleanup; only
      // this acknowledgement proves the card can now lose its retry surface.
      const response = await fetch(`/api/portal/chrome/tools/${encodeURIComponent(tool.id)}/icon`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { ok?: unknown; error?: unknown; layout?: unknown } | null;
      if (!response.ok) {
        await refresh();
        setPaletteProblem(typeof payload?.error === "string"
          ? payload.error
          : "The uploaded icon is queued for cleanup. Try again before removing the tool.");
        return;
      }
      if (!authoritativeToolsAfterIconDelete(payload, tool.id)) {
        await refresh();
        setPaletteProblem("The icon cleanup completed, but the latest palette could not be verified. Your tools were left untouched; reload and try again.");
        return;
      }
      // The lifecycle route owns the icon mutation and advances the chrome
      // revision. Adopt that revision before asking the queued layout writer to
      // remove the now-iconless card, otherwise its compare-and-set must fail.
      const latest = await refresh();
      if (!latest) {
        setPaletteProblem("The icon cleanup completed, but the latest palette could not be loaded. Your tools were left untouched; reload and try again.");
        return;
      }
      if (!latest.savedTools.some(candidate => candidate.id === tool.id)) return;
      if (!await commit(latest.savedTools.filter(candidate => candidate.id !== tool.id))) {
        await refresh();
        setPaletteProblem("The tool could not be removed. Try again.");
        return;
      }
    } finally {
      finishMutation();
    }
  }

  return (
    <section aria-labelledby="my-tools-heading" aria-describedby="my-tools-privacy">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-black/40">My tools</p>
          <h2 id="my-tools-heading" className="mt-1 text-lg font-semibold text-black/85">Your palette</h2>
          <p id="my-tools-privacy" className="mt-1 flex max-w-xl items-start gap-1.5 text-xs leading-5 text-black/45">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            Only you can see these shortcuts. They are saved to your account, not the workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Manage tool palette">
          <button type="button" disabled={!ready || interactionLocked} onClick={startFolderAdd} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03] disabled:opacity-50">
            <FolderPlus size={16} aria-hidden /> New folder
          </button>
          <button type="button" disabled={!ready || interactionLocked} onClick={startAdd} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black/85 px-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
            <Plus size={16} aria-hidden /> Add a tool
          </button>
        </div>
      </div>

      {paletteProblem ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{paletteProblem}</p> : null}
      {folderProblem ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{folderProblem}</p> : null}

      {folderEditor ? (
        <form onSubmit={saveFolder} className="mt-4 flex flex-col gap-3 rounded-md border border-black/10 bg-white p-4 sm:flex-row sm:items-end">
          <label className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-xs font-semibold text-black/55">Folder name</span>
            <input autoFocus disabled={interactionLocked} value={folderEditor.name} onChange={event => setFolderEditor(current => current ? { ...current, name: event.target.value } : current)} maxLength={60} placeholder="Design tools" className="min-h-11 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-brand/45 disabled:opacity-50" />
          </label>
          <div className="flex gap-2" role="group" aria-label="Folder editor actions">
            <button type="submit" disabled={interactionLocked} className="min-h-11 rounded-md bg-black/85 px-4 text-sm font-semibold text-white disabled:opacity-50">{folderEditor.id ? "Rename folder" : "Add folder"}</button>
            <button type="button" disabled={interactionLocked} onClick={cancelFolderEditor} className="min-h-11 rounded-md border border-black/15 px-4 text-sm font-medium text-black/60 disabled:opacity-50">Cancel</button>
          </div>
        </form>
      ) : null}

      {adding ? (
        <form onSubmit={submit} className="mt-4 grid gap-4 rounded-md border border-black/10 bg-white p-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="text-sm font-semibold text-black/80">{editing ? "Edit tool" : "Add a tool"}</h3>
            <button type="button" disabled={interactionLocked} onClick={cancelToolEditor} aria-label="Close tool editor" className="grid size-11 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] disabled:opacity-50"><X size={17} aria-hidden /></button>
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Name</span>
            <input disabled={interactionLocked} value={label} onChange={event => setLabel(event.target.value)} maxLength={60} autoFocus placeholder="Colour palette tool" className="min-h-11 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-brand/45 disabled:opacity-50" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Web address</span>
            <input disabled={interactionLocked} value={url} onChange={event => setUrl(event.target.value)} inputMode="url" spellCheck={false} className="min-h-11 rounded-md border border-black/15 px-3 font-mono text-sm outline-none focus:border-brand/45 disabled:opacity-50" />
          </label>
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-black/55">Description <span className="font-normal text-black/35">(optional)</span></span>
            <textarea disabled={interactionLocked} value={description} onChange={event => setDescription(event.target.value)} maxLength={160} rows={3} placeholder="What you use this tool for" className="resize-y rounded-md border border-black/15 px-3 py-2.5 text-sm outline-none focus:border-brand/45 disabled:opacity-50" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Folder <span className="font-normal text-black/35">(optional)</span></span>
            <select disabled={interactionLocked} value={folderId} onChange={event => setFolderId(event.target.value)} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-brand/45 disabled:opacity-50">
              <option value="">Unfiled</option>
              {savedToolFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Built-in icon</span>
            <select disabled={interactionLocked} value={icon} onChange={event => setIcon(event.target.value)} className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-brand/45 disabled:opacity-50">
              <option value="">Automatic link icon</option>
              {SAVED_TAB_ICON_CHOICES.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <span className="text-xs font-semibold text-black/55">Uploaded icon <span className="font-normal text-black/35">(optional, replaces the built-in icon)</span></span>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-black/15 p-3" role="group" aria-label="Manage uploaded icon">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-brand/15 bg-brand/[0.07] text-brand">
                {iconPreview ? <img src={iconPreview} alt="New tool icon preview" className="size-full object-cover" />
                  : editingTool?.iconAsset && !removeUploadedIcon ? <img src={toolIconUrl(editingTool)} alt="Current tool icon" className="size-full object-cover" />
                    : (() => { const Icon = chosenNavIcon(icon) ?? ExternalLink; return <Icon size={20} aria-hidden />; })()}
              </span>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]">
                {preparingIcon ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <ImageUp size={16} aria-hidden />}
                {preparingIcon ? "Preparing…" : "Upload icon"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={interactionLocked} onChange={event => { const file = event.target.files?.[0]; if (file) void chooseIcon(file); event.currentTarget.value = ""; }} />
              </label>
              {iconPreview ? <button type="button" disabled={interactionLocked} onClick={() => { if (!isInteractionLocked()) clearPreview(); }} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-black/55 hover:bg-black/[0.04] disabled:opacity-50"><RotateCcw size={15} aria-hidden /> Undo new icon</button> : null}
              {editingTool?.iconAsset && !iconPreview && !removeUploadedIcon ? <button type="button" disabled={interactionLocked} onClick={() => { if (!isInteractionLocked()) setRemoveUploadedIcon(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={15} aria-hidden /> Remove upload</button> : null}
              {removeUploadedIcon ? <button type="button" disabled={interactionLocked} onClick={() => { if (!isInteractionLocked()) setRemoveUploadedIcon(false); }} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-black/55 hover:bg-black/[0.04] disabled:opacity-50"><RotateCcw size={15} aria-hidden /> Keep current upload</button> : null}
              <span className="basis-full text-xs leading-5 text-black/40">PNG, JPEG or WebP. Aqua crops it square and stores a small private copy.</span>
            </div>
          </div>
          {toolProblem ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{toolProblem}</p> : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2" role="group" aria-label="Tool editor actions">
            <button type="submit" disabled={interactionLocked} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black/85 px-4 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
              {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null}{editing ? "Save changes" : "Add to palette"}
            </button>
            <button type="button" disabled={interactionLocked} onClick={cancelToolEditor} className="min-h-11 rounded-md border border-black/15 px-4 text-sm font-medium text-black/60 hover:bg-black/[0.03] disabled:opacity-50">Cancel</button>
          </div>
        </form>
      ) : null}

      {ready && (savedTools.length > 0 || savedToolFolders.length > 0) ? (
        <div className="mt-4">
          <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filter tools by folder">
            <button type="button" disabled={interactionLocked} aria-pressed={view === "all"} onClick={() => setView("all")} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold disabled:opacity-50 ${view === "all" ? "border-brand/30 bg-brand/[0.08] text-brand" : "border-black/10 bg-white text-black/55"}`}>
              All <span className="text-xs opacity-65">{savedTools.length}</span>
            </button>
            <button type="button" disabled={interactionLocked} aria-pressed={view === "unfiled"} onClick={() => setView("unfiled")} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold disabled:opacity-50 ${view === "unfiled" ? "border-brand/30 bg-brand/[0.08] text-brand" : "border-black/10 bg-white text-black/55"}`}>
              <Folder size={15} aria-hidden /> Unfiled <span className="text-xs opacity-65">{unfiledCount}</span>
            </button>
            {savedToolFolders.map(folder => (
              <button key={folder.id} type="button" disabled={interactionLocked} aria-pressed={view === folder.id} onClick={() => setView(folder.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold disabled:opacity-50 ${view === folder.id ? "border-brand/30 bg-brand/[0.08] text-brand" : "border-black/10 bg-white text-black/55"}`}>
                <FolderOpen size={15} aria-hidden /> {folder.name} <span className="text-xs opacity-65">{counts.get(folder.id) ?? 0}</span>
              </button>
            ))}
          </div>
          {view !== "all" && view !== "unfiled" ? (() => {
            const folder = savedToolFolders.find(candidate => candidate.id === view);
            return folder ? <div className="mt-1 flex flex-wrap items-center gap-2" role="group" aria-label={`Manage ${folder.name} folder`}>
              <span className="mr-auto text-xs text-black/40">Showing {counts.get(folder.id) ?? 0} in {folder.name}</span>
              <button type="button" disabled={interactionLocked} onClick={() => startFolderEdit(folder)} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-black/55 hover:bg-black/[0.04] disabled:opacity-50"><FolderPen size={15} aria-hidden /> Rename</button>
              <button type="button" disabled={interactionLocked} onClick={() => { if (!isInteractionLocked()) setFolderToDelete(folder); }} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={15} aria-hidden /> Delete folder</button>
            </div> : null;
          })() : null}
        </div>
      ) : null}

      {ready && !savedTools.length && !adding ? (
        <p className="mt-4 rounded-md border border-dashed border-black/15 p-6 text-center text-sm leading-6 text-black/45">
          Nothing here yet. Add the sites you reach for while you work, give each one a useful description and icon, then organise them into folders whenever you like.
        </p>
      ) : null}

      {ready && savedTools.length > 0 && !visibleTools.length ? (
        <p className="mt-4 rounded-md border border-dashed border-black/15 p-6 text-center text-sm leading-6 text-black/45">No tools are in this folder yet.</p>
      ) : null}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {visibleTools.map((tool, index) => {
          const folder = tool.folderId ? savedToolFolders.find(candidate => candidate.id === tool.folderId) : undefined;
          return (
            <li key={tool.id} className="overflow-hidden rounded-md border border-black/10 bg-white shadow-sm transition hover:border-brand/35 hover:shadow-md">
              <a href={tool.url} target="_blank" rel="noopener noreferrer" className="mm-tool-card group flex min-h-40 items-start gap-4 p-5 hover:bg-brand/[0.025]">
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border border-brand/15 bg-brand/[0.07] text-brand"><ToolArtwork tool={tool} /></span>
                <span className="flex min-w-0 flex-1 flex-col self-stretch">
                  <strong className="text-base font-semibold text-black/85">{tool.label}</strong>
                  <span className="mt-1 line-clamp-3 text-sm leading-5 text-black/50">{tool.note || `Open ${hostLabel(tool.url)} in a new tab.`}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-black/35">{folder ? <><Folder size={12} aria-hidden /> {folder.name}</> : "Unfiled"}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs font-semibold text-brand">Open tool <ChevronRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden /></span>
                </span>
              </a>
              <div className="flex items-center justify-end border-t border-black/[0.07] p-1" role="group" aria-label={`Manage ${tool.label}`}>
                <button type="button" onClick={() => void move(tool.id, -1)} disabled={index === 0 || interactionLocked} aria-label={`Move ${tool.label} earlier`} className="grid size-11 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black/75 disabled:opacity-25"><ArrowUp size={16} aria-hidden /></button>
                <button type="button" onClick={() => void move(tool.id, 1)} disabled={index === visibleTools.length - 1 || interactionLocked} aria-label={`Move ${tool.label} later`} className="grid size-11 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black/75 disabled:opacity-25"><ArrowDown size={16} aria-hidden /></button>
                <button type="button" onClick={() => startEdit(tool)} disabled={interactionLocked} aria-label={`Edit ${tool.label}`} className="grid size-11 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black/75 disabled:opacity-25"><PenLine size={16} aria-hidden /></button>
                <button type="button" onClick={() => { if (!isInteractionLocked()) setToolToDelete(tool); }} disabled={interactionLocked} aria-label={`Remove ${tool.label}`} className="grid size-11 place-items-center rounded-md text-red-600/75 hover:bg-red-50 hover:text-red-700 disabled:opacity-25"><Trash2 size={16} aria-hidden /></button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog open={Boolean(toolToDelete)} title={`Remove ${toolToDelete?.label ?? "tool"}?`} body="This removes the card from your palette. Its website is not affected." confirmLabel="Remove tool" onCancel={() => { if (!isInteractionLocked()) setToolToDelete(null); }} onConfirm={() => { if (!isInteractionLocked() && toolToDelete) void deleteTool(toolToDelete); }} />
      <ConfirmDialog open={Boolean(folderToDelete)} title={`Delete ${folderToDelete?.name ?? "folder"}?`} body="Tools inside it will move to Unfiled. The tools themselves will not be deleted." confirmLabel="Delete folder" onCancel={() => { if (!isInteractionLocked()) setFolderToDelete(null); }} onConfirm={() => { if (!isInteractionLocked() && folderToDelete) void deleteFolder(folderToDelete); }} />
    </section>
  );
}
