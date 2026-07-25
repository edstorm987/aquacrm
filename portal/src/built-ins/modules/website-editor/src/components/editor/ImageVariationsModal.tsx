"use client";

// R005 — Image variations modal. Hits the ai-builder
// /image/variations endpoint and lets the operator replace the
// current image-src with one of the generated thumbs.

import { useEffect, useState } from "react";

interface Props {
  sourceUrl: string;
  onClose: () => void;
  onPick: (url: string) => void;
}

interface Variation { url: string; width: number; height: number }

export default function ImageVariationsModal({ sourceUrl, onClose, onPick }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/ai-builder/image/variations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceImageUrl: sourceUrl, count: 4 }),
      });
      const data = await res.json() as { ok: boolean; images?: Variation[]; error?: string; resetsOn?: string };
      if (!data.ok) {
        setError(data.error === "ceiling-reached" ? `Monthly image ceiling reached — resets ${data.resetsOn ?? ""}` : (data.error ?? "request failed"));
        return;
      }
      setVariations(data.images ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div role="dialog" aria-label="Generate variations" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-brand-black-soft border border-white/10 rounded-lg w-[640px] max-w-[92vw] p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[14px] text-brand-cream font-medium">Generate variations</h2>
            <p className="text-[11px] text-brand-cream/55">4 picks derived from your current image.</p>
          </div>
          <button onClick={onClose} className="text-brand-cream/55 hover:text-brand-cream text-lg leading-none">×</button>
        </div>

        {loading && <p className="text-[12px] text-brand-cream/55 py-8 text-center">Generating…</p>}
        {error && <p className="text-[12px] text-red-300 py-4 text-center">{error}</p>}

        {!loading && !error && (
          <div className="grid grid-cols-2 gap-3">
            {variations.map(v => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <button key={v.url} onClick={() => onPick(v.url)} className="group relative rounded-md overflow-hidden border border-white/10 hover:border-cyan-400/40">
                <img src={v.url} alt="" className="w-full h-40 object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/70 text-cyan-200 text-[11px] py-1 opacity-0 group-hover:opacity-100">Use this</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={generate} disabled={loading} className="px-3 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-brand-cream disabled:opacity-40">Regenerate</button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-[11px] text-brand-cream/65 hover:text-brand-cream">Cancel</button>
        </div>
      </div>
    </div>
  );
}
