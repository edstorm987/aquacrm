"use client";

// R005 — Inpaint modal. Simple brush canvas over the source image
// captures a black-on-transparent mask (white-painted regions = the
// area the operator wants regenerated), POSTs to the ai-builder
// /image/inpaint endpoint with a base64-PNG mask + prompt.

import { useEffect, useRef, useState } from "react";

interface Props {
  sourceUrl: string;
  onClose: () => void;
  onPick: (url: string) => void;
}

export default function ImageInpaintModal({ sourceUrl, onClose, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stub, setStub] = useState(false);
  const [drawing, setDrawing] = useState(false);

  // Size canvas + clear once on mount.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    c.width = 512; c.height = 384;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
  }, []);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function paint(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pointer(e);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
  }

  function clear() {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  }

  async function submit() {
    if (!prompt.trim()) { setError("describe what to put in the masked region"); return; }
    setLoading(true); setError(null);
    try {
      const mask = canvasRef.current!.toDataURL("image/png");
      const res = await fetch("/api/portal/ai-builder/image/inpaint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceImageUrl: sourceUrl, mask, prompt: prompt.trim() }),
      });
      const data = await res.json() as { ok: boolean; image?: { url: string; stub?: boolean }; error?: string; resetsOn?: string };
      if (!data.ok || !data.image) {
        setError(data.error === "ceiling-reached" ? `Monthly image ceiling reached — resets ${data.resetsOn ?? ""}` : (data.error ?? "request failed"));
        return;
      }
      if (data.image.stub) setStub(true);
      onPick(data.image.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div role="dialog" aria-label="Edit with mask" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-brand-black-soft border border-white/10 rounded-lg w-[640px] max-w-[92vw] p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[14px] text-brand-cream font-medium">Edit with mask</h2>
            <p className="text-[11px] text-brand-cream/55">Paint over the area you want regenerated, describe the change.</p>
          </div>
          <button onClick={onClose} className="text-brand-cream/55 hover:text-brand-cream text-lg leading-none">×</button>
        </div>

        <div className="relative bg-black/40 rounded-md overflow-hidden border border-white/10 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sourceUrl} alt="" className="w-full h-72 object-contain pointer-events-none" />
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => { setDrawing(true); paint(e); }}
            onPointerMove={paint}
            onPointerUp={() => setDrawing(false)}
            onPointerLeave={() => setDrawing(false)}
            className="absolute inset-0 w-full h-72 cursor-crosshair touch-none"
          />
        </div>

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. replace background with a bright ocean horizon"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40 mb-3"
        />

        {error && <p className="text-[12px] text-red-300 mb-2">{error}</p>}
        {stub && <p className="text-[11px] text-brand-cream/45 mb-2">Stub provider — source returned unchanged. Configure OpenAI key for real edits.</p>}

        <div className="flex justify-between items-center gap-2">
          <button onClick={clear} className="px-3 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-brand-cream/75">Clear mask</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md text-[11px] text-brand-cream/65 hover:text-brand-cream">Cancel</button>
            <button onClick={submit} disabled={loading} className="px-3 py-1.5 rounded-md text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20 disabled:opacity-40">
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
