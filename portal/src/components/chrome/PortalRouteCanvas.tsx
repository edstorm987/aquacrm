"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { COLOR_MODE_STORAGE_KEY } from "@/lib/chrome/colorMode";
import { isCommandCenterPath } from "@/lib/chrome/commandCenter";
import { PortalLoadingCoordinator } from "@/components/ui/PortalLoadingCoordinator";

const AREA_SEGMENTS: Array<[string, string]> = [
  ["/company", "company"],
  ["/actions", "actions"],
  ["/calendar", "calendar"],
  ["/notepad", "notepad"],
  ["/automations", "automations"],
  ["/inbox", "inbox"],
  ["/clients", "clients"],
  ["/fulfilment", "fulfilment"],
  ["/portals", "portals"],
  ["/you-deserve-it", "delight"],
  ["/pipelines", "journey"],
  ["/development", "fulfilment"],
  ["/performance", "fulfilment"],
  ["/marketing", "marketing"],
  ["/agency-finance", "finance"],
  ["/finance", "finance"],
  ["/sop-library", "sops"],
  ["/tools", "tools"],
  ["/settings", "settings"],
  ["/account", "account"],
];

function areaFor(pathname: string, tab: string | null): string {
  if (pathname.startsWith("/portal/clients/")) {
    if (tab === "finance") return "finance";
    if (tab === "properties" || tab === "website" || tab === "systems") return "fulfilment";
    if (tab === "fulfilment" || tab === "kanban") return "journey";
    return "clients";
  }

  const match = AREA_SEGMENTS.find(([segment]) => pathname.includes(segment));
  return match?.[1] ?? "dashboard";
}

export function PortalRouteCanvas({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const area = areaFor(pathname, searchParams.get("tab"));
  const shellTheme = isCommandCenterPath(pathname) ? "command" : "standard";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.portalShell = shellTheme;

    if (shellTheme === "command") {
      let previousMode = root.dataset.colorMode === "dark" ? "dark" : "light";
      if (root.dataset.colorMode !== "dark" && root.dataset.colorMode !== "light") {
        try {
          previousMode = localStorage.getItem(COLOR_MODE_STORAGE_KEY) === "dark" ? "dark" : "light";
        } catch {
          /* localStorage may be blocked; light remains the safe fallback */
        }
      }
      root.dataset.commandPreviousColorMode = previousMode;
      root.dataset.colorMode = "dark";
    }

    return () => {
      if (shellTheme === "command") {
        const previousMode = root.dataset.commandPreviousColorMode;
        root.dataset.colorMode = previousMode === "dark" ? "dark" : "light";
        delete root.dataset.commandPreviousColorMode;
      }
      if (root.dataset.portalShell === shellTheme) delete root.dataset.portalShell;
    };
  }, [shellTheme]);

  return (
    <div key={pathname} className="mm-route-canvas" data-portal-area={area} data-portal-shell={shellTheme} data-mm-route-motion>
      <PortalLoadingCoordinator>{children}</PortalLoadingCoordinator>
    </div>
  );
}
