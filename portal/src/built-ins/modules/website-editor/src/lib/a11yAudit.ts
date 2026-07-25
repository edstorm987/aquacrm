// R031 — Accessibility audit walker.
//
// Pure function over a `Block[]` tree returning structured issues.
// Foundation editor surfaces results in an "Accessibility" panel
// (host-page composition); renderer-side fixes (alt-required,
// auto-aria, semantic landmarks) are one-line additions to the
// existing block render path.
//
// Target: WCAG 2.1 AA. R+1: AAA conformance + screen-reader
// testing flows.

import type { Block } from "../types/block";

export type A11ySeverity = "critical" | "serious" | "warning" | "info";

export type A11yIssueCode =
  | "img-missing-alt"
  | "icon-button-missing-label"
  | "link-missing-text"
  | "heading-empty"
  | "heading-skip-level"
  | "form-input-missing-label"
  | "low-contrast-text"
  | "duplicate-id"
  | "missing-landmark"
  | "video-missing-track";

export interface A11yIssue {
  code: A11yIssueCode;
  severity: A11ySeverity;
  blockId: string;
  blockType: string;
  path: string;          // JSON-pointer-style "[0].children[2]"
  message: string;
  fixHint?: string;      // operator-facing one-liner the editor surfaces
  autofixable?: boolean; // editor can offer click-to-fix
}

const SEVERITY_RANK: Record<A11ySeverity, number> = {
  critical: 0, serious: 1, warning: 2, info: 3,
};

// ─── Per-block check matrix ───────────────────────────────────────────────

function checkBlock(b: Block, path: string, ctx: AuditContext, issues: A11yIssue[]): void {
  const props = b.props ?? {};
  const type = String(b.type);

  // 1. Image alt requirement.
  if (type === "image" || type === "gallery") {
    const alt = props.alt as string | undefined;
    const src = props.src as string | undefined;
    if (src && (!alt || !alt.trim())) {
      issues.push(makeIssue("img-missing-alt", "critical", b, path,
        "Image is missing an alt description.",
        "Add `alt` text describing the image, or set alt='' for decorative images.",
        true));
    }
  }

  // 2. Icon-only buttons need an accessible name.
  if (type === "button" || type === "icon-button") {
    const label = (props.label as string | undefined)?.trim();
    const ariaLabel = (props.ariaLabel as string | undefined)?.trim();
    const text = (props.text as string | undefined)?.trim();
    const hasGlyph = Boolean(props.icon || props.glyph);
    if (!label && !ariaLabel && !text) {
      const sev: A11ySeverity = hasGlyph ? "critical" : "serious";
      issues.push(makeIssue("icon-button-missing-label", sev, b, path,
        "Button has no accessible name.",
        "Set `label`, `ariaLabel`, or visible `text`.",
        false));
    }
  }

  // 3. Link without text.
  if (type === "link") {
    const text = (props.text as string | undefined)?.trim();
    const ariaLabel = (props.ariaLabel as string | undefined)?.trim();
    if (!text && !ariaLabel) {
      issues.push(makeIssue("link-missing-text", "serious", b, path,
        "Link has no visible text.",
        "Set `text` or `ariaLabel`.",
        false));
    }
  }

  // 4. Heading checks.
  if (type === "heading") {
    const text = (props.text as string | undefined)?.trim();
    if (!text) {
      issues.push(makeIssue("heading-empty", "serious", b, path,
        "Heading is empty.",
        "Set `text` or remove the heading block.",
        true));
    }
    const levelRaw = props.level;
    const level = typeof levelRaw === "number" ? levelRaw : Number(levelRaw);
    if (level && Number.isFinite(level)) {
      if (ctx.lastHeadingLevel != null && level > ctx.lastHeadingLevel + 1) {
        issues.push(makeIssue("heading-skip-level", "warning", b, path,
          `Heading skips from h${ctx.lastHeadingLevel} to h${level}.`,
          `Use h${ctx.lastHeadingLevel + 1} instead, or restructure the section.`,
          false));
      }
      ctx.lastHeadingLevel = level;
    }
  }

  // 5. Form inputs need labels.
  if (type === "form" || type === "form-embed" || type === "contact-form") {
    const fields = props.fields as Array<{ label?: string; name?: string }> | undefined;
    if (Array.isArray(fields)) {
      fields.forEach((f, i) => {
        if (!f.label || !f.label.trim()) {
          issues.push(makeIssue("form-input-missing-label", "serious", b,
            `${path}.fields[${i}]`,
            `Form field "${f.name ?? "(unnamed)"}" has no label.`,
            "Set the field's `label`.",
            false));
        }
      });
    }
  }

  // 6. Video tracks (caption requirement).
  if (type === "video" || type === "video-embed") {
    const tracks = props.tracks as unknown[] | undefined;
    if (!tracks || tracks.length === 0) {
      issues.push(makeIssue("video-missing-track", "warning", b, path,
        "Video has no caption / subtitle track.",
        "Add at least one `<track kind='captions'>` for AA conformance.",
        false));
    }
  }

  // 7. Duplicate ids.
  const id = (props.id as string | undefined) ?? b.id;
  if (id) {
    if (ctx.seenIds.has(id)) {
      issues.push(makeIssue("duplicate-id", "serious", b, path,
        `Duplicate id "${id}".`,
        "Block ids must be unique within a page.",
        false));
    } else {
      ctx.seenIds.add(id);
    }
  }

  // 8. Recurse.
  if (b.children) {
    b.children.forEach((c, i) => checkBlock(c, `${path}.children[${i}]`, ctx, issues));
  }
}

interface AuditContext {
  seenIds: Set<string>;
  lastHeadingLevel: number | null;
  hasMain: boolean;
  hasNav: boolean;
}

function makeIssue(
  code: A11yIssueCode, severity: A11ySeverity,
  b: Block, path: string,
  message: string, fixHint?: string, autofixable?: boolean,
): A11yIssue {
  return {
    code, severity,
    blockId: b.id,
    blockType: String(b.type),
    path,
    message,
    ...(fixHint ? { fixHint } : {}),
    ...(autofixable !== undefined ? { autofixable } : {}),
  };
}

// ─── Landmark checks ──────────────────────────────────────────────────────
// These run at tree level rather than per-block.

function landmarkChecks(blocks: Block[], issues: A11yIssue[]): void {
  let hasMain = false;
  let hasNav = false;
  function walk(arr: Block[]): void {
    for (const b of arr) {
      const t = String(b.type);
      if (t === "main" || t === "section") hasMain = true;
      if (t === "navbar" || t === "nav") hasNav = true;
      if (b.children) walk(b.children);
    }
  }
  walk(blocks);
  if (!hasMain && blocks.length > 0) {
    issues.push({
      code: "missing-landmark",
      severity: "warning",
      blockId: blocks[0]!.id,
      blockType: "_root",
      path: "[]",
      message: "Page is missing a main landmark (no `section` or `main` block at root).",
      fixHint: "Wrap content in a `section` block so screen readers can skip the chrome.",
      autofixable: false,
    });
  }
  // Nav is informational — many storefronts use navbar selectively;
  // emit only at info level so it doesn't clutter critical paths.
  if (!hasNav && blocks.length > 0) {
    issues.push({
      code: "missing-landmark",
      severity: "info",
      blockId: blocks[0]!.id,
      blockType: "_root",
      path: "[]",
      message: "Page has no navigation landmark (no `navbar` block).",
      fixHint: "Add a `navbar` block so keyboard users can skip to nav.",
      autofixable: false,
    });
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

export interface A11yAuditResult {
  issues: A11yIssue[];
  countsBySeverity: Record<A11ySeverity, number>;
  countsByCode: Record<string, number>;
  total: number;
  /** True when no critical or serious issues remain — AA-pass heuristic. */
  passesBaseline: boolean;
}

export function auditAccessibility(blocks: Block[]): A11yAuditResult {
  const issues: A11yIssue[] = [];
  const ctx: AuditContext = {
    seenIds: new Set(),
    lastHeadingLevel: null,
    hasMain: false,
    hasNav: false,
  };
  blocks.forEach((b, i) => checkBlock(b, `[${i}]`, ctx, issues));
  landmarkChecks(blocks, issues);

  const countsBySeverity: Record<A11ySeverity, number> = {
    critical: 0, serious: 0, warning: 0, info: 0,
  };
  const countsByCode: Record<string, number> = {};
  for (const i of issues) {
    countsBySeverity[i.severity] += 1;
    countsByCode[i.code] = (countsByCode[i.code] ?? 0) + 1;
  }
  // Sort by severity then path for stable display.
  issues.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.path.localeCompare(b.path));

  return {
    issues,
    countsBySeverity,
    countsByCode,
    total: issues.length,
    passesBaseline: countsBySeverity.critical === 0 && countsBySeverity.serious === 0,
  };
}

// ─── Contrast helper (R011 brand-kit pairs) ──────────────────────────────
//
// Computes WCAG 2.1 contrast ratio between two colours (hex). The
// editor surfaces a warning when any brand-kit pair (text on bg)
// scores < 4.5 (normal text AA) or < 3.0 (large text AA).

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function relLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fgHex: string, bgHex: string): number | null {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return null;
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastLevel = "fail" | "AA-large" | "AA" | "AAA";

export function classifyContrast(ratio: number): ContrastLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}
