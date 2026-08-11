"use client";

import { useId, useMemo, useState } from "react";
import {
  BookOpen,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileUp,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  PenLine,
  Presentation,
  Plus,
  Search,
  Tags,
  Trash2,
  Video,
  Volume2,
  X,
} from "lucide-react";

import type { SopDocument } from "@/server/types";

type EditorDraft = {
  id?: string;
  title: string;
  category: string;
  categories: string[];
  tags: string;
  content: string;
};

const EMPTY_DRAFT: EditorDraft = { title: "", category: "", categories: [], tags: "", content: "" };

export function SopLibrary({ initialSops, initialCategories }: { initialSops: SopDocument[]; initialCategories: string[] }) {
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
  const [deletingCategory, setDeletingCategory] = useState<{ category: string; replacementCategory: string } | null>(null);
  const [error, setError] = useState("");

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
          <p className="mt-1 text-sm text-black/50">Procedures, documents, presentations and training media in one organised library.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCreatingCategory(current => !current)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70">
            <FolderPlus size={16} /> Create category
          </button>
          <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70">
            <FileUp size={16} /> Upload SOP
          </button>
          <button type="button" onClick={() => openWriter()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
            <PenLine size={16} /> Write SOP
          </button>
        </div>
      </header>

      {error ? <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

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
          <button type="button" onClick={() => void createCategory()} disabled={!newCategory.trim()} className="min-h-10 rounded-md bg-black px-3 text-sm font-semibold text-white disabled:opacity-40">Create folder</button>
          <button type="button" onClick={() => setCreatingCategory(false)} className="min-h-10 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/60">Cancel</button>
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
              <button type="button" onClick={() => setUploadOpen(true)} className="min-h-10 rounded-md border border-black/12 px-3 text-sm font-medium">Upload file</button>
              <button type="button" onClick={() => openWriter()} className="min-h-10 rounded-md bg-black px-3 text-sm font-semibold text-white">Write SOP</button>
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
                {categoryFilter !== "all" ? <button type="button" onClick={() => setCategoryFilter("all")} className="min-h-9 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62">Back to folders</button> : null}
              </div>
            </div>
            {visible.length ? visible.map(sop => (
              <article key={sop.id} className="mm-surface-card mm-hover-lift flex flex-col gap-3 rounded-lg border border-black/10 p-4 sm:flex-row sm:items-center">
                <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md">
                  {resourceIcon(sop)}
                </span>
                <button type="button" onClick={() => sop.kind === "written" ? setEditor({
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
              <button type="button" onClick={() => openWriter(selectedCategory)} className="mt-3 min-h-10 rounded-md bg-black px-3 text-sm font-semibold text-white">Write SOP here</button>
            </div>}
          </section> : null}
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
            <button type="button" onClick={() => void deleteCategory()} className="min-h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">Delete category</button>
          </div>
        </div>
      </Modal> : null}
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
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}>{busy ? "Saving..." : "Save SOP"}</button></div>
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
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}>{busy ? "Uploading..." : "Upload file"}</button></div>
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
      <div className="flex justify-between gap-2"><a href={`/api/portal/sops/content?id=${encodeURIComponent(sop.id)}`} target="_blank" rel="noreferrer" className={`${secondaryButton} inline-flex items-center gap-2`}><Download size={15} />Open file</a><button disabled={busy} className={primaryButton}>{busy ? "Saving..." : "Save details"}</button></div>
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
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}>{busy ? "Saving..." : "Save organisation"}</button></div>
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

function resourceIcon(sop: SopDocument, size = 17): React.ReactNode {
  if (sop.kind === "written") return <PenLine size={size} />;
  if (sop.resourceType === "presentation") return <Presentation size={size} />;
  if (sop.resourceType === "video") return <Video size={size} />;
  if (sop.resourceType === "audio") return <Volume2 size={size} />;
  if (sop.resourceType === "image") return <FileImage size={size} />;
  if (sop.resourceType === "spreadsheet") return <FileSpreadsheet size={size} />;
  return <FileText size={size} />;
}

function resourceLabel(sop: SopDocument): string {
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
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatBytes(value?: number) {
  if (!value) return "File";
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const inputClass = "min-h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/40";
const primaryButton = "min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50";
const secondaryButton = "min-h-10 rounded-md border border-black/12 bg-white px-4 text-sm font-medium text-black/65";
