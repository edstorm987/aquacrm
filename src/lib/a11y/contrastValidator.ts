// contrastValidator — pure WCAG AA contrast-ratio check for tenant
// brand kits. Used by `<ThemeInjector>` (dev-time console warning) and
// by the brand-kit form (UI warning when a paste fails contrast).
//
// AA thresholds: 4.5 for normal text, 3.0 for large text + UI
// components. We default to 4.5 for the strictest check.

export interface PaletteInput {
  primary?: string;
  secondary?: string;
  accent?: string;
  bg?: string;
  surface?: string;
  ink?: string;
}

export interface ContrastWarning {
  pair: string;
  ratio: number;
  required: number;
  hint: string;
}

export interface ContrastResult {
  ok: boolean;
  warnings: ContrastWarning[];
}

// Hex like "#0EA5A4" or "#fff" → { r, g, b } in 0..255.
function parseHex(input: string): { r: number; g: number; b: number } | null {
  const s = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  if (s.length === 3) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    };
  }
  if (s.length === 6) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }
  return null;
}

// Convert sRGB channel 0..255 to linear 0..1 (WCAG formula).
function linearise(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * linearise(rgb.r) + 0.7152 * linearise(rgb.g) + 0.0722 * linearise(rgb.b);
}

// Contrast ratio per WCAG 2.1 (1.05 * (L1+0.05) / (L2+0.05) … in
// canonical form). Returns 1..21.
export function contrastRatio(fg: string, bg: string): number | null {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return null;
  const lf = relativeLuminance(f);
  const lb = relativeLuminance(b);
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const PAIRS: { fg: keyof PaletteInput; bg: keyof PaletteInput; required: number; hint: string }[] = [
  { fg: "ink", bg: "bg", required: 4.5, hint: "Body text on page background." },
  { fg: "ink", bg: "surface", required: 4.5, hint: "Body text on card surface." },
  { fg: "primary", bg: "bg", required: 3.0, hint: "Primary CTA on page background." },
  { fg: "primary", bg: "surface", required: 3.0, hint: "Primary CTA on card surface." },
  { fg: "accent", bg: "bg", required: 3.0, hint: "Accent CTA / highlight on page background." },
];

export function validatePalette(palette: PaletteInput): ContrastResult {
  const warnings: ContrastWarning[] = [];
  for (const { fg, bg, required, hint } of PAIRS) {
    const fgVal = palette[fg];
    const bgVal = palette[bg];
    if (!fgVal || !bgVal) continue;
    const ratio = contrastRatio(fgVal, bgVal);
    if (ratio === null) continue;
    if (ratio < required) {
      warnings.push({
        pair: `${fg} on ${bg}`,
        ratio: Math.round(ratio * 100) / 100,
        required,
        hint,
      });
    }
  }
  return { ok: warnings.length === 0, warnings };
}
