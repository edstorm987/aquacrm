"use client";

// R006 — Save-as-template control. Captures the current page's
// BlockTree (caller passes it in via `getBlocks`) into the per-agency
// template registry. Operator gives it a label + optional cover URL +
// tags. Surfaces in the editor topbar near the publish controls.

import { useState } from "react";
import type { Block } from "../../types/block";

interface Props {
  getBlocks: () => Block[];
  // Optional override for tests / SSR.
  fetchImpl?: typeof fetch;
}

export default function SaveAsTemplateButton({ getBlocks, fetchImpl }: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!label.trim()) { setError("label required"); return; }
    setSaving(true); setError(null);
    try {
      const f = fetchImpl ?? fetch;
      const res = await f("/api/portal/website-editor/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          description: description.trim() || undefined,
          tags: tagsText.split(",").map(s => s.trim()).filter(Boolean),
          coverUrl: coverUrl.trim() || undefined,
          blocks: getBlocks(),
        }),
      });
      const data = await res.json() as { ok: boolean; template?: { id: string }; error?: string };
      if (!data.ok || !data.template) {
        setError(data.error ?? "save failed");
        return;
      }
      setSavedId(data.template.id);
      setTimeout(() => { setOpen(false); setSavedId(null); setLabel(""); setDescription(""); setTagsText(""); setCoverUrl(""); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-brand-cream"
      >
        💾 Save as template
      </button>

      {open && (
        <div role="dialog" aria-label="Save as template" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-brand-black-soft border border-white/10 rounded-lg w-[480px] max-w-[92vw] p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-[14px] text-brand-cream font-medium">Save current page as template</h2>
              <button onClick={() => setOpen(false)} className="text-brand-cream/55 hover:text-brand-cream text-lg leading-none">×</button>
            </div>

            <div className="space-y-3">
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Template label (required)"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
              />
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Description"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
              />
              <input
                value={tagsText}
                onChange={e => setTagsText(e.target.value)}
                placeholder="Tags, comma-separated (e.g. Therapist, Service Portal)"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
              />
              <input
                value={coverUrl}
                onChange={e => setCoverUrl(e.target.value)}
                placeholder="Cover image URL (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
              />
            </div>

            {error && <p className="text-[12px] text-red-300 mt-3">{error}</p>}
            {savedId && <p className="text-[12px] text-emerald-300 mt-3">Saved · {savedId}</p>}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md text-[11px] text-brand-cream/65 hover:text-brand-cream">Cancel</button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-3 py-1.5 rounded-md text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/20 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
