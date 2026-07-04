"use client";

// Per-client Files tab (T1 R10). v0 surface — operator-pasted links
// stored on `client.metadata.files[]`. T2 R010's `@aqua/plugin-client-
// files` will replace this with real upload/storage when shipped.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type FileCategory = "brand" | "brief" | "deliverable" | "invoice" | "misc";

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
  deliverable: { label: "Deliverables",     emoji: "📦" },
  invoice:     { label: "Invoices",         emoji: "🧾" },
  misc:        { label: "Misc",             emoji: "📎" },
};

const CATEGORIES: readonly FileCategory[] = ["brand", "brief", "deliverable", "invoice", "misc"];

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
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
  const [draft, setDraft] = useState<{ name: string; url: string; category: FileCategory }>({
    name: "", url: "", category: "deliverable",
  });

  const counts = useMemo(() => {
    const c: Record<FileCategory, number> = { brand: 0, brief: 0, deliverable: 0, invoice: 0, misc: 0 };
    for (const f of files) c[f.category] = (c[f.category] ?? 0) + 1;
    return c;
  }, [files]);

  const visible = filter === "all" ? files : files.filter(f => f.category === filter);

  async function add() {
    if (!draft.name.trim() || !draft.url.trim()) {
      setError("Name + URL required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/client-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "add", file: draft }),
      });
      const data = await res.json() as { ok: boolean; error?: string; files?: ClientFileRef[] };
      if (!data.ok) {
        setError(data.error ?? "Add failed.");
        return;
      }
      if (data.files) setFiles(data.files);
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
            filter === "all" ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-medium" : "text-black/75 hover:bg-black/5",
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
              filter === c ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-medium" : "text-black/75 hover:bg-black/5",
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
        <div className="rounded-xl border border-dashed border-black/15 bg-black/[0.02] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-black/85">Add file reference</h2>
            <span className="text-[11px] text-black/45">
              v0: paste a Drive / Dropbox / Notion URL. Real uploads land with T2 R010.
            </span>
          </div>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_10rem_auto]"
            onSubmit={e => { e.preventDefault(); add(); }}
          >
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
              placeholder="https://…"
              disabled={busy}
              className="rounded-md border border-black/15 bg-white px-2 py-1 text-sm"
            />
            <select
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
              disabled={busy || !draft.name.trim() || !draft.url.trim()}
              className="rounded-md bg-[var(--brand-primary)] px-3 py-1 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              Add
            </button>
          </form>
          {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-black/10 bg-white px-6 py-10 text-center text-sm text-black/55">
            {filter === "all"
              ? "No files yet. Paste a Drive / Dropbox / Notion link above to get started."
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
                    className="block truncate text-sm font-medium text-[var(--brand-primary)] hover:underline"
                  >
                    {CATEGORY_META[f.category].emoji} {f.name} ↗
                  </a>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-black/50">
                    <span className="rounded-full bg-black/5 px-1.5 py-px">
                      {CATEGORY_META[f.category].label}
                    </span>
                    <span>{f.uploadedBy ?? "—"}</span>
                    <span>· {formatRelative(f.uploadedAt)}</span>
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
