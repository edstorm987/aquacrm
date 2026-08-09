"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

const AREA_SEGMENTS: Array<[string, string]> = [
  ["/company", "company"],
  ["/actions", "actions"],
  ["/inbox", "inbox"],
  ["/clients", "clients"],
  ["/portals", "portals"],
  ["/you-deserve-it", "delight"],
  ["/pipelines", "journey"],
  ["/development", "development"],
  ["/performance", "development"],
  ["/marketing", "marketing"],
  ["/agency-finance", "finance"],
  ["/finance", "finance"],
  ["/sop-library", "sops"],
  ["/settings", "settings"],
  ["/account", "account"],
];

function areaFor(pathname: string, tab: string | null): string {
  if (pathname.startsWith("/portal/clients/")) {
    if (tab === "finance") return "finance";
    if (tab === "properties" || tab === "website" || tab === "systems") return "development";
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

  return (
    <div className="mm-route-canvas" data-portal-area={area}>
      {children}
    </div>
  );
}
