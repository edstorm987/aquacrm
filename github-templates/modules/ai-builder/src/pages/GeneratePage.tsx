"use client";

// GeneratePage — operator types a description, the page calls
// /api/portal/ai-builder/generate, displays the resulting block tree
// + lets the operator copy it as JSON. The deeper "inside the
// website-editor" integration is the GenerateModal (see
// `src/components/GenerateModal.tsx`); this admin page is the
// stand-alone surface for browsing + previewing without leaving.

import { useState } from "react";

interface GeneratedRecord {
  id: string;
  status: string;
  blockTree: unknown[] | null;
  validationError?: string;
  costCents: number;
  modelId: string;
}

export default function GeneratePage(_props: unknown) {
  const [prompt, setPrompt] = useState("A hero with our brand colours, a 3-column feature grid, and a CTA at the bottom.");
  const [hints, setHints] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GeneratedRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/portal/ai-builder/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt, contextHints: hints || undefined }),
      });
      const data = await res.json() as { ok: boolean; generation?: GeneratedRecord; error?: string };
      if (!res.ok || !data.ok || !data.generation) {
        setError(data.error ?? `status ${res.status}`);
        return;
      }
      setResult(data.generation);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-4xl space-y-6">
      <header>
        <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">AI</p>
        <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Generate a page</h1>
        <p className="text-brand-cream/45 text-sm mt-1">
          Describe the page in plain language. Claude returns a block tree the editor can insert.
        </p>
      </header>

      <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-[0.18em] text-brand-amber mb-1">Prompt</span>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={4}
            className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-[0.18em] text-brand-amber mb-1">Context hints (optional)</span>
          <input
            type="text"
            value={hints}
            onChange={e => setHints(e.target.value)}
            placeholder="e.g. brand colours #ff6b35, dark mode, ecommerce site"
            className="w-full bg-brand-black border border-white/10 rounded-lg px-3 py-2 text-sm text-brand-cream"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={running || prompt.trim().length === 0}
            className="text-sm px-5 py-2 rounded-lg bg-brand-orange hover:bg-brand-orange-light text-white font-semibold disabled:opacity-50"
          >
            {running ? "Generating…" : "✨ Generate"}
          </button>
        </div>
        {error && <p className="text-sm text-red-300">Error: {error}</p>}
      </section>

      {result && (
        <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
          <header className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-brand-amber">Result · {result.status}</p>
            <span className="text-xs text-brand-cream/55">
              {result.modelId} · {(result.costCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 })}
            </span>
          </header>
          {result.validationError && (
            <p className="text-xs text-amber-300">Validation: {result.validationError}</p>
          )}
          {result.blockTree ? (
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-black/40 border border-white/5 rounded p-3 max-h-[480px] overflow-auto">
              {JSON.stringify(result.blockTree, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-brand-cream/55">No block tree was produced.</p>
          )}
        </section>
      )}
    </div>
  );
}
