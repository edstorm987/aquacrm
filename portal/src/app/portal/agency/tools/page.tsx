import Link from "next/link";
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
] as const;

interface WorkspaceTool {
  href: string;
  label: string;
  detail: string;
  action: string;
  icon: typeof Wrench;
}

interface WorkspaceGroup {
  id: string;
  title: string;
  caption: string;
  tools: WorkspaceTool[];
}

// Grouped by the sidebar's panels — the daily operating areas, then money &
// people, then the operations surfaces, then settings. Every href below is a
// real, reachable agency route (core rows from the sidebar assembly plus the
// installed plugin workspaces the agency override parks out of the nav).
const WORKSPACE_GROUPS: WorkspaceGroup[] = [
  {
    id: "operating",
    title: "Operating areas",
    caption: "The daily command surfaces — the core agency navigation.",
    tools: [
      {
        href: "/portal/agency",
        label: "Command Centre",
        detail: "Your day, business monitoring, decisions, strategy, and Radar in one place.",
        action: "Open command centre",
        icon: LayoutDashboard,
      },
      {
        href: "/portal/agency/operations",
        label: "Operations",
        detail: "The business-functions hub — Journey, Fulfilment, Finance, Staff, and the rest, in delegation order.",
        action: "Open operations",
        icon: Workflow,
      },
      {
        href: "/portal/agency/inbox",
        label: "Master inbox",
        detail: "Every message and actionable item that needs your attention, unified.",
        action: "Open master inbox",
        icon: Inbox,
      },
      {
        href: "/portal/agency/actions",
        label: "Actions",
        detail: "The live queue of work to resolve, each with its evidence and resolution path.",
        action: "Open actions",
        icon: ListChecks,
      },
      {
        href: "/portal/clients?view=journey",
        label: "Journey",
        detail: "People, relationships, enquiries, qualification, and sales movement to conversion.",
        action: "Open journey",
        icon: Route,
      },
      {
        href: "/portal/agency/fulfilment",
        label: "Fulfilment",
        detail: "The delivery work after a service is sold — technical delivery and operating model.",
        action: "Open fulfilment",
        icon: PackageCheck,
      },
      {
        href: "/portal/agency/fulfilment?view=tags",
        label: "Aqua tags",
        detail: "The consent-gated tag control tower — GA, PostHog, and the rest through one tag.",
        action: "Open aqua tags",
        icon: Tags,
      },
      {
        href: "/portal/agency/marketing",
        label: "Marketing",
        detail: "Campaigns, content, automations, and the agency's own outbound marketing.",
        action: "Open marketing",
        icon: Megaphone,
      },
      {
        href: "/portal/agency/you-deserve-it",
        label: "You deserve it",
        detail: "Wins, milestones, and the rewards you've earned running the business.",
        action: "Open you deserve it",
        icon: Gift,
      },
    ],
  },
  {
    id: "money-people",
    title: "Money & people",
    caption: "Finance, the staff directory, HR records, and freelancers.",
    tools: [
      {
        href: "/portal/agency/agency-finance",
        label: "Finance",
        detail: "Money and obligations across the portfolio — plans, billing, and lock-in.",
        action: "Open finance",
        icon: Banknote,
      },
      {
        // P5 — the canonical staff directory. The agency-hr copy at
        // /portal/agency/agency-hr is retired and redirects here.
        href: "/portal/agency/people",
        label: "People operations",
        detail: "The agency staff directory — people, roles, pay, and status.",
        action: "Open people operations",
        icon: UsersRound,
      },
      {
        // The agency-hr plugin's surviving pages. The agency override filters
        // the nav down to core ids, so no agency-hr row ever reaches the
        // sidebar — this card is the only way in. Departments is the landing
        // page; its workspace nav reaches Leave / Employees / Roles / Settings.
        href: "/portal/agency/agency-hr/departments",
        label: "People records",
        detail: "Org chart of departments, leave requests, employee records, roles, and HR configuration.",
        action: "Open people records",
        icon: Network,
      },
      {
        href: "/portal/agency/freelancers",
        label: "Freelancers",
        detail: "The freelance roster — access, assignments, and contributor status.",
        action: "Open freelancers",
        icon: HardHat,
      },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    caption: "The record-keeping and delivery-support surfaces behind the business.",
    tools: [
      {
        href: "/portal/agency/sop-library",
        label: "SOP library",
        detail: "The standard operating procedures that keep delivery consistent.",
        action: "Open SOP library",
        icon: BookOpen,
      },
      {
        href: "/portal/agency/governance",
        label: "Governance",
        detail: "Compliance posture, the legal register, DPO/data-erasure, and security — know where you stand.",
        action: "Open Governance",
        icon: ShieldCheck,
      },
      {
        href: "/portal/agency/activity-inbox",
        label: "Activity log",
        detail: "The complete history of client, portal, sales, billing, support, and project updates.",
        action: "Open activity log",
        icon: Activity,
      },
      {
        href: "/portal/agency/email-sender",
        label: "Email operations",
        detail: "Queued and sent messages, sender identities, provider readiness, failures, and bounces.",
        action: "Open email operations",
        icon: Mail,
      },
      {
        href: "/portal/agency/agency-marketing",
        label: "Marketing operations",
        detail: "Templates, reporting, the content calendar, touchpoints, performance, and system settings.",
        action: "Open marketing operations",
        icon: Megaphone,
      },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    caption: "Configuration for the whole agency workspace.",
    tools: [
      {
        href: "/portal/agency/settings",
        label: "Agency settings",
        detail: "Brand kit, roles, plugins, billing, and the rest of the agency-wide configuration.",
        action: "Open agency settings",
        icon: Settings,
      },
    ],
  },
];

const WORKSPACE_COUNT = WORKSPACE_GROUPS.reduce((total, group) => total + group.tools.length, 0);
const PUBLIC_SHOWCASE_TOOL_PATHS = new Set([
  "/portal/agency",
  "/portal/agency/operations",
  "/portal/agency/inbox",
  "/portal/clients?view=journey",
  "/portal/agency/fulfilment",
  "/portal/agency/marketing",
  "/portal/agency/sop-library",
]);

export default async function ToolsPage() {
  const session = await requireRole([...AGENCY_ROLES]);
  const quickTools = session.publicShowcase ? [] : QUICK_TOOLS;
  const workspaceGroups = session.publicShowcase
    ? WORKSPACE_GROUPS.map(group => ({ ...group, tools: group.tools.filter(tool => PUBLIC_SHOWCASE_TOOL_PATHS.has(tool.href)) })).filter(group => group.tools.length > 0)
    : WORKSPACE_GROUPS;
  const workspaceCount = session.publicShowcase
    ? workspaceGroups.reduce((total, group) => total + group.tools.length, 0)
    : WORKSPACE_COUNT;
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

      <section aria-labelledby="workspace-tools-heading" className="border-t border-black/10 pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-black/40">Workspace directory</p>
            <h2 id="workspace-tools-heading" className="mt-1 text-lg font-semibold text-black/85">All agency workspaces</h2>
          </div>
          <span className="text-xs font-medium text-black/40">{workspaceCount} workspaces</span>
        </div>

        <div className="mt-5 space-y-8">
          {workspaceGroups.map(group => (
            <div key={group.id} aria-labelledby={`workspace-group-${group.id}`}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 id={`workspace-group-${group.id}`} className="text-sm font-semibold text-black/70">{group.title}</h3>
                <span className="text-xs font-medium text-black/35">{group.caption}</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {group.tools.map(tool => {
                  const Icon = tool.icon;
                  return (
                    <Link key={tool.href} href={tool.href} className="group flex min-h-48 flex-col rounded-md border border-black/10 bg-white p-5 shadow-sm transition hover:border-brand/35 hover:bg-brand/[0.025] hover:shadow-md">
                      <span className="grid size-10 place-items-center rounded-md border border-brand/15 bg-brand/[0.07] text-brand"><Icon size={19} aria-hidden /></span>
                      <strong className="mt-4 text-base font-semibold text-black/85">{tool.label}</strong>
                      <span className="mt-1 text-sm leading-5 text-black/50">{tool.detail}</span>
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-semibold text-brand">{tool.action} <ChevronRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden /></span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
