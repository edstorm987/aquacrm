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
import { getInstall } from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { LeadsPipelineWorkspace } from "./_LeadsPipelineWorkspace";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";

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

  if (pipeline.kind === "leads") {
    let install = getInstall({ agencyId: agency.id }, "leads-pipeline");
    if (!install) {
      const result = await installPlugin("leads-pipeline", {
        scope: { agencyId: agency.id },
        installedBy: session.userId,
      });
      if (result.ok) install = result.install;
    } else if (!install.enabled) {
      await setPluginEnabled({ agencyId: agency.id }, "leads-pipeline", true);
      install = getInstall({ agencyId: agency.id }, "leads-pipeline");
    }
    if (install?.enabled) {
      const storage = makePluginStorage(install.id);
      const { leads } = leadsContainerFor({ agencyId: agency.id, storage: storage as never });
      const leadList = await leads.list();
      const clients = listClients(agency.id);
      const cards = listCards(pipeline.id);
      const columnByLeadId = new Map<string, string>();
      for (const card of cards) {
        if (card.kind !== "lead") continue;
        const snapshot = card.lead as unknown as { leadId?: string; email?: string };
        const key = snapshot.leadId ?? leadList.find(lead => lead.email === snapshot.email)?.id;
        if (key) columnByLeadId.set(key, card.columnId);
      }

      return (
        <LeadsPipelineWorkspace
          columns={pipeline.columns.map(col => ({ id: col.id, label: col.label, color: col.color }))}
          leads={leadList.map(lead => {
            const client = clients.find(candidate => {
              const sameLead = candidate.metadata?.leadId === lead.id;
              const sameEmail = candidate.ownerEmail?.trim().toLowerCase() === lead.email.trim().toLowerCase();
              return sameLead || sameEmail;
            });
            return {
              id: lead.id,
              clientId: client?.id,
              email: lead.email,
              name: lead.name,
              phone: lead.phone,
              company: lead.company,
              source: lead.source,
              tags: lead.tags,
              notes: lead.notes,
              capturedAt: lead.capturedAt,
              lastContactedAt: lead.lastContactedAt,
              nextMeetingAt: lead.nextMeetingAt,
              meetingLink: lead.meetingLink,
              meetingNotes: lead.meetingNotes,
              callRecordingUrl: lead.callRecordingUrl,
              sessionNotes: lead.sessionNotes,
              inspirationLinks: lead.inspirationLinks,
              potentialProblems: lead.potentialProblems,
              potentialSolutions: lead.potentialSolutions,
              pricePoints: lead.pricePoints,
              budgetRange: lead.budgetRange,
              designFeedback: lead.designFeedback,
              supportNotes: lead.supportNotes,
              sentCount: lead.sentCount,
              columnId: columnByLeadId.get(lead.id) ?? pipeline.columns[0]?.id ?? "new",
            };
          })}
          importHref="/portal/agency/leads-pipeline/contacts"
          campaignsHref="/portal/agency/leads-pipeline/campaigns"
        />
      );
    }
  }

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
          <div className="text-[11px] uppercase tracking-wide text-black/45">{pipelineKindLabel(pipeline.kind)}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">{pipelineName(pipeline.name, pipeline.kind)}</h1>
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
              <option key={p.id} value={p.slug}>{pipelineName(p.name, p.kind)}</option>
            ))}
          </select>
          <span className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/55">
            Pipelines are managed from Systems
          </span>
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

function pipelineName(name: string, kind: string): string {
  if (kind === "fulfilment" || name.toLowerCase() === "fulfilment") return "Project pipeline";
  return name;
}

function pipelineKindLabel(kind: string): string {
  if (kind === "fulfilment") return "project work";
  return kind.replace(/-/g, " ");
}
