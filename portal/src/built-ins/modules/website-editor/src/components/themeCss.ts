// Client-side mirror of the server's tokensToCssVars helper. Used by
// PortalPageRenderer + Canvas root to inject the active theme's tokens
// without re-fetching from the server module (the server module isn't
// importable in client bundles).
//
// Faithful port of `02/src/components/editor/themeCss.ts`.

import type { ThemeTokens } from "../types/theme";

export function tokensToCssVarsClient(tokens: ThemeTokens | undefined): string {
  if (!tokens) return "";
  const out: string[] = [];
  if (tokens.primary)      out.push(`--theme-primary: ${tokens.primary};`);
  if (tokens.surface)      out.push(`--theme-surface: ${tokens.surface};`);
  if (tokens.surfaceAlt)   out.push(`--theme-surface-alt: ${tokens.surfaceAlt};`);
  if (tokens.ink)          out.push(`--theme-ink: ${tokens.ink};`);
  if (tokens.inkSoft)      out.push(`--theme-ink-soft: ${tokens.inkSoft};`);
  if (tokens.border)       out.push(`--theme-border: ${tokens.border};`);
  if (tokens.shadow)       out.push(`--theme-shadow: ${tokens.shadow};`);
  if (tokens.fontHeading)  out.push(`--theme-font-heading: ${tokens.fontHeading};`);
  if (tokens.fontBody)     out.push(`--theme-font-body: ${tokens.fontBody};`);
  if (tokens.fontMono)     out.push(`--theme-font-mono: ${tokens.fontMono};`);
  if (tokens.radius)       out.push(`--theme-radius: ${tokens.radius};`);
  if (tokens.spacingUnit)  out.push(`--theme-space: ${tokens.spacingUnit};`);
  return out.join(" ");
}

// Wrapper that emits a complete `:root { ... }` block. Used by
// EditorThemeInjector when injecting a `<style>` tag.
export function tokensToCssVars(tokens: ThemeTokens | undefined): string {
  const inner = tokensToCssVarsClient(tokens);
  if (!inner) return "";
  return `:root { ${inner} }`;
}
