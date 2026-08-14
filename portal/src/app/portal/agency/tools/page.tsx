import Link from "next/link";
import { Activity, CalendarDays, ChevronRight, Mail, Megaphone, NotebookPen, UsersRound, Wrench } from "lucide-react";

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

const WORKSPACE_TOOLS = [
  {
    href: "/portal/agency/activity-inbox",
    label: "Activity log",
    detail: "Inspect the complete history of client, portal, sales, billing, support, and project updates.",
    action: "Open activity log",
    icon: Activity,
  },
  {
    href: "/portal/agency/agency-hr",
    label: "People operations",
    detail: "Manage staff, departments, leave, employee records, roles, and HR configuration.",
    action: "Open people operations",
    icon: UsersRound,
  },
  {
    href: "/portal/agency/email-sender",
    label: "Email operations",
    detail: "Inspect queued and sent messages, sender identities, provider readiness, failures, and bounces.",
    action: "Open email operations",
    icon: Mail,
  },
  {
    href: "/portal/agency/agency-marketing",
    label: "Marketing operations",
    detail: "Open templates, reporting, the content calendar, touchpoints, performance, and system settings.",
    action: "Open marketing operations",
    icon: Megaphone,
  },
] as const;

export default function ToolsPage() {
  return (
    <div className="w-full space-y-6">
      <header className="border-b border-black/10 pb-5">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-brand">
          <Wrench size={14} aria-hidden /> Workspace utilities
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-black/90">Tools</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Fast access to the small utilities you use while running the business.</p>
      </header>

      <section aria-labelledby="quick-tools-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-black/40">Utility deck</p>
            <h2 id="quick-tools-heading" className="mt-1 text-lg font-semibold text-black/85">Quick actions</h2>
          </div>
          <span className="text-xs font-medium text-black/40">{QUICK_TOOLS.length} utilities</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {QUICK_TOOLS.map(tool => {
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
      </section>

      <section aria-labelledby="workspace-tools-heading" className="border-t border-black/10 pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-black/40">Workspace directory</p>
            <h2 id="workspace-tools-heading" className="mt-1 text-lg font-semibold text-black/85">Specialist workspaces</h2>
          </div>
          <span className="text-xs font-medium text-black/40">{WORKSPACE_TOOLS.length} workspaces</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {WORKSPACE_TOOLS.map(tool => {
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
      </section>
    </div>
  );
}
