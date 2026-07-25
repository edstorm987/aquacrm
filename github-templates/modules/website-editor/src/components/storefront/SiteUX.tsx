// Top-level wrapper that orchestrates site overlays (preview bar +
// edit overlay + theme injection) for a rendered storefront page.
// Faithful port from `02/src/components/SiteUX.tsx`.

import type { ReactNode } from "react";
import type { EditorPage } from "../../types/editorPage";
import type { Site } from "../../types/site";
import type { ThemeRecord } from "../../types/theme";
import { PortalEditOverlay } from "./PortalEditOverlay";
import { PortalPageRenderer } from "./PortalPageRenderer";
import { PreviewBar } from "./PreviewBar";

export interface SiteUXProps {
  site: Site;
  page: EditorPage;
  theme?: ThemeRecord | null;
  editMode?: boolean;
  previewMode?: "draft" | "published";
  extraHead?: ReactNode;
}

export function SiteUX({
  site,
  page,
  theme,
  editMode,
  previewMode,
  extraHead,
}: SiteUXProps) {
  return (
    <>
      {extraHead}
      <PreviewBar mode={previewMode ?? "published"} />
      <PortalEditOverlay
        pageId={page.id}
        clientId={site.clientId}
        agencyId={site.agencyId}
        enabled={Boolean(editMode)}
      >
        <PortalPageRenderer
          page={page}
          theme={theme ?? null}
          preview={previewMode === "draft"}
        />
      </PortalEditOverlay>
    </>
  );
}
