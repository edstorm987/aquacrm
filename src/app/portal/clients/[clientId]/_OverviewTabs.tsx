"use client";

// Tab nav for the per-client overview. Tabs persist via `?tab=` so a
// link to `/portal/clients/<id>?tab=website` lands on the website tab.
// Server-rendered content lives in `page.tsx`; this is just the bar.

import Link from "next/link";
import { TABS, type TabId } from "./_tabs";

export type { TabId };

export function OverviewTabs({ clientId, active }: { clientId: string; active: TabId }) {
  return (
    <nav aria-label="Client sections" className="flex flex-wrap gap-1 border-b border-black/10">
      {TABS.map(tab => {
        const isActive = tab.id === active;
        const href = tab.id === "overview"
          ? `/portal/clients/${clientId}`
          : `/portal/clients/${clientId}?tab=${tab.id}`;
        return (
          <Link
            key={tab.id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm",
              isActive
                ? "border-[var(--brand-primary)] font-medium text-[var(--brand-primary)]"
                : "border-transparent text-black/65 hover:text-black/85",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
