import type { CSSProperties } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/server/auth/auth";
import { performanceModePreference } from "@/lib/server/performanceMode";
import { AGENCY_ROLES } from "@/server/types";
import {
  Activity,
  Banknote,
  BookOpen,
  ChevronRight,
  Gift,
  HardHat,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Lock,
  Mail,
  Megaphone,
  Network,
  PackageCheck,
  Route,
  Settings,
  ShieldCheck,
  Tags,
  UsersRound,
  Workflow,
} from "lucide-react";

// Operations surface — the hub / front door.
//
// Ed's IA v2 gives the owner portal five surfaces: Command Centre, Inbox &
// actions, Executive, Operations, and Tools. Every surface except Operations
// already had a landing page; the sidebar only carried the Operations business
// functions as loose rows. This hub is the Operations front door — a scannable
// launcher for the business functions, in delegation order, so Ed can run a
// function himself or hand it to the team.
//
// The set of functions here is the SAME set the sidebar assembles under the
// "Operations" group (src/lib/chrome/sidebarLayout.ts, `operationsIds`). They
// are kept in lock-step by scripts/smoke-operations-hub.test.ts, which rebuilds
// the real sidebar and fails if any Operations function is missing a card here.

interface OpsFunction {
  href: string;
  label: string;
  detail: string;
  action: string;
  icon: typeof Workflow;
}

interface OpsGroup {
  id: string;
  title: string;
  caption: string;
  functions: OpsFunction[];
}

// Grouped into delegation clusters — the way you'd hand areas of the business
// to a team. Every href is a real, reachable agency route and matches the
// sidebar's Operations group exactly.
const OPS_GROUPS: OpsGroup[] = [
  {
    id: "sell-deliver",
    title: "Sell & deliver",
    caption: "Win the work, then deliver it.",
    functions: [
      {
        href: "/portal/clients?view=journey",
        label: "Journey",
        detail: "People, relationships, enquiries, qualification, and sales movement through to conversion.",
        action: "Open journey",
        icon: Route,
      },
      {
        href: "/portal/agency/fulfilment",
        label: "Fulfilment",
        detail: "The delivery work after a service is sold — technical delivery and the operating model.",
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
    ],
  },
  {
    id: "grow",
    title: "Grow",
    caption: "Bring in the next customer.",
    functions: [
      {
        href: "/portal/agency/marketing",
        label: "Marketing",
        detail: "Campaigns, content, automations, funnels, and the agency's own outbound marketing.",
        action: "Open marketing",
        icon: Megaphone,
      },
    ],
  },
  {
    id: "money-people",
    title: "Money & people",
    caption: "The resources that run the business.",
    functions: [
      {
        href: "/portal/agency/agency-finance",
        label: "Finance",
        detail: "Money and obligations across the portfolio — plans, billing, and lock-in.",
        action: "Open finance",
        icon: Banknote,
      },
      {
        href: "/portal/agency/people",
        label: "Staff",
        detail: "The agency staff directory — people, roles, pay, and status.",
        action: "Open staff",
        icon: UsersRound,
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
    id: "standards",
    title: "Standards & governance",
    caption: "Keep delivery consistent and compliant.",
    functions: [
      {
        href: "/portal/agency/sop-library",
        label: "SOP library",
        detail: "The standard operating procedures — and interactive guides — that keep delivery consistent.",
        action: "Open SOP library",
        icon: BookOpen,
      },
      {
        href: "/portal/agency/governance",
        label: "Governance",
        detail: "Compliance posture, the legal register, DPO / data-erasure, and security — know where you stand.",
        action: "Open governance",
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: "reward",
    title: "Reward",
    caption: "The reason you do it.",
    functions: [
      {
        href: "/portal/agency/you-deserve-it",
        label: "You deserve it",
        detail: "Wins, milestones, and the rewards you've earned running the business.",
        action: "Open you deserve it",
        icon: Gift,
      },
    ],
  },
  // Ed, 2026-08-30: *"just put all the workspaces in operations just have
  // additional spaces or something."*
  //
  // The Tools page carried a 19-entry workspace directory, and Tools is being
  // reduced to calendar / notes / chat plus his own saved links. Four of those
  // entries had NO other door: the AquaOasis agency override deliberately parks
  // People records, Email operations and Marketing operations out of the
  // sidebar, and drops the Activity log too (see smoke-tools-directory.test.ts).
  // Deleting the directory without these two groups would have left four real
  // workspaces reachable from nowhere.
  //
  // The copy is carried over verbatim from the Tools cards rather than rewritten
  // — same destination, same description, one less place to keep in sync.
  {
    id: "records",
    title: "Records & operations",
    caption: "The systems behind the functions.",
    functions: [
      {
        // Departments is the landing page; its workspace nav reaches
        // Leave / Employees / Roles / Settings.
        href: "/portal/agency/agency-hr/departments",
        label: "People records",
        detail: "Org chart of departments, leave requests, employee records, roles, and HR configuration.",
        action: "Open people records",
        icon: Network,
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
      {
        href: "/portal/agency/activity-inbox",
        label: "Activity log",
        detail: "The complete history of client, portal, sales, billing, support, and project updates.",
        action: "Open activity log",
        icon: Activity,
      },
    ],
  },
  {
    id: "surfaces",
    title: "Surfaces",
    caption: "The rest of the workspace, from one place.",
    functions: [
      {
        href: "/portal/agency",
        label: "Command Centre",
        detail: "Your day, business monitoring, decisions, strategy, and Radar in one place.",
        action: "Open command centre",
        icon: LayoutDashboard,
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
        href: "/portal/agency/settings",
        label: "Agency settings",
        detail: "Brand kit, roles, plugins, billing, and the rest of the agency-wide configuration.",
        action: "Open agency settings",
        icon: Settings,
      },
      // Deliberately NOT a card for /portal/agency/operations — this page. A
      // hub that lists itself is a loop, and smoke-operations-hub.test.ts fails
      // on it. Calendar and Notepad stay in Tools, which is becoming the
      // personal workbench.
    ],
  },
];

const OPS_COUNT = OPS_GROUPS.reduce((total, group) => total + group.functions.length, 0);
const PUBLIC_SHOWCASE_OPERATION_PATHS = new Set([
  "/portal/clients?view=journey",
  "/portal/agency/fulfilment",
  "/portal/agency/marketing",
  "/portal/agency/sop-library",
]);

export default async function OperationsPage() {
  const session = await requireRole([...AGENCY_ROLES]);
  // Performance mode vetoes the belt animation even when cinematic mode is on.
  // Performance wins — that is what the switch is for.
  const perfMode = await performanceModePreference();
  // Staff and freelancers can see these two crates but cannot open them; the
  // sidebar gates the same pair. Labelling them is honest; HIDING them would be
  // a permissions change smuggled into a visual redesign, so it is not done here.
  const ownerOnly = session.role !== "agency-owner" && session.role !== "agency-manager";
  const operationGroups = session.publicShowcase
    ? OPS_GROUPS.map(group => ({ ...group, functions: group.functions.filter(item => PUBLIC_SHOWCASE_OPERATION_PATHS.has(item.href)) })).filter(group => group.functions.length > 0)
    : OPS_GROUPS;
  const operationCount = session.publicShowcase
    ? operationGroups.reduce((total, group) => total + group.functions.length, 0)
    : OPS_COUNT;
  return (
    <div className="w-full space-y-6">
      <header className="border-b border-black/10 pb-5">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-brand">
          <Workflow size={14} aria-hidden /> Run the business
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-black/90">Operations</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
          Every business function in one place, in the order you delegate them. Run a function yourself, or hand it to the team — the work stays here either way.
        </p>
      </header>

      <section aria-labelledby="ops-functions-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-black/40">Business functions</p>
            <h2 id="ops-functions-heading" className="mt-1 text-lg font-semibold text-black/85">The operating surfaces</h2>
          </div>
          <span className="text-xs font-medium text-black/40">{operationCount} functions</span>
        </div>

        <nav aria-label="Business functions" className="ops-belt mt-5" data-ops-lite={perfMode ? "true" : "false"}>
          <ol className="ops-stations">
            {operationGroups.map((group, index) => (
              <li
                key={group.id}
                className="ops-station"
                data-ops-station={group.id}
                aria-labelledby={`ops-group-${group.id}`}
                style={{ "--ops-n": group.functions.length } as CSSProperties}
              >
                <div className="ops-station-head flex items-baseline justify-between gap-2 pl-6 pb-2">
                  {/* aria-hidden: the <ol> already announces position, and
                      "01 Sell and deliver" is double-speak. */}
                  <span className="ops-station-disc text-xs font-semibold text-black/55" aria-hidden>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 id={`ops-group-${group.id}`} className="text-sm font-semibold text-black/75">{group.title}</h3>
                  <span className="text-xs font-medium text-black/40">{group.caption}</span>
                </div>
                <ol className="ops-crates">
                  {group.functions.map(fn => {
                    const Icon = fn.icon;
                    const locked = ownerOnly
                      && (fn.href === "/portal/agency/people" || fn.href === "/portal/agency/freelancers");
                    return (
                      <li key={fn.href} className="ops-crate">
                        <Link
                          href={fn.href}
                          // The finish lives in the ops-* CSS block, fed by the STATION accent —
                          // which Tailwind's brand-only hover utilities could never see.
                          // mm-hover-lift is dropped deliberately: its hover shadow would
                          // clobber the layered stack (it wins specificity).
                          className="ops-crate-link group flex min-h-[7.75rem] flex-col rounded-md border bg-white p-3"
                        >
                          <span className="ops-crate-band" aria-hidden />
                          <span className="mm-area-icon grid size-8 place-items-center rounded-md"><Icon size={17} aria-hidden /></span>
                          <strong className="mt-2.5 text-sm font-semibold leading-4 text-black/85">{fn.label}</strong>
                          {/* line-clamp is visual truncation only — the full
                              sentence stays in the accessible tree and in
                              browser find. An earlier draft hid this behind a
                              hover panel; that fails on touch and was cut. */}
                          <span className="mt-1 line-clamp-2 text-xs leading-4 text-black/55">{fn.detail}</span>
                          <span className="ops-crate-foot mt-auto flex items-center gap-1.5 pt-2">
                            {locked ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-black/55">
                                <span aria-hidden className="inline-block size-2 rounded-full border border-dashed border-current" />
                                <Lock size={11} aria-hidden />
                                {/* Shape, glyph AND word — never colour alone. */}
                                <span className="hidden min-[360px]:inline">Owner only</span>
                                <span className="sr-only min-[360px]:hidden">Owner only</span>
                              </span>
                            ) : null}
                            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand">
                              {fn.action}<ChevronRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden />
                            </span>
                          </span>
                          <span className="ops-crate-patch" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </nav>
      </section>
    </div>
  );
}
