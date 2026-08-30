"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Info, PenLine, Plus, X } from "lucide-react";

import { checkSavedToolUrl } from "@/lib/chrome/savedToolUrl";
import { useChromeLayout, type SavedTool } from "@/components/chrome/pinnedTabsStore";

/**
 * Ed's palette — his own saved links as cards on Tools.
 *
 * Ed, 2026-08-30: *"like a painters pallete thing… i might want to grab the url
 * create a tool save the url link name it colour pallete tool and then it makes
 * a card i click the card and boom sends me there in a new tab it just makes
 * life easier to make my own tools and save them here."*
 *
 * Every card is a plain `<a target="_blank" rel="noopener noreferrer">` — never
 * `next/link`, which is for in-app routes. `noreferrer` earns its place on its
 * own here: portal URLs carry client and project ids that must not ride the
 * Referer header to a third-party site.
 *
 * Reordering is arrow buttons rather than drag, deliberately: the only drag
 * pattern in the repo is welded into the mobile topbar chrome, and extracting
 * working mobile chrome for a nice-to-have is the wrong trade today.
 */
const MAX_TOOLS = 48;

export function MyToolsPalette() {
  const { savedTools, save, ready } = useChromeLayout();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("https://");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");

  function resetForm() {
    setLabel(""); setUrl("https://"); setNote(""); setProblem("");
    setAdding(false); setEditing(null);
  }

  function commit(tools: SavedTool[]) {
    // Never before the first load: a save built on the EMPTY default would
    // send the whole field and wipe whatever the account already holds
    // (Ed's finding, 2026-08-30).
    if (!ready) return;
    save({ savedTools: tools.map((tool, index) => ({ ...tool, order: index })) });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = label.trim();
    if (!name) { setProblem("Give the tool a name — it is what the card says."); return; }
    const checked = checkSavedToolUrl(url);
    if (!checked.ok || !checked.url) { setProblem(checked.reason ?? "That address cannot be saved."); return; }
    const now = Date.now();
    if (editing) {
      commit(savedTools.map(tool => tool.id === editing
        ? { ...tool, label: name, url: checked.url!, note: note.trim() || undefined, updatedAt: now }
        : tool));
    } else {
      if (savedTools.length >= MAX_TOOLS) {
        // Refused, never evicted: a palette somebody curated must not silently
        // lose a card the way a working-set strip may.
        setProblem(`The palette holds ${MAX_TOOLS} tools. Remove one you no longer use first.`);
        return;
      }
      commit([...savedTools, {
        id: `tool_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        label: name, url: checked.url, note: note.trim() || undefined,
        order: savedTools.length, createdAt: now, updatedAt: now,
      }]);
    }
    resetForm();
  }

  function move(id: string, delta: -1 | 1) {
    const index = savedTools.findIndex(tool => tool.id === id);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= savedTools.length) return;
    const next = [...savedTools];
    next.splice(to, 0, next.splice(index, 1)[0]!);
    commit(next);
  }

  function startEdit(tool: SavedTool) {
    setEditing(tool.id); setAdding(true);
    setLabel(tool.label); setUrl(tool.url); setNote(tool.note ?? ""); setProblem("");
  }

  return (
    <section aria-labelledby="my-tools-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-black/40">
            My tools
            <span title="Your own saved links. Each card opens its site in a new tab. Only you see these — they are saved to your account, not the workspace." className="inline-flex cursor-help text-black/30"><Info size={13} aria-hidden /></span>
          </p>
          <h2 id="my-tools-heading" className="mt-1 text-lg font-semibold text-black/85">Your palette</h2>
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={() => { resetForm(); setAdding(true); }}
          className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black/85 px-3 text-sm font-semibold text-white hover:bg-black"
        >
          <Plus size={15} aria-hidden /> Add a tool
        </button>
      </div>

      {adding ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 rounded-md border border-black/10 bg-white p-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Name</span>
            <input value={label} onChange={event => setLabel(event.target.value)} maxLength={60} autoFocus
              placeholder="Colour palette tool"
              className="min-h-11 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-black/35" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Web address</span>
            <input value={url} onChange={event => setUrl(event.target.value)} inputMode="url" spellCheck={false}
              className="min-h-11 rounded-md border border-black/15 px-3 font-mono text-sm outline-none focus:border-black/35" />
          </label>
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-black/55">Note <span className="font-normal text-black/35">(optional)</span></span>
            <input value={note} onChange={event => setNote(event.target.value)} maxLength={160}
              placeholder="What you use it for"
              className="min-h-11 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-black/35" />
          </label>
          {problem ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{problem}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded-md bg-black/85 px-3.5 py-2 text-sm font-semibold text-white hover:bg-black">
              {editing ? "Save changes" : "Add to palette"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md border border-black/15 px-3.5 py-2 text-sm font-medium text-black/60 hover:bg-black/[0.03]">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {ready && !savedTools.length && !adding ? (
        <p className="mt-4 rounded-md border border-dashed border-black/15 p-6 text-center text-sm leading-6 text-black/45">
          Nothing here yet. Add the sites you reach for while you work — a colour
          tool, a client's CMS, a supplier — and each becomes a card that opens
          in a new tab.
        </p>
      ) : null}

      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {savedTools.map((tool, index) => (
          <li key={tool.id} className="group relative">
            <a
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mm-tool-card flex min-h-28 flex-col rounded-md border border-black/10 bg-white p-4 shadow-sm transition hover:border-brand/35 hover:bg-brand/[0.025] hover:shadow-md"
            >
              <span className="grid size-9 place-items-center rounded-md border border-brand/15 bg-brand/[0.07] text-brand">
                <ExternalLink size={16} aria-hidden />
              </span>
              <strong className="mt-2.5 text-sm font-semibold text-black/85">{tool.label}</strong>
              {tool.note ? <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-black/50">{tool.note}</span> : null}
              <span className="mt-auto truncate pt-2 text-[11px] text-black/35">{tool.url.replace(/^https?:\/\//, "")}</span>
            </a>
            <span className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <button type="button" onClick={() => move(tool.id, -1)} disabled={index === 0} aria-label={`Move ${tool.label} earlier`} className="grid size-7 place-items-center rounded-md bg-white/90 text-black/45 shadow-sm hover:text-black/75 disabled:opacity-30"><ArrowUp size={13} aria-hidden /></button>
              <button type="button" onClick={() => move(tool.id, 1)} disabled={index === savedTools.length - 1} aria-label={`Move ${tool.label} later`} className="grid size-7 place-items-center rounded-md bg-white/90 text-black/45 shadow-sm hover:text-black/75 disabled:opacity-30"><ArrowDown size={13} aria-hidden /></button>
              <button type="button" onClick={() => startEdit(tool)} aria-label={`Edit ${tool.label}`} className="grid size-7 place-items-center rounded-md bg-white/90 text-black/45 shadow-sm hover:text-black/75"><PenLine size={13} aria-hidden /></button>
              <button type="button" onClick={() => commit(savedTools.filter(candidate => candidate.id !== tool.id))} aria-label={`Remove ${tool.label}`} className="grid size-7 place-items-center rounded-md bg-white/90 text-red-600/70 shadow-sm hover:text-red-700"><X size={13} aria-hidden /></button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
