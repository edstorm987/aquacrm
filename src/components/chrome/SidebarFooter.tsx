"use client";

// Sidebar footer — Settings (link to /portal/agency/settings, the
// tabbed mega-page) and Sign out. Settings used to expand inline; it
// now navigates to the consolidated hub so there's only one place to
// configure anything. `settingsItems` is still accepted but unused —
// the hub renders all of them as tabs/sections.

import Link from "next/link";
import { SidebarCollapseToggle } from "./SidebarCollapseToggle";

interface SettingsItem { label: string; href: string }
interface Props {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  settingsItems?: SettingsItem[];
}

export function SidebarFooter(_props: Props) {
  return (
    <div className="mm-sidebar-footer mt-6 flex flex-col gap-1 border-t border-black/10 pt-3">
      <Link
        href="/portal/agency/settings"
        title="Settings"
        className="mm-sidebar-link flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/75 hover:bg-black/5"
      >
        <span className="mm-sidebar-link-icon inline-flex h-5 w-5 shrink-0 items-center justify-center text-black/55">
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </span>
        <span className="mm-sidebar-link-label">Settings</span>
      </Link>

      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          title="Sign out"
          className="mm-sidebar-link flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-black/75 hover:bg-red-50 hover:text-red-700"
        >
          <span className="mm-sidebar-link-icon inline-flex h-5 w-5 shrink-0 items-center justify-center text-black/55">
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span className="mm-sidebar-link-label">Sign out</span>
        </button>
      </form>

      <SidebarCollapseToggle />
    </div>
  );
}
