// R024 — Auto-tag heuristic for uploaded assets.
//
// Pure function — derives a list of tags from filename + mimeType.
// Operator-supplied tags merge on top (their tags win on dedup).
//
// Heuristic order:
//   1. mimeType family → "image" / "video" / "audio" / "doc"
//   2. filename keyword scan → "logo" / "hero" / "product" / "team" / etc.
//   3. extension → "png" / "jpg" / "svg" / etc. (lowercase)

export interface AutoTagInput {
  filename: string;
  mimeType: string;
  operatorTags?: string[];
}

const KEYWORD_TAGS: ReadonlyArray<{ keywords: string[]; tag: string }> = [
  { keywords: ["logo", "brandmark", "wordmark"], tag: "logo" },
  { keywords: ["hero", "banner", "cover"], tag: "hero" },
  { keywords: ["product", "sku"], tag: "product" },
  { keywords: ["team", "headshot", "portrait", "founder", "staff"], tag: "team" },
  { keywords: ["icon", "favicon"], tag: "icon" },
  { keywords: ["bg", "background", "texture"], tag: "background" },
  { keywords: ["thumb", "thumbnail", "preview"], tag: "thumbnail" },
  { keywords: ["screenshot", "screen", "ui"], tag: "screenshot" },
  { keywords: ["map", "location"], tag: "map" },
  { keywords: ["chart", "graph", "diagram"], tag: "diagram" },
];

function familyForMime(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("application/pdf")) return "doc";
  if (m.startsWith("application/")) return "doc";
  if (m.startsWith("text/")) return "doc";
  return "other";
}

function extensionFor(filename: string): string | null {
  const i = filename.lastIndexOf(".");
  if (i < 0 || i === filename.length - 1) return null;
  const ext = filename.slice(i + 1).toLowerCase();
  // Accept short alphanumeric extensions only (skip query strings + non-extension dots).
  if (!/^[a-z0-9]{2,5}$/.test(ext)) return null;
  return ext;
}

export function deriveAutoTags(input: AutoTagInput): string[] {
  const tags = new Set<string>();
  // Family
  const family = familyForMime(input.mimeType);
  if (family !== "other") tags.add(family);
  // Keyword scan
  const lowerName = input.filename.toLowerCase();
  for (const rule of KEYWORD_TAGS) {
    if (rule.keywords.some(k => lowerName.includes(k))) {
      tags.add(rule.tag);
    }
  }
  // Extension
  const ext = extensionFor(input.filename);
  if (ext) tags.add(ext);
  return Array.from(tags);
}

export function mergeTags(autoTags: string[], operatorTags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Operator tags first (their order wins).
  for (const t of operatorTags ?? []) {
    const v = t.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  for (const t of autoTags) {
    const v = t.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
