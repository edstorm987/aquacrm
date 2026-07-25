// R014 — Server-side OG-card generator.
//
// Emits a 1200×630 SVG card with `{title}` over a brand-coloured
// background, optional `{brandName}` lockup line. Foundation can
// serve the SVG verbatim from `/og?title=…` — no extra deps (vs.
// `@vercel/og` which pulls in Satori + a font bundle).
//
// SVG is the storage format; consumers that need raster PNG can
// pipe the SVG through `sharp` or similar at the foundation layer
// (R+1).

export interface OgCardOptions {
  title: string;
  brandName?: string;
  primaryColor: string;     // hex, e.g. "#0ea5e9"
  textColor?: string;       // defaults derived from primary lightness
  fontFamily?: string;      // CSS font stack
  width?: number;
  height?: number;
}

// Tiny luminance check so we pick black text on light backgrounds
// and white on dark ones. Operator override via `textColor` always
// wins.
function isLightHex(hex: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  let r: number, g: number, b: number;
  if (m[1]!.length === 3) {
    r = parseInt(m[1]![0]! + m[1]![0]!, 16);
    g = parseInt(m[1]![1]! + m[1]![1]!, 16);
    b = parseInt(m[1]![2]! + m[1]![2]!, 16);
  } else {
    r = parseInt(m[1]!.slice(0, 2), 16);
    g = parseInt(m[1]!.slice(2, 4), 16);
    b = parseInt(m[1]!.slice(4, 6), 16);
  }
  // Standard relative-luminance approximation.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Wraps `title` into multiple lines, ~30 chars per line, max 4 lines.
function wrapTitle(title: string, maxCharsPerLine = 30, maxLines = 4): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines - 1) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Truncate the last line with ellipsis if we ran out of words.
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    lines[lines.length - 1] = lines[lines.length - 1]!.slice(0, maxCharsPerLine - 1) + "…";
  }
  return lines.length > 0 ? lines : [title];
}

export function buildOgCardSvg(opts: OgCardOptions): string {
  const width = opts.width ?? 1200;
  const height = opts.height ?? 630;
  const fontFamily = opts.fontFamily ?? "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const lines = wrapTitle(opts.title);
  const lineHeight = 80;
  const totalH = lines.length * lineHeight;
  // Vertically centre the title block.
  const startY = (height - totalH) / 2 + lineHeight * 0.75;

  const textColor = opts.textColor ?? (isLightHex(opts.primaryColor) ? "#0b1220" : "#f5f3ec");
  const subtleColor = textColor === "#f5f3ec" ? "rgba(255,255,255,0.55)" : "rgba(11,18,32,0.55)";

  const titleLines = lines.map((l, i) =>
    `<tspan x="80" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(l)}</tspan>`,
  ).join("");

  const brandLine = opts.brandName
    ? `<text x="80" y="${height - 60}" font-family="${escapeXml(fontFamily)}" font-size="28" fill="${subtleColor}" font-weight="500">${escapeXml(opts.brandName)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${escapeXml(opts.primaryColor)}"/>
  <text font-family="${escapeXml(fontFamily)}" font-size="68" fill="${textColor}" font-weight="700" y="${startY}">${titleLines}</text>
  ${brandLine}
</svg>`;
}

// Convenience: returns a `data:image/svg+xml;base64,…` URL ready to
// paste into `<meta property="og:image">`. For external crawlers
// many social platforms refuse data URIs, so foundation should serve
// the SVG from a real route in production — this is the editor-
// preview shortcut.
export function buildOgCardDataUrl(opts: OgCardOptions): string {
  const svg = buildOgCardSvg(opts);
  // Use base64 encoding so the URL works regardless of escape
  // semantics in the consumer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (globalThis as any).Buffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (globalThis as any).Buffer.from(svg, "utf-8").toString("base64")
    : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${buf}`;
}
