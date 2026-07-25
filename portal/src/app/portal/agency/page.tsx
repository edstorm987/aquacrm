// Ed's home — /portal/agency.
//
// T1 R034 — Pipelines hub. The single "Clients grid" retired; this page
// now lists every pipeline (fulfilment / leads / sales / custom) as a
// clickable card. Each card → /portal/agency/pipelines/<slug>. Default
// landing for the foundation team is fulfilment; the kanban plugin
// (T2 R+1) renders the actual board behind each pipeline.
//
// Why a hub instead of redirect: Ed wants the dashboard tiles + activity
// feed + KPIs visible above the pipelines so the agency owner gets a
// glance at status before diving into a board.

import Link from "next/link";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { listPipelines, pipelineCardCounts, seedDefaultPipelines } from "@/server/pipelines";
import { NewClientButton } from "./_NewClientButton";
import { FounderTodosWidget } from "./_FounderTodosWidget";
import { FounderDashboardKpis } from "./_FounderDashboardKpis";
import { AgencyActivityFeed } from "./_AgencyActivityFeed";

export default async function AgencyHome() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const agency = getAgency(session.agencyId)!;
  const clients = listClients(agency.id);

  // Idempotent — guarantees a fresh agency lands on default pipelines
  // even if it pre-dates the R034 seed in `bootstrapAgency`.
  seedDefaultPipelines(agency.id);

  const pipelines = listPipelines(agency.id);
  const counts = pipelineCardCounts(agency.id);
  const leadsPipeline = pipelines.find(p => p.kind === "leads" || p.slug === "leads");
  const leadsCardCount = leadsPipeline ? counts[leadsPipeline.id] ?? 0 : 0;
  const fulfilmentPipeline = pipelines.find(p => p.kind === "fulfilment" || p.slug === "fulfilment");
  const fulfilmentCardCount = fulfilmentPipeline ? counts[fulfilmentPipeline.id] ?? 0 : 0;

  const firstName = (session.email.split("@")[0] || "there").replace(/[^a-z]/gi, "");
  const greet = firstName ? firstName[0]!.toUpperCase() + firstName.slice(1) : "there";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7" data-testid="agency-pipelines-hub">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            Milesymedia Agency OS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">
            Welcome back, {greet}.
          </h1>
          <p className="mt-2 text-sm leading-6 text-black/60">
            A simple command centre for sales, clients, project work, support, finance, and the signals you cannot afford to miss.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/portal/agency/pipelines/leads#new-lead"
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 shadow-sm hover:bg-black/[0.03]"
          >
            Add lead
          </Link>
          <NewClientButton />
        </div>
      </section>

      <FounderDashboardKpis
        activeClients={clients.filter(c => c.stage !== "churned").length}
        lockInCollected={clients.filter(c => {
          const m = (c.metadata ?? {}) as { lockInPaid?: boolean };
          return m.lockInPaid === true;
        }).length}
        openWorkItems={fulfilmentCardCount}
        staleClients={clients.filter(c => {
          const m = (c.metadata ?? {}) as { lastContactedAt?: number };
          if (!m.lastContactedAt) return true;
          return Date.now() - m.lastContactedAt > 7 * 24 * 60 * 60 * 1000;
        }).length}
      />

      <AgencyOperatingSystem leadCount={leadsCardCount} clientCount={clients.length} />

      <FounderTodosWidget isFounder={session.role === "agency-owner"} />

      <AgencyActivityFeed />

      <section aria-labelledby="pipelines-heading" data-testid="pipelines-grid">
        <div className="mb-3">
          <div>
            <h2 id="pipelines-heading" className="text-lg font-medium text-black/85">
              Pipelines
            </h2>
            <p className="text-xs text-black/55">
              Each pipeline is its own kanban — project work carries clients, leads carries unconverted contacts, sales carries open deals.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pipelines.map(p => {
            const cardCount = counts[p.id] ?? 0;
            return (
              <Link
                key={p.id}
                href={`/portal/agency/pipelines/${p.slug}`}
                data-testid={`pipeline-card-${p.slug}`}
                data-pipeline-kind={p.kind}
                className="group relative overflow-hidden rounded-lg border border-black/10 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-medium text-black/90">{pipelineName(p.name, p.kind)}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wide text-black/45">
                      {pipelineKindLabel(p.kind)}
                    </div>
                  </div>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/65">
                    {cardCount} {cardCount === 1 ? "card" : "cards"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.columns.map(col => (
                    <span
                      key={col.id}
                      className="rounded-full px-1.5 py-px text-[10px] text-white"
                      style={{ backgroundColor: col.color ?? "#0EA5A4" }}
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AgencyOperatingSystem({
  leadCount,
  clientCount,
}: {
  leadCount: number;
  clientCount: number;
}) {
  const zones = [
    {
      label: "Sales",
      href: "/portal/agency/pipelines/leads",
      status: `${leadCount} board card${leadCount === 1 ? "" : "s"}`,
      description: "Capture leads, import sheets, follow up, book calls, and turn the right people into clients.",
    },
    {
      label: "Clients",
      href: "/portal/clients",
      status: `${clientCount} client${clientCount === 1 ? "" : "s"}`,
      description: "Create client portals, store notes, track stage, and keep each build in one clean place.",
    },
    {
      label: "Work",
      href: "/portal/agency/pipelines/fulfilment",
      status: "Project pipeline",
      description: "See what is being built, what is blocked, and what needs your attention next.",
    },
    {
      label: "Support",
      href: "/portal/agency/activity-inbox",
      status: "Inbox first",
      description: "Bring tickets, client messages, website outages, and Milesy tag alerts into one queue.",
    },
    {
      label: "Money",
      href: "/portal/agency/agency-finance",
      status: "Finance",
      description: "Track invoices, payments, plans, lock-ins, and the products or services you sell.",
    },
    {
      label: "Systems",
      href: "/portal/agency/sops",
      status: "Reusable process",
      description: "Document how the business works so you can delegate without losing quality.",
    },
  ];

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm" aria-labelledby="agency-os-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">One simple loop</p>
          <h2 id="agency-os-heading" className="mt-1 text-lg font-medium text-black/85">
            Find the client, build the product, support the result.
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
            Keep the app calm: every client should have a clear stage, a portal, active work, support history, money status, and any blindspots surfaced before they become problems.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/agency/leads-pipeline/contacts#upload" className="rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85">
            Upload sheet
          </Link>
          <Link href="/portal/agency/pipelines/leads" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Leads board
          </Link>
          <Link href="/portal/agency/activity-inbox" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 hover:bg-black/[0.03]">
            Open inbox
          </Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {zones.map(zone => (
          <OperatingZone key={zone.label} {...zone} />
        ))}
      </div>
    </section>
  );
}

function pipelineName(name: string, kind: string): string {
  if (kind === "fulfilment" || name.toLowerCase() === "fulfilment") return "Project pipeline";
  return name;
}

function pipelineKindLabel(kind: string): string {
  if (kind === "fulfilment") return "project work";
  return kind.replace(/-/g, " ");
}

function OperatingZone({
  href,
  label,
  status,
  description,
}: {
  href: string;
  label: string;
  status: string;
  description: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-black/10 bg-black/[0.02] p-3 transition hover:bg-black/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-black/85">{label}</div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-black/50 ring-1 ring-black/10">
          {status}
        </span>
      </div>
      <div className="mt-2 text-xs leading-5 text-black/55">{description}</div>
    </Link>
  );
}
