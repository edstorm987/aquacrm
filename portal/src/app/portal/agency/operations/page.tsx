import Link from "next/link";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import {
  Banknote,
  BookOpen,
  ChevronRight,
  Gift,
  HardHat,
  Megaphone,
  PackageCheck,
  Route,
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

        <div className="mt-5 space-y-8">
          {operationGroups.map(group => (
            <div key={group.id} aria-labelledby={`ops-group-${group.id}`}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 id={`ops-group-${group.id}`} className="text-sm font-semibold text-black/70">{group.title}</h3>
                <span className="text-xs font-medium text-black/35">{group.caption}</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.functions.map(fn => {
                  const Icon = fn.icon;
                  return (
                    <Link key={fn.href} href={fn.href} className="group flex min-h-48 flex-col rounded-md border border-black/10 bg-white p-5 shadow-sm transition hover:border-brand/35 hover:bg-brand/[0.025] hover:shadow-md">
                      <span className="grid size-10 place-items-center rounded-md border border-brand/15 bg-brand/[0.07] text-brand"><Icon size={19} aria-hidden /></span>
                      <strong className="mt-4 text-base font-semibold text-black/85">{fn.label}</strong>
                      <span className="mt-1 text-sm leading-5 text-black/50">{fn.detail}</span>
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-semibold text-brand">{fn.action} <ChevronRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden /></span>
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
