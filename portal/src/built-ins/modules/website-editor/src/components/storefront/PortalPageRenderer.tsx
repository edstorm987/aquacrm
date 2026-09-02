// Renders a published `EditorPage` for the storefront route. Wraps the
// block tree in the page's theme + custom CSS + head injections.
//
// Faithful copy from `02/src/components/PortalPageRenderer.tsx`,
// re-scoped to take props directly (no lookup-by-host) — the foundation
// resolves the page server-side and passes it in.

import type { EditorPage } from "../../types/editorPage";
import type { ThemeRecord } from "../../types/theme";
import { resolveStorefrontTree } from "../../lib/draftPublished";
import { resolvePublishedPage, resolvePublishedTheme } from "../../lib/pagePublication";
import { BlockTreeRenderer } from "../BlockRenderer";
import { EditorThemeInjector } from "./EditorThemeInjector";

export interface PortalPageRendererProps {
  page: EditorPage;
  theme?: ThemeRecord | null;
  preview?: boolean;
  agencyId?: string;
  clientId?: string;
}

export function PortalPageRenderer({ page, theme, preview, agencyId, clientId }: PortalPageRendererProps) {
  const resolved = resolveStorefrontTree(page, { preview });
  const renderedPage = preview ? page : resolvePublishedPage(page);
  const renderedTheme = preview ? (theme ?? null) : resolvePublishedTheme(page, theme);
  return (
    <div
      data-portal-page={renderedPage.id}
      data-portal-role={renderedPage.portalRole ?? "page"}
      data-aqua-storefront={agencyId && clientId ? "" : undefined}
      data-aqua-agency-id={agencyId}
      data-aqua-client-id={clientId}
    >
      <EditorThemeInjector
        theme={renderedTheme ?? null}
        customCSS={renderedPage.customCss ?? renderedPage.customCSS}
      />
      <BlockTreeRenderer
        blocks={resolved.tree}
        context={{
          agencyId: agencyId ?? renderedPage.agencyId,
          clientId: clientId ?? renderedPage.clientId,
          siteId: renderedPage.siteId,
          pageId: renderedPage.id,
          publishedWebsite: preview !== true && resolved.source === "published",
        }}
      />
    </div>
  );
}
