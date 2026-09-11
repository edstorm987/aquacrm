// Renamed from `02/src/components/ThemeInjector.tsx` to avoid clashing
// with T1's foundation chrome ThemeInjector (per brief). Injects per-page
// theme tokens as CSS variables into a `<style>` block.

import type { ThemeRecord } from "../../types/theme";
import { appearanceToColorSchemeCss, tokensToCssVars } from "../themeCss";

export interface EditorThemeInjectorProps {
  theme?: ThemeRecord | null;
  customCSS?: string;
}

export function EditorThemeInjector({ theme, customCSS }: EditorThemeInjectorProps) {
  const tokensCss = theme ? tokensToCssVars(theme.tokens) : "";
  const appearanceCss = appearanceToColorSchemeCss(theme?.appearance);
  const combined = [appearanceCss, tokensCss, customCSS ?? ""].filter(Boolean).join("\n");
  if (!combined) return null;
  // React's style-text serializer neutralises an HTML closing-tag sequence;
  // raw HTML insertion here would let stored CSS terminate this element.
  return <style data-editor-theme>{combined}</style>;
}
