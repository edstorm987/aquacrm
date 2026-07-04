// /portal/agency/phases — phases preview hub.
//
// Founder + agency-manager surface for previewing every phase, signing
// in as the demo client at a chosen phase, editing phases, and adding
// custom phases. Default phases (seeded by the fulfillment plugin) are
// protected from deletion.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole, getActiveAgencyId } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { listPhasesForAgency } from "@/server/phases";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { AddCustomPhaseForm } from "./_AddCustomPhaseForm";
import { PreviewAsClientButton, DeletePhaseButton } from "./_PhaseCardActions";

const DEFAULT_STAGES = new Set([
  "aqua-epic-intro",
  "aqua-blueprint",
  "aqua-diagnostics",
  "aqua-brand-builder",
  "aqua-traffic",
  "aqua-mastery",
]);

export default async function PhasesPreviewPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const eff = effectiveRole(session);
  const isManagerOrFounder = eff.isFounder || session.role === "agency-owner" || session.role === "agency-manager";
  if (!isManagerOrFounder) redirect("/portal/agency");

  const agencyId = getActiveAgencyId(session);
  const phases = listPhasesForAgency(agencyId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-black/90">Phases preview</h1>
        <p className="mt-1 text-sm text-black/60">
          Preview each phase as the demo client, edit phase metadata, or add a custom phase
          with optional CSS / JS injection. {phases.length} phase{phases.length === 1 ? "" : "s"}.
        </p>
      </header>

      <ul className="grid gap-4 md:grid-cols-2">
        {phases.map(p => {
          const isDefault = p.isDefault === true || DEFAULT_STAGES.has(p.stage);
          return (
            <li
              key={p.id}
              className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
              data-phase-id={p.id}
              data-phase-default={isDefault ? "true" : "false"}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-black/50">
                    #{p.order} · {p.stage}{isDefault ? " · default" : ""}
                  </div>
                  <div className="text-base font-semibold text-black/90">{p.label}</div>
                  {p.description && (
                    <p className="mt-1 text-sm text-black/60">{p.description}</p>
                  )}
                  {(p.customCss || p.customJs) && (
                    <p className="mt-2 text-[11px] text-amber-700">
                      Code injection: {[p.customCss && "CSS", p.customJs && "JS"].filter(Boolean).join(" + ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <PreviewAsClientButton phaseId={p.id} label={p.label} />
                <Link
                  href={`/portal/agency/phases/${encodeURIComponent(p.id)}`}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/80 hover:bg-black/5"
                >
                  Edit
                </Link>
                {!isDefault && <DeletePhaseButton phaseId={p.id} label={p.label} />}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="rounded-lg border border-dashed border-black/15 bg-black/[0.02] p-4">
        <h2 className="text-sm font-semibold text-black/80">+ Add custom phase</h2>
        <p className="mt-1 text-xs text-black/60">
          New custom phases land at the bottom of the order. Optional CSS / JS is injected
          into the client portal head when previewing this phase.
        </p>
        <AddCustomPhaseForm />
      </section>
    </div>
  );
}
