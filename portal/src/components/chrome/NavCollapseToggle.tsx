"use client";
// Three related toggles:
//   - <NavCollapseToggle />  bottom of stickybar.  Click → collapses the
//                            stickybar away (visible only when scrolled).
//   - <NavExpandToggle />    inside nav-cta cluster, next to the theme
//                            switcher.  Renders only when collapsed —
//                            click brings the stickybar back.
//   - <NavSideTab />         small circular tab hanging off the bottom-
//                            right of the nav.  Always visible.  Two-
//                            direction chevron (◀ ▶).  Reserved for a
//                            future drawer/menu — currently toggles
//                            body.mm-side-open as a placeholder.
import { useEffect, useState } from "react";

const STORAGE_KEY = "mm-nav-collapsed";

function setCollapsed(next: boolean) {
  document.body.classList.toggle("mm-nav-collapsed", next);
  try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
}

function useCollapsedSync() {
  const [collapsed, setLocal] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) === "1";
    setLocal(saved);
    document.body.classList.toggle("mm-nav-collapsed", saved);
    const obs = new MutationObserver(() => {
      setLocal(document.body.classList.contains("mm-nav-collapsed"));
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return [collapsed, (v: boolean) => { setCollapsed(v); setLocal(v); }] as const;
}

export function NavCollapseToggle() {
  const [collapsed, set] = useCollapsedSync();
  return (
    <button
      type="button"
      className="mm-nav-collapse"
      aria-label="Collapse top notice bar"
      aria-expanded={!collapsed}
      onClick={() => set(true)}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 15 12 9 18 15" />
      </svg>
    </button>
  );
}

export function NavExpandToggle() {
  const [collapsed, set] = useCollapsedSync();
  if (!collapsed) return null;
  return (
    <button
      type="button"
      className="mm-nav-expand"
      aria-label="Show top notice bar"
      onClick={() => set(false)}
      title="Show top bar"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

export function NavSideTab() {
  const [folded, setFolded] = useState(false);
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    document.body.classList.toggle("mm-nav-side-folded", next);
  };
  return (
    <button
      type="button"
      className="mm-nav-side-tab"
      data-folded={folded ? "true" : undefined}
      aria-label={folded ? "Restore navigation" : "Fold navigation away"}
      aria-expanded={!folded}
      onClick={toggle}
      title={folded ? "Bring nav back" : "Fold nav away"}
    >
      {/* Default state — double chevron drawer handle */}
      <svg className="mm-nav-side-tab-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 7 4 12 9 17" />
        <polyline points="15 7 20 12 15 17" />
      </svg>
      {/* Folded state — morphs into the "M" chatbot mark */}
      <span className="mm-nav-side-tab-mark" aria-hidden>M</span>
    </button>
  );
}
