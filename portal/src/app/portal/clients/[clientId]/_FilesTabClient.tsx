"use client";

import { Link2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type FileCategory = "brand" | "brief" | "recording" | "inspiration" | "design-feedback" | "preview" | "deliverable" | "invoice" | "misc";

interface ClientFileRef {
  id: string;
  name: string;
  url: string;
  category: FileCategory;
  uploadedBy?: string;
  uploadedAt: number;
}

const CATEGORY_META: Record<FileCategory, { label: string; emoji: string }> = {
  brand:       { label: "Brand Assets",     emoji: "🎨" },
  brief:       { label: "Brief / Strategy", emoji: "📐" },
  recording:   { label: "Call Recordings",  emoji: "🎙️" },
  inspiration: { label: "Inspiration",      emoji: "✨" },
  "design-feedback": { label: "Design Feedback", emoji: "💬" },
  preview:     { label: "Build Previews",   emoji: "🖥️" },
  deliverable: { label: "Deliverables",     emoji: "📦" },
  invoice:     { label: "Invoices",         emoji: "🧾" },
  misc:        { label: "Misc",             emoji: "📎" },
};

const CATEGORIES: readonly FileCategory[] = ["brand", "brief", "recording", "inspiration", "design-feedback", "preview", "deliverable", "invoice", "misc"];

function formatFileDate(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ts));
}

export function FilesTabClient({
  clientId,
  initialFiles,
}: {
  clientId: string;
  initialFiles: ClientFileRef[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<ClientFileRef[]>(initialFiles);
  const [filter, setFilter] = useState<"all" | FileCategory>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addMode, setAddMode] = useState<"upload" | "link">("upload");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<{ name: string; url: string; category: FileCategory }>({
    name: "", url: "", category: "deliverable",
  });

  const counts = useMemo(() => {
    const c: Record<FileCategory, number> = {
      brand: 0,
      brief: 0,
      recording: 0,
      inspiration: 0,
      "design-feedback": 0,
      preview: 0,
      deliverable: 0,
      invoice: 0,
      misc: 0,
    };
    for (const f of files) c[f.category] = (c[f.category] ?? 0) + 1;
    return c;
  }, [files]);

  const visible = filter === "all" ? files : files.filter(f => f.category === filter);

  async function add() {
    if (addMode === "upload" ? !uploadFile : (!draft.name.trim() || !draft.url.trim())) {
      setError(addMode === "upload" ? "Choose a file to upload." : "Name and link are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (addMode === "upload" && uploadFile) {
        const form = new FormData();
        form.set("clientId", clientId);
        form.set("category", draft.category);
        form.set("file", uploadFile);
        res = await fetch("/api/tenants/client-files/upload", { method: "POST", body: form });
      } else {
        res = await fetch("/api/tenants/client-files", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId, action: "add", file: draft }),
        });
      }
      const data = await res.json() as { ok: boolean; error?: string; files?: ClientFileRef[] };
      if (!data.ok) {
        setError(data.error ?? "Add failed.");
        return;
      }
      if (data.files) setFiles(data.files);
      setUploadFile(null);
      setDraft({ name: "", url: "", category: draft.category });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this file reference?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "delete", fileId: id }),
      });
      const data = await res.json() as { ok: boolean; error?: string; files?: ClientFileRef[] };
      if (!data.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }
      if (data.files) setFiles(data.files);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="client-files-tab" className="grid gap-4 md:grid-cols-[12rem_1fr]">
      <aside className="flex flex-col gap-1">
        <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-black/55">Categories</h3>
        <button
          type="button"
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={[
            "flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
            filter === "all" ? "bg-brand/10 text-brand font-medium" : "text-black/75 hover:bg-black/5",
          ].join(" ")}
        >
          <span>All</span>
          <span className="text-[10px] text-black/45">{files.length}</span>
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            aria-pressed={filter === c}
            className={[
              "flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
              filter === c ? "bg-brand/10 text-brand font-medium" : "text-black/75 hover:bg-black/5",
            ].join(" ")}
          >
            <span>
              <span aria-hidden="true" className="mr-1">{CATEGORY_META[c].emoji}</span>
              {CATEGORY_META[c].label}
            </span>
            <span className="text-[10px] text-black/45">{counts[c]}</span>
          </button>
        ))}
      </aside>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-black/10 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-black/40">Client file room</p>
              <h2 className="mt-1 text-sm font-medium text-black/85">Add a file</h2>
            </div>
            <div className="inline-flex rounded-md border border-black/10 bg-black/[0.025] p-0.5">
              <button type="button" onClick={() => setAddMode("upload")} className={`inline-flex min-h-9 items-center gap-2 rounded px-3 text-xs font-medium ${addMode === "upload" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>
                <Upload size={13} aria-hidden="true" /> Upload
              </button>
              <button type="button" onClick={() => setAddMode("link")} className={`inline-flex min-h-9 items-center gap-2 rounded px-3 text-xs font-medium ${addMode === "link" ? "bg-white text-black shadow-sm" : "text-black/45"}`}>
                <Link2 size={13} aria-hidden="true" /> Add link
              </button>
            </div>
          </div>
          <form
            className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
            onSubmit={e => { e.preventDefault(); add(); }}
          >
            {addMode === "upload" ? (
              <label className="grid gap-1 text-[11px] text-black/45">
                PDF, document, image, video or text · up to 4 MB
                <input
                  type="file"
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.csv,.txt,.mp4"
                  disabled={busy}
                  className="min-h-10 cursor-pointer rounded-md border border-black/15 bg-white px-2 py-1 text-sm file:mr-3 file:rounded file:border-0 file:bg-black/[0.05] file:px-3 file:py-1 file:text-xs"
                />
              </label>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="File name"
                  disabled={busy}
                  className="rounded-md border border-black/15 bg-white px-2 py-1 text-sm"
                />
                <input
                  type="url"
                  value={draft.url}
                  onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                  placeholder="https://"
                  disabled={busy}
                  className="rounded-md border border-black/15 bg-white px-2 py-1 text-sm"
                />
              </div>
            )}
            <select
              aria-label="File category"
              value={draft.category}
              onChange={e => setDraft(d => ({ ...d, category: e.target.value as FileCategory }))}
              disabled={busy}
              className="rounded-md border border-black/15 bg-white px-2 py-1 text-sm"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_META[c].label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || (addMode === "upload" ? !uploadFile : (!draft.name.trim() || !draft.url.trim()))}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-sm font-medium text-white hover:bg-black/85 disabled:opacity-50"
            >
              {addMode === "upload" ? <Upload size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
              {busy ? "Adding..." : addMode === "upload" ? "Upload" : "Add link"}
            </button>
          </form>
          {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-black/10 bg-white px-6 py-10 text-center text-sm text-black/55">
            {filter === "all"
              ? "No files yet. Upload the first document, image, recording, or deliverable above."
              : `No ${CATEGORY_META[filter].label.toLowerCase()} yet.`}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map(f => (
              <li
                key={f.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-medium text-brand hover:underline"
                  >
                    {CATEGORY_META[f.category].emoji} {f.name} ↗
                  </a>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-black/50">
                    <span className="rounded-full bg-black/5 px-1.5 py-px">
                      {CATEGORY_META[f.category].label}
                    </span>
                    <span>{f.uploadedBy ?? "—"}</span>
                    <span>· {formatFileDate(f.uploadedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-black/15 px-2 py-1 text-[11px] hover:bg-black/5"
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    disabled={busy}
                    className="rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
