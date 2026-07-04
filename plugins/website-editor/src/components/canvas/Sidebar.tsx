"use client";

// Editor left sidebar — split between a block library (drag a block
// onto the canvas to insert) and a layers tree (the current document
// structure with click-to-select).

import { useState } from "react";
import type { Block } from "../../types/block";
import { listBlockDefinitions, type BlockDefinition } from "../blockRegistry";

const CATEGORIES: Array<{ id: BlockDefinition["category"]; label: string }> = [
  { id: "layout",   label: "Layout" },
  { id: "content",  label: "Content" },
  { id: "media",    label: "Media" },
  { id: "commerce", label: "Commerce" },
  { id: "advanced", label: "Advanced" },
];

interface SidebarProps {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddTopLevel: (type: BlockDefinition["type"]) => void;
}

export default function Sidebar({ blocks, selectedId, onSelect, onAddTopLevel }: SidebarProps) {
  const [tab, setTab] = useState<"library" | "layers">("library");
  // Collapsed-on-mobile state — admin can expand via the floating button.
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="md:hidden fixed bottom-4 left-4 z-40 w-11 h-11 rounded-full bg-brand-orange text-white text-lg font-bold shadow-lg shadow-black/40"
        aria-label={open ? "Close blocks panel" : "Open blocks panel"}
      >{open ? "×" : "▦"}</button>

      <aside className={`shrink-0 flex flex-col border-r border-white/8 bg-brand-black-soft
        ${open ? "fixed inset-y-0 left-0 z-30 w-72" : "hidden"}
        md:relative md:flex md:w-72`}>
      <div className="flex border-b border-white/8">
        <button
          onClick={() => setTab("library")}
          className={`flex-1 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase ${tab === "library" ? "text-brand-orange border-b-2 border-brand-orange" : "text-brand-cream/55 hover:text-brand-cream"}`}
        >
          Blocks
        </button>
        <button
          onClick={() => setTab("layers")}
          className={`flex-1 py-2 text-[11px] font-semibold tracking-[0.18em] uppercase ${tab === "layers" ? "text-brand-orange border-b-2 border-brand-orange" : "text-brand-cream/55 hover:text-brand-cream"}`}
        >
          Layers
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "library"
          ? <BlockLibrary onAdd={t => { onAddTopLevel(t); setOpen(false); }} />
          : <LayersTree blocks={blocks} selectedId={selectedId} onSelect={id => { onSelect(id); setOpen(false); }} />
        }
      </div>
    </aside>
    </>
  );
}

function BlockLibrary({ onAdd }: { onAdd: (type: BlockDefinition["type"]) => void }) {
  const all = listBlockDefinitions();
  return (
    <div className="p-3 space-y-4">
      {CATEGORIES.map(cat => {
        const items = all.filter(d => d.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id}>
            <p className="text-[10px] tracking-[0.2em] uppercase text-brand-cream/40 mb-1.5 px-1">{cat.label}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map(d => (
                <button
                  key={d.type}
                  draggable
                  data-touch-drag-payload={JSON.stringify({ type: "x-block-type", value: d.type })}
                  onDragStart={e => {
                    e.dataTransfer.setData("application/x-block-type", d.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAdd(d.type)}
                  className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-white/[0.06] hover:border-brand-orange/40 transition-colors text-center cursor-grab active:cursor-grabbing touch-none"
                >
                  <span className="text-base leading-none">{d.icon}</span>
                  <span className="text-[10px] text-brand-cream/75 leading-tight">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LayersTree({ blocks, selectedId, onSelect }: { blocks: Block[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (blocks.length === 0) {
    return <p className="p-4 text-[11px] text-brand-cream/45 leading-relaxed">No blocks yet. Drag one from the Blocks tab onto the canvas.</p>;
  }
  return <ul className="p-2 space-y-0.5">{blocks.map(b => <LayerRow key={b.id} block={b} depth={0} selectedId={selectedId} onSelect={onSelect} />)}</ul>;
}

function LayerRow({ block, depth, selectedId, onSelect }: { block: Block; depth: number; selectedId: string | null; onSelect: (id: string) => void }) {
  const active = block.id === selectedId;
  return (
    <li>
      <button
        onClick={() => onSelect(block.id)}
        className={`w-full flex items-center gap-2 py-1 pr-2 rounded text-left text-[12px] transition-colors ${active ? "bg-brand-orange/15 text-brand-cream" : "text-brand-cream/65 hover:bg-white/5 hover:text-brand-cream"}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span className="text-[10px] opacity-50 w-3 inline-block">{block.children ? "▾" : ""}</span>
        <span className="flex-1 truncate">{block.type}</span>
        <span className="text-[10px] opacity-40 font-mono">{block.id.slice(2, 6)}</span>
      </button>
      {block.children && block.children.length > 0 && (
        <ul className="space-y-0.5 mt-0.5">
          {block.children.map(c => <LayerRow key={c.id} block={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />)}
        </ul>
      )}
    </li>
  );
}
