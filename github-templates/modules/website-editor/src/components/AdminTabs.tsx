"use client";

// AdminTabs — minimal chrome shim for the plugin admin pages. The
// foundation owns the global admin shell; in plugin context we render
// a thin tab strip that links between sibling plugin admin routes.
//
// Faithful contract from `02/src/components/admin/AdminTabs.tsx`:
//   <AdminTabs tabs={[{ href, label, badge? }]} ariaLabel?="Tabs" />
// The plugin currently doesn't auto-highlight the active tab (the
// foundation's nav handles that); this component just renders the
// links so lifted pages compile and look reasonable.

import Link from "next/link";

export interface AdminTab {
  href: string;
  label: string;
  badge?: string | number;
}

export interface AdminTabsProps {
  tabs: AdminTab[];
  ariaLabel?: string;
}

export default function AdminTabs({ tabs, ariaLabel }: AdminTabsProps) {
  return (
    <nav aria-label={ariaLabel ?? "Tabs"} className="flex flex-wrap gap-1 border-b border-white/8 mb-2">
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className="px-3 py-1.5 text-[12px] text-brand-cream/65 hover:text-brand-cream hover:bg-white/5 rounded-t-lg"
        >
          {tab.label}
          {tab.badge !== undefined && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-brand-cream/85">
              {tab.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
