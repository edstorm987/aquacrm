import "server-only";

import { getSession } from "@/lib/server/auth/auth";
import { readMyRadar } from "@/lib/server/intelligence/myRadar";
import { allocationHeadline } from "@/lib/intelligence/departmentAllocation";
import { isAgencyRole } from "@/server/types";
import { MyRadarButton } from "@/components/chrome/MyRadarButton";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Server half of the topbar My Radar — the `DevConsoleControl` shape: compute
// the cheap reading here, hand the client button a real starting value. The
// scan is in-memory with no I/O and NO WRITES — this runs on every authenticated
// navigation, which is exactly the path issue #21 cleared of render-time writes.
// Fresh data is fetched by the panel on open, through its own gated route.
//
// ── The staff gate runs HERE as well as on the route ──────────────────────
//
// `GET /api/portal/dashboard-planning` refuses an agency-staff account whose
// `staff.overview` view was revoked, and the new my-radar route applies the
// same element gate. A server-computed initial reading handed to the client
// button would be a side door past both — the one place the meters could reach
// a person the route would refuse. So the same gate decides whether this
// renders at all: refused means NO control, not a control with blank data,
// matching how the Dev Console icon is a server decision the client can never
// summon. The window is the same rolling 7 days as the page and the dashboard
// mount — baselines are weekly, so the window must be too.
export async function MyRadarControl({ activeDepartment }: { activeDepartment?: string }) {
  const session = await getSession();
  if (!session || !isAgencyRole(session.role)) return null;
  if (session.role === "agency-staff") {
    try {
      // Dynamic import, deliberately: this wrapper renders on EVERY healthy
      // owner navigation, and a static import here drags the whole
      // access-control graph into that hot path — the exact regression
      // smoke-shared-graph-split exists to catch (it did, 2026-08-30). The
      // gate only actually runs for delegated staff.
      const { requireCurrentWorkspaceElementAccess } = await import("@/lib/server/access/workspaceElementAccess");
      await requireCurrentWorkspaceElementAccess("staff", "staff.overview", "view");
    } catch {
      return null;
    }
  }
  const now = Date.now();
  const reading = readMyRadar({ agencyId: session.agencyId, userId: session.userId, from: now - WEEK_MS, to: now, now });
  return (
    <MyRadarButton
      activeDepartment={activeDepartment}
      initial={{ generatedAt: now, reading, headline: allocationHeadline(reading.allocation) }}
    />
  );
}
