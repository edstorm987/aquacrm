"use client";

import { useId, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  Download,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileUp,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  Layers,
  ListChecks,
  PenLine,
  Pencil,
  Presentation,
  Plus,
  Save,
  Search,
  Sparkles,
  Tags,
  Trash2,
  Video,
  Volume2,
  X,
} from "lucide-react";

import type { SopDocument, SopGuide } from "@/server/types";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { BlockRenderer } from "@/lib/elements/BlockRenderer";
import type { Block } from "@/lib/elements";
import {
  COMPOSER_BLOCK_TYPES,
  composerBlockType,
  createComposerBlock,
  type ComposerBlockType,
} from "./composerBlocks";
// Load-bearing side-effect: populates the shared element registry the
// BlockRenderer resolves against, so interactive SOP blocks render with real
// components instead of degrading to empty fragments. Mirrors how the portal
// storefront renderer pulls in the same library.
import "@/built-ins/modules/website-editor/src/components/blockRegistry";

type EditorDraft = {
  id?: string;
  title: string;
  category: string;
  categories: string[];
  tags: string;
  content: string;
};

const EMPTY_DRAFT: EditorDraft = { title: "", category: "", categories: [], tags: "", content: "" };

export function SopLibrary({ initialSops, initialCategories, initialGuides = [], canManageGuides = false }: {
  initialSops: SopDocument[];
  initialCategories: string[];
  initialGuides?: SopGuide[];
  canManageGuides?: boolean;
}) {
  const [view, setView] = useState<"library" | "guides">("library");
  const [guides, setGuides] = useState(initialGuides);
  const [sops, setSops] = useState(initialSops);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [manualCategories, setManualCategories] = useState(initialCategories);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<SopDocument | null>(null);
  const [organisingSop, setOrganisingSop] = useState<SopDocument | null>(null);
  const [composer, setComposer] = useState<ComposerDraft | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<{ category: string; replacementCategory: string } | null>(null);
  const [guideEditor, setGuideEditor] = useState<GuideEditorState | null>(null);
  const [viewingGuide, setViewingGuide] = useState<SopGuide | null>(null);
  const [error, setError] = useState("");

  function upsertGuide(guide: SopGuide) {
    setGuides(current => [guide, ...current.filter(item => item.id !== guide.id)]);
  }

  async function removeGuide(guide: SopGuide) {
    if (!window.confirm(`Delete guide “${guide.title}”? The SOPs it references are not affected.`)) return;
    setError("");
    const response = await fetch(`/api/portal/sop-guides?id=${encodeURIComponent(guide.id)}`, { method: "DELETE" });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "The guide could not be deleted.");
      return;
    }
    setGuides(current => current.filter(item => item.id !== guide.id));
  }

  const categories = useMemo(() => [...new Set([...manualCategories, ...uniqueCategories(sops)])].sort((a, b) => a.localeCompare(b)), [manualCategories, sops]);
  const allTags = useMemo(() => [...new Set(sops.flatMap(sop => sop.tags))].sort((a, b) => a.localeCompare(b)), [sops]);
  const writtenCount = sops.filter(sop => sop.kind === "written").length;
  const uploadedCount = sops.length - writtenCount;
  const selectedCategory = categoryFilter === "all" || categoryFilter === "uncategorised" ? "" : categoryFilter;
  const categoryFolders = useMemo(() => {
    const folders = categories.map(category => {
      const items = sops.filter(sop => sopInCategory(sop, category));
      return {
        id: category,
        label: category,
        count: items.length,
        written: items.filter(sop => sop.kind === "written").length,
        uploaded: items.filter(sop => sop.kind === "file").length,
        updatedAt: items.reduce((latest, sop) => Math.max(latest, sop.updatedAt), 0),
      };
    });
    const uncategorised = sops.filter(sop => sopCategories(sop).length === 0);
    if (uncategorised.length) {
      folders.push({
        id: "uncategorised",
        label: "Uncategorised",
        count: uncategorised.length,
        written: uncategorised.filter(sop => sop.kind === "written").length,
        uploaded: uncategorised.filter(sop => sop.kind === "file").length,
        updatedAt: uncategorised.reduce((latest, sop) => Math.max(latest, sop.updatedAt), 0),
      });
    }
    return folders.sort((a, b) => Number(b.updatedAt > a.updatedAt) - Number(a.updatedAt > b.updatedAt) || a.label.localeCompare(b.label));
  }, [categories, sops]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sops.filter(sop => {
      const matchesCategory = categoryFilter === "all"
        || (categoryFilter === "uncategorised" ? sopCategories(sop).length === 0 : sopInCategory(sop, categoryFilter));
      const matchesTag = tagFilter === "all" || sop.tags.some(tag => tag.toLowerCase() === tagFilter.toLowerCase());
      const matchesQuery = !needle
        || [sop.title, ...sopCategories(sop), sop.fileName, ...sop.tags].filter(Boolean).join(" ").toLowerCase().includes(needle);
      return matchesCategory && matchesTag && matchesQuery;
    });
  }, [categoryFilter, query, sops, tagFilter]);

  function upsert(sop: SopDocument) {
    setSops(current => [sop, ...current.filter(item => item.id !== sop.id)]);
    const assigned = sopCategories(sop);
    if (assigned.length) setManualCategories(current => [...new Set([...current, ...assigned])]);
  }

  function openWriter(category = selectedCategory) {
    setEditor({ ...EMPTY_DRAFT, category, categories: category ? [category] : [] });
  }

  function openComposer(category = selectedCategory) {
    setComposer({ title: "", category, categories: category ? [category] : [], tags: "", blocks: [] });
  }

  function editComposer(sop: SopDocument) {
    setComposer({
      id: sop.id,
      title: sop.title,
      category: sop.category ?? "",
      categories: sopCategories(sop),
      tags: sop.tags.join(", "),
      blocks: (sop.blocks ?? []).map(cloneComposerBlock),
    });
  }

  async function createCategory() {
    const category = newCategory.trim().slice(0, 80);
    if (!category) return;
    setError("");
    const response = await fetch("/api/portal/sops/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category }),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; category?: string; error?: string } | null;
    if (!response.ok || !result?.category) {
      setError(result?.error ?? "The category could not be created.");
      return;
    }
    setManualCategories(current => current.some(item => item.toLowerCase() === result.category!.toLowerCase()) ? current : [...current, result.category!]);
    setCategoryFilter(result.category);
    setNewCategory("");
    setCreatingCategory(false);
  }

  async function remove(sop: SopDocument) {
    if (!window.confirm(`Delete “${sop.title}”? This cannot be undone.`)) return;
    setError("");
    const response = await fetch(`/api/portal/sops?id=${encodeURIComponent(sop.id)}`, { method: "DELETE" });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "The SOP could not be deleted.");
      return;
    }
    setSops(current => current.filter(item => item.id !== sop.id));
  }

  async function deleteCategory() {
    if (!deletingCategory) return;
    setError("");
    const response = await fetch("/api/portal/sops/categories", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(deletingCategory),
    });
    const result = await response.json().catch(() => null) as {
      ok?: boolean;
      categories?: string[];
      updatedSops?: SopDocument[];
      error?: string;
    } | null;
    if (!response.ok || !result?.ok) {
      setError(result?.error ?? "The category could not be deleted.");
      return;
    }
    const updates = new Map((result.updatedSops ?? []).map(sop => [sop.id, sop]));
    setSops(current => current.map(sop => updates.get(sop.id) ?? sop));
    setManualCategories(result.categories ?? categories.filter(category => category !== deletingCategory.category));
    if (categoryFilter === deletingCategory.category) setCategoryFilter(deletingCategory.replacementCategory || "all");
    setDeletingCategory(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-black/40">Knowledge</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90 sm:text-3xl">SOP library</h1>
          <p className="mt-1 text-sm text-black/50">{view === "guides"
            ? "Compose ordered guides from the SOPs already in your library."
            : "Procedures, documents, presentations and training media in one organised library."}</p>
        </div>
        {view === "library" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCreatingCategory(current => !current)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70">
              <FolderPlus size={16} /> Create category
            </button>
            <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70">
              <FileUp size={16} /> Upload SOP
            </button>
            <button type="button" onClick={() => openComposer()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70">
              <Sparkles size={16} /> New interactive SOP
            </button>
            <button type="button" onClick={() => openWriter()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
              <PenLine size={16} /> Write SOP
            </button>
          </div>
        ) : canManageGuides ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setGuideEditor({ mode: "create", draft: { ...EMPTY_GUIDE_DRAFT } })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
              <Plus size={16} /> New guide
            </button>
          </div>
        ) : null}
      </header>

      <nav className="mt-4 inline-flex rounded-lg border border-black/10 bg-black/[0.025] p-1 text-sm font-semibold">
        <button type="button" onClick={() => setView("library")} aria-pressed={view === "library"} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 ${view === "library" ? "bg-white text-black/85 shadow-sm" : "text-black/50 hover:text-black/75"}`}>
          <BookOpen size={15} /> Library
        </button>
        <button type="button" onClick={() => setView("guides")} aria-pressed={view === "guides"} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 ${view === "guides" ? "bg-white text-black/85 shadow-sm" : "text-black/50 hover:text-black/75"}`}>
          <GraduationCap size={15} /> Guides<span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] text-black/45">{guides.length}</span>
        </button>
      </nav>

      {error ? <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {view === "guides" ? (
        <GuidesView
          guides={guides}
          sops={sops}
          canManage={canManageGuides}
          onEdit={guide => setGuideEditor({ mode: "edit", guide, draft: guideToDraft(guide) })}
          onView={setViewingGuide}
          onDelete={removeGuide}
        />
      ) : (
      <>

      {creatingCategory ? (
        <section className="mt-4 grid gap-2 rounded-lg border border-black/10 bg-black/[0.025] p-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            autoFocus
            value={newCategory}
            onChange={event => setNewCategory(event.target.value)}
            onKeyDown={event => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void createCategory();
            }}
            className="min-h-10 rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/40"
            placeholder="New SOP category name"
          />
          <button type="button" onClick={() => void createCategory()} disabled={!newCategory.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40"><FolderPlus size={15} /> Create folder</button>
          <button type="button" onClick={() => setCreatingCategory(false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/60"><X size={14} /> Cancel</button>
        </section>
      ) : null}

      <dl className="mt-5 grid grid-cols-3 gap-3">
        <LibraryMetric label="Procedures" value={String(sops.length)} icon={<BookOpen size={17} />} tone="blue" />
        <LibraryMetric label="Categories" value={String(categories.length)} icon={<FolderOpen size={17} />} tone="violet" />
        <LibraryMetric label="Uploaded" value={String(uploadedCount)} icon={<FileUp size={17} />} tone="emerald" />
      </dl>

      {sops.length === 0 && categories.length === 0 ? (
        <section className="mm-surface-card mt-4 grid min-h-[360px] place-items-center rounded-lg border border-dashed border-black/15 px-5 py-12 text-center">
          <div className="max-w-sm">
            <span className="mm-area-icon mx-auto grid size-12 place-items-center rounded-lg"><BookOpen size={21} /></span>
            <h2 className="mt-4 text-lg font-semibold text-black/80">No SOPs yet</h2>
            <p className="mt-1 text-sm leading-6 text-black/45">Write your first procedure or upload an existing document when you are ready.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 px-3 text-sm font-medium"><FileUp size={15} /> Upload file</button>
              <button type="button" onClick={() => openWriter()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><PenLine size={15} /> Write SOP</button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="relative w-full max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
              <input value={query} onChange={event => setQuery(event.target.value)} className="min-h-10 w-full rounded-md border border-black/12 bg-white pl-9 pr-3 text-sm outline-none focus:border-black/35" placeholder="Search SOPs" />
            </div>
            <label className="relative w-full sm:w-56">
              <FolderOpen size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
              <span className="sr-only">Filter by category</span>
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="min-h-10 w-full appearance-none rounded-md border border-black/12 bg-white pl-9 pr-8 text-sm text-black/65 outline-none focus:border-black/35">
                <option value="all">All categories</option>
                {categories.map(category => <option key={category} value={category}>{category}</option>)}
                {sops.some(sop => sopCategories(sop).length === 0) ? <option value="uncategorised">Uncategorised</option> : null}
              </select>
            </label>
            <label className="relative w-full">
              <Tags size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
              <span className="sr-only">Filter by tag</span>
              <select value={tagFilter} onChange={event => setTagFilter(event.target.value)} className="min-h-10 w-full appearance-none rounded-md border border-black/12 bg-white pl-9 pr-8 text-sm text-black/65 outline-none focus:border-black/35">
                <option value="all">All tags</option>
                {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </label>
          </div>
          {categoryFilter === "all" && !query.trim() && tagFilter === "all" ? <section className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-black/78">Folders</h2>
                <p className="mt-0.5 text-xs text-black/42">An SOP can appear in more than one folder while keeping one primary home.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryFolders.map(folder => {
                return (
                  <article key={folder.id} className="relative min-h-32 rounded-lg border border-black/10 bg-white p-4 text-black/72 transition hover:border-black/25 hover:bg-black/[0.02]">
                    <button type="button" onClick={() => setCategoryFilter(folder.id)} className="absolute inset-0 rounded-lg" aria-label={`Open ${folder.label}`} />
                    <span className="relative pointer-events-none flex items-start justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-md bg-black/[0.045] text-black/55"><Folder size={18} /></span>
                      <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[10px] font-semibold text-black/45">{folder.count}</span>
                    </span>
                    <strong className="relative pointer-events-none mt-3 block truncate pr-8 text-sm">{folder.label}</strong>
                    <span className="relative pointer-events-none mt-1 block text-xs text-black/42">{folder.written} written · {folder.uploaded} uploads</span>
                    {folder.id !== "uncategorised" ? <button type="button" title={`Delete ${folder.label} category`} onClick={() => setDeletingCategory({ category: folder.id, replacementCategory: "" })} className="absolute bottom-3 right-3 z-10 grid size-8 place-items-center rounded-md text-black/30 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button> : null}
                  </article>
                );
              })}
              <button type="button" onClick={() => setCreatingCategory(true)} className="grid min-h-32 place-items-center rounded-lg border border-dashed border-black/15 bg-white p-4 text-center text-sm font-semibold text-black/45 hover:border-black/30 hover:text-black/65">
                <span><FolderPlus className="mx-auto mb-2" size={20} />Create category</span>
              </button>
            </div>
          </section> : null}

          {categoryFilter !== "all" || query.trim() || tagFilter !== "all" ? <section className="mt-4 grid gap-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-black/78">{categoryFilter === "all" ? "Matching SOPs" : categoryFilter === "uncategorised" ? "Uncategorised SOPs" : categoryFilter}</h2>
                <p className="mt-0.5 text-xs text-black/42">{visible.length} result{visible.length === 1 ? "" : "s"}{tagFilter !== "all" ? ` tagged ${tagFilter}` : ""}.</p>
              </div>
              <div className="flex items-center gap-2">
                {categoryFilter !== "all" && categoryFilter !== "uncategorised" ? <button type="button" title="Delete category" onClick={() => setDeletingCategory({ category: categoryFilter, replacementCategory: "" })} className="grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/40 hover:border-red-200 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button> : null}
                {categoryFilter !== "all" ? <button type="button" onClick={() => setCategoryFilter("all")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62"><ChevronLeft size={13} /> Back to folders</button> : null}
              </div>
            </div>
            {visible.length ? visible.map(sop => (
              <article key={sop.id} className="mm-surface-card mm-hover-lift flex flex-col gap-3 rounded-lg border border-black/10 p-4 sm:flex-row sm:items-center">
                <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md">
                  {resourceIcon(sop)}
                </span>
                <button type="button" onClick={() => sop.kind === "interactive" ? editComposer(sop) : sop.kind === "written" ? setEditor({
                  id: sop.id,
                  title: sop.title,
                  category: sop.category ?? "",
                  categories: sopCategories(sop),
                  tags: sop.tags.join(", "),
                  content: sop.content ?? "",
                }) : setEditingFile(sop)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold text-black/80">{sop.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black/40">
                    <span>{resourceLabel(sop)}{sop.fileName ? ` · ${sop.fileName}` : ""}</span>
                    {sopCategories(sop).length ? <span>{sopCategories(sop).join(" · ")}</span> : null}
                    <span>Updated {formatDate(sop.updatedAt)}</span>
                  </span>
                  {sop.tags.length ? <span className="mt-2 flex flex-wrap gap-1">{sop.tags.slice(0, 5).map(tag => <span key={tag} className="rounded bg-black/[0.045] px-1.5 py-0.5 text-[10px] font-medium text-black/50">{tag}</span>)}</span> : null}
                </button>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                  {sop.kind === "file" ? <a href={`/api/portal/sops/content?id=${encodeURIComponent(sop.id)}`} target="_blank" rel="noreferrer" title="Open file" className="grid size-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black"><Download size={16} /></a> : null}
                  <button type="button" title="Move, categorise or tag SOP" onClick={() => setOrganisingSop(sop)} className="grid size-9 place-items-center rounded-md text-black/40 hover:bg-black/[0.04] hover:text-black"><FolderInput size={16} /></button>
                  <button type="button" title="Delete SOP" onClick={() => void remove(sop)} className="grid size-9 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button>
                </div>
              </article>
            )) : <div className="mm-surface-card rounded-lg border border-dashed border-black/15 px-4 py-12 text-center text-sm text-black/45">
              <p>No SOPs match this view.</p>
              <button type="button" onClick={() => openWriter(selectedCategory)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white"><PenLine size={15} /> Write SOP here</button>
            </div>}
          </section> : null}
        </>
      )}
      </>
      )}

      {editor ? <WrittenSopModal
        draft={editor}
        categories={categories}
        onClose={() => setEditor(null)}
        onSaved={sop => { upsert(sop); setEditor(null); }}
        onError={setError}
      /> : null}
      {uploadOpen ? <UploadSopModal
        categories={categories}
        initialCategory={selectedCategory}
        onClose={() => setUploadOpen(false)}
        onUploaded={sop => { upsert(sop); setUploadOpen(false); }}
        onError={setError}
      /> : null}
      {editingFile ? <FileDetailsModal
        sop={editingFile}
        categories={categories}
        onClose={() => setEditingFile(null)}
        onSaved={sop => { upsert(sop); setEditingFile(null); }}
        onError={setError}
      /> : null}
      {organisingSop ? <OrganiseSopModal
        sop={organisingSop}
        categories={categories}
        onClose={() => setOrganisingSop(null)}
        onSaved={sop => { upsert(sop); setOrganisingSop(null); }}
        onError={setError}
      /> : null}
      {composer ? <InteractiveSopComposerModal
        draft={composer}
        categories={categories}
        onClose={() => setComposer(null)}
        onSaved={sop => { upsert(sop); setComposer(null); }}
        onError={setError}
      /> : null}
      {deletingCategory ? <Modal title="Delete category" onClose={() => setDeletingCategory(null)}>
        <div className="grid gap-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong className="block">Delete “{deletingCategory.category}”?</strong>
            <span className="mt-1 block text-red-700/75">{sops.filter(sop => sopInCategory(sop, deletingCategory.category)).length} SOP{sops.filter(sop => sopInCategory(sop, deletingCategory.category)).length === 1 ? "" : "s"} currently appear in this category.</span>
          </div>
          <Field label="Relocate affected SOPs">
            <select value={deletingCategory.replacementCategory} onChange={event => setDeletingCategory(current => current ? { ...current, replacementCategory: event.target.value } : null)} className={inputClass}>
              <option value="">Remove this category only</option>
              {categories.filter(category => category !== deletingCategory.category).map(category => <option key={category} value={category}>Move to {category}</option>)}
            </select>
            <span className="text-[11px] font-normal text-black/40">Other folder memberships and tags will be preserved.</span>
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeletingCategory(null)} className={secondaryButton}>Cancel</button>
            <button type="button" onClick={() => void deleteCategory()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"><Trash2 size={14} /> Delete category</button>
          </div>
        </div>
      </Modal> : null}
      {guideEditor ? <GuideComposerModal
        editor={guideEditor}
        sops={sops}
        onClose={() => setGuideEditor(null)}
        onSaved={guide => { upsertGuide(guide); setGuideEditor(null); }}
        onError={setError}
      /> : null}
      {viewingGuide ? <GuideViewer guide={viewingGuide} sops={sops} onClose={() => setViewingGuide(null)} /> : null}
    </div>
  );
}

// ─── SOP guides (SOP Engine Phase 3) ──────────────────────────────────────

type GuideDraft = {
  title: string;
  description: string;
  sopIds: string[];
  quizEnabled: boolean;
};

type GuideEditorState =
  | { mode: "create"; draft: GuideDraft }
  | { mode: "edit"; guide: SopGuide; draft: GuideDraft };

const EMPTY_GUIDE_DRAFT: GuideDraft = { title: "", description: "", sopIds: [], quizEnabled: false };

function guideToDraft(guide: SopGuide): GuideDraft {
  return {
    title: guide.title,
    description: guide.description ?? "",
    sopIds: [...guide.sopIds],
    quizEnabled: guide.quizEnabled === true,
  };
}

function GuidesView({ guides, sops, canManage, onEdit, onView, onDelete }: {
  guides: SopGuide[];
  sops: SopDocument[];
  canManage: boolean;
  onEdit: (guide: SopGuide) => void;
  onView: (guide: SopGuide) => void;
  onDelete: (guide: SopGuide) => void;
}) {
  const sopById = useMemo(() => new Map(sops.map(sop => [sop.id, sop])), [sops]);

  if (!guides.length) {
    return (
      <section className="mm-surface-card mt-5 grid min-h-[320px] place-items-center rounded-lg border border-dashed border-black/15 px-5 py-12 text-center">
        <div className="max-w-sm">
          <span className="mm-area-icon mx-auto grid size-12 place-items-center rounded-lg"><GraduationCap size={21} /></span>
          <h2 className="mt-4 text-lg font-semibold text-black/80">No guides yet</h2>
          <p className="mt-1 text-sm leading-6 text-black/45">A guide is an ordered run of SOPs you already have — pick them, order them, and read them as one sequence.{canManage ? "" : " Ask an owner or manager to compose one."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5 grid gap-3">
      {guides.map(guide => {
        const resolved = guide.sopIds.map(id => sopById.get(id)).filter((sop): sop is SopDocument => Boolean(sop));
        const missing = guide.sopIds.length - resolved.length;
        return (
          <article key={guide.id} className="mm-surface-card flex flex-col gap-3 rounded-lg border border-black/10 p-4 sm:flex-row sm:items-center">
            <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md"><Layers size={17} /></span>
            <button type="button" onClick={() => onView(guide)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-black/80">{guide.title}</span>
              {guide.description ? <span className="mt-0.5 block truncate text-xs text-black/45">{guide.description}</span> : null}
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black/40">
                <span>{guide.sopIds.length} SOP{guide.sopIds.length === 1 ? "" : "s"}</span>
                {missing ? <span className="text-amber-700">{missing} missing</span> : null}
                {guide.quizEnabled ? <span className="inline-flex items-center gap-1 text-black/50"><ListChecks size={12} /> Quiz</span> : null}
                <span>Updated {formatDate(guide.updatedAt)}</span>
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
              <button type="button" title="View guide" onClick={() => onView(guide)} className="grid size-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black"><Eye size={16} /></button>
              {canManage ? <button type="button" title="Edit guide" onClick={() => onEdit(guide)} className="grid size-9 place-items-center rounded-md text-black/40 hover:bg-black/[0.04] hover:text-black"><Pencil size={16} /></button> : null}
              {canManage ? <button type="button" title="Delete guide" onClick={() => onDelete(guide)} className="grid size-9 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function GuideComposerModal({ editor, sops, onClose, onSaved, onError }: {
  editor: GuideEditorState;
  sops: SopDocument[];
  onClose: () => void;
  onSaved: (guide: SopGuide) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(editor.draft);
  const [pickerQuery, setPickerQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const sopById = useMemo(() => new Map(sops.map(sop => [sop.id, sop])), [sops]);

  const selectedSops = draft.sopIds.map(id => sopById.get(id)).filter((sop): sop is SopDocument => Boolean(sop));
  const available = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    return sops
      .filter(sop => !draft.sopIds.includes(sop.id))
      .filter(sop => !needle || [sop.title, ...(sop.categories ?? []), ...sop.tags].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [sops, draft.sopIds, pickerQuery]);

  function addSop(id: string) {
    setDraft(current => current.sopIds.includes(id) ? current : { ...current, sopIds: [...current.sopIds, id] });
  }
  function removeSop(id: string) {
    setDraft(current => ({ ...current, sopIds: current.sopIds.filter(item => item !== id) }));
  }
  function moveSop(index: number, delta: number) {
    setDraft(current => {
      const next = [...current.sopIds];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, sopIds: next };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return onError("A guide needs a title.");
    setBusy(true);
    onError("");
    const payload = {
      ...(editor.mode === "edit" ? { id: editor.guide.id } : {}),
      title: draft.title,
      description: draft.description,
      sopIds: draft.sopIds,
      quizEnabled: draft.quizEnabled,
    };
    const response = await fetch("/api/portal/sop-guides", {
      method: editor.mode === "edit" ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; guide?: SopGuide; error?: string } | null;
    setBusy(false);
    if (!response.ok || !result?.guide) return onError(result?.error ?? "The guide could not be saved.");
    onSaved(result.guide);
  }

  return <Modal title={editor.mode === "edit" ? "Edit guide" : "New guide"} onClose={onClose} wide>
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Title"><input required autoFocus value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className={inputClass} placeholder="e.g. New starter onboarding" /></Field>
      <Field label="Description"><textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} rows={2} className={`${inputClass} resize-y py-2 leading-6`} placeholder="What this guide walks someone through." /></Field>

      <div className="grid gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-black/60">Sequence</p>
            <p className="mt-0.5 text-[11px] text-black/40">Add SOPs and order them — this is the run someone reads top to bottom.</p>
          </div>
          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold text-black/45">{selectedSops.length} selected</span>
        </div>

        {selectedSops.length ? <ol className="grid gap-1.5">
          {draft.sopIds.map((id, index) => {
            const sop = sopById.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border border-black/10 bg-white px-2.5 py-2">
                <span className="grid size-6 shrink-0 place-items-center rounded bg-black/[0.05] text-[11px] font-semibold text-black/50">{index + 1}</span>
                <span className="text-black/40">{sop ? resourceIcon(sop, 15) : <FileText size={15} />}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-black/75">{sop ? sop.title : <em className="text-amber-700">Missing SOP ({id})</em>}</span>
                <button type="button" title="Move up" disabled={index === 0} onClick={() => moveSop(index, -1)} className="grid size-8 place-items-center rounded text-black/40 hover:bg-black/[0.05] disabled:opacity-25"><ArrowUp size={15} /></button>
                <button type="button" title="Move down" disabled={index === draft.sopIds.length - 1} onClick={() => moveSop(index, 1)} className="grid size-8 place-items-center rounded text-black/40 hover:bg-black/[0.05] disabled:opacity-25"><ArrowDown size={15} /></button>
                <button type="button" title="Remove" onClick={() => removeSop(id)} className="grid size-8 place-items-center rounded text-black/35 hover:bg-red-50 hover:text-red-700"><X size={15} /></button>
              </li>
            );
          })}
        </ol> : <p className="rounded-md border border-dashed border-black/10 bg-white px-3 py-4 text-center text-xs text-black/40">No SOPs added yet — pick from the list below.</p>}

        <div className="grid gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
            <input value={pickerQuery} onChange={event => setPickerQuery(event.target.value)} className="min-h-10 w-full rounded-md border border-black/12 bg-white pl-9 pr-3 text-sm outline-none focus:border-black/35" placeholder="Search SOPs to add" />
          </div>
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-black/10 bg-white p-1.5">
            {available.length ? available.map(sop => (
              <button key={sop.id} type="button" onClick={() => addSop(sop.id)} className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-black/70 hover:bg-black/[0.04]">
                <span className="text-black/40">{resourceIcon(sop, 15)}</span>
                <span className="min-w-0 flex-1 truncate">{sop.title}</span>
                <span className="text-[10px] text-black/35">{resourceLabel(sop)}</span>
                <Plus size={14} className="text-black/40" />
              </button>
            )) : <p className="px-2 py-3 text-center text-xs text-black/40">{sops.length ? "No SOPs match." : "Write or upload SOPs first, then compose them into a guide."}</p>}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2.5 rounded-md border border-black/10 bg-black/[0.018] px-3 py-2.5 text-sm text-black/70">
        <input type="checkbox" checked={draft.quizEnabled} onChange={event => setDraft(current => ({ ...current, quizEnabled: event.target.checked }))} className="size-4 accent-black" />
        <span><span className="font-medium">Quiz / completion gate</span><span className="block text-[11px] text-black/40">Opt-in per guide. Off by default.</span></span>
      </label>

      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}><Save size={15} />{busy ? "Saving..." : "Save guide"}</button></div>
    </form>
  </Modal>;
}

function GuideViewer({ guide, sops, onClose }: { guide: SopGuide; sops: SopDocument[]; onClose: () => void }) {
  const sopById = useMemo(() => new Map(sops.map(sop => [sop.id, sop])), [sops]);
  return <Modal title={guide.title} onClose={onClose} wide>
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-black/45">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 font-semibold"><Layers size={12} /> Guide</span>
        <span>{guide.sopIds.length} SOP{guide.sopIds.length === 1 ? "" : "s"}</span>
        {guide.quizEnabled ? <span className="inline-flex items-center gap-1"><ListChecks size={12} /> Quiz enabled</span> : null}
      </div>
      {guide.description ? <p className="text-sm leading-6 text-black/60">{guide.description}</p> : null}
      {guide.sopIds.length ? <ol className="grid gap-4">
        {guide.sopIds.map((id, index) => {
          const sop = sopById.get(id);
          return (
            <li key={id} className="rounded-lg border border-black/10 bg-white">
              <div className="flex items-center gap-2 border-b border-black/8 px-4 py-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded bg-black/[0.05] text-[11px] font-semibold text-black/50">{index + 1}</span>
                <span className="text-black/40">{sop ? resourceIcon(sop, 15) : <FileText size={15} />}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-black/80">{sop ? sop.title : "Missing SOP"}</span>
                {sop ? <span className="text-[10px] text-black/35">{resourceLabel(sop)}</span> : null}
              </div>
              <div className="p-4">
                {sop ? <GuideSopContent sop={sop} /> : <p className="text-sm text-amber-700">This SOP ({id}) no longer exists in the library.</p>}
              </div>
            </li>
          );
        })}
      </ol> : <p className="rounded-lg border border-dashed border-black/15 px-4 py-10 text-center text-sm text-black/40">This guide has no SOPs yet.</p>}
      <div className="flex justify-end"><button type="button" onClick={onClose} className={secondaryButton}>Close</button></div>
    </div>
  </Modal>;
}

function GuideSopContent({ sop }: { sop: SopDocument }) {
  if (sop.kind === "interactive") {
    return sop.blocks && sop.blocks.length
      ? <BlockRenderer blocks={sop.blocks} />
      : <p className="py-4 text-center text-sm text-black/40">This interactive SOP has no content yet.</p>;
  }
  if (sop.kind === "written") {
    return sop.content?.trim()
      ? <div className="whitespace-pre-wrap text-sm leading-6 text-black/70">{sop.content}</div>
      : <p className="py-4 text-center text-sm text-black/40">This written SOP has no content yet.</p>;
  }
  return (
    <div className="flex items-center gap-3 rounded-md bg-black/[0.03] p-3">
      <span className="text-black/40">{resourceIcon(sop, 20)}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-black/75">{sop.fileName ?? sop.title}</p><p className="text-xs text-black/40">{resourceLabel(sop)}</p></div>
      <a href={`/api/portal/sops/content?id=${encodeURIComponent(sop.id)}`} target="_blank" rel="noreferrer" className={`${secondaryButton} inline-flex items-center gap-2`}><Download size={15} /> Open</a>
    </div>
  );
}

function WrittenSopModal({ draft, categories, onClose, onSaved, onError }: {
  draft: EditorDraft;
  categories: string[];
  onClose: () => void;
  onSaved: (sop: SopDocument) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(draft);
  const [busy, setBusy] = useState(false);
  return <Modal title={draft.id ? "Edit SOP" : "Write SOP"} onClose={onClose} wide>
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      onError("");
      const response = await fetch("/api/portal/sops", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...value, tags: splitTags(value.tags) }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; sop?: SopDocument; error?: string } | null;
      setBusy(false);
      if (!response.ok || !result?.sop) return onError(result?.error ?? "The SOP could not be saved.");
      onSaved(result.sop);
    }}>
      <Field label="Title"><input required autoFocus value={value.title} onChange={event => setValue(current => ({ ...current, title: event.target.value }))} className={inputClass} /></Field>
      <CategoryAssignmentFields
        primary={value.category}
        assigned={value.categories}
        categories={categories}
        onChange={(category, assigned) => setValue(current => ({ ...current, category, categories: assigned }))}
      />
      <Field label="Tags"><input value={value.tags} onChange={event => setValue(current => ({ ...current, tags: event.target.value }))} className={inputClass} placeholder="Training, onboarding, finance" /></Field>
      <Field label="Procedure"><textarea required value={value.content} onChange={event => setValue(current => ({ ...current, content: event.target.value }))} rows={16} className={`${inputClass} resize-y py-3 leading-6`} /></Field>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}><Save size={15} />{busy ? "Saving..." : "Save SOP"}</button></div>
    </form>
  </Modal>;
}

function UploadSopModal({ categories, initialCategory, onClose, onUploaded, onError }: {
  categories: string[];
  initialCategory: string;
  onClose: () => void;
  onUploaded: (sop: SopDocument) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(initialCategory);
  const [assignedCategories, setAssignedCategories] = useState(initialCategory ? [initialCategory] : []);
  return <Modal title="Upload SOP" onClose={onClose}>
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      onError("");
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/portal/sops/upload", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as { ok?: boolean; sop?: SopDocument; error?: string } | null;
      setBusy(false);
      if (!response.ok || !result?.sop) return onError(result?.error ?? "The file could not be uploaded.");
      onUploaded(result.sop);
    }}>
      <Field label="File"><input required name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.ppt,.pptx,.odp,.key,.mp4,.mov,.webm,.mpeg,.mpg,.m4v,.mp3,.m4a,.wav,.ogg" className="min-h-11 w-full rounded-md border border-dashed border-black/20 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" /><span className="text-[11px] font-normal text-black/40">Documents and images up to 25 MB, presentations and audio up to 100 MB, or video up to 250 MB.</span></Field>
      <Field label="Title"><input name="title" className={inputClass} placeholder="Defaults to the file name" /></Field>
      <CategoryAssignmentFields
        primary={category}
        assigned={assignedCategories}
        categories={categories}
        onChange={(nextCategory, assigned) => { setCategory(nextCategory); setAssignedCategories(assigned); }}
        primaryName="category"
        categoriesName="categories"
      />
      <Field label="Tags"><input name="tags" className={inputClass} placeholder="Training, onboarding, finance" /></Field>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}><FileUp size={15} />{busy ? "Uploading..." : "Upload file"}</button></div>
    </form>
  </Modal>;
}

function FileDetailsModal({ sop, categories, onClose, onSaved, onError }: {
  sop: SopDocument;
  categories: string[];
  onClose: () => void;
  onSaved: (sop: SopDocument) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(sop.title);
  const [category, setCategory] = useState(sop.category ?? "");
  const [assignedCategories, setAssignedCategories] = useState(sopCategories(sop));
  const [tags, setTags] = useState(sop.tags.join(", "));
  const [busy, setBusy] = useState(false);
  return <Modal title="File details" onClose={onClose}>
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      const response = await fetch("/api/portal/sops", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sop.id, title, category, categories: assignedCategories, tags: splitTags(tags) }) });
      const result = await response.json().catch(() => null) as { sop?: SopDocument; error?: string } | null;
      setBusy(false);
      if (!response.ok || !result?.sop) return onError(result?.error ?? "The file details could not be saved.");
      onSaved(result.sop);
    }}>
      <div className="flex items-center gap-3 rounded-md bg-black/[0.03] p-3"><span className="text-black/40">{resourceIcon(sop, 20)}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{sop.fileName}</p><p className="text-xs text-black/40">{resourceLabel(sop)} · {formatBytes(sop.size)}</p></div></div>
      <Field label="Title"><input required value={title} onChange={event => setTitle(event.target.value)} className={inputClass} /></Field>
      <CategoryAssignmentFields primary={category} assigned={assignedCategories} categories={categories} onChange={(nextCategory, assigned) => { setCategory(nextCategory); setAssignedCategories(assigned); }} />
      <Field label="Tags"><input value={tags} onChange={event => setTags(event.target.value)} className={inputClass} placeholder="Training, onboarding, finance" /></Field>
      <div className="flex justify-between gap-2"><a href={`/api/portal/sops/content?id=${encodeURIComponent(sop.id)}`} target="_blank" rel="noreferrer" className={`${secondaryButton} inline-flex items-center gap-2`}><Download size={15} />Open file</a><button disabled={busy} className={primaryButton}><Save size={15} />{busy ? "Saving..." : "Save details"}</button></div>
    </form>
  </Modal>;
}

function OrganiseSopModal({ sop, categories, onClose, onSaved, onError }: {
  sop: SopDocument;
  categories: string[];
  onClose: () => void;
  onSaved: (sop: SopDocument) => void;
  onError: (message: string) => void;
}) {
  const [category, setCategory] = useState(sop.category ?? "");
  const [assignedCategories, setAssignedCategories] = useState(sopCategories(sop));
  const [tags, setTags] = useState(sop.tags.join(", "));
  const [busy, setBusy] = useState(false);
  return <Modal title="Organise SOP" onClose={onClose}>
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      onError("");
      const response = await fetch("/api/portal/sops", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sop.id, category, categories: assignedCategories, tags: splitTags(tags) }),
      });
      const result = await response.json().catch(() => null) as { sop?: SopDocument; error?: string } | null;
      setBusy(false);
      if (!response.ok || !result?.sop) return onError(result?.error ?? "The SOP could not be organised.");
      onSaved(result.sop);
    }}>
      <div className="flex items-center gap-3 rounded-md bg-black/[0.03] p-3">
        <span className="text-black/40">{resourceIcon(sop, 20)}</span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-black/75">{sop.title}</p><p className="text-xs text-black/40">{resourceLabel(sop)}</p></div>
      </div>
      <CategoryAssignmentFields primary={category} assigned={assignedCategories} categories={categories} onChange={(nextCategory, assigned) => { setCategory(nextCategory); setAssignedCategories(assigned); }} />
      <Field label="Tags"><input value={tags} onChange={event => setTags(event.target.value)} className={inputClass} placeholder="Training, onboarding, finance" /></Field>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}><Save size={15} />{busy ? "Saving..." : "Save organisation"}</button></div>
    </form>
  </Modal>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-[100] grid items-end bg-black/40 sm:items-center sm:p-6"><button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={title} className={`relative mx-auto max-h-[100dvh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-lg sm:p-6 ${wide ? "max-w-3xl" : "max-w-xl"}`}><header className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-black/85">{title}</h2><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><X size={16} /></button></header>{children}</section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-black/55">{label}{children}</label>;
}

function LibraryMetric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "blue" | "emerald" | "violet" }) {
  return <div className="mm-kpi-card mm-surface-card min-w-0 rounded-lg border border-black/10 px-3 py-3 sm:px-4" data-kpi-tone={tone}><div className="flex items-start justify-between gap-2"><dt className="truncate text-[9px] font-semibold uppercase text-black/40 sm:text-[10px]">{label}</dt><span className="mm-kpi-icon hidden size-7 shrink-0 place-items-center rounded-md sm:grid">{icon}</span></div><dd className="mt-1 text-xl font-semibold text-black/85 sm:text-2xl">{value}</dd></div>;
}

function CategoryAssignmentFields({ primary, assigned, categories, onChange, primaryName, categoriesName }: {
  primary: string;
  assigned: string[];
  categories: string[];
  onChange: (primary: string, assigned: string[]) => void;
  primaryName?: string;
  categoriesName?: string;
}) {
  const available = uniqueStrings([...categories, ...assigned, ...(primary ? [primary] : [])]);
  const assignedValues = uniqueStrings([...assigned, ...(primary ? [primary] : [])]);

  function changePrimary(nextPrimary: string) {
    const next = nextPrimary.trimStart().slice(0, 80);
    const withoutPrevious = assignedValues.filter(category => category.toLowerCase() !== primary.toLowerCase());
    onChange(next, uniqueStrings([...withoutPrevious, ...(next ? [next] : [])]));
  }

  function toggleCategory(category: string, checked: boolean) {
    const next = checked
      ? uniqueStrings([...assignedValues, category])
      : assignedValues.filter(item => item.toLowerCase() !== category.toLowerCase());
    onChange(primary, next);
  }

  return <div className="grid gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3">
    <CategoryField name={primaryName} value={primary} categories={available} onChange={changePrimary} />
    <div className="grid gap-2">
      <div><p className="text-xs font-medium text-black/55">Also appears in</p><p className="mt-0.5 text-[11px] text-black/40">The primary folder is its main home. Select any additional folders where it should also be found.</p></div>
      {available.filter(category => category.toLowerCase() !== primary.toLowerCase()).length ? <div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border border-black/10 bg-white p-2 sm:grid-cols-2">
        {available.filter(category => category.toLowerCase() !== primary.toLowerCase()).map(category => {
          const checked = assignedValues.some(item => item.toLowerCase() === category.toLowerCase());
          return <label key={category} className="flex min-h-8 items-center gap-2 rounded px-2 text-xs text-black/65 hover:bg-black/[0.03]"><input type="checkbox" checked={checked} onChange={event => toggleCategory(category, event.target.checked)} className="size-4 accent-black" />{category}</label>;
        })}
      </div> : <p className="rounded-md border border-dashed border-black/10 bg-white px-3 py-2 text-xs text-black/40">Create another category to file this SOP in multiple folders.</p>}
      {categoriesName ? assignedValues.map(category => <input key={category} type="hidden" name={categoriesName} value={category} />) : null}
    </div>
  </div>;
}

function CategoryField({ value, categories, onChange, name }: { value: string; categories: string[]; onChange?: (value: string) => void; name?: string }) {
  const fieldId = useId();
  const listId = `${fieldId}-options`;
  const [localValue, setLocalValue] = useState(value);
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const selectedValue = onChange ? value : localValue;

  function selectCategory(nextValue: string) {
    const cleanValue = nextValue.trimStart().slice(0, 80);
    if (onChange) onChange(cleanValue);
    else setLocalValue(cleanValue);
  }

  function createCategory() {
    const cleanCategory = newCategory.trim().slice(0, 80);
    if (!cleanCategory) return;
    selectCategory(cleanCategory);
    setNewCategory("");
    setCreating(false);
  }

  return <div className="grid gap-1.5">
    <div className="flex min-h-6 items-center justify-between gap-3">
      <label htmlFor={fieldId} className="text-xs font-medium text-black/55">Category</label>
      <button
        type="button"
        onClick={() => setCreating(current => !current)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-black/55 hover:text-black"
        aria-expanded={creating}
      >
        <Plus size={13} aria-hidden="true" /> New category
      </button>
    </div>
    <input
      id={fieldId}
      name={name}
      list={listId}
      value={selectedValue}
      onChange={event => selectCategory(event.target.value)}
      className={inputClass}
      placeholder="Choose a category"
    />
    <datalist id={listId}>{categories.map(category => <option key={category} value={category} />)}</datalist>
    {creating ? <div className="grid gap-2 rounded-md border border-black/10 bg-black/[0.025] p-2 sm:grid-cols-[1fr_auto]">
      <input
        autoFocus
        value={newCategory}
        onChange={event => setNewCategory(event.target.value)}
        onKeyDown={event => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          createCategory();
        }}
        className="min-h-9 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/40"
        placeholder="Category name"
        aria-label="New category name"
      />
      <button type="button" onClick={createCategory} disabled={!newCategory.trim()} className="min-h-9 rounded-md bg-black px-3 text-xs font-semibold text-white disabled:opacity-40">Add category</button>
    </div> : null}
    <p className="text-[11px] text-black/40">The category is saved when you save this SOP.</p>
  </div>;
}

function uniqueCategories(sops: SopDocument[]) {
  return uniqueStrings(sops.flatMap(sopCategories));
}

function sopCategories(sop: SopDocument): string[] {
  return uniqueStrings([...(sop.categories ?? []), ...(sop.category ? [sop.category] : [])]);
}

function sopInCategory(sop: SopDocument, category: string): boolean {
  return sopCategories(sop).some(item => item.toLowerCase() === category.toLowerCase());
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(value => value.trim()).sort((a, b) => a.localeCompare(b));
}

// ─── Interactive SOP composer (SOP Engine) ────────────────────────────────
//
// A SIMPLE block composer — add / reorder / remove a small set of element-engine
// block types and edit each block's content with basic form fields. It never
// touches the website-editor plugin: blocks are seeded via the element engine's
// own `createComposerBlock` and rendered through the shared `BlockRenderer`, so
// what is composed here is exactly what the library renders. On save the block
// tree is persisted as a `kind: "interactive"` SopDocument through the existing
// sops create/update route, which validates it against the element schema.

type ComposerDraft = {
  id?: string;
  title: string;
  category: string;
  categories: string[];
  tags: string;
  blocks: Block[];
};

/** A structural clone so editing a draft never mutates the stored SOP's blocks. */
function cloneComposerBlock(block: Block): Block {
  return {
    ...block,
    props: { ...(block.props ?? {}) },
    children: block.children ? block.children.map(cloneComposerBlock) : block.children,
  };
}

function InteractiveSopComposerModal({ draft, categories, onClose, onSaved, onError }: {
  draft: ComposerDraft;
  categories: string[];
  onClose: () => void;
  onSaved: (sop: SopDocument) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(draft);
  const [busy, setBusy] = useState(false);

  function addBlock(type: ComposerBlockType["type"]) {
    setValue(current => ({ ...current, blocks: [...current.blocks, createComposerBlock(type)] }));
  }
  function removeBlock(index: number) {
    setValue(current => ({ ...current, blocks: current.blocks.filter((_, i) => i !== index) }));
  }
  function moveBlock(index: number, delta: number) {
    setValue(current => {
      const next = [...current.blocks];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, blocks: next };
    });
  }
  function setBlockProp(index: number, key: string, propValue: unknown) {
    setValue(current => ({
      ...current,
      blocks: current.blocks.map((block, i) => i === index
        ? { ...block, props: { ...(block.props ?? {}), [key]: propValue } }
        : block),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.title.trim()) return onError("An interactive SOP needs a title.");
    setBusy(true);
    onError("");
    const payload = {
      ...(value.id ? { id: value.id } : { kind: "interactive" as const }),
      title: value.title,
      blocks: value.blocks,
      category: value.category,
      categories: value.categories,
      tags: splitTags(value.tags),
    };
    const response = await fetch("/api/portal/sops", {
      method: value.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; sop?: SopDocument; error?: string } | null;
    setBusy(false);
    if (!response.ok || !result?.sop) return onError(result?.error ?? "The interactive SOP could not be saved.");
    onSaved(result.sop);
  }

  return <Modal title={value.id ? "Edit interactive SOP" : "New interactive SOP"} onClose={onClose} wide>
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Title"><input required autoFocus value={value.title} onChange={event => setValue(current => ({ ...current, title: event.target.value }))} className={inputClass} placeholder="e.g. Client onboarding walk-through" /></Field>
      <CategoryAssignmentFields
        primary={value.category}
        assigned={value.categories}
        categories={categories}
        onChange={(category, assigned) => setValue(current => ({ ...current, category, categories: assigned }))}
      />
      <Field label="Tags"><input value={value.tags} onChange={event => setValue(current => ({ ...current, tags: event.target.value }))} className={inputClass} placeholder="Training, onboarding, finance" /></Field>

      <div className="grid gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-black/60">Blocks</p>
            <p className="mt-0.5 text-[11px] text-black/40">Add content blocks, order them, and edit each one — this is what readers see.</p>
          </div>
          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold text-black/45">{value.blocks.length} block{value.blocks.length === 1 ? "" : "s"}</span>
        </div>

        {value.blocks.length ? <ol className="grid gap-2.5">
          {value.blocks.map((block, index) => {
            const palette = composerBlockType(block.type);
            return (
              <li key={block.id} className="rounded-md border border-black/10 bg-white">
                <div className="flex items-center gap-2 border-b border-black/8 px-3 py-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded bg-black/[0.05] text-[11px] font-semibold text-black/50">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-black/70">{palette?.label ?? block.type}</span>
                  <button type="button" title="Move up" disabled={index === 0} onClick={() => moveBlock(index, -1)} className="grid size-8 place-items-center rounded text-black/40 hover:bg-black/[0.05] disabled:opacity-25"><ArrowUp size={15} /></button>
                  <button type="button" title="Move down" disabled={index === value.blocks.length - 1} onClick={() => moveBlock(index, 1)} className="grid size-8 place-items-center rounded text-black/40 hover:bg-black/[0.05] disabled:opacity-25"><ArrowDown size={15} /></button>
                  <button type="button" title="Remove block" onClick={() => removeBlock(index)} className="grid size-8 place-items-center rounded text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
                </div>
                <div className="grid gap-3 p-3 sm:grid-cols-2">
                  <div className="grid gap-2.5">
                    {palette ? palette.fields.map(field => (
                      <ComposerFieldInput
                        key={field.key}
                        field={field}
                        value={block.props?.[field.key]}
                        onChange={next => setBlockProp(index, field.key, next)}
                      />
                    )) : <p className="text-xs text-black/40">This block type has no inline fields.</p>}
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-black/35">Preview</p>
                    <div className="overflow-hidden rounded-md border border-black/8 bg-white p-3">
                      <BlockRenderer blocks={[block]} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol> : <p className="rounded-md border border-dashed border-black/10 bg-white px-3 py-4 text-center text-xs text-black/40">No blocks yet — add one below.</p>}

        <div className="grid gap-1.5">
          <p className="text-[11px] font-medium text-black/45">Add a block</p>
          <div className="flex flex-wrap gap-1.5">
            {COMPOSER_BLOCK_TYPES.map(entry => (
              <button key={entry.type} type="button" title={entry.hint} onClick={() => addBlock(entry.type)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/12 bg-white px-2.5 text-xs font-semibold text-black/65 hover:border-black/30 hover:text-black">
                <Plus size={13} /> {entry.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}><Save size={15} />{busy ? "Saving..." : "Save SOP"}</button></div>
    </form>
  </Modal>;
}

function ComposerFieldInput({ field, value, onChange }: {
  field: ComposerBlockType["fields"][number];
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (field.control === "textarea") {
    return <Field label={field.label}><textarea value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} rows={4} className={`${inputClass} resize-y py-2 leading-6`} placeholder={field.placeholder} /></Field>;
  }
  if (field.control === "select") {
    return <Field label={field.label}><select value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} className={inputClass}>{(field.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
  }
  if (field.control === "level") {
    const current = typeof value === "number" ? value : 2;
    return <Field label={field.label}><select value={String(current)} onChange={event => onChange(Number(event.target.value))} className={inputClass}>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>Heading {level}</option>)}</select></Field>;
  }
  return <Field label={field.label}><input type={field.control === "url" ? "url" : "text"} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} className={inputClass} placeholder={field.placeholder} /></Field>;
}

function resourceIcon(sop: SopDocument, size = 17): React.ReactNode {
  if (sop.kind === "interactive") return <Sparkles size={size} />;
  if (sop.kind === "written") return <PenLine size={size} />;
  if (sop.resourceType === "presentation") return <Presentation size={size} />;
  if (sop.resourceType === "video") return <Video size={size} />;
  if (sop.resourceType === "audio") return <Volume2 size={size} />;
  if (sop.resourceType === "image") return <FileImage size={size} />;
  if (sop.resourceType === "spreadsheet") return <FileSpreadsheet size={size} />;
  return <FileText size={size} />;
}

function resourceLabel(sop: SopDocument): string {
  if (sop.kind === "interactive") return "Interactive SOP";
  if (sop.kind === "written") return "Written SOP";
  const labels: Record<string, string> = {
    presentation: "Presentation",
    video: "Training video",
    audio: "Audio SOP",
    image: "Visual guide",
    spreadsheet: "Spreadsheet",
    document: "Document",
  };
  return labels[sop.resourceType ?? "document"] ?? "Uploaded SOP";
}

function splitTags(value: string) {
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function formatDate(value: number) {
  return formatUkDate(value, { day: "numeric", month: "short", year: "numeric" });
}

function formatBytes(value?: number) {
  if (!value) return "File";
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const inputClass = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/40";
const primaryButton = "inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondaryButton = "min-h-10 rounded-md border border-black/12 bg-white px-4 text-sm font-medium text-black/65";
