"use client";

import { Search } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

import type { PortalSearchItem } from "@/components/chrome/PortalSearch";

interface PortalSearchProps {
  items: PortalSearchItem[];
  recordsEnabled?: boolean;
  initiallyOpen?: boolean;
}

let portalSearchModule: Promise<typeof import("@/components/chrome/PortalSearch")> | null = null;

function loadPortalSearch() {
  portalSearchModule ??= import("@/components/chrome/PortalSearch").catch(error => {
    portalSearchModule = null;
    throw error;
  });
  return portalSearchModule;
}

/**
 * Keep the always-visible search affordance cheap. The full record-search UI
 * and its icon set are loaded on user intent, while click and Cmd/Ctrl-K still
 * open the same component and preserve its existing request behaviour.
 */
export function DeferredPortalSearch({ items, recordsEnabled = false }: PortalSearchProps) {
  const [SearchComponent, setSearchComponent] = useState<ComponentType<PortalSearchProps> | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (SearchComponent) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpening(true);
        void loadPortalSearch()
          .then(module => setSearchComponent(() => module.PortalSearch))
          .catch(() => setOpening(false));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [SearchComponent]);

  if (SearchComponent) {
    return <SearchComponent items={items} recordsEnabled={recordsEnabled} initiallyOpen={opening} />;
  }

  const preload = () => { void loadPortalSearch().catch(() => undefined); };
  const open = () => {
    setOpening(true);
    void loadPortalSearch()
      .then(module => setSearchComponent(() => module.PortalSearch))
      .catch(() => setOpening(false));
  };

  return (
    <div className="mm-private-chrome relative">
      <button
        type="button"
        onMouseEnter={preload}
        onFocus={preload}
        onClick={open}
        aria-label="Search workspace"
        aria-expanded="false"
        aria-controls="aqua-workspace-search"
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-2.5 text-black/60 shadow-sm transition hover:border-black/20 hover:text-black lg:min-w-48 lg:justify-start"
      >
        <Search size={15} aria-hidden="true" />
        <span className="hidden text-xs lg:inline">{opening ? "Opening search…" : "Search workspace"}</span>
      </button>
    </div>
  );
}
