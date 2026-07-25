"use client";

// R027 — In-editor block catalog. Renders every registered block
// grouped by category, with search + per-block "View source"
// expander showing the default JSON shape (useful for Code-mode
// users from R020).
//
// Pure UI: receives `onInsert(type)` so the host wires the click to
// its existing insert-block flow. Lives behind the editor's
// "Catalog" sidebar tab — host page mounts.

import { useMemo, useState } from "react";
import { listBlockDefinitions, type BlockDefinition } from "../blockRegistry";
import type { BlockCategory } from "../../lib/aquaPluginTypes";

interface Props {
  // Fires when operator clicks a block's Insert button.
  onInsert: (type: string) => void;
  // Optional override — when host is rendering inside a host-shell
  // it can hide the closed-by-default fence with a custom prop.
  defaultExpanded?: BlockCategory;
}

const CATEGORY_ORDER: BlockCategory[] = ["layout", "content", "media", "commerce", "auth", "advanced"];
const CATEGORY_LABEL: Record<BlockCategory, string> = {
  layout: "Layout",
  content: "Content",
  media: "Media",
  commerce: "Commerce",
  auth: "Auth",
  advanced: "Advanced",
};

// Heuristic description from the def shape — block library doesn't
// carry a `description` field today (R+1 candidate). For now we
// stitch a sentence from icon + container-ness + props count.
function deriveDescription(def: BlockDefinition): string {
  const propsCount = Object.keys(def.defaultProps ?? {}).length;
  const fieldsCount = (def.fields ?? []).length;
  const containerHint = def.isContainer ? "Container — accepts nested blocks." : "";
  const propsHint = propsCount > 0
    ? `${propsCount} prop${propsCount === 1 ? "" : "s"}`
    : "no props";
  const fieldsHint = fieldsCount > 0
    ? `${fieldsCount} editable field${fieldsCount === 1 ? "" : "s"}`
    : "";
  return [containerHint, propsHint, fieldsHint].filter(Boolean).join(" · ");
}

function blockJsonSnippet(def: BlockDefinition): string {
  return JSON.stringify({
    id: `${def.type}_<id>`,
    type: def.type,
    props: def.defaultProps ?? {},
    ...(def.isContainer && def.defaultChildren ? { children: def.defaultChildren } : {}),
  }, null, 2);
}

export default function BlockCatalog({ onInsert, defaultExpanded }: Props) {
  const all = useMemo(() => listBlockDefinitions(), []);
  const [query, setQuery] = useState("");
  const [openSource, setOpenSource] = useState<Set<string>>(() => new Set());

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<BlockCategory, BlockDefinition[]>();
    for (const def of all) {
      if (q && !`${def.label} ${def.type}`.toLowerCase().includes(q)) continue;
      const arr = map.get(def.category) ?? [];
      arr.push(def);
      map.set(def.category, arr);
    }
    // Sort by label within each category for predictable scan order.
    for (const [k, v] of map) v.sort((a, b) => a.label.localeCompare(b.label));
    return map;
  }, [all, query]);

  function toggleSource(type: string): void {
    setOpenSource(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  return (
    <section data-component="block-catalog"
      style={{
        height: "100%", display: "flex", flexDirection: "column",
        background: "var(--brand-bg, #0b1220)",
        color: "var(--brand-text, #f5f3ec)",
        borderLeft: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
        minWidth: 320,
      }}>
      <header style={{ padding: 12, borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.05))" }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, marginBottom: 8 }}>Block catalog</h3>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search…"
          style={{
            width: "100%", padding: "5px 8px", fontSize: 12,
            background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
            border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
            borderRadius: "var(--brand-radius-sm, 4px)",
            color: "var(--brand-text, currentColor)",
          }}
        />
        <p style={{ fontSize: 10, color: "var(--brand-text-muted, rgba(255,255,255,0.5))", margin: "8px 0 0 0" }}>
          {all.length} block{all.length === 1 ? "" : "s"} registered
        </p>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
        {Array.from(grouped.entries())
          .sort(([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
          .map(([cat, defs]) => {
            const open = defaultExpanded === cat || query.length > 0;
            return (
              <details key={cat} open={open || true}
                data-category={cat}
                style={{ marginTop: 12 }}>
                <summary style={{
                  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em",
                  color: "var(--brand-text-muted, rgba(255,255,255,0.55))",
                  padding: "6px 4px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span>{CATEGORY_LABEL[cat] ?? cat}</span>
                  <span style={{ fontFamily: "monospace", opacity: 0.6 }}>{defs.length}</span>
                </summary>
                {defs.map(def => (
                  <div key={def.type}
                    data-block-type={def.type}
                    style={{
                      padding: "8px 8px",
                      borderRadius: "var(--brand-radius-sm, 4px)",
                      marginBottom: 6,
                      background: "var(--brand-bg-elevated, rgba(255,255,255,0.03))",
                      border: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
                    }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1, opacity: 0.85 }}>
                        {def.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{def.label}</p>
                        <p style={{
                          fontSize: 10, color: "var(--brand-text-muted, rgba(255,255,255,0.55))",
                          margin: "2px 0 0 0", fontFamily: "monospace",
                        }}>
                          {def.type}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--brand-text-muted, rgba(255,255,255,0.65))", margin: "4px 0 0 0" }}>
                          {deriveDescription(def)}
                        </p>
                      </div>
                      <button
                        onClick={() => onInsert(def.type)}
                        aria-label={`Insert ${def.label}`}
                        style={{
                          padding: "3px 8px", fontSize: 11,
                          background: "var(--brand-primary, rgba(56,189,248,0.18))",
                          color: "var(--brand-text, #fff)",
                          border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
                          borderRadius: "var(--brand-radius-sm, 4px)",
                          cursor: "pointer",
                        }}>
                        Insert
                      </button>
                    </div>
                    <button
                      onClick={() => toggleSource(def.type)}
                      style={{
                        marginTop: 6, padding: "2px 0", fontSize: 10,
                        background: "transparent", border: "none",
                        color: "var(--brand-text-muted, rgba(255,255,255,0.55))",
                        cursor: "pointer", textAlign: "left",
                      }}>
                      {openSource.has(def.type) ? "▾ Hide source" : "▸ View source"}
                    </button>
                    {openSource.has(def.type) && (
                      <pre style={{
                        marginTop: 6, padding: 8, fontSize: 11,
                        background: "var(--brand-bg, rgba(0,0,0,0.4))",
                        border: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
                        borderRadius: "var(--brand-radius-sm, 4px)",
                        color: "var(--brand-text, currentColor)",
                        fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                        overflowX: "auto", whiteSpace: "pre",
                      }}>{blockJsonSnippet(def)}</pre>
                    )}
                  </div>
                ))}
              </details>
            );
          })}
        {grouped.size === 0 && (
          <p style={{ padding: 16, fontSize: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.45))", textAlign: "center" }}>
            No blocks match.
          </p>
        )}
      </div>
    </section>
  );
}
