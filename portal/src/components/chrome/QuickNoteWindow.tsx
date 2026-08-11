"use client";

import Link from "next/link";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, GripHorizontal, Link2, LoaderCircle, NotebookPen, Pin, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Position {
  x: number;
  y: number;
}

const EDGE = 12;
const PANEL_WIDTH = 384;

export function QuickNoteWindow({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sticky, setSticky] = useState(false);
  const [attachPage, setAttachPage] = useState(true);
  const [pageUrl, setPageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNoteId, setSavedNoteId] = useState("");

  useEffect(() => {
    setPortalRoot(document.querySelector(".mm-portal-root") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPageUrl(currentPageUrl());
    setSavedNoteId("");
    setError("");
    setPosition(current => current ?? defaultPosition());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setPosition(current => current ? clampPosition(current, panelRef.current) : defaultPosition());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !panelRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea")) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, panelRef.current));
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function saveNote() {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle && !cleanBody) {
      setError("Write a title or note first.");
      return;
    }
    setSaving(true);
    setError("");
    setSavedNoteId("");
    try {
      const response = await fetch("/api/portal/notepad", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-note",
          title: cleanTitle || fallbackTitle(pageUrl),
          body: attachPage && pageUrl ? appendPageContext(cleanBody, pageUrl) : cleanBody,
          tags: ["quick-note"],
          pinned: sticky,
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; note?: { id: string }; error?: string } | null;
      if (!response.ok || !result?.ok || !result.note) throw new Error(result?.error || "The note could not be saved.");
      setSavedNoteId(result.note.id);
      setTitle("");
      setBody("");
      setSticky(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !portalRoot || !position) return null;

  return createPortal(
    <section
      ref={panelRef}
      role="dialog"
      aria-label="Quick note"
      aria-modal="false"
      data-testid="quick-note-window"
      className="mm-quick-note fixed left-0 top-0 z-[95] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-lg border border-[#d6c49f] bg-[#fffdf8] text-[#2a2520] shadow-[0_24px_70px_rgba(34,25,12,0.24)]"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <div
        className="mm-quick-note-handle flex touch-none select-none items-center gap-2 border-b border-[#e7ddc9] bg-[#f7f0df] px-3 py-2.5 sm:cursor-move"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#ead8af] text-[#725724]"><NotebookPen size={16} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Quick note</h2>
          <p className="truncate text-[10px] text-[#746a5c]">Private to your AquaCRM account</p>
        </div>
        <GripHorizontal size={16} className="hidden text-[#9b8a69] sm:block" aria-hidden="true" />
        <button type="button" onClick={onClose} title="Close quick note" aria-label="Close quick note" className="grid size-8 place-items-center rounded-md text-[#746a5c] hover:bg-black/[0.05] hover:text-[#2a2520]"><X size={16} /></button>
      </div>

      <div className="min-h-0 overflow-y-auto p-3.5">
        <label className="grid gap-1 text-[10px] font-semibold uppercase text-[#746a5c]">
          Title
          <input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder="What happened?" autoFocus className="min-h-10 rounded-md border border-[#d9cfbc] bg-white px-3 text-sm font-semibold normal-case text-[#2a2520] outline-none placeholder:text-[#9b9287] focus:border-[#9a6a16]" />
        </label>
        <label className="mt-3 grid gap-1 text-[10px] font-semibold uppercase text-[#746a5c]">
          Note
          <textarea value={body} onChange={event => setBody(event.target.value)} rows={7} maxLength={100_000} placeholder="Capture the error, idea, decision, or anything you need to return to..." className="resize-y rounded-md border border-[#d9cfbc] bg-white px-3 py-2.5 text-sm leading-6 normal-case text-[#2a2520] outline-none placeholder:text-[#9b9287] focus:border-[#9a6a16]" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSticky(value => !value)} aria-pressed={sticky} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold ${sticky ? "border-[#b88b37] bg-[#f4e4bb] text-[#684b14]" : "border-[#d9cfbc] bg-white text-[#665c4e] hover:bg-[#faf6ed]"}`}><Pin size={14} />{sticky ? "Sticky" : "Make sticky"}</button>
          <button type="button" onClick={() => { setAttachPage(value => !value); setPageUrl(currentPageUrl()); }} aria-pressed={attachPage} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold ${attachPage ? "border-[#7bb5af] bg-[#e7f3f1] text-[#17685f]" : "border-[#d9cfbc] bg-white text-[#665c4e] hover:bg-[#faf6ed]"}`}><Link2 size={14} />{attachPage ? "Page attached" : "Attach page"}</button>
        </div>
        {attachPage && pageUrl ? <p className="mt-2 truncate text-[10px] text-[#8a8072]" title={pageUrl}>{pageUrl}</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        {savedNoteId ? <p role="status" className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"><Check size={14} />Saved to your notepad.</p> : null}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-[#e7ddc9] bg-white/70 px-3.5 py-3">
        <Link href={savedNoteId ? `/portal/agency/notepad?note=${encodeURIComponent(savedNoteId)}` : "/portal/agency/notepad"} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[#725724] hover:bg-[#f7f0df]">Full notepad <ArrowUpRight size={13} /></Link>
        <button type="button" onClick={() => void saveNote()} disabled={saving} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#2a2520] px-4 text-xs font-semibold text-white hover:bg-[#40382f] disabled:opacity-50">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <NotebookPen size={14} />}{saving ? "Saving" : "Save note"}</button>
      </footer>
    </section>,
    portalRoot,
  );
}

function currentPageUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: EDGE, y: 72 };
  const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE * 2);
  return { x: Math.max(EDGE, window.innerWidth - width - 20), y: Math.min(76, Math.max(EDGE, window.innerHeight - 520)) };
}

function clampPosition(position: Position, panel: HTMLElement | null): Position {
  if (typeof window === "undefined") return position;
  const width = panel?.offsetWidth ?? Math.min(PANEL_WIDTH, window.innerWidth - EDGE * 2);
  const height = panel?.offsetHeight ?? Math.min(510, window.innerHeight - EDGE * 2);
  return {
    x: Math.min(Math.max(EDGE, position.x), Math.max(EDGE, window.innerWidth - width - EDGE)),
    y: Math.min(Math.max(EDGE, position.y), Math.max(EDGE, window.innerHeight - height - EDGE)),
  };
}

function fallbackTitle(pageUrl: string): string {
  const segment = pageUrl.split("?")[0]?.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ");
  return segment ? `Quick note: ${segment}` : "Quick note";
}

function appendPageContext(body: string, pageUrl: string): string {
  const context = `Page: ${pageUrl}`;
  return body ? `${body}\n\n${context}` : context;
}
