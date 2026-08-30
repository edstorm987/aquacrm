// `/portal/agency/my-radar`
//
// Ed's operating model on one screen: which of your departments is starving,
// and what each was meant to get.
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
// ── The window is the last seven days ─────────────────────────────────────
//
// Baselines are stated per WEEK, so the actuals have to be a week or the
// comparison is meaningless. A rolling seven days rather than "this calendar
// week" because a Monday-morning radar showing every department starved is
// technically true and completely useless.

import { requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { readMyRadar } from "@/lib/server/intelligence/myRadar";
import { allocationHeadline } from "@/lib/intelligence/departmentAllocation";
import { MyRadarPanel } from "@/components/intelligence/MyRadarPanel";
import { DepartmentBaselines } from "@/components/intelligence/DepartmentBaselines";
import { AGENCY_ROLES } from "@/server/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function MyRadarPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const now = Date.now();

  // This person's own week. The agency-wide reading is the same function with
  // the user omitted — deliberately not shown here yet, because a team view is
  // only meaningful once more than one person has worn a hat.
  const reading = readMyRadar({
    agencyId: session.agencyId,
    userId: session.userId,
    from: now - WEEK_MS,
    to: now,
    now,
  });

  const settings = getAgencyWorkspaceSettings(session.agencyId);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-lg font-semibold text-black/85">My Radar</h1>
        <p className="mt-1 text-sm text-black/50">
          The last seven days, judged by department rather than as one number.
        </p>
      </header>

      <MyRadarPanel
        allocation={reading.allocation}
        wellbeing={reading.wellbeing}
        daysWorked={reading.daysWorked}
        headline={allocationHeadline(reading.allocation)}
      />

      <DepartmentBaselines initial={settings.departmentBaselines ?? []} />
    </main>
  );
}
