// `/portal/agency/my-radar`
//
// The signed-in person's operating view: actions, to-dos, goals, wellbeing and
// workload. The owner is still a person here; agency-wide health lives in the
// separate Business Radar.
//
// ── Why a page of its own rather than inside the Command Centre ───────────
//
// The Command Centre dashboard is a 2,787-line component. Folding a new
// subsystem into it before the subsystem has been used once would mean editing
// the busiest file in the app to ship something nobody has looked at yet. This
// page is reachable, complete and self-contained; moving it into the Command
// Centre is a later, smaller edit made with the benefit of having actually used
// it.
//
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { ensureHydrated } from "@/server/storage";
import { readPersonalRadar } from "@/lib/server/intelligence/myRadar";
import { readPersonalRadarActions } from "@/lib/server/intelligence/personalRadarActions";
import { resolveBusinessRadarAccessForActor, resolvePersonalRadarAccessForActor } from "@/lib/server/intelligence/personalRadarAccess";
import { personalRadarHeadline } from "@/lib/intelligence/personalRadar";
import { PersonalRadarPanel } from "@/components/intelligence/PersonalRadarPanel";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentAccessActor } from "@/server/accessControl";

export default async function MyRadarPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  let actor: Awaited<ReturnType<typeof requireCurrentAccessActor>>;
  if (session.role !== "agency-owner") {
    try {
      actor = (await requireCurrentWorkspaceElementAccess("staff", "staff.overview", "view")).actor;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error
        && Number((error as { status?: unknown }).status) === 403) {
        redirect("/portal/account/permissions?notice=staff-overview-required");
      }
      throw error;
    }
  } else {
    actor = await requireCurrentAccessActor();
  }
  const now = Date.now();
  const [{ goalsAvailable, goalsWritable }, businessRadarAvailable] = await Promise.all([
    resolvePersonalRadarAccessForActor(actor),
    resolveBusinessRadarAccessForActor(actor),
  ]);
  const reading = await readPersonalRadar({
    agencyId: actor.resourceAgencyId,
    userId: session.userId,
    now,
    includeGoals: goalsAvailable,
    goalsWritable,
  });
  const { actions, actionSummary, available: actionsAvailable } = await readPersonalRadarActions(session, now, actor);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-lg font-semibold text-black/85">My Radar</h1>
        <p className="mt-1 text-sm text-black/50">
          Your private operating view — actions, to-dos, goals, wellbeing and personal workload.
        </p>
      </header>

      <PersonalRadarPanel
        reading={reading}
        actions={actions}
        actionSummary={actionSummary}
        actionsAvailable={actionsAvailable}
        headline={personalRadarHeadline(reading, actions, now, actionSummary)}
        actionsHref={session.role === "agency-staff" ? "/portal/team/actions" : "/portal/agency/actions"}
        goalsHref="/portal/agency/calendar"
        businessRadarHref={businessRadarAvailable ? "/portal/agency/radar" : null}
      />
    </div>
  );
}
