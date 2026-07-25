import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole, getActiveAgencyId } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { getPhase } from "@/server/phases";
import { PhaseEditorForm } from "./_PhaseEditorForm";

export default async function PhaseEditorPage({
  params,
}: {
  params: Promise<{ phaseId: string }>;
}) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const eff = effectiveRole(session);
  const ok = eff.isFounder || session.role === "agency-owner" || session.role === "agency-manager";
  if (!ok) redirect("/portal/agency");

  const { phaseId } = await params;
  const activeAgencyId = getActiveAgencyId(session);
  // Resilient lookup: route param can be the full id (`phase_<agency>_<stage>`)
  // OR just the stage (legacy bookmarks / Ed's manual nav). Stage fallback
  // scopes to the active agency to avoid cross-tenant leak.
  let phase = getPhase(phaseId);
  if (!phase) {
    const { listPhasesForAgency } = await import("@/server/phases");
    phase = listPhasesForAgency(activeAgencyId).find(p => p.stage === phaseId) ?? null;
  }
  if (!phase || phase.agencyId !== activeAgencyId) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/portal/agency/phases" className="text-xs text-black/60 hover:text-black/80">
          ← All phases
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-black/90">Edit phase: {phase.label}</h1>
        <p className="mt-1 text-sm text-black/60">
          Stage: <code>{phase.stage}</code> · ID: <code>{phase.id}</code>
        </p>
      </header>
      <PhaseEditorForm
        phaseId={phase.id}
        initial={{
          name: phase.label,
          description: phase.description ?? "",
          ordering: phase.order,
          customCss: phase.customCss ?? "",
          customJs: phase.customJs ?? "",
          welcomeHeading: phase.welcomeHeading ?? "",
          welcomeBody: phase.welcomeBody ?? "",
          isPublicPreset: phase.isPublicPreset ?? false,
        }}
      />
    </div>
  );
}
