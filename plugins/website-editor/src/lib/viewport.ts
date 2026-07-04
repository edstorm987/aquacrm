// R019 — Viewport switching helpers.
//
// `Viewport` is the canonical viewport-size category — the editor's
// topbar switcher, BlockStyles' `hideOn*` flags, and the overflow
// detector all key off these three values.
//
// Pure module — no DOM imports at module scope; safe in SSR / smoke
// contexts.

import type { Block, BlockStyles } from "../types/block";

export type Viewport = "desktop" | "tablet" | "mobile";

export interface ViewportSpec {
  id: Viewport;
  label: string;
  width: number;       // CSS pixels — preview iframe width
  icon: string;
}

export const VIEWPORT_SPECS: readonly ViewportSpec[] = [
  { id: "desktop", label: "Desktop", width: 1280, icon: "🖥" },
  { id: "tablet",  label: "Tablet",  width: 768,  icon: "📱" },
  { id: "mobile",  label: "Mobile",  width: 390,  icon: "📲" },
];

export function widthForViewport(v: Viewport): number {
  return VIEWPORT_SPECS.find(s => s.id === v)?.width ?? 1280;
}

// Returns true if the block should be hidden on the given viewport
// based on its styles' `hideOn*` flags.
export function isHiddenOn(styles: BlockStyles | undefined, v: Viewport): boolean {
  if (!styles) return false;
  if (v === "desktop" && styles.hideOnDesktop) return true;
  if (v === "tablet" && styles.hideOnTablet) return true;
  if (v === "mobile" && styles.hideOnMobile) return true;
  return false;
}

// Recursively prunes the BlockTree of blocks hidden on the given
// viewport. Called by the storefront renderer with the user's actual
// viewport AND by the editor preview when previewing a non-desktop
// viewport. Pure (deep clone — never mutates input).
export function pruneForViewport(blocks: Block[], v: Viewport): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (isHiddenOn(b.styles, v)) continue;
    out.push({
      ...b,
      ...(b.children ? { children: pruneForViewport(b.children, v) } : {}),
    });
  }
  return out;
}

// ─── Overflow detection (R019 §C) ─────────────────────────────────────────
//
// The editor flags blocks whose rendered width exceeds the active
// viewport — common cause of horizontal-scroll issues. The DOM
// detector reads `getBoundingClientRect().width` on every
// `[data-block-id]` element under the iframe and compares against the
// active viewport width.

export interface OverflowReport {
  blockId: string;
  width: number;
  viewportWidth: number;
}

// SSR-safe: returns [] when document is missing.
export function detectOverflows(
  doc: Document | null | undefined,
  viewportWidth: number,
): OverflowReport[] {
  if (!doc) return [];
  const out: OverflowReport[] = [];
  const nodes = doc.querySelectorAll<HTMLElement>("[data-block-id]");
  // 1px tolerance — sub-pixel rounding artefacts shouldn't trigger
  // amber flags.
  const tolerance = 1;
  for (const el of Array.from(nodes)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > viewportWidth + tolerance) {
      out.push({
        blockId: el.getAttribute("data-block-id") ?? "",
        width: Math.round(rect.width),
        viewportWidth,
      });
    }
  }
  return out;
}
