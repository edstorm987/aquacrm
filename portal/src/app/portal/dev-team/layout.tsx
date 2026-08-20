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
import { DevTeamTransition } from "@/components/chrome/DevTeamTransition";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { Sidebar } from "@/components/chrome/Sidebar";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Topbar } from "@/components/chrome/Topbar";
import { requireRole } from "@/lib/server/auth/auth";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { devIconPreference } from "@/lib/server/devIconPreference";
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
        /* The SHIPYARD token set ships HERE, inline, on purpose: Tailwind v4 +
           Turbopack dropped these custom-property definitions when they lived in
           globals.css (the compiled sheet carried no .mm-dev-team-shell{--dev-*}
           rule, so the whole workspace fell back to app defaults). A server
           <style> ships raw and bypasses that pipeline, exactly as the --dt-*
           tokens always did. LIGHT = timber MILL; html[data-color-mode="dark"]
           forges the FORGE. --dt-* are thin aliases so existing markup resolves. */
        .mm-dev-team-shell {
          --dev-bg: #efe3cd; --dev-surface: #f7efdd; --dev-surface-raised: #fdf9f0;
          --dev-ink: #3a2c1e; --dev-ink-muted: #6a5942; --dev-faint: #7c6a52;
          --dev-line: #d9c7a5; --dev-hairline: #e6d8bd; --dev-hover: rgba(58,44,30,0.06);
          --dev-accent: #1f7a6e; --dev-accent-hover: #17635a; --dev-accent-soft: #dcebe6;
          --dev-accent-line: #b9d8d1; --dev-on-accent: #ffffff;
          --dev-success: #2f7d4a; --dev-success-soft: #dcebdd; --dev-success-line: #b7d4bb;
          --dev-danger: #b8442f; --dev-danger-soft: #f2ddd6; --dev-danger-line: #e0b6a9;
          --dev-warning: #9e5f14; --dev-warning-soft: #f1e6c9; --dev-warning-line: #ddc794;
          --dev-info: #2f6f8f; --dev-info-soft: #d9e6ec; --dev-info-line: #b3ccd6;
          --dev-violet: #6d4aa8; --dev-purple: #8a3f86; --dev-indigo: #3f51a8;
          --dev-cyan: #0e7490; --dev-slate: #4a5c6a; --dev-glow: rgba(31,122,110,0.30);
          --dt-bg: var(--dev-bg); --dt-surface: var(--dev-surface); --dt-raised: var(--dev-surface-raised);
          --dt-ink: var(--dev-ink); --dt-muted: var(--dev-ink-muted); --dt-faint: var(--dev-faint);
          --dt-line: var(--dev-line); --dt-hairline: var(--dev-hairline); --dt-hover: var(--dev-hover);
        }
        html[data-color-mode="dark"] .mm-dev-team-shell {
          --dev-bg: #15110d; --dev-surface: #1e1813; --dev-surface-raised: #261e17;
          --dev-ink: #f3e7d6; --dev-ink-muted: #a8937c; --dev-faint: #8a765f;
          --dev-line: #3a2e22; --dev-hairline: #2a2118; --dev-hover: rgba(255,122,47,0.09);
          --dev-accent: #ff7a2f; --dev-accent-hover: #ff9354; --dev-accent-soft: #3a2214;
          --dev-accent-line: #5c3a20; --dev-on-accent: #1a1109;
          --dev-success: #4fae6b; --dev-success-soft: #1f2d21; --dev-success-line: #2f4a34;
          --dev-danger: #e5482f; --dev-danger-soft: #331810; --dev-danger-line: #5c2c1e;
          --dev-warning: #e0a63a; --dev-warning-soft: #2f2510; --dev-warning-line: #574016;
          --dev-info: #6f97ad; --dev-info-soft: #1a232a; --dev-info-line: #33454f;
          --dev-violet: #b79ae6; --dev-purple: #cf8ac9; --dev-indigo: #8f9ee8;
          --dev-cyan: #4bb6d4; --dev-slate: #93a7b5; --dev-glow: rgba(255,122,47,0.5);
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
        /* Cutscene + card CSS relocated from globals.css: Tailwind v4 + Turbopack
           dropped the appended dev-team block (verified: getComputedStyle empty,
           fresh build unchanged), which would break production. Inline ships raw. */
.mm-dev-team-shell .mm-dev-card {
  background: var(--dev-surface);
  border: 1px solid var(--dev-line);
  border-radius: 1rem;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.mm-dev-team-shell .mm-dev-card:hover {
  border-color: var(--dev-accent-line);
  box-shadow: 0 14px 30px -12px var(--dev-glow);
}
@media (prefers-reduced-motion: reduce) {
  .mm-dev-team-shell .mm-dev-card { transition: none; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEV TEAM CUTSCENE — "ENTERING THE SHIPYARD / FIRING THE FORGE"
   Sibling of .mm-command-transition (the bridge handshake). Same structural
   DNA — fixed full-device overlay, curtains, console, copy, progress — retuned
   for the yard: ember ignition + sparks in the forge (dark), timber/sawdust
   reveal in the mill (light). Themed from the --dev-* tokens so it flips with
   the app's colour mode. prefers-reduced-motion strips the animation.
   ═══════════════════════════════════════════════════════════════════════════ */
.mm-dev-transition {
  --dev-tr-accent: var(--dev-accent, #1f7a6e);
  --dev-tr-bright: var(--dev-ink, #3a2c1e);
  --dev-tr-dim: color-mix(in srgb, var(--dev-tr-accent) 55%, transparent);
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  min-width: 0;
  min-height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  pointer-events: none;
  color: var(--dev-tr-bright);
  background: var(--dev-bg, #efe3cd);
  font-variant-numeric: tabular-nums;
  cursor: progress;
  animation: mm-dev-transition-enter 200ms ease-out both;
}
html[data-color-mode="dark"] .mm-dev-transition {
  --dev-tr-bright: var(--dev-ink, #f3e7d6);
  background: var(--dev-bg, #15110d);
}
.mm-dev-transition[data-phase="release"] {
  animation: mm-dev-transition-release 380ms cubic-bezier(0.4, 0, 1, 1) both;
}

/* Slipway gates that draw back to reveal the yard. */
.mm-dev-transition__gate {
  position: absolute;
  inset-block: 0;
  z-index: -1;
  width: 56%;
  background: var(--dev-surface, #f7efdd);
  box-shadow: 0 0 80px color-mix(in srgb, var(--dev-ink) 24%, transparent);
}
.mm-dev-transition__gate--left {
  left: 0;
  border-right: 1px solid var(--dev-tr-dim);
  animation: mm-dev-gate-left 1.15s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.mm-dev-transition__gate--right {
  right: 0;
  border-left: 1px solid var(--dev-tr-dim);
  animation: mm-dev-gate-right 1.15s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Timber-grain / hammered-iron floor grid. */
.mm-dev-transition__grid {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.4;
  background-image:
    linear-gradient(color-mix(in srgb, var(--dev-tr-accent) 8%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--dev-tr-accent) 8%, transparent) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
}

/* Spark / sawdust motes drifting up from the work. */
.mm-dev-transition__sparks {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}
.mm-dev-transition__sparks span {
  position: absolute;
  bottom: -6%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--dev-tr-accent);
  box-shadow: 0 0 8px var(--dev-tr-accent), 0 0 16px var(--dev-glow);
  opacity: 0;
  animation: mm-dev-spark 1.9s ease-in infinite;
}
.mm-dev-transition__sparks span:nth-child(1) { left: 12%; animation-delay: 0ms; }
.mm-dev-transition__sparks span:nth-child(2) { left: 27%; animation-delay: 260ms; }
.mm-dev-transition__sparks span:nth-child(3) { left: 41%; animation-delay: 520ms; }
.mm-dev-transition__sparks span:nth-child(4) { left: 58%; animation-delay: 140ms; }
.mm-dev-transition__sparks span:nth-child(5) { left: 71%; animation-delay: 400ms; }
.mm-dev-transition__sparks span:nth-child(6) { left: 86%; animation-delay: 640ms; }

.mm-dev-transition__header,
.mm-dev-transition__footer {
  position: absolute;
  z-index: 6;
  left: max(1rem, env(safe-area-inset-left));
  right: max(1rem, env(safe-area-inset-right));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-color: var(--dev-tr-dim);
  color: var(--dev-tr-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}
.mm-dev-transition__header {
  top: max(1rem, env(safe-area-inset-top));
  padding-bottom: 0.85rem;
  border-bottom-width: 1px;
}
.mm-dev-transition__footer {
  bottom: max(1rem, env(safe-area-inset-bottom));
  padding-top: 0.85rem;
  border-top-width: 1px;
}
.mm-dev-transition__header span,
.mm-dev-transition__footer span {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.mm-dev-transition__console {
  position: relative;
  z-index: 5;
  display: grid;
  width: min(100% - 2rem, 72rem);
  min-height: min(33rem, calc(100dvh - 8rem));
  margin: auto;
  grid-template-columns: minmax(8rem, 1fr) minmax(14rem, 1.4fr) minmax(8rem, 1fr);
  grid-template-rows: 1fr auto auto auto;
  align-items: center;
  gap: 1.35rem 2.25rem;
}

/* The forge / the anvil ring — a heating disc coming to temperature. */
.mm-dev-transition__forge {
  position: relative;
  grid-column: 2;
  grid-row: 1;
  width: min(34vw, 17rem);
  aspect-ratio: 1;
  justify-self: center;
  overflow: hidden;
  border: 1px solid var(--dev-tr-accent);
  border-radius: 50%;
  background:
    radial-gradient(circle at center, color-mix(in srgb, var(--dev-tr-accent) 30%, transparent) 0 6%, transparent 34%),
    repeating-conic-gradient(from 0deg, var(--dev-tr-dim) 0 0.5deg, transparent 0.5deg 30deg),
    var(--dev-surface, #f7efdd);
  box-shadow:
    inset 0 0 45px color-mix(in srgb, var(--dev-tr-accent) 22%, transparent),
    0 0 0 7px color-mix(in srgb, var(--dev-tr-accent) 6%, transparent),
    0 0 60px var(--dev-glow);
  animation: mm-dev-forge-heat 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.mm-dev-transition__forge::before,
.mm-dev-transition__forge::after {
  position: absolute;
  inset: 9%;
  border: 1px solid var(--dev-tr-dim);
  border-radius: 50%;
  content: "";
}
.mm-dev-transition__forge::after { inset: 25%; }

.mm-dev-transition__ember {
  position: absolute;
  inset: 50% auto auto 50%;
  z-index: 2;
  display: grid;
  width: 4.6rem;
  aspect-ratio: 1;
  translate: -50% -50%;
  place-items: center;
  border: 1px solid var(--dev-tr-dim);
  border-radius: 50%;
  color: var(--dev-tr-accent);
  background: var(--dev-surface-raised, #fdf9f0);
  box-shadow: 0 0 28px var(--dev-glow);
  animation: mm-dev-ember-pulse 1.6s ease-in-out infinite;
}

.mm-dev-transition__side-data {
  display: grid;
  gap: 0.75rem;
  align-content: center;
  color: var(--dev-tr-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.3;
}
.mm-dev-transition__side-data span {
  padding: 0.55rem 0;
  border-block: 1px solid color-mix(in srgb, var(--dev-tr-accent) 18%, transparent);
}
.mm-dev-transition__side-data--left { grid-column: 1; grid-row: 1; text-align: right; }
.mm-dev-transition__side-data--right { grid-column: 3; grid-row: 1; }

.mm-dev-transition__copy {
  grid-column: 1 / -1;
  grid-row: 2;
  text-align: center;
  animation: mm-dev-copy-enter 620ms 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.mm-dev-transition__copy p {
  color: var(--dev-tr-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.4;
}
.mm-dev-transition__copy h2 {
  margin-top: 0.45rem;
  color: var(--dev-tr-bright);
  font-size: clamp(1.45rem, 4vw, 2.5rem);
  font-weight: 650;
  line-height: 1.05;
  text-shadow: 0 0 24px var(--dev-glow);
}
.mm-dev-transition__copy > span {
  display: block;
  max-width: 36rem;
  margin: 0.65rem auto 0;
  color: color-mix(in srgb, var(--dev-tr-bright) 66%, transparent);
  font-size: 12px;
  line-height: 1.5;
}

.mm-dev-transition__progress {
  display: grid;
  grid-column: 1 / -1;
  grid-row: 3;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.3rem;
  width: min(100%, 31rem);
  justify-self: center;
}
.mm-dev-transition__progress span {
  height: 3px;
  background: var(--dev-tr-accent);
  box-shadow: 0 0 8px var(--dev-glow);
  transform-origin: left;
  animation: mm-dev-progress-segment 360ms ease-out both;
}
.mm-dev-transition__progress span:nth-child(1) { animation-delay: 120ms; }
.mm-dev-transition__progress span:nth-child(2) { animation-delay: 210ms; }
.mm-dev-transition__progress span:nth-child(3) { animation-delay: 300ms; }
.mm-dev-transition__progress span:nth-child(4) { animation-delay: 390ms; }
.mm-dev-transition__progress span:nth-child(5) { animation-delay: 480ms; }
.mm-dev-transition__progress span:nth-child(6) { animation-delay: 570ms; }
.mm-dev-transition__progress span:nth-child(7) { animation-delay: 660ms; }
.mm-dev-transition__progress span:nth-child(8) { animation-delay: 750ms; }

.mm-dev-transition__systems {
  display: flex;
  grid-column: 1 / -1;
  grid-row: 4;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem 1.4rem;
  color: var(--dev-tr-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  font-weight: 700;
}
.mm-dev-transition__systems span {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  animation: mm-dev-system-enter 400ms 680ms ease-out both;
}

@keyframes mm-dev-transition-enter { from { opacity: 0; } to { opacity: 1; } }
@keyframes mm-dev-transition-release {
  0% { opacity: 1; filter: brightness(1); }
  35% { opacity: 1; filter: brightness(1.4); }
  100% { opacity: 0; filter: brightness(0.6); }
}
@keyframes mm-dev-gate-left { from { transform: translateX(15%); } to { transform: translateX(-8%); } }
@keyframes mm-dev-gate-right { from { transform: translateX(-15%); } to { transform: translateX(8%); } }
@keyframes mm-dev-forge-heat {
  from { opacity: 0; transform: scale(1.16); filter: blur(5px) brightness(0.7); }
  to { opacity: 1; transform: scale(1); filter: blur(0) brightness(1); }
}
@keyframes mm-dev-ember-pulse {
  0%, 100% { box-shadow: 0 0 20px var(--dev-glow); filter: brightness(0.94); }
  50% { box-shadow: 0 0 40px var(--dev-glow); filter: brightness(1.12); }
}
@keyframes mm-dev-spark {
  0% { opacity: 0; transform: translateY(0) scale(0.7); }
  18% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-78vh) scale(1.15); }
}
@keyframes mm-dev-copy-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mm-dev-progress-segment { from { opacity: 0; transform: scaleX(0); } to { opacity: 1; transform: scaleX(1); } }
@keyframes mm-dev-system-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 639px) {
  .mm-dev-transition__header,
  .mm-dev-transition__footer { font-size: 8px; }
  .mm-dev-transition__header span:last-child,
  .mm-dev-transition__footer span:first-child,
  .mm-dev-transition__side-data { display: none; }
  .mm-dev-transition__console {
    width: min(100% - 2rem, 25rem);
    min-height: calc(100dvh - 8rem);
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto auto auto;
    gap: 1.2rem;
  }
  .mm-dev-transition__forge { grid-column: 1; width: min(62vw, 14rem); }
  .mm-dev-transition__copy,
  .mm-dev-transition__progress,
  .mm-dev-transition__systems { grid-column: 1; }
  .mm-dev-transition__copy > span { max-width: 19rem; font-size: 11px; }
  .mm-dev-transition__systems { gap: 0.45rem 0.8rem; font-size: 8px; }
}

/* Cinematic mode OFF hides the cutscene entirely (belt-and-braces; the
   component also refuses to mount when cinematic mode is off). */
html[data-cinematic-mode="false"] .mm-dev-transition { display: none !important; }

@media (prefers-reduced-motion: reduce) {
  .mm-dev-transition,
  .mm-dev-transition * {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
      `}</style>
      <div className="mm-dev-team-shell mm-portal-root flex h-dvh overflow-hidden">
        {/* The shipyard cutscene — fires on entering the yard, gated by
            Cinematic mode + prefers-reduced-motion (both handled inside). */}
        <DevTeamTransition />
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
            devConsole={devDocsAccessible(session) && (await devIconPreference())}
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
