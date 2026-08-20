import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  Hammer,
  ScanEye,
  Wrench,
  Library,
  LogOut,
  NotebookPen,
  Route,
  UserRound,
} from "lucide-react";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { Sidebar } from "@/components/chrome/Sidebar";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Topbar } from "@/components/chrome/Topbar";
import { requireRole } from "@/lib/server/auth";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ACCENTS } from "./_ui";

// The sidebar's own stylesheet colours `.mm-sidebar-link-icon`, and lucide icons
// stroke with `currentColor` — so an icon dropped in here inherits the chrome's
// grey and every section looks identical. Passing an explicit `color` overrides
// that, giving each section the SAME hue it has on its card and page header, so
// the colour means the same thing everywhere.
const ico = (Comp: typeof Hammer, accent: keyof typeof ACCENTS) => (
  <Comp size={16} strokeWidth={1.8} color={ACCENTS[accent].fg} />
);

// The Dev Team portal — our own internal workspace, founder + Dev-Mode only.
// Same layered gate as dev-docs: the layout AND every page re-assert
// `devDocsAccessible` (founder + Dev Mode), so it is unreachable in any
// production-like context. Its own sidebar + chrome, mirroring the `team/`
// scope pattern (inline panels → the shared <Sidebar>/<Topbar>).
export default async function DevTeamLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  // Founder + Dev Mode, or this portal does not exist.
  if (!devDocsAccessible(session)) notFound();

  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");
  const user = getUserById(session.userId);

  // Every item carries its OWN icon: the shared <SidebarNavLink> falls back to a
  // generic dot for ids it doesn't know (`navIcon()`), which is what made this
  // sidebar read as bare text. Each icon is the SAME lucide component the
  // section's page header uses, so the nav and the page agree — and collapsed
  // mode, which hides labels and leaves only the icon, stays readable.
  const panels: NavPanel[] = [{
    id: "main",
    label: "",
    order: 0,
    items: [
      { id: "home", label: "Home", href: "/portal/dev-team", icon: ico(Hammer, "default"), panelId: "main" as const, order: 0 },
      // One section, three views (Roadmap / Right now / Tasks) — the board and
      // the task list are the same work zoomed in, not places of their own.
      { id: "roadmap", label: "Roadmap", href: "/portal/dev-team/roadmap", icon: ico(Route, "roadmap"), panelId: "main" as const, order: 3 },
      { id: "findings", label: "Findings", href: "/portal/dev-team/findings", icon: ico(ScanEye, "findings"), panelId: "main" as const, order: 5 },
      { id: "library", label: "Library", href: "/portal/dev-team/library", icon: ico(Library, "library"), panelId: "main" as const, order: 20 },
      { id: "tools", label: "Tools", href: "/portal/dev-team/tools", icon: ico(Wrench, "tools"), panelId: "main" as const, order: 30 },
      { id: "notes", label: "Notes", href: "/portal/dev-team/notes", icon: ico(NotebookPen, "notes"), panelId: "main" as const, order: 70 },
      // Leaving is plain navigation back to the normal workspace — entering
      // never changed who you are, so there is nothing to restore. (Lives in
      // the main panel because SidebarFooter only renders its own two known
      // items and would drop this one.)
      { id: "exit-dev-team", label: "← Leave Dev Team", href: "/portal/agency", icon: <LogOut size={16} strokeWidth={1.8} />, panelId: "main" as const, order: 80 },
    ],
  }, {
    id: "settings",
    label: "Settings",
    order: 90,
    items: [{ id: "account", label: "My profile", href: "/portal/account", icon: <UserRound size={16} strokeWidth={1.8} />, panelId: "settings" as const, order: 100 }],
  }];

  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/dev-team";
  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      {/* Sidebar motion, scoped to THIS portal.
          The <Sidebar> component is shared with the agency/client/team scopes,
          so its styling can't be changed for us alone — and globals.css is a
          contended file. A scoped style block keeps the effect entirely inside
          the Dev Team shell: links slide and wash on hover, and each icon
          scales in its OWN accent colour (set inline per item above), so the
          hover reads as that section rather than as a generic highlight. */}
      <style>{`
        /* Dev Team tokens. Every surface in this portal reads these, so the
           whole workspace follows the app's own light/dark switch instead of
           being pinned to hardcoded light hex. Accent HUES stay the same in
           both modes (they carry meaning); only their tints move, derived from
           the hue itself with color-mix so one definition serves both. */
        .mm-dev-team-shell {
          --dt-bg: #f2f3ef;
          --dt-surface: #ffffff;
          --dt-raised: #fafbf8;
          --dt-ink: #14231f;
          --dt-muted: #5b6b66;
          --dt-faint: #8a978f;
          --dt-line: #e6e9e2;
          --dt-hairline: #f0f2ee;
          --dt-hover: rgba(20, 35, 31, 0.06);
        }
        html[data-color-mode="dark"] .mm-dev-team-shell {
          --dt-bg: #0e1512;
          --dt-surface: #161f1b;
          --dt-raised: #121a17;
          --dt-ink: #e9f1ec;
          --dt-muted: #9db0a7;
          --dt-faint: #7b8d85;
          --dt-line: #26312c;
          --dt-hairline: #1e2823;
          --dt-hover: rgba(255, 255, 255, 0.06);
        }
        /* This workspace carries more nav items than any other scope, so at a
           laptop height the list overflowed and collided with the pinned
           footer — "My profile" printed straight over "Leave Dev Team". Give
           the nav its own scroll, exactly as the mobile and client variants
           already do, scoped so no other workspace changes. */
        .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-primary-nav {
          overflow-y: auto;
          overscroll-behavior: contain;
          padding-right: 4px;
        }

        /* …and pin the way OUT to the bottom of that scroll, so making the nav
           scrollable never buries the exit below the fold. The rule goes on the
           LIST ITEM, not the link: a sticky element can only move inside its
           containing block, and the <li> is exactly the link's own height —
           zero room to shift, so sticking the <a> does nothing at all. */
        .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-primary-nav li:has(> a[href="/portal/agency"]) {
          position: sticky;
          bottom: 0;
          z-index: 1;
          background: var(--dt-surface);
          border-top: 1px solid var(--dt-hairline);
        }

        .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link {
          transition: transform 160ms ease, background-color 160ms ease;
        }
        /* The themed sidebar rules are selected at html[data-color-mode][data-portal-shell]
           strength, which outranks any sane class selector here — so the two
           properties that actually move are marked important. Scoped to this
           shell, so nothing outside Dev Team is affected. */
        .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link:hover {
          transform: translateX(3px) !important;
          background-color: var(--dt-hover) !important;
        }
        .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link .mm-sidebar-link-icon {
          transition: transform 160ms ease, filter 160ms ease;
        }
        .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link:hover .mm-sidebar-link-icon {
          transform: scale(1.18) !important;
          filter: saturate(1.4) !important;
        }
        .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link.is-active .mm-sidebar-link-icon {
          transform: scale(1.08);
        }
        @media (prefers-reduced-motion: reduce) {
          .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link,
          .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link .mm-sidebar-link-icon {
            transition: none;
          }
          .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link:hover {
            transform: none !important;
          }
          .mm-dev-team-shell .mm-private-sidebar .mm-sidebar-link:hover .mm-sidebar-link-icon {
            transform: none !important;
          }
        }
      `}</style>
      <div className="mm-dev-team-shell mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar panels={panels} tenantLabel="Dev Team" currentPath={currentPath} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            title="Dev Team"
            subtitle="Internal workspace"
            role={session.role}
            email={session.email}
            name={user?.name}
            avatarUrl={user?.avatarUrl}
            panels={panels}
            tenantLabel="Dev Team"
            currentPath={currentPath}
            searchRecordsEnabled={false}
            devConsole={devDocsAccessible(session)}
            isDemo={session.isDemo}
            devModeActive={Boolean(session.devReturnAgencyId)}
          />
          <main id="main-content" className="mm-private-surface min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[color:var(--dt-bg)] px-4 py-5 text-[color:var(--dt-ink)] sm:px-6 lg:px-8 lg:py-6">
            <ErrorBoundary label="dev team workspace"><PortalRouteCanvas>{children}</PortalRouteCanvas></ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
