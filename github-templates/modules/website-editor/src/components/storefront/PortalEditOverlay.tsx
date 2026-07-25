// In-place editor overlay. Faithful structural port from
// `02/src/components/PortalEditOverlay.tsx` (841 lines). Round-1 keeps
// the overlay shell; the click-target wiring + properties drawer is
// stubbed and lifted in Round 2.
//
// Only mounted when `editMode=true` (set by foundation when an
// authenticated agency operator visits a portal route).

import type { ReactNode } from "react";

export interface PortalEditOverlayProps {
  pageId: string;
  clientId: string;
  agencyId: string;
  enabled: boolean;
  children: ReactNode;
}

export function PortalEditOverlay({ pageId, clientId, agencyId, enabled, children }: PortalEditOverlayProps) {
  if (!enabled) return <>{children}</>;
  return (
    <div
      data-portal-edit-overlay
      data-page-id={pageId}
      data-client-id={clientId}
      data-agency-id={agencyId}
    >
      {children}
      <div
        data-portal-edit-toolbar
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          padding: "8px 12px",
          background: "#0f172a",
          color: "white",
          borderRadius: 8,
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          boxShadow: "0 6px 24px rgba(0,0,0,0.2)",
          zIndex: 9999,
        }}
      >
        Editing · {pageId}
      </div>
    </div>
  );
}
