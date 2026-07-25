"use client";

// GenerateModal — R8: SSE-streaming variant. POSTs to
// `/api/portal/ai-builder/generate/stream` and decodes Anthropic-shaped
// SSE frames as they arrive. Renders a live partial-tree preview while
// generation is in flight; Cancel button aborts the in-flight request.
//
// Soft-fail render: a half-built JSON array is parsed best-effort by
// closing the brackets and discarding any trailing incomplete object.
// When parse fails we fall back to a streaming-text view so operators
// see *something* happening.
//
// Lives in website-editor (not ai-builder) because only the editor
// knows the active page's block array.

import { useEffect, useRef, useState } from "react";

interface BlockNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: BlockNode[];
}

interface GenerationRecord {
  id: string;
  status: string;
  blockTree?: BlockNode[] | null;
  validationError?: string;
  modelId?: string;
  costCents?: number;
}

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "complete"; generation: GenerationRecord }
  | { type: "error"; error: string };

export function GenerateModal({
  open, onClose, onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (tree: BlockNode[]) => Promise<void> | void;
}) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error" | "cancelled">("idle");
  const [error, setError] = useState<string | null>(null);
  const [accumulatedText, setAccumulatedText] = useState("");
  const [partialTree, setPartialTree] = useState<BlockNode[] | null>(null);
  const [finalTree, setFinalTree] = useState<BlockNode[] | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setPrompt(""); setPhase("idle"); setError(null);
      setAccumulatedText(""); setPartialTree(null); setFinalTree(null);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Abort any in-flight request when the modal unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) return null;

  async function generate() {
    if (!prompt.trim()) return;
    setPhase("running"); setError(null);
    setAccumulatedText(""); setPartialTree(null); setFinalTree(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    try {
      const res = await fetch("/api/portal/ai-builder/generate/stream", {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "text/event-stream" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setError(`Stream failed (${res.status}).`); setPhase("error"); return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = frame.split("\n").find(l => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let evt: StreamEvent;
          try { evt = JSON.parse(payload) as StreamEvent; }
          catch { continue; }
          if (evt.type === "delta") {
            acc += evt.text;
            setAccumulatedText(acc);
            const partial = tryParsePartial(acc);
            if (partial) setPartialTree(partial);
          } else if (evt.type === "complete") {
            const gen = evt.generation;
            if (gen.status === "completed" && gen.blockTree) {
              // R9 — auto-fill image blocks with generated URLs. Soft-
              // fails to placeholder if the image endpoint errors or
              // hits a ceiling.
              const filled = await fillImageBlocks(gen.blockTree, prompt.trim());
              setFinalTree(filled);
              setPhase("done");
            } else {
              setError(gen.validationError ?? `Generation status: ${gen.status}.`);
              setPhase("error");
            }
          } else if (evt.type === "error") {
            setError(evt.error); setPhase("error");
          }
        }
      }
      // If we reached end-of-stream without a "complete" frame, surface
      // an error so the operator isn't left in a stuck "running" state.
      setPhase(p => (p === "running" ? "error" : p));
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setPhase("cancelled");
      } else {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function insert() {
    if (!finalTree) return;
    await onInsert(finalTree);
    onClose();
  }

  const previewTree = finalTree ?? partialTree;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-brand-black-soft border border-white/10 rounded-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">✨</span>
          <h2 className="font-display text-xl text-brand-cream">Generate page section</h2>
          <div className="flex-1" />
          <button onClick={onClose} className="text-brand-cream/55 hover:text-brand-cream text-lg leading-none">×</button>
        </div>

        <p className="text-sm text-brand-cream/55 mb-3">
          Describe what you want — Claude streams the blocks live as they land.
        </p>

        <textarea
          ref={inputRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={phase === "running"}
          placeholder="a hero with our brand colours, a 3-column feature grid, a CTA"
          rows={3}
          className="w-full bg-[#0a0e1a] border border-white/10 rounded-lg p-3 text-brand-cream text-sm focus:outline-none focus:border-cyan-400/40 disabled:opacity-50"
        />

        {error && (
          <div className="mt-3 text-xs text-red-300 border border-red-400/30 rounded-md p-2 bg-red-500/5" role="alert">
            {error}
          </div>
        )}

        {phase === "cancelled" && (
          <div className="mt-3 text-xs text-amber-300 border border-amber-400/30 rounded-md p-2 bg-amber-500/5">
            Generation cancelled.
          </div>
        )}

        {(previewTree || phase === "running") && (
          <div className={`mt-3 rounded-lg border p-3 ${finalTree ? "border-emerald-400/20 bg-emerald-500/5" : "border-cyan-400/20 bg-cyan-500/5"}`}>
            <p className={`text-[11px] uppercase tracking-[0.18em] mb-2 ${finalTree ? "text-emerald-300" : "text-cyan-300"}`}>
              {finalTree ? "Preview" : phase === "running" ? "Streaming…" : "Partial preview"}
            </p>
            {previewTree && previewTree.length > 0 ? (
              <ul className="text-xs text-brand-cream/75 space-y-0.5 max-h-40 overflow-auto font-mono">
                {flatten(previewTree).map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            ) : (
              <pre className="text-[10px] text-brand-cream/55 max-h-40 overflow-auto whitespace-pre-wrap font-mono">
                {accumulatedText || "Waiting for first chunk…"}
              </pre>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 justify-end">
          {phase === "running" ? (
            <button
              onClick={cancel}
              className="px-3 py-1.5 rounded-md text-[12px] text-amber-200 border border-amber-400/30 hover:bg-amber-500/10"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[12px] text-brand-cream/65 hover:text-brand-cream"
            >
              Close
            </button>
          )}
          {phase === "done" && finalTree ? (
            <button
              onClick={insert}
              className="px-4 py-1.5 rounded-md text-[12px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30"
            >
              Insert {finalTree.length} block{finalTree.length === 1 ? "" : "s"}
            </button>
          ) : (
            <button
              onClick={generate}
              disabled={phase === "running" || !prompt.trim()}
              className="px-4 py-1.5 rounded-md text-[12px] font-medium bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/30 disabled:opacity-40"
            >
              {phase === "running" ? "Generating…" : "Generate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// R9 — walk the tree, find image-bearing blocks with no src, request
// one image per block from the ai-builder image endpoint, soft-fail to
// the existing src (or empty) if the call fails. Block types we treat
// as image-bearing: hero, image, productCard, gallery, banner.
const IMAGE_BLOCK_TYPES = new Set(["hero", "image", "productCard", "product-card", "gallery", "banner"]);

async function fillImageBlocks(tree: BlockNode[], promptHint: string): Promise<BlockNode[]> {
  async function walk(node: BlockNode): Promise<BlockNode> {
    let next: BlockNode = node;
    if (IMAGE_BLOCK_TYPES.has(node.type)) {
      const props = (node.props ?? {}) as Record<string, unknown>;
      const hasSrc = typeof props.src === "string" && props.src.length > 0;
      if (!hasSrc) {
        const blockPrompt = (props.alt as string) || (props.title as string) || (props.heading as string) || promptHint;
        try {
          const res = await fetch("/api/portal/ai-builder/image", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ prompt: blockPrompt, count: 1 }),
          });
          const data = await res.json() as { ok: boolean; images?: { url: string }[] };
          if (data.ok && data.images?.[0]?.url) {
            next = { ...node, props: { ...props, src: data.images[0].url } };
          }
        } catch { /* soft-fail: leave src empty */ }
      }
    }
    if (node.children?.length) {
      const children = await Promise.all(node.children.map(walk));
      next = { ...next, children };
    }
    return next;
  }
  return Promise.all(tree.map(walk));
}

function flatten(nodes: BlockNode[], depth = 0): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(`${"  ".repeat(depth)}• ${n.type}${n.id ? `  (${n.id})` : ""}`);
    if (n.children?.length) out.push(...flatten(n.children, depth + 1));
  }
  return out;
}

// Best-effort JSON-array parser for partial streaming text. Strips any
// leading code fence + prose, then trims to the last complete top-level
// object before closing the array. Returns null if no parseable object
// has been emitted yet.
function tryParsePartial(raw: string): BlockNode[] | null {
  let s = raw.trim().replace(/^```(?:json)?\s*/, "");
  const arrStart = s.indexOf("[");
  if (arrStart < 0) return null;
  s = s.slice(arrStart + 1);
  // Walk forward, tracking brace depth + string state, recording the
  // index after each complete top-level object closure.
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastClose = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) lastClose = i;
    }
  }
  if (lastClose < 0) return null;
  const candidate = `[${s.slice(0, lastClose + 1)}]`;
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed as BlockNode[];
  } catch { /* not yet parseable */ }
  return null;
}
