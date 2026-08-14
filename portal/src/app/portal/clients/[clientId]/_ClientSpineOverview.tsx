import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  FolderKanban,
  HeartHandshake,
  MonitorCog,
  PanelTop,
} from "lucide-react";
import type { AquaHealthState } from "@/lib/clientAquaHealth";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";

interface Props {
  clientId: string;
  relationship: {
    score: number | null;
    confidence: number;
    state: AquaHealthState;
    summary: string;
    openRequests: number;
  };
  delivery: {
    progress: number | null;
    assignedProducts: number;
    openMilestones: number;
    blockedMilestones: number;
    overdueMilestones: number;
  };
  systems: {
    properties: number;
    tagsInstalled: number;
    tagsNeedingAttention: number;
    websiteConnected: boolean;
  };
  portalReady: boolean;
}

export function ClientSpineOverview({ clientId, relationship, delivery, systems, portalReady }: Props) {
  return (
    <div className="grid gap-6">
      <section className="border-y border-black/10 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">Shared client spine</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-black/88">One record, three operational lenses</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-black/55">
              Journey owns the relationship, Fulfilment owns delivery, and Development owns the technical estate. Every lens returns to this same client record.
            </p>
          </div>
          <Link href={clientWorkspaceHref(clientId, "portal")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">
            <PanelTop size={15} /> {portalReady ? "Open client portal" : "Prepare client portal"}
          </Link>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden border border-black/10 bg-black/10 lg:grid-cols-3">
        <Lens
          icon={HeartHandshake}
          eyebrow="Journey · relationship"
          title="Aqua Health"
          value={relationship.score === null ? "Learning" : `${relationship.score}/100`}
          detail={`${relationship.confidence}% evidence confidence · ${relationship.openRequests} open request${relationship.openRequests === 1 ? "" : "s"}`}
          summary={relationship.summary}
          tone={relationship.state === "risk" ? "risk" : relationship.state === "strong" ? "strong" : "watch"}
          href={clientWorkspaceHref(clientId, "relationship")}
        />
        <Lens
          icon={FolderKanban}
          eyebrow="Fulfilment · delivery"
          title="Delivery progress"
          value={delivery.progress === null ? "Not started" : `${delivery.progress}%`}
          detail={`${delivery.assignedProducts} assigned product${delivery.assignedProducts === 1 ? "" : "s"} · ${delivery.openMilestones} open milestone${delivery.openMilestones === 1 ? "" : "s"}`}
          summary={delivery.blockedMilestones || delivery.overdueMilestones
            ? `${delivery.blockedMilestones} blocked and ${delivery.overdueMilestones} overdue milestone${delivery.overdueMilestones === 1 ? "" : "s"} need attention.`
            : "No blocked or overdue delivery milestone is recorded."}
          tone={delivery.blockedMilestones || delivery.overdueMilestones ? "risk" : delivery.assignedProducts ? "strong" : "watch"}
          href={clientWorkspaceHref(clientId, "delivery")}
        />
        <Lens
          icon={MonitorCog}
          eyebrow="Development · technical"
          title="Technical coverage"
          value={`${systems.tagsInstalled}/${systems.properties}`}
          detail={`Aqua tags installed · ${systems.tagsNeedingAttention} tag record${systems.tagsNeedingAttention === 1 ? "" : "s"} need attention`}
          summary={systems.websiteConnected
            ? "A live website is connected to this client record. Open Systems for telemetry and deployment evidence."
            : "No live website URL is connected to this client record."}
          tone={systems.tagsNeedingAttention || !systems.websiteConnected ? "watch" : "strong"}
          href={clientWorkspaceHref(clientId, "systems")}
        />
      </section>
    </div>
  );
}
function Lens({ icon: Icon, eyebrow, title, value, detail, summary, tone, href }: {
  icon: typeof HeartHandshake;
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  summary: string;
  tone: "risk" | "watch" | "strong";
  href: string;
}) {
  const toneClass = tone === "risk" ? "text-red-700" : tone === "strong" ? "text-emerald-700" : "text-amber-700";
  return (
    <article className="flex min-h-72 flex-col bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-black/[0.04] text-black/55"><Icon size={18} /></span>
        {tone !== "strong" ? <CircleAlert size={17} className={toneClass} aria-label={`${tone} state`} /> : null}
      </div>
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/38">{eyebrow}</p>
      <h3 className="mt-1 text-sm font-semibold text-black/75">{title}</h3>
      <p className={`mt-3 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-black/45">{detail}</p>
      <p className="mt-4 flex-1 text-sm leading-6 text-black/58">{summary}</p>
      <Link href={href} className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-black/68 hover:text-black">
        Open lens <ArrowRight size={13} />
      </Link>
    </article>
  );
}
