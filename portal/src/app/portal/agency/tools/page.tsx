import Link from "next/link";
import { MyToolsPalette } from "./_MyToolsPalette";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import {
  Activity,
  Banknote,
  BookOpen,
  ShieldCheck,
  CalendarDays,
  ChevronRight,
  Gift,
  HardHat,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Mail,
  Megaphone,
  Network,
  NotebookPen,
  PackageCheck,
  Route,
  Settings,
  Tags,
  UsersRound,
  Workflow,
  Wrench,
} from "lucide-react";

// Complete agency workspace directory.
//
// Ed wanted Tools to list EVERY agency directory he can navigate to, so it acts
// as one scannable launcher. The source of truth for what is reachable is the
// sidebar assembly (src/lib/chrome/sidebarLayout.ts): its `defaultMainItems`
// declares the core agency rows and the plugin registry contributes the rest.
// The AquaOasis agency override in that file deliberately narrows the *visible*
// sidebar down to a fixed list of core ids — which means several real,
// reachable agency surfaces (People records / Email operations / Marketing
// operations / Activity log / Freelancers) carry no sidebar row at all and were
// otherwise only reachable by typing the URL. This page gathers them all.
//
// Kept in lock-step by scripts/smoke-tools-directory.test.ts, which rebuilds the
// real sidebar and fails if any reachable agency destination is missing here —
// so a future added section cannot silently drop out of this directory.

const QUICK_TOOLS = [
  {
    href: "/portal/agency/calendar",
    label: "Calendar",
    detail: "Schedule work, meetings, reminders, and business deadlines.",
    action: "Open calendar",
    icon: CalendarDays,
    tone: "teal",
  },
  {
    href: "/portal/agency/notepad",
    label: "Notepad",
    detail: "Capture ideas, errors, decisions, and working notes without losing context.",
    action: "Open notepad",
    icon: NotebookPen,
    tone: "amber",
  },
  {
    // The personal view — actions, goals, wellbeing and pace. Deliberately not
    // Business Radar, which lives in the Command Centre for whole-business seats.
    href: "/portal/agency/my-radar",
    label: "My Radar",
    detail: "Your own actions, goals, wellbeing and work pace — the personal view, separate from the business scan.",
    action: "Open My Radar",
    icon: Activity,
    tone: "teal",
  },
] as const;



// Ed, 2026-08-30: *"just put all the workspaces in operations… no more workspace
// directory."* The 19-entry directory that used to live here moved to
// /portal/agency/operations, which now carries every one of those destinations
// (including the four the AquaOasis override parks out of the sidebar, which
// had no other door). Tools is the personal workbench from here: the utility
// deck, and in time Ed's own saved links — see
// docs/development/plans/my-tools-palette.md.

export default async function ToolsPage() {
  const session = await requireRole([...AGENCY_ROLES]);
  const quickTools = session.publicShowcase ? [] : QUICK_TOOLS;

  return (
    <div className="w-full space-y-6">
      <header className="border-b border-black/10 pb-5">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-brand">
          <Wrench size={14} aria-hidden /> Workspace utilities
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-black/90">Tools</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
          Fast access to the small utilities you use while running the business, and a complete directory of every agency workspace.
        </p>
      </header>

      {quickTools.length ? <section aria-labelledby="quick-tools-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-black/40">Utility deck</p>
            <h2 id="quick-tools-heading" className="mt-1 text-lg font-semibold text-black/85">Quick actions</h2>
          </div>
          <span className="text-xs font-medium text-black/40">{quickTools.length} utilities</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {quickTools.map(tool => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                data-tone={tool.tone}
                className="group flex min-h-40 items-start gap-4 rounded-md border border-black/10 bg-white p-5 shadow-sm transition hover:border-brand/35 hover:bg-brand/[0.025] hover:shadow-md"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-md border border-brand/15 bg-brand/[0.07] text-brand">
                  <Icon size={20} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col self-stretch">
                  <strong className="text-base font-semibold text-black/85">{tool.label}</strong>
                  <span className="mt-1 text-sm leading-5 text-black/50">{tool.detail}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-semibold text-brand">
                    {tool.action} <ChevronRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section> : null}

      {!session.publicShowcase ? <MyToolsPalette /> : null}

      {!quickTools.length ? (
        <p className="rounded-md border border-black/10 bg-white p-5 text-sm leading-6 text-black/50">
          Tools is your personal workbench — the utilities you keep to hand. There is nothing to
          show in the read-only showcase. Every business function lives on{" "}
          <Link href="/portal/agency/operations" className="font-semibold text-brand">Operations</Link>.
        </p>
      ) : null}
    </div>
  );
}
