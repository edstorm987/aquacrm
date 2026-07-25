"use client";

import { useEffect, useState } from "react";
import {
  getSections, saveSections, setSectionVisible, moveSectionUp, moveSectionDown, onSectionsChange,
  type SectionDef,
} from "../lib/sections";
import AdminTabs from "../components/AdminTabs";
import { CONTENT_TABS } from "../lib/tabSets";

export default function AdminSectionsPage(_props: unknown) {
  const [sections, setSections] = useState<SectionDef[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const refresh = () => setSections(getSections());
    refresh();
    return onSectionsChange(refresh);
  }, []);

  function handleUp(id: string) {
    moveSectionUp(id);
    setSaved(false);
  }

  function handleDown(id: string) {
    moveSectionDown(id);
    setSaved(false);
  }

  function handleVisible(id: string, v: boolean) {
    setSectionVisible(id, v);
    setSaved(false);
  }

  // Drag-and-drop handlers
  function handleDragStart(id: string) {
    setDragging(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOver(id);
  }

  function handleDrop(targetId: string) {
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return; }
    const updated = [...sections];
    const from = updated.findIndex((s) => s.id === dragging);
    const to = updated.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = updated.splice(from, 1);
    if (!moved) return;
    updated.splice(to, 0, moved);
    saveSections(updated);
    setSections(updated);
    setDragging(null);
    setDragOver(null);
    setSaved(false);
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-2xl space-y-6">
      <AdminTabs tabs={CONTENT_TABS} ariaLabel="Content" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-brand-amber mb-2">Design</p>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-cream">Section layout</h1>
          <p className="text-brand-cream/45 text-sm mt-1">
            Drag to reorder homepage sections or toggle visibility. Changes apply live.
          </p>
        </div>
        {saved && (
          <span className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 px-3 py-1.5 rounded-lg">
            Saved
          </span>
        )}
      </div>

      <div className="space-y-2">
        {sections.map((s, i) => {
          const isFirst = i === 0;
          const isLast = i === sections.length - 1;
          const isDragging = dragging === s.id;
          const isOver = dragOver === s.id;

          return (
            <div
              key={s.id}
              draggable={!s.locked}
              onDragStart={() => handleDragStart(s.id)}
              onDragOver={(e) => handleDragOver(e, s.id)}
              onDrop={() => handleDrop(s.id)}
              onDragEnd={() => { setDragging(null); setDragOver(null); }}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
                isDragging
                  ? "opacity-40 border-brand-orange/40 bg-brand-orange/5"
                  : isOver
                  ? "border-brand-orange/60 bg-brand-orange/5 scale-[1.01]"
                  : s.visible
                  ? "border-white/8 bg-white/[0.02] hover:border-white/15"
                  : "border-white/5 bg-white/[0.01] opacity-60"
              }`}
            >
              {/* Drag handle */}
              <div className={`flex flex-col gap-0.5 shrink-0 ${s.locked ? "opacity-20" : "cursor-grab active:cursor-grabbing text-brand-cream/30 hover:text-brand-cream/60"}`}>
                <span className="block w-4 h-px bg-current" />
                <span className="block w-4 h-px bg-current" />
                <span className="block w-4 h-px bg-current" />
              </div>

              {/* Position badge */}
              <span className="text-[11px] text-brand-cream/25 font-mono w-5 text-center shrink-0">{i + 1}</span>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${s.visible ? "text-brand-cream" : "text-brand-cream/40"}`}>
                  {s.label}
                  {s.locked && <span className="ml-2 text-[10px] text-brand-cream/25">locked</span>}
                </p>
                <p className="text-xs text-brand-cream/35 mt-0.5">{s.description}</p>
              </div>

              {/* Up / Down */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  disabled={isFirst || s.locked}
                  onClick={() => handleUp(s.id)}
                  className="w-7 h-6 rounded text-brand-cream/30 hover:text-brand-cream/80 hover:bg-white/10 disabled:opacity-20 disabled:cursor-default text-xs flex items-center justify-center transition-colors"
                >
                  ↑
                </button>
                <button
                  disabled={isLast || s.locked}
                  onClick={() => handleDown(s.id)}
                  className="w-7 h-6 rounded text-brand-cream/30 hover:text-brand-cream/80 hover:bg-white/10 disabled:opacity-20 disabled:cursor-default text-xs flex items-center justify-center transition-colors"
                >
                  ↓
                </button>
              </div>

              {/* Visibility toggle */}
              <button
                disabled={s.locked}
                onClick={() => handleVisible(s.id, !s.visible)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  s.locked ? "opacity-20 cursor-default" : s.visible ? "bg-brand-orange" : "bg-white/15 hover:bg-white/25"
                }`}
                title={s.visible ? "Visible — click to hide" : "Hidden — click to show"}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${s.visible ? "left-6" : "left-1"}`} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/8 p-4 text-xs text-brand-cream/40 space-y-1.5">
        <p className="font-medium text-brand-cream/60">How it works</p>
        <p>• Drag sections up or down to change their order on the homepage.</p>
        <p>• Toggle the switch on the right to show or hide a section entirely.</p>
        <p>• Changes apply immediately — no publish step needed.</p>
        <p>• The <strong className="text-brand-cream/60">Hero</strong> section is locked and always appears first.</p>
      </div>
    </div>
  );
}
