// /portal/agency/pipelines/<slug> — single pipeline kanban view.
//
// T1 R034 foundation surface. Foundation fetches the pipeline + its
// column shape + a virtual card list (from clients for fulfilment,
// from PipelineCard rows for everything else) and renders the column
// scaffold. T2's kanban plugin (R+1) replaces the body with the real
// drag-drop board; until then the columns + card snapshots ship a
// readable, accessible view of pipeline state.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import {
  getPipelineBySlug,
  listPipelines,
  listCards,
  projectClientsToFulfilmentCards,
} from "@/server/pipelines";
import { phaseLabel } from "@/server/phases";

interface RouteProps {
  params: Promise<{ slug: string }>;
}

export default async function PipelineView({ params }: RouteProps) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const agency = getAgency(session.agencyId)!;
  const { slug } = await params;

  const pipeline = getPipelineBySlug(agency.id, slug);
  if (!pipeline) notFound();

  const allPipelines = listPipelines(agency.id);

  // Card source: fulfilment projects from Client rows when no migration
  // has run yet (returns the canonical client snapshots). All other
  // pipelines read from PipelineCard storage directly.
  let columnCards: Record<string, Array<{ id: string; label: string; sub?: string; href?: string }>> = {};
  for (const col of pipeline.columns) columnCards[col.id] = [];

  if (pipeline.kind === "fulfilment") {
    const projections = projectClientsToFulfilmentCards(agency.id);
    for (const proj of projections) {
      const bucket = columnCards[proj.columnId] ?? (columnCards[proj.columnId] = []);
      bucket.push({
        id: proj.client.id,
        label: proj.client.name,
        sub: phaseLabel(proj.client.stage),
        href: `/portal/clients/${proj.client.id}`,
      });
    }
  } else {
    for (const card of listCards(pipeline.id)) {
      const bucket = columnCards[card.columnId] ?? (columnCards[card.columnId] = []);
      if (card.kind === "lead") {
        bucket.push({ id: card.id, label: card.lead.name ?? card.lead.email, sub: card.lead.source });
      } else if (card.kind === "deal") {
        bucket.push({
          id: card.id,
          label: card.deal.title,
          sub: card.deal.amount ? `$${card.deal.amount}` : undefined,
        });
      } else if (card.kind === "client") {
        const c = listClients(agency.id).find(c => c.id === card.clientId);
        bucket.push({ id: card.id, label: c?.name ?? card.clientId });
      } else {
        bucket.push({ id: card.id, label: "Custom card" });
      }
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="pipeline-view" data-pipeline-slug={pipeline.slug}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-black/45">{pipeline.kind}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">{pipeline.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pipeline-switch" className="sr-only">Switch pipeline</label>
          <select
            id="pipeline-switch"
            data-testid="pipeline-switcher"
            defaultValue={pipeline.slug}
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-sm"
          >
            {allPipelines.map(p => (
              <option key={p.id} value={p.slug}>{p.name}</option>
            ))}
          </select>
          <Link
            href="/portal/agency/pipelines/new"
            className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
            data-testid="new-pipeline-link"
          >
            + New pipeline
          </Link>
        </div>
      </header>

      <div
        className="grid gap-3 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${pipeline.columns.length}, minmax(240px, 1fr))` }}
        data-testid="pipeline-columns"
      >
        {pipeline.columns.map(col => {
          const cards = columnCards[col.id] ?? [];
          return (
            <section
              key={col.id}
              data-testid={`column-${col.id}`}
              className="flex flex-col rounded-lg border border-black/10 bg-white/70 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-black/85">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: col.color ?? "#0EA5A4" }}
                    aria-hidden="true"
                  />
                  {col.label}
                </h2>
                <span className="rounded-full bg-black/5 px-1.5 py-px text-[11px] text-black/55">{cards.length}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {cards.map(card => (
                  <li
                    key={card.id}
                    data-testid={`pipeline-card-${card.id}`}
                    className="rounded-md border border-black/5 bg-white p-2 text-sm shadow-sm"
                  >
                    {card.href ? (
                      <Link href={card.href} className="block hover:underline">{card.label}</Link>
                    ) : (
                      <span>{card.label}</span>
                    )}
                    {card.sub && <div className="text-[11px] text-black/55">{card.sub}</div>}
                  </li>
                ))}
                {cards.length === 0 && (
                  <li className="rounded-md border border-dashed border-black/10 p-2 text-[11px] text-black/40">
                    Empty
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
