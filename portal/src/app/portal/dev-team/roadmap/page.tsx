import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Plus, Route } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible, PROJECT_ROOT } from "@/lib/server/dev/devDocs";
import { buildRoadmap, ROADMAP_REL_PATH } from "@/lib/server/dev/devTeamRoadmap";
import { scanTasks } from "@/lib/server/dev/devTeamTasks";
import { thoughtsByTask, unacknowledgedCount } from "@/lib/server/dev/devTeamThoughts";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { PageHeader, Pill } from "../_ui";
import { TasksWorkspace } from "../tasks/_TasksWorkspace";
import { Board } from "../working/_Board";
import { RoadmapWorkspace } from "./_RoadmapWorkspace";

// The Roadmap — one section, three altitudes of the SAME work.
//
//   • "Roadmap"   — outcomes, horizons and target dates. What is coming.
//   • "Right now" — the live board: plans in lanes, workers checked in.
//   • "Tasks"     — every phase of every live plan, and a place to say what you
//                   think about one.
//
// These were three sidebar items and that was two too many: zooming out and
// zooming in is not three destinations. Every percentage on the outer view is
// computed from the tasks on the inner one, so the views can never disagree.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
type View = "plan" | "now" | "tasks";

const VIEWS: { key: View; label: string; href: string }[] = [
  { key: "plan", label: "Roadmap", href: "/portal/dev-team/roadmap" },
  { key: "now", label: "Right now", href: "/portal/dev-team/roadmap?view=now" },
  { key: "tasks", label: "Tasks", href: "/portal/dev-team/roadmap?view=tasks" },
];

function ViewSwitch({ active }: { active: View }) {
  return (
    <div className="inline-flex rounded-full border border-[color:var(--dt-line)] bg-[color:var(--dt-surface)] p-0.5">
      {VIEWS.map(view => {
        const on = view.key === active;
        return (
          <Link
            key={view.key}
            href={view.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              on ? "bg-[color:var(--dev-success)] text-white" : "text-[color:var(--dt-muted)] hover:text-[color:var(--dev-success)]"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function RoadmapPage({ searchParams }: { searchParams: SearchParams }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  const params = await searchParams;
  const view: View = params.view === "now" ? "now" : params.view === "tasks" ? "tasks" : "plan";

  if (view === "now") {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          icon={<Route size={20} />}
          accent="roadmap"
          title="Roadmap"
          subtitle="Right now — plans, phases and live worker status, straight from the shared brain."
          meta={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ViewSwitch active="now" />
              <Link
                href="/portal/dev-team/plans/new"
                className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--dev-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[color:var(--dev-accent-hover)]"
              >
                <Plus size={13} />
                Write a plan
              </Link>
            </div>
          }
        />
        <Board />
      </div>
    );
  }

  if (view === "tasks") {
    const [plans, byTask, waiting] = await Promise.all([
      scanTasks({ onlyActive: true }),
      thoughtsByTask(),
      unacknowledgedCount(),
    ]);
    const totalTasks = plans.reduce((n, p) => n + p.total, 0);
    const doneTasks = plans.reduce((n, p) => n + p.done, 0);

    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          icon={<Route size={20} />}
          accent="roadmap"
          title="Roadmap"
          subtitle="Every phase of every live plan — and a place to say what you think."
          meta={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ViewSwitch active="tasks" />
              {waiting > 0 ? <Pill tone="warn">{waiting} thought{waiting === 1 ? "" : "s"} waiting</Pill> : null}
              <Pill tone="accent">{doneTasks}/{totalTasks} done</Pill>
            </div>
          }
        />

        <TasksWorkspace plans={plans} initialThoughts={byTask} nowMs={Date.now()} />

        <p className="text-[11px] leading-relaxed text-[color:var(--dt-faint)]">
          Task state is read from the plans themselves and from worker check-ins — nothing here is
          typed twice. A thought you leave is picked up by the worker on that task when it runs{" "}
          <code className="text-[color:var(--dt-faint)]">npm run worker:thoughts</code>, and this
          page shows you once it has been.
        </p>
      </div>
    );
  }

  const [roadmap, planFiles] = await Promise.all([
    buildRoadmap(),
    readdir(join(PROJECT_ROOT, "docs", "development", "plans")).catch((): string[] => []),
  ]);

  const planNames = planFiles
    .filter(n => n.toLowerCase().endsWith(".md"))
    .map(n => n.slice(0, -3))
    .sort();

  const live = roadmap.byHorizon.now.length + roadmap.byHorizon.next.length;
  const next = roadmap.schedule[0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        icon={<Route size={20} />}
        accent="roadmap"
        title="Roadmap"
        subtitle="What's coming, when it lands, and what it's made of."
        meta={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ViewSwitch active="plan" />
            {roadmap.overdue.length > 0 ? (
              <Pill tone="danger">{roadmap.overdue.length} past target</Pill>
            ) : null}
            {next ? <Pill tone="warn">Next: {next.target}</Pill> : null}
            <Pill tone="accent">{live} in the plan</Pill>
            <Pill tone="ok">{roadmap.counts.shipped} shipped</Pill>
          </div>
        }
      />

      <RoadmapWorkspace roadmap={roadmap} planNames={planNames} nowMs={roadmap.generatedAtMs} />

      <p className="text-[11px] leading-relaxed text-[color:var(--dt-faint)]">
        Every item is an outcome; the plans under it are how it gets built and their phases are the
        tasks. Progress is <strong>computed</strong> from those tasks, never typed — so this page
        can&apos;t drift from what&apos;s actually done. It lives as markdown at{" "}
        <code className="text-[color:var(--dt-faint)]">{ROADMAP_REL_PATH}</code>, so workers can read
        it and you can edit it in the Library.
      </p>
    </div>
  );
}
