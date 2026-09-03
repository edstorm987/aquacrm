import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { MyRadarPanel } from "@/components/intelligence/MyRadarPanel";
import { DepartmentBaselines } from "@/components/intelligence/DepartmentBaselines";
import { allocationHeadline } from "@/lib/intelligence/departmentAllocation";
import { readMyRadar } from "@/lib/server/intelligence/myRadar";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { ensureHydrated } from "@/server/storage";
import { DEPARTMENT_PROFILES, departmentCapabilities } from "@/lib/access/departmentProfiles";
import { actorHasGovernanceCapability, requireCurrentAccessActor } from "@/server/accessControl";
import { ACCESS_ENVIRONMENTS } from "@/server/types";
import { resolveBusinessRadarCapabilityForActor } from "@/lib/server/intelligence/personalRadarAccess";
import { assertWorkspaceElementAccess, resolveActorWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function BusinessWorkloadRadarPage() {
  await ensureHydrated();
  // Baseline editing is business configuration, so this surface retains the
  // existing owner/manager boundary instead of broadening staff access.
  await requireRole(["agency-owner", "agency-manager"]);
  let actor: Awaited<ReturnType<typeof requireCurrentAccessActor>>;
  try {
    actor = await requireCurrentAccessActor();
    if (!await resolveBusinessRadarCapabilityForActor(actor, "view")) {
      redirect("/portal/account/permissions?notice=business-radar-workload-required");
    }
    assertWorkspaceElementAccess(resolveActorWorkspaceElementAccess(actor, "staff"), "workspace.settings", "manage");
  } catch (error) {
    if (error && typeof error === "object" && "status" in error
      && Number((error as { status?: unknown }).status) === 403) {
      redirect("/portal/account/permissions?notice=business-radar-workload-required");
    }
    throw error;
  }
  const now = Date.now();
  // No user id: this is deliberately the whole agency, housed under Business
  // Radar rather than masquerading as the signed-in person's personal view.
  const reading = readMyRadar({ agencyId: actor.resourceAgencyId, from: now - WEEK_MS, to: now, now });
  const settings = getAgencyWorkspaceSettings(actor.resourceAgencyId);
  const profileCapabilities = [...new Set(DEPARTMENT_PROFILES.flatMap(departmentCapabilities))];
  const canManageTemplates = ACCESS_ENVIRONMENTS.every(environment =>
    actorHasGovernanceCapability(actor, environment, "access.template.manage")
    && profileCapabilities.every(capability => actorHasGovernanceCapability(actor, environment, capability)));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><Building2 size={14} aria-hidden="true" /> Business Radar</p>
          <h1 className="mt-1 text-xl font-semibold text-black/85">Department workload</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">Company-wide hours against weekly department baselines. This is business capacity, not anybody’s personal My Radar.</p>
        </div>
        <Link href="/portal/agency/radar" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03]"><ArrowLeft size={14} aria-hidden="true" /> Back to Business Radar</Link>
      </header>

      <MyRadarPanel
        allocation={reading.allocation}
        wellbeing={reading.wellbeing}
        daysWorked={reading.daysWorked}
        headline={allocationHeadline(reading.allocation)}
        eyebrow="Business Radar"
        title="All people · department allocation"
        ariaLabel="Business Radar — department workload"
        showWellbeing={false}
        aggregate
      />

      <DepartmentBaselines initial={settings.departmentBaselines ?? []} canManageTemplates={canManageTemplates} />
    </div>
  );
}
