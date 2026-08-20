import Link from "next/link";
import {
  Activity,
  BarChart3,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Mail,
  Megaphone,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/server/types";

interface WorkspaceDestination {
  path: string;
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const WORKSPACES: Record<string, { label: string; backHref: string; items: WorkspaceDestination[] }> = {
  "agency-hr": {
    label: "People operations",
    backHref: "/portal/agency?station=battle&battle=systems",
    items: [
      // P5 — the plugin's own Staff directory is retired; this row links out to
      // the canonical one so the panel ("People operations") and the row do not
      // both read "People". `/portal/agency/agency-hr` redirects here anyway.
      { path: "", label: "Staff directory", href: "/portal/agency/people", icon: UsersRound },
      { path: "departments", label: "Departments", href: "/portal/agency/agency-hr/departments", icon: Network },
      { path: "leave", label: "Leave", href: "/portal/agency/agency-hr/leave", icon: CalendarDays },
      { path: "employees", label: "Employees", href: "/portal/agency/agency-hr/employees", icon: UserRoundCheck },
      { path: "roles", label: "Roles", href: "/portal/agency/agency-hr/roles", icon: ShieldCheck, adminOnly: true },
      { path: "settings", label: "Settings", href: "/portal/agency/agency-hr/settings", icon: Settings, adminOnly: true },
    ],
  },
  "email-sender": {
    label: "Email operations",
    backHref: "/portal/agency/inbox",
    items: [
      { path: "", label: "Outbox", href: "/portal/agency/email-sender", icon: Mail },
      { path: "settings", label: "Sender setup", href: "/portal/agency/email-sender/settings", icon: Settings, adminOnly: true },
      { path: "logs", label: "Delivery issues", href: "/portal/agency/email-sender/logs", icon: Activity },
    ],
  },
  "agency-marketing": {
    label: "Marketing operations",
    backHref: "/portal/agency/marketing",
    items: [
      { path: "", label: "Campaign records", href: "/portal/agency/agency-marketing", icon: Megaphone },
      { path: "leads", label: "Leads", href: "/portal/agency/agency-marketing/leads", icon: UsersRound },
      { path: "templates", label: "Templates", href: "/portal/agency/agency-marketing/templates", icon: Sparkles },
      { path: "reports", label: "Reports", href: "/portal/agency/agency-marketing/reports", icon: FileText },
      { path: "calendar", label: "Calendar", href: "/portal/agency/agency-marketing/calendar", icon: CalendarDays },
      { path: "touchpoints", label: "Touchpoints", href: "/portal/agency/agency-marketing/touchpoints", icon: LayoutDashboard },
      { path: "performance", label: "Performance", href: "/portal/agency/agency-marketing/performance", icon: BarChart3 },
      { path: "settings", label: "Settings", href: "/portal/agency/agency-marketing/settings", icon: Settings, adminOnly: true },
    ],
  },
};

export function PluginWorkspaceNav({ pluginId, activePath, role }: { pluginId: string; activePath: string; role: Role }) {
  const workspace = WORKSPACES[pluginId];
  if (!workspace) return null;

  const normalisedPath = activePath === "staff" || activePath === "outbox" || activePath === "campaigns"
    ? ""
    : activePath;

  return (
    <section className="mb-6 border-b border-black/10 pb-4" aria-label={`${workspace.label} navigation`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-black/45">{workspace.label}</p>
        <Link href={workspace.backHref} className="text-xs font-semibold text-teal-700 hover:text-teal-900">
          Back to workspace
        </Link>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {workspace.items.filter(item => !item.adminOnly || role === "agency-owner" || role === "agency-manager").map(item => {
          const Icon = item.icon;
          const isActive = item.path === normalisedPath;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${isActive ? "border-teal-700 bg-teal-700 text-white" : "border-black/10 bg-white text-black/65 hover:border-black/25 hover:text-black"}`}
            >
              <Icon size={15} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
