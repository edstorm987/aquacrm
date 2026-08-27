"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPen,
  FolderPlus,
  Inbox,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  NotebookPen,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { dateFromValue, formatUkDate } from "@/lib/shared/formatDateTime";
import type { NotepadFolder, NotepadNote, NotepadNoteStatus } from "@/server/types";

type NotebookView = "all" | "pinned" | "archived" | "trashed" | `folder:${string}`;
type SortMode = "updated" | "created" | "title";
type SaveState = "saved" | "unsaved" | "saving" | "error";
type NotepadDraft = Pick<NotepadNote, "id" | "title" | "body" | "folderId" | "tags" | "pinned" | "status" | "updatedAt">;

const FOLDER_COLORS = ["#087f8c", "#9a6a16", "#a74478", "#4f46e5", "#187554", "#b95d12", "#5c6675"];
const DRAFT_KEY_PREFIX = "aquacrm:notepad-draft:";

export function NotepadWorkspace({
  initialNotes,
  initialFolders,
  initialNoteId,
}: {
  initialNotes: NotepadNote[];
  initialFolders: NotepadFolder[];
  initialNoteId?: string;
}) {
  const initialSelected = initialNotes.find(note => note.id === initialNoteId)
    ?? initialNotes.find(note => note.status === "active")
    ?? initialNotes[0];
  const [notes, setNotes] = useState(initialNotes);
  const [folders, setFolders] = useState(initialFolders);
  const [selectedId, setSelectedId] = useState(initialSelected?.id ?? null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(Boolean(initialNoteId));
  const [view, setView] = useState<NotebookView>(() => viewForNote(initialSelected));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("updated");
  const [quickCapture, setQuickCapture] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [folderEditor, setFolderEditor] = useState<{ id?: string; name: string; color: string } | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<NotepadFolder | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<NotepadNote | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notesRef = useRef(notes);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const revisions = useRef(new Map<string, number>());

  useEffect(() => { notesRef.current = notes; }, [notes]);

  useEffect(() => {
    const recoveredIds: string[] = [];
    const recovered = notesRef.current.map(note => {
      const draft = readDraft(note.id);
      if (!draft) return note;
      if (draft.updatedAt <= note.updatedAt) {
        clearDraft(note.id);
        return note;
      }
      recoveredIds.push(note.id);
      revisions.current.set(note.id, Math.max(1, revisions.current.get(note.id) ?? 0));
      return { ...note, ...draft };
    });
    if (recoveredIds.length) {
      notesRef.current = recovered;
      setNotes(recovered);
      setSaveStates(current => ({
        ...current,
        ...Object.fromEntries(recoveredIds.map(id => [id, "error" as const])),
      }));
      setError(`${recoveredIds.length} unsaved ${recoveredIds.length === 1 ? "note was" : "notes were"} recovered from this browser. Use Retry save to persist the latest version.`);
    }

    const hasPendingDraft = () => saveTimers.current.size > 0 || notesRef.current.some(note => Boolean(readDraft(note.id)));
    const flushForExit = () => sendDraftsKeepalive(notesRef.current, new Set(saveTimers.current.keys()));
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingDraft()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    window.addEventListener("pagehide", flushForExit);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      window.removeEventListener("pagehide", flushForExit);
      flushForExit();
      for (const timer of saveTimers.current.values()) clearTimeout(timer);
      saveTimers.current.clear();
    };
  }, []);

  const selected = notes.find(note => note.id === selectedId) ?? null;
  const activeNotes = notes.filter(note => note.status === "active");
  const activeViewFolder = view.startsWith("folder:") ? folders.find(folder => folder.id === view.slice("folder:".length)) : undefined;
  const folderCounts = useMemo(() => new Map(folders.map(folder => [
    folder.id,
    activeNotes.filter(note => note.folderId === folder.id).length,
  ])), [activeNotes, folders]);
  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = notes.filter(note => {
      const matchesView = view === "all" ? note.status === "active"
        : view === "pinned" ? note.status === "active" && note.pinned
          : view === "archived" ? note.status === "archived"
            : view === "trashed" ? note.status === "trashed"
              : note.status === "active" && note.folderId === view.slice("folder:".length);
      if (!matchesView) return false;
      if (!needle) return true;
      const folder = note.folderId ? folders.find(item => item.id === note.folderId) : undefined;
      return [note.title, note.body, note.tags.join(" "), folder?.name].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle);
    });
    return filtered.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      return sort === "created" ? b.createdAt - a.createdAt : Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;
    });
  }, [folders, notes, query, sort, view]);

  useEffect(() => {
    if (selectedId && visibleNotes.some(note => note.id === selectedId)) return;
    setSelectedId(visibleNotes[0]?.id ?? null);
  }, [selectedId, visibleNotes]);

  async function post<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch("/api/portal/notepad", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & T) | null;
    if (!response.ok || !result?.ok) throw new Error(result?.error || "The notepad could not be updated.");
    return result;
  }

  async function createNote(title = "") {
    setBusy(true);
    setError("");
    try {
      const folderId = view.startsWith("folder:") ? view.slice("folder:".length) : undefined;
      const result = await post<{ note: NotepadNote }>({ action: "create-note", title, folderId });
      setNotes(current => [result.note, ...current]);
      openEditor(result.note.id);
      setView(folderId ? `folder:${folderId}` : "all");
      setQuickCapture("");
      setSaveStates(current => ({ ...current, [result.note.id]: "saved" }));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  function editSelected(patch: Partial<Pick<NotepadNote, "title" | "body" | "folderId" | "tags" | "pinned">>) {
    if (!selected) return;
    const next: NotepadNote = { ...selected, ...patch, updatedAt: Date.now() };
    replaceNote(next);
    writeDraft(next);
    scheduleSave(next);
  }

  function replaceNote(note: NotepadNote) {
    const next = notesRef.current.map(item => item.id === note.id ? note : item);
    notesRef.current = next;
    setNotes(next);
  }

  function scheduleSave(note: NotepadNote) {
    const currentTimer = saveTimers.current.get(note.id);
    if (currentTimer) clearTimeout(currentTimer);
    const revision = (revisions.current.get(note.id) ?? 0) + 1;
    revisions.current.set(note.id, revision);
    setSaveStates(current => ({ ...current, [note.id]: "unsaved" }));
    saveTimers.current.set(note.id, setTimeout(() => {
      saveTimers.current.delete(note.id);
      void persistNote(note, revision);
    }, 650));
  }

  async function persistNote(note: NotepadNote, revision: number): Promise<boolean> {
    setSaveStates(current => ({ ...current, [note.id]: "saving" }));
    try {
      const result = await post<{ note: NotepadNote }>(updateRequest(note));
      if (revisions.current.get(note.id) !== revision) return false;
      replaceNote(result.note);
      clearDraft(note.id);
      setSaveStates(current => ({ ...current, [note.id]: "saved" }));
      return true;
    } catch (caught) {
      if (revisions.current.get(note.id) === revision) setSaveStates(current => ({ ...current, [note.id]: "error" }));
      setError(message(caught));
      return false;
    }
  }

  function retrySave(noteId: string) {
    const note = notesRef.current.find(item => item.id === noteId);
    if (!note) return;
    const draft = readDraft(noteId);
    const latest = draft ? { ...note, ...draft } : note;
    const currentTimer = saveTimers.current.get(noteId);
    if (currentTimer) clearTimeout(currentTimer);
    saveTimers.current.delete(noteId);
    const revision = (revisions.current.get(noteId) ?? 0) + 1;
    revisions.current.set(noteId, revision);
    replaceNote(latest);
    writeDraft(latest);
    setError("");
    void persistNote(latest, revision);
  }

  async function changeStatus(note: NotepadNote, status: NotepadNoteStatus) {
    const timer = saveTimers.current.get(note.id);
    if (timer) clearTimeout(timer);
    saveTimers.current.delete(note.id);
    const pendingRevision = revisions.current.get(note.id);
    if (readDraft(note.id) && pendingRevision && !await persistNote(note, pendingRevision)) return;
    const revision = (revisions.current.get(note.id) ?? 0) + 1;
    revisions.current.set(note.id, revision);
    const optimistic = { ...note, status, updatedAt: Date.now() };
    replaceNote(optimistic);
    setSaveStates(current => ({ ...current, [note.id]: "saving" }));
    try {
      const result = await post<{ note: NotepadNote }>({ action: "update-note", noteId: note.id, status });
      replaceNote(result.note);
      clearDraft(note.id);
      setSaveStates(current => ({ ...current, [note.id]: "saved" }));
    } catch (caught) {
      replaceNote(note);
      setSaveStates(current => ({ ...current, [note.id]: "error" }));
      setError(message(caught));
    }
  }

  async function saveFolder() {
    if (!folderEditor?.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<{ folder: NotepadFolder }>({
        action: folderEditor.id ? "update-folder" : "create-folder",
        folderId: folderEditor.id,
        name: folderEditor.name,
        color: folderEditor.color,
      });
      setFolders(current => folderEditor.id
        ? current.map(folder => folder.id === result.folder.id ? result.folder : folder)
        : [...current, result.folder].sort((a, b) => a.name.localeCompare(b.name)));
      if (!folderEditor.id) setView(`folder:${result.folder.id}`);
      setFolderEditor(null);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(folder: NotepadFolder) {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ folders: NotepadFolder[]; notes: NotepadNote[] }>({ action: "delete-folder", folderId: folder.id });
      setFolders(result.folders);
      setNotes(result.notes);
      if (view === `folder:${folder.id}`) setView("all");
      setFolderToDelete(null);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function permanentlyDelete(note: NotepadNote) {
    setBusy(true);
    setError("");
    try {
      await post({ action: "delete-note", noteId: note.id });
      clearDraft(note.id);
      setNotes(current => current.filter(item => item.id !== note.id));
      setSaveStates(current => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
      setNoteToDelete(null);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  function addTag() {
    if (!selected) return;
    const tag = tagDraft.replace(/^#/, "").trim().slice(0, 32);
    if (!tag || selected.tags.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setTagDraft("");
      return;
    }
    editSelected({ tags: [...selected.tags, tag].slice(0, 12) });
    setTagDraft("");
  }

  function chooseView(next: NotebookView) {
    if (selectedId) flushScheduled(selectedId, saveTimers, notesRef, revisions, persistNote);
    setView(next);
    setMobileEditorOpen(false);
  }

  function openEditor(noteId: string) {
    if (selectedId && selectedId !== noteId) {
      flushScheduled(selectedId, saveTimers, notesRef, revisions, persistNote);
    }
    setSelectedId(noteId);
    setMobileEditorOpen(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      requestAnimationFrame(() => document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "auto" }));
    }
  }

  return (
    <div className="w-full">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Personal workspace</p>
          <h1 className="mt-1 text-3xl font-semibold text-black/90">Notepad</h1>
          <p className="mt-1 text-sm text-black/55">Ideas, decisions and working notes, kept close to the rest of the business.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/45">
            <span><strong className="text-black/75">{activeNotes.length}</strong> active</span>
            <span><strong className="text-black/75">{activeNotes.filter(note => note.pinned).length}</strong> pinned</span>
            <span><strong className="text-black/75">{folders.length}</strong> folders</span>
          </div>
        </div>
        <div className="flex w-full max-w-xl gap-2 lg:w-auto">
          <label className="relative min-w-0 flex-1 lg:w-80">
            <span className="sr-only">Quick capture</span>
            <NotebookPen className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" size={17} />
            <input
              value={quickCapture}
              onChange={event => setQuickCapture(event.target.value)}
              onKeyDown={event => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void createNote(quickCapture);
              }}
              placeholder="Capture an idea..."
              className="h-11 w-full rounded-md border border-black/12 bg-white pl-10 pr-3 text-sm text-black/80 outline-none focus:border-brand"
            />
          </label>
          <button
            type="button"
            onClick={() => void createNote(quickCapture)}
            disabled={busy}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-45"
          >
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={17} />}
            <span className="hidden sm:inline">New note</span>
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="shrink-0" aria-label="Dismiss error"><X size={16} /></button>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2 overflow-x-auto border-b border-black/10 pb-3 xl:hidden" aria-label="Notepad views">
        <CompactViewButton active={view === "all"} onClick={() => chooseView("all")} icon={<FileText size={14} />} label="Notes" count={activeNotes.length} />
        <CompactViewButton active={view === "pinned"} onClick={() => chooseView("pinned")} icon={<Pin size={14} />} label="Pinned" count={activeNotes.filter(note => note.pinned).length} />
        {folders.map(folder => <CompactViewButton key={folder.id} active={view === `folder:${folder.id}`} onClick={() => chooseView(`folder:${folder.id}`)} icon={<span className="size-2 rounded-sm" style={{ backgroundColor: folder.color }} />} label={folder.name} count={folderCounts.get(folder.id) ?? 0} />)}
        <button type="button" onClick={() => setFolderEditor({ name: "", color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length] })} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium text-black/55"><FolderPlus size={14} />New folder</button>
        <CompactViewButton active={view === "archived"} onClick={() => chooseView("archived")} icon={<Archive size={14} />} label="Archive" count={notes.filter(note => note.status === "archived").length} />
        <CompactViewButton active={view === "trashed"} onClick={() => chooseView("trashed")} icon={<Trash2 size={14} />} label="Trash" count={notes.filter(note => note.status === "trashed").length} />
      </div>

      <section className="mt-4 grid min-h-[calc(100dvh-17rem)] overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm md:h-[calc(100dvh-13rem)] md:min-h-[620px] md:grid-cols-[minmax(240px,0.42fr)_minmax(0,1fr)] xl:grid-cols-[220px_320px_minmax(0,1fr)]">
        <aside className="hidden border-r border-black/10 bg-black/[0.025] p-3 xl:flex xl:flex-col" aria-label="Notepad folders">
          <div className="space-y-1">
            <ViewButton active={view === "all"} onClick={() => chooseView("all")} icon={<FileText size={16} />} label="All notes" count={activeNotes.length} />
            <ViewButton active={view === "pinned"} onClick={() => chooseView("pinned")} icon={<Pin size={16} />} label="Pinned" count={activeNotes.filter(note => note.pinned).length} />
          </div>

          <div className="mt-5 flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase text-black/40">Folders</p>
            <button type="button" onClick={() => setFolderEditor({ name: "", color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length] })} className="grid size-7 place-items-center rounded-md text-black/40 hover:bg-black/[0.06] hover:text-black/70" title="Create folder" aria-label="Create folder"><FolderPlus size={15} /></button>
          </div>
          <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {folders.map(folder => (
              <div key={folder.id} className="group flex items-center gap-1">
                <button type="button" onClick={() => chooseView(`folder:${folder.id}`)} className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm ${view === `folder:${folder.id}` ? "bg-white font-medium text-black shadow-sm" : "text-black/60 hover:bg-black/[0.04]"}`}>
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: folder.color }} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="text-[10px] text-black/35">{folderCounts.get(folder.id) ?? 0}</span>
                </button>
                <button type="button" onClick={() => setFolderEditor({ id: folder.id, name: folder.name, color: folder.color })} className="hidden size-7 shrink-0 place-items-center rounded-md text-black/35 hover:bg-black/[0.06] group-hover:grid group-focus-within:grid" title={`Rename ${folder.name}`} aria-label={`Rename ${folder.name}`}><FolderPen size={13} /></button>
                <button type="button" onClick={() => setFolderToDelete(folder)} className="hidden size-7 shrink-0 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700 group-hover:grid group-focus-within:grid" title={`Delete ${folder.name}`} aria-label={`Delete ${folder.name}`}><Trash2 size={13} /></button>
              </div>
            ))}
            {!folders.length ? <p className="px-2 py-3 text-xs leading-5 text-black/35">No folders yet.</p> : null}
          </div>

          <div className="space-y-1 border-t border-black/10 pt-3">
            <ViewButton active={view === "archived"} onClick={() => chooseView("archived")} icon={<Archive size={16} />} label="Archive" count={notes.filter(note => note.status === "archived").length} />
            <ViewButton active={view === "trashed"} onClick={() => chooseView("trashed")} icon={<Trash2 size={16} />} label="Trash" count={notes.filter(note => note.status === "trashed").length} />
          </div>
        </aside>

        <div className={`${mobileEditorOpen ? "hidden" : "flex"} min-h-0 flex-col border-black/10 md:flex md:border-r`}>
          <div className="border-b border-black/10 p-3">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search notes</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-black/35" size={15} />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notes" className="h-9 w-full rounded-md border border-black/10 bg-black/[0.025] pl-8 pr-8 text-sm outline-none focus:border-brand" />
                {query ? <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/35" aria-label="Clear search"><X size={14} /></button> : null}
              </label>
              <label className="relative shrink-0">
                <span className="sr-only">Sort notes</span>
                <ListFilter className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-black/35" size={14} />
                <select value={sort} onChange={event => setSort(event.target.value as SortMode)} className="h-9 appearance-none rounded-md border border-black/10 bg-white pl-7 pr-7 text-xs text-black/60 outline-none">
                  <option value="updated">Updated</option>
                  <option value="created">Created</option>
                  <option value="title">Title</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-black/30" size={13} />
              </label>
            </div>
            <div className="mt-2 flex min-h-7 items-center justify-between gap-2 px-0.5 text-[11px] text-black/38">
              <span>{viewLabel(view, folders)}</span>
              <span className="flex items-center gap-1.5">
                <span>{visibleNotes.length} {visibleNotes.length === 1 ? "note" : "notes"}</span>
                {activeViewFolder ? <button type="button" onClick={() => setFolderEditor({ id: activeViewFolder.id, name: activeViewFolder.name, color: activeViewFolder.color })} className="grid size-6 place-items-center rounded-md text-black/38 hover:bg-black/[0.05] hover:text-black/65" title="Rename folder" aria-label={`Rename ${activeViewFolder.name}`}><FolderPen size={12} /></button> : null}
                {activeViewFolder ? <button type="button" onClick={() => setFolderToDelete(activeViewFolder)} className="grid size-6 place-items-center rounded-md text-black/38 hover:bg-red-50 hover:text-red-700" title="Delete folder" aria-label={`Delete ${activeViewFolder.name}`}><Trash2 size={12} /></button> : null}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleNotes.map(note => (
              <button
                type="button"
                key={note.id}
                onClick={() => openEditor(note.id)}
                className={`block w-full border-b border-black/[0.07] px-4 py-3 text-left transition ${selectedId === note.id ? "bg-brand/[0.075]" : "hover:bg-black/[0.025]"}`}
              >
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-black/80">{note.title || "Untitled note"}</span>
                  {note.pinned ? <Pin className="mt-0.5 shrink-0 text-amber-700" size={13} fill="currentColor" /> : null}
                </span>
                <span className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-black/45">{note.body.trim() || "Empty note"}</span>
                <span className="mt-2 flex min-w-0 items-center gap-2 text-[10px] text-black/35">
                  <span className="shrink-0">{formatRelative(note.updatedAt)}</span>
                  {note.tags.length ? <span className="truncate">{note.tags.slice(0, 2).map(tag => `#${tag}`).join("  ")}</span> : null}
                </span>
              </button>
            ))}
            {!visibleNotes.length ? (
              <div className="grid min-h-64 place-items-center px-6 text-center">
                <div>
                  <span className="mx-auto grid size-10 place-items-center rounded-md bg-black/[0.04] text-black/35">{query ? <Search size={18} /> : <Inbox size={18} />}</span>
                  <h2 className="mt-3 text-sm font-semibold text-black/70">{query ? "No matching notes" : emptyTitle(view)}</h2>
                  <p className="mt-1 text-xs text-black/40">{query ? "Try another word or folder." : "Capture something when it matters."}</p>
                  {!query && view !== "trashed" && view !== "archived" ? <button type="button" onClick={() => void createNote()} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Plus size={14} />New note</button> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className={`${mobileEditorOpen ? "flex" : "hidden"} min-h-0 flex-col bg-white md:flex`}>
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 sm:px-4">
                <button type="button" onClick={() => { flushScheduled(selected.id, saveTimers, notesRef, revisions, persistNote); setMobileEditorOpen(false); }} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/55 md:hidden" aria-label="Back to notes"><ArrowLeft size={17} /></button>
                <label className="relative min-w-40 flex-1 sm:max-w-52">
                  <span className="sr-only">Folder</span>
                  <Folder className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-black/35" size={14} />
                  <select value={selected.folderId ?? ""} onChange={event => editSelected({ folderId: event.target.value || undefined })} className="h-9 w-full appearance-none rounded-md border border-black/10 bg-white pl-8 pr-7 text-xs text-black/60 outline-none focus:border-brand">
                    <option value="">No folder</option>
                    {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-black/30" size={13} />
                </label>
                <SaveIndicator state={saveStates[selected.id] ?? "saved"} onRetry={() => retrySave(selected.id)} />
                {selected.status !== "active" ? (
                  <button type="button" onClick={() => void changeStatus(selected, "active")} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 px-2.5 text-xs font-medium text-black/60" title="Restore note"><RotateCcw size={14} /><span className="hidden sm:inline">Restore</span></button>
                ) : (
                  <button type="button" onClick={() => editSelected({ pinned: !selected.pinned })} className={`grid size-9 place-items-center rounded-md border ${selected.pinned ? "border-amber-300 bg-amber-50 text-amber-800" : "border-black/10 text-black/45"}`} title={selected.pinned ? "Unpin note" : "Pin note"} aria-label={selected.pinned ? "Unpin note" : "Pin note"}><Pin size={15} fill={selected.pinned ? "currentColor" : "none"} /></button>
                )}
                {selected.status === "active" ? <button type="button" onClick={() => void changeStatus(selected, "archived")} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45" title="Archive note" aria-label="Archive note"><Archive size={15} /></button> : null}
                {selected.status === "trashed" ? <button type="button" onClick={() => setNoteToDelete(selected)} className="grid size-9 place-items-center rounded-md border border-red-200 text-red-700" title="Delete forever" aria-label="Delete forever"><Trash2 size={15} /></button> : <button type="button" onClick={() => void changeStatus(selected, "trashed")} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/45 hover:border-red-200 hover:text-red-700" title="Move to trash" aria-label="Move to trash"><Trash2 size={15} /></button>}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 lg:px-9">
                <input
                  value={selected.title === "Untitled note" ? "" : selected.title}
                  onChange={event => editSelected({ title: event.target.value })}
                  onBlur={() => flushScheduled(selected.id, saveTimers, notesRef, revisions, persistNote)}
                  placeholder="Untitled note"
                  className="w-full border-0 bg-transparent p-0 text-2xl font-semibold text-black/90 outline-none placeholder:text-black/25 sm:text-3xl"
                />
                <div className="mt-3 flex min-h-8 flex-wrap items-center gap-1.5 border-y border-black/[0.07] py-2">
                  <Tag size={14} className="mr-1 text-black/30" />
                  {selected.tags.map(tag => (
                    <span key={tag} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-black/[0.055] px-2 text-[11px] font-medium text-black/55">
                      #{tag}
                      <button type="button" onClick={() => editSelected({ tags: selected.tags.filter(item => item !== tag) })} className="text-black/35 hover:text-black/70" aria-label={`Remove ${tag} tag`}><X size={12} /></button>
                    </span>
                  ))}
                  {selected.tags.length < 12 ? (
                    <input
                      value={tagDraft}
                      onChange={event => setTagDraft(event.target.value)}
                      onBlur={addTag}
                      onKeyDown={event => {
                        if (event.key !== "Enter" && event.key !== ",") return;
                        event.preventDefault();
                        addTag();
                      }}
                      placeholder={selected.tags.length ? "Add tag" : "Add tags"}
                      className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1 text-xs text-black/55 outline-none placeholder:text-black/30"
                    />
                  ) : null}
                </div>
                <textarea
                  value={selected.body}
                  onChange={event => editSelected({ body: event.target.value })}
                  onBlur={() => flushScheduled(selected.id, saveTimers, notesRef, revisions, persistNote)}
                  placeholder="Start writing..."
                  className="mt-5 min-h-[430px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-7 text-black/75 outline-none placeholder:text-black/25 md:min-h-[calc(100dvh-28rem)]"
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-2.5 text-[11px] text-black/38 sm:px-7 lg:px-9">
                <span>{wordCount(selected.body)} words · {selected.body.length.toLocaleString("en-GB")} characters</span>
                <span>Edited {formatRelative(selected.updatedAt)}</span>
              </div>
            </>
          ) : (
            <div className="grid min-h-96 flex-1 place-items-center px-6 text-center">
              <div>
                <span className="mx-auto grid size-11 place-items-center rounded-md bg-black/[0.04] text-black/30"><NotebookPen size={20} /></span>
                <h2 className="mt-3 text-sm font-semibold text-black/65">Choose a note</h2>
                <p className="mt-1 text-xs text-black/38">Or capture a new idea above.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {folderEditor ? (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/35 p-4" onMouseDown={event => { if (event.currentTarget === event.target) setFolderEditor(null); }}>
          <form onSubmit={event => { event.preventDefault(); void saveFolder(); }} className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase text-black/40">Organisation</p><h2 className="mt-1 text-lg font-semibold text-black/85">{folderEditor.id ? "Edit folder" : "New folder"}</h2></div>
              <button type="button" onClick={() => setFolderEditor(null)} className="grid size-8 place-items-center rounded-md text-black/45 hover:bg-black/[0.05]" aria-label="Close"><X size={17} /></button>
            </div>
            <label className="mt-5 block text-xs font-medium text-black/60">Folder name<input autoFocus value={folderEditor.name} onChange={event => setFolderEditor(current => current ? { ...current, name: event.target.value } : current)} maxLength={80} className="mt-1.5 h-10 w-full rounded-md border border-black/12 bg-white px-3 text-sm outline-none focus:border-brand" /></label>
            <fieldset className="mt-4"><legend className="text-xs font-medium text-black/60">Colour</legend><div className="mt-2 flex flex-wrap gap-2">{FOLDER_COLORS.map(color => <button type="button" key={color} onClick={() => setFolderEditor(current => current ? { ...current, color } : current)} className={`grid size-8 place-items-center rounded-md border ${folderEditor.color === color ? "border-black/50" : "border-transparent"}`} style={{ backgroundColor: `${color}1a` }} aria-label={`Use ${color}`}><span className="size-4 rounded-sm" style={{ backgroundColor: color }} />{folderEditor.color === color ? <span className="sr-only">Selected</span> : null}</button>)}</div></fieldset>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setFolderEditor(null)} className="min-h-10 rounded-md border border-black/12 px-3 text-sm font-medium text-black/60">Cancel</button><button type="submit" disabled={busy || !folderEditor.name.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <FolderOpen size={15} />}{folderEditor.id ? "Save folder" : "Create folder"}</button></div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog open={Boolean(folderToDelete)} title={`Delete ${folderToDelete?.name ?? "folder"}?`} body="Notes inside it will be moved to No folder. The notes themselves will not be deleted." confirmLabel="Delete folder" onCancel={() => setFolderToDelete(null)} onConfirm={() => { if (folderToDelete) void deleteFolder(folderToDelete); }} />
      <ConfirmDialog open={Boolean(noteToDelete)} title="Delete this note forever?" body="This removes the note permanently and cannot be undone." confirmLabel="Delete forever" onCancel={() => setNoteToDelete(null)} onConfirm={() => { if (noteToDelete) void permanentlyDelete(noteToDelete); }} />
    </div>
  );
}

function ViewButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return <button type="button" onClick={onClick} className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${active ? "bg-white font-medium text-black shadow-sm" : "text-black/60 hover:bg-black/[0.04]"}`}><span className="text-black/40">{icon}</span><span className="min-w-0 flex-1 truncate">{label}</span><span className="text-[10px] text-black/35">{count}</span></button>;
}

function CompactViewButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${active ? "border-brand bg-brand/[0.08] text-black/80" : "border-black/10 bg-white text-black/55"}`}>{icon}{label}<span className="text-[10px] text-black/35">{count}</span></button>;
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return <button type="button" onClick={onRetry} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-[10px] font-semibold text-red-700"><RotateCcw size={12} />Retry save</button>;
  }
  return <span className="inline-flex min-w-16 items-center justify-end gap-1 text-[10px] text-black/38">{state === "saving" ? <LoaderCircle className="animate-spin" size={12} /> : state === "saved" ? <Check size={12} /> : <MoreHorizontal size={13} />}{state === "saving" ? "Saving" : state === "saved" ? "Saved" : "Unsaved"}</span>;
}

function flushScheduled(
  noteId: string,
  timers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>,
  notes: React.MutableRefObject<NotepadNote[]>,
  revisions: React.MutableRefObject<Map<string, number>>,
  persist: (note: NotepadNote, revision: number) => Promise<unknown>,
) {
  const timer = timers.current.get(noteId);
  if (!timer) return;
  clearTimeout(timer);
  timers.current.delete(noteId);
  const note = notes.current.find(item => item.id === noteId);
  const revision = revisions.current.get(noteId);
  if (note && revision) void persist(note, revision);
}

function updateRequest(note: NotepadNote): Record<string, unknown> {
  return {
    action: "update-note",
    noteId: note.id,
    title: note.title,
    body: note.body,
    folderId: note.folderId ?? null,
    tags: note.tags,
    pinned: note.pinned,
    status: note.status,
  };
}

function draftKey(noteId: string): string {
  return `${DRAFT_KEY_PREFIX}${noteId}`;
}

function writeDraft(note: NotepadNote): void {
  try {
    const draft: NotepadDraft = {
      id: note.id,
      title: note.title,
      body: note.body,
      folderId: note.folderId,
      tags: note.tags,
      pinned: note.pinned,
      status: note.status,
      updatedAt: note.updatedAt,
    };
    window.localStorage.setItem(draftKey(note.id), JSON.stringify(draft));
  } catch {
    // The visible unsaved/error state and unload warning still protect the edit.
  }
}

function readDraft(noteId: string): NotepadDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotepadDraft>;
    if (parsed.id !== noteId || typeof parsed.title !== "string" || typeof parsed.body !== "string" || !Array.isArray(parsed.tags) || typeof parsed.updatedAt !== "number") return null;
    return parsed as NotepadDraft;
  } catch {
    return null;
  }
}

function clearDraft(noteId: string): void {
  try {
    window.localStorage.removeItem(draftKey(noteId));
  } catch {
    // A stale browser draft is harmless; server truth still won this save.
  }
}

function sendDraftsKeepalive(notes: NotepadNote[], forcedNoteIds = new Set<string>()): void {
  for (const note of notes) {
    const draft = readDraft(note.id);
    if (!draft && !forcedNoteIds.has(note.id)) continue;
    void fetch("/api/portal/notepad", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updateRequest(draft ? { ...note, ...draft } : note)),
      keepalive: true,
    }).catch(() => undefined);
  }
}

function viewForNote(note?: NotepadNote): NotebookView {
  if (!note || note.status === "active") return "all";
  return note.status === "archived" ? "archived" : "trashed";
}

function viewLabel(view: NotebookView, folders: NotepadFolder[]): string {
  if (view === "all") return "All notes";
  if (view === "pinned") return "Pinned notes";
  if (view === "archived") return "Archive";
  if (view === "trashed") return "Trash";
  return folders.find(folder => folder.id === view.slice("folder:".length))?.name ?? "Folder";
}

function emptyTitle(view: NotebookView): string {
  if (view === "pinned") return "Nothing pinned";
  if (view === "archived") return "Archive is empty";
  if (view === "trashed") return "Trash is empty";
  return "No notes here yet";
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function formatRelative(timestamp: number): string {
  const difference = Math.max(0, Date.now() - timestamp);
  if (difference < 60_000) return "just now";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  if (difference < 604_800_000) return `${Math.floor(difference / 86_400_000)}d ago`;
  const date = dateFromValue(timestamp);
  if (!date) return "Date needs review";
  return formatUkDate(date, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The notepad could not be updated.";
}
