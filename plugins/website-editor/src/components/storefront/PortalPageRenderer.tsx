// Renders a published `EditorPage` for the storefront route. Wraps the
// block tree in the page's theme + custom CSS + head injections.
//
// Faithful copy from `02/src/components/PortalPageRenderer.tsx`,
// re-scoped to take props directly (no lookup-by-host) — the foundation
// resolves the page server-side and passes it in.

import type { EditorPage } from "../../types/editorPage";
import type { ThemeRecord } from "../../types/theme";
import { BlockTreeRenderer } from "../BlockRenderer";
import { EditorThemeInjector } from "./EditorThemeInjector";

export interface PortalPageRendererProps {
  page: EditorPage;
  theme?: ThemeRecord | null;
  preview?: boolean;
}

export function PortalPageRenderer({ page, theme, preview }: PortalPageRendererProps) {
  const blocks = preview && page.draftBlocks ? page.draftBlocks : page.blocks;
  return (
    <div data-portal-page={page.id} data-portal-role={page.portalRole ?? "page"}>
      <EditorThemeInjector theme={theme ?? null} customCSS={page.customCSS} />
      <BlockTreeRenderer blocks={blocks} />
    </div>
  );
}
