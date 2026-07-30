"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  PenLine,
  Search,
  Trash2,
  X,
} from "lucide-react";

import type { SopDocument } from "@/server/types";

type EditorDraft = {
  id?: string;
  title: string;
  category: string;
  tags: string;
  content: string;
};

const EMPTY_DRAFT: EditorDraft = { title: "", category: "", tags: "", content: "" };

export function SopLibrary({ initialSops }: { initialSops: SopDocument[] }) {
  const [sops, setSops] = useState(initialSops);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<SopDocument | null>(null);
  const [error, setError] = useState("");

  const categories = useMemo(() => [...new Set(sops.map(sop => sop.category).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [sops]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sops.filter(sop => {
      const matchesCategory = categoryFilter === "all"
        || (categoryFilter === "uncategorised" ? !sop.category : sop.category === categoryFilter);
      const matchesQuery = !needle
        || [sop.title, sop.category, sop.fileName, ...sop.tags].filter(Boolean).join(" ").toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, query, sops]);

  function upsert(sop: SopDocument) {
    setSops(current => [sop, ...current.filter(item => item.id !== sop.id)]);
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

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-black/40">Knowledge</p>
          <h1 className="mt-1 text-2xl font-semibold text-black/90 sm:text-3xl">SOP library</h1>
          <p className="mt-1 text-sm text-black/50">Your written procedures and uploaded documents.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-sm font-medium text-black/70">
            <FileUp size={16} /> Upload file
          </button>
          <button type="button" onClick={() => setEditor({ ...EMPTY_DRAFT })} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">
            <PenLine size={16} /> Write SOP
          </button>
        </div>
      </header>

      {error ? <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {sops.length === 0 ? (
        <section className="grid min-h-[420px] place-items-center py-12 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-black/[0.04] text-black/45"><BookOpen size={21} /></span>
            <h2 className="mt-4 text-lg font-semibold text-black/80">No SOPs yet</h2>
            <p className="mt-1 text-sm leading-6 text-black/45">Write your first procedure or upload an existing document when you are ready.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={() => setUploadOpen(true)} className="min-h-10 rounded-md border border-black/12 px-3 text-sm font-medium">Upload file</button>
              <button type="button" onClick={() => setEditor({ ...EMPTY_DRAFT })} className="min-h-10 rounded-md bg-black px-3 text-sm font-semibold text-white">Write SOP</button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
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
                {sops.some(sop => !sop.category) ? <option value="uncategorised">Uncategorised</option> : null}
              </select>
            </label>
          </div>
          <section className="mt-4 overflow-hidden rounded-lg border border-black/10 bg-white">
            {visible.length ? visible.map(sop => (
              <article key={sop.id} className="flex flex-col gap-3 border-b border-black/8 p-4 last:border-b-0 sm:flex-row sm:items-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-black/[0.04] text-black/45">
                  {sop.kind === "written" ? <PenLine size={17} /> : <FileText size={17} />}
                </span>
                <button type="button" onClick={() => sop.kind === "written" ? setEditor({
                  id: sop.id,
                  title: sop.title,
                  category: sop.category ?? "",
                  tags: sop.tags.join(", "),
                  content: sop.content ?? "",
                }) : setEditingFile(sop)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold text-black/80">{sop.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black/40">
                    <span>{sop.kind === "written" ? "Written SOP" : sop.fileName}</span>
                    {sop.category ? <span>{sop.category}</span> : null}
                    <span>Updated {formatDate(sop.updatedAt)}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                  {sop.kind === "file" ? <a href={`/api/portal/sops/content?id=${encodeURIComponent(sop.id)}`} target="_blank" rel="noreferrer" title="Open file" className="grid size-9 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black"><Download size={16} /></a> : null}
                  <button type="button" title="Delete SOP" onClick={() => void remove(sop)} className="grid size-9 place-items-center rounded-md text-black/35 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button>
                </div>
              </article>
            )) : <div className="px-4 py-12 text-center text-sm text-black/45">No SOPs match your search.</div>}
          </section>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <CategoryField value={value.category} categories={categories} onChange={category => setValue(current => ({ ...current, category }))} />
        <Field label="Tags"><input value={value.tags} onChange={event => setValue(current => ({ ...current, tags: event.target.value }))} className={inputClass} placeholder="Separate with commas" /></Field>
      </div>
      <Field label="Procedure"><textarea required value={value.content} onChange={event => setValue(current => ({ ...current, content: event.target.value }))} rows={16} className={`${inputClass} resize-y py-3 leading-6`} /></Field>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}>{busy ? "Saving..." : "Save SOP"}</button></div>
    </form>
  </Modal>;
}

function UploadSopModal({ categories, onClose, onUploaded, onError }: {
  categories: string[];
  onClose: () => void;
  onUploaded: (sop: SopDocument) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
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
      <Field label="File"><input required name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png,.webp" className="min-h-11 w-full rounded-md border border-dashed border-black/20 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" /><span className="text-[11px] font-normal text-black/40">PDF, Word, spreadsheet, text, or image. Maximum 8 MB.</span></Field>
      <Field label="Title"><input name="title" className={inputClass} placeholder="Defaults to the file name" /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><CategoryField name="category" value="" categories={categories} /><Field label="Tags"><input name="tags" className={inputClass} placeholder="Separate with commas" /></Field></div>
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
  const [tags, setTags] = useState(sop.tags.join(", "));
  const [busy, setBusy] = useState(false);
  return <Modal title="File details" onClose={onClose}>
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      const response = await fetch("/api/portal/sops", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sop.id, title, category, tags: splitTags(tags) }) });
      const result = await response.json().catch(() => null) as { sop?: SopDocument; error?: string } | null;
      setBusy(false);
      if (!response.ok || !result?.sop) return onError(result?.error ?? "The file details could not be saved.");
      onSaved(result.sop);
    }}>
      <div className="flex items-center gap-3 rounded-md bg-black/[0.03] p-3"><FileText size={20} className="text-black/40" /><div className="min-w-0"><p className="truncate text-sm font-medium">{sop.fileName}</p><p className="text-xs text-black/40">{formatBytes(sop.size)}</p></div></div>
      <Field label="Title"><input required value={title} onChange={event => setTitle(event.target.value)} className={inputClass} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><CategoryField value={category} categories={categories} onChange={setCategory} /><Field label="Tags"><input value={tags} onChange={event => setTags(event.target.value)} className={inputClass} placeholder="Separate with commas" /></Field></div>
      <div className="flex justify-between gap-2"><a href={`/api/portal/sops/content?id=${encodeURIComponent(sop.id)}`} target="_blank" rel="noreferrer" className={`${secondaryButton} inline-flex items-center gap-2`}><Download size={15} />Open file</a><button disabled={busy} className={primaryButton}>{busy ? "Saving..." : "Save details"}</button></div>
    </form>
  </Modal>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-[100] grid items-end bg-black/40 sm:items-center sm:p-6"><button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={title} className={`relative mx-auto max-h-[92vh] w-full overflow-y-auto bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6 ${wide ? "max-w-3xl" : "max-w-xl"}`}><header className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-black/85">{title}</h2><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-md border border-black/10 text-black/50"><X size={16} /></button></header>{children}</section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-black/55">{label}{children}</label>;
}

function CategoryField({ value, categories, onChange, name }: { value: string; categories: string[]; onChange?: (value: string) => void; name?: string }) {
  const listId = `sop-category-${name ?? "editor"}`;
  return <Field label="Category">
    <input name={name} list={listId} value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onChange={event => onChange?.(event.target.value)} className={inputClass} placeholder="Type or choose a category" />
    <datalist id={listId}>{categories.map(category => <option key={category} value={category} />)}</datalist>
  </Field>;
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
