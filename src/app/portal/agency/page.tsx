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

  const firstName = (session.email.split("@")[0] || "there").replace(/[^a-z]/gi, "");
  const greet = firstName ? firstName[0]!.toUpperCase() + firstName.slice(1) : "there";

  return (
    <div className="flex flex-col gap-8" data-testid="agency-pipelines-hub">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">
            Welcome back, {greet}.
          </h1>
          <p className="mt-1 text-sm italic text-[var(--brand-primary)]/80">
            Where Healing Meets Revolution.
          </p>
          <p className="mt-1 text-sm text-black/60">
            {pipelines.length} pipeline{pipelines.length === 1 ? "" : "s"} in {agency.name}.
          </p>
        </div>
        {clients.length > 0 && <NewClientButton />}
      </section>

      <FounderDashboardKpis
        activeClients={clients.filter(c => c.stage !== "churned").length}
        lockInCollected={clients.filter(c => {
          const m = (c.metadata ?? {}) as { lockInPaid?: boolean };
          return m.lockInPaid === true;
        }).length}
        staleClients={clients.filter(c => {
          const m = (c.metadata ?? {}) as { lastContactedAt?: number };
          if (!m.lastContactedAt) return true;
          return Date.now() - m.lastContactedAt > 7 * 24 * 60 * 60 * 1000;
        }).length}
      />

      <FounderTodosWidget isFounder={session.role === "agency-owner"} />

      <AgencyActivityFeed />

      <section aria-labelledby="pipelines-heading" data-testid="pipelines-grid">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 id="pipelines-heading" className="text-lg font-medium text-black/85">
              Pipelines
            </h2>
            <p className="text-xs text-black/55">
              Each pipeline is its own kanban — fulfilment carries clients, leads carries unconverted contacts, sales carries open deals.
            </p>
          </div>
          <Link
            href="/portal/agency/pipelines/new"
            className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
            data-testid="new-pipeline-link"
          >
            + New pipeline
          </Link>
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
                className="group relative overflow-hidden rounded-xl border border-black/10 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-medium text-black/90">{p.name}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wide text-black/45">
                      {p.kind}
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
