"use client";

// /admin/assets — portal-wide asset library. Drop / paste / pick files,
// each upload becomes available in any image-typed field across the
// visual editor's properties panel.

import { useEffect, useRef, useState } from "react";
import type { PortalAsset } from "../lib/media";
import {
  deleteAsset, formatBytes, loadAssets, onAssetsChange, patchAsset,
  uploadAsset,
} from "../lib/media";
import { confirm } from "../lib/confirm";
import AdminTabs from "../components/AdminTabs";
import { CONTENT_TABS } from "../lib/tabSets";

export default function AssetsPage(_props: unknown) {
  const [assets, setAssets] = useState<PortalAsset[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [capBytes, setCapBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    const data = await loadAssets(true);
    setAssets(data.assets);
    setUsedBytes(data.usedBytes);
    setCapBytes(data.capBytes);
  }

  useEffect(() => {
    void refresh();
    return onAssetsChange(() => { void refresh(); });
  }, []);

  async function handleFiles(files: FileList | File[]) {
    setBusy(true); setError(null);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadAsset(file);
        if ("error" in result) { setError(result.error); break; }
      }
      void refresh();
    } finally { setBusy(false); }
  }

  async function handleDelete(asset: PortalAsset) {
    if (!(await confirm({
      title: `Delete ${asset.filename}?`,
      message: "Any block referencing it by id will break.",
      danger: true,
      confirmLabel: "Delete",
    }))) return;
    await deleteAsset(asset.id);
    void refresh();
  }

  async function handleAlt(asset: PortalAsset, alt: string) {
    if (alt === (asset.alt ?? "")) return;
    await patchAsset(asset.id, { alt });
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-[0.28em] uppercase text-brand-orange mb-1">Library</p>
          <h1 className="font-display text-3xl text-brand-cream">Assets</h1>
          <p className="text-[12px] text-brand-cream/55 mt-1">
            {assets.length} file{assets.length === 1 ? "" : "s"} · {formatBytes(usedBytes)} used of {formatBytes(capBytes)}
          </p>
        </div>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="px-3 py-2 rounded-lg bg-brand-orange text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "+ Upload files"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) void handleFiles(e.target.files); }}
        />
      </header>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed transition-colors py-10 text-center ${drag ? "border-brand-orange bg-brand-orange/10" : "border-white/10 hover:border-white/30"}`}
      >
        <p className="text-[13px] text-brand-cream/65">
          Drop files here or <button onClick={() => fileInput.current?.click()} className="text-brand-orange hover:underline">browse</button>
        </p>
        <p className="text-[11px] text-brand-cream/40 mt-1">Up to 4 MB per file. Stored as data URIs in cloud state.</p>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      {/* Grid */}
      {assets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map(asset => (
            <article key={asset.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col">
              <div className="aspect-square bg-white/[0.04] flex items-center justify-center">
                {asset.contentType.startsWith("image/")
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={asset.dataUrl} alt={asset.alt ?? asset.filename} className="w-full h-full object-cover" loading="lazy" />
                  : <span className="text-[10px] text-brand-cream/45 px-2 text-center break-all">{asset.contentType}</span>
                }
              </div>
              <div className="p-2 space-y-1.5">
                <p className="text-[11px] text-brand-cream/85 font-mono truncate" title={asset.filename}>{asset.filename}</p>
                <p className="text-[10px] text-brand-cream/45">
                  {formatBytes(asset.size)}
                  {asset.width && asset.height && ` · ${asset.width}×${asset.height}`}
                </p>
                <input
                  defaultValue={asset.alt ?? ""}
                  onBlur={e => handleAlt(asset, e.target.value)}
                  placeholder="Alt text…"
                  className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[10px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-brand-orange/50"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => navigator.clipboard?.writeText(asset.dataUrl)}
                    className="flex-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-brand-cream/65"
                    title="Copy data URL"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => handleDelete(asset)}
                    className="px-2 py-1 rounded text-[10px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
