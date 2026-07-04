"use client";

// Lightweight picker for image-typed property fields in the editor.
// Renders a thumbnail of the current value, a "Library" button that
// opens an inline picker, an "Upload" button for direct file picks,
// and a URL input for paste. Selecting a library asset writes its
// dataUrl into the field — exactly what the renderer expects.
//
// Faithful port of `02/src/components/editor/AssetPicker.tsx`. The
// asset library client moved from `@/lib/admin/assets` → plugin's
// `../lib/media`; the contract is identical.

import { useEffect, useRef, useState } from "react";
import type { PortalAsset } from "../lib/media";
import { listAssets, loadAssets, uploadAsset } from "../lib/media";

interface AssetPickerProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

export default function AssetPicker({ value, onChange, placeholder }: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<PortalAsset[]>(listAssets());
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void loadAssets(true).then(data => setAssets(data.assets));
  }, [open]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const result = await uploadAsset(files[0]!);
      if (!("error" in result)) {
        onChange(result.dataUrl);
        const data = await loadAssets(true);
        setAssets(data.assets);
        setOpen(false);
      }
    } finally { setUploading(false); }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "URL or data:image/..."}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-brand-orange/50 font-mono"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[11px] text-brand-cream/70 hover:text-brand-cream hover:bg-white/10"
        >
          {open ? "Close" : "Library"}
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="px-2.5 py-1.5 rounded-lg border border-brand-orange/30 bg-brand-orange/10 text-[11px] text-brand-orange hover:bg-brand-orange/20 disabled:opacity-50"
        >
          {uploading ? "…" : "Upload"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => void handleUpload(e.target.files)}
        />
      </div>

      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="w-full h-32 object-cover rounded-lg bg-white/[0.04] border border-white/10" />
      )}

      {open && (
        <div className="rounded-lg border border-white/10 bg-brand-black p-2 max-h-64 overflow-y-auto">
          {assets.length === 0 ? (
            <p className="text-[11px] text-brand-cream/45 p-3 text-center">No assets yet — click Upload above or visit <code className="font-mono">/admin/assets</code>.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {assets.map(asset => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => { onChange(asset.dataUrl); setOpen(false); }}
                  className={`aspect-square rounded overflow-hidden border-2 transition-colors ${value === asset.dataUrl ? "border-brand-orange" : "border-white/10 hover:border-white/30"}`}
                  title={asset.filename}
                >
                  {asset.contentType.startsWith("image/")
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={asset.dataUrl} alt={asset.alt ?? asset.filename} className="w-full h-full object-cover" loading="lazy" />
                    : <span className="text-[9px] text-brand-cream/45">{asset.filename}</span>
                  }
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
