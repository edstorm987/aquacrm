// Preview-mode banner. Shown above storefront pages when an operator is
// viewing the draft tree (e.g. via a signed preview token). Faithful
// port from `02/src/components/PreviewBar.tsx` — kept compact.

export interface PreviewBarProps {
  mode: "draft" | "published";
  exitHref?: string;
}

export function PreviewBar({ mode, exitHref }: PreviewBarProps) {
  if (mode === "published") return null;
  return (
    <div
      data-preview-bar
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9998,
        padding: "6px 12px",
        background: "#1d4ed8",
        color: "white",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        textAlign: "center",
      }}
    >
      Preview · viewing draft tree {exitHref ? <a href={exitHref} style={{ color: "#bfdbfe", marginLeft: 8 }}>exit</a> : null}
    </div>
  );
}
