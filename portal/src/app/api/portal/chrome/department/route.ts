import "server-only";

// Putting a department hat on — the cookie AND the clock, in one action.
//
// ── Why this route exists at all ──────────────────────────────────────────
//
// The first version of the switcher wrote the cookie from the browser and
// refreshed. The nav narrowed, it looked right, and `switchDashboardWorkDepartment`
// had **zero callers** — so no hours were ever stamped and My Radar would have
// reported every minute as unattributed, for ever. Found on 2026-08-29 by
// sweeping the session's own new exports for consumers, after Ed said: *"we
// keep building stuff but not connecting them all, we need to double check."*
//
// The lesson is in the shape of this file rather than in a comment: the two
// effects of putting a hat on — what you SEE and what your time COUNTS
// toward — now happen in one server action. They cannot drift apart again
// because there is no longer a path that does one without the other.
//
// ── Stamping is best-effort; narrowing is not ─────────────────────────────
//
// If there is no work session running, `switchDashboardWorkDepartment` returns
// null and the cookie is still set. Switching hats while clocked out is a
// navigation preference, not a time record — inventing a session for it would
// put hours on the clock nobody worked.

import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { switchDashboardWorkDepartment } from "@/server/dashboardPlanning";
import { departmentProfile } from "@/lib/access/departmentProfiles";
import { departmentHasVisibleNav } from "@/lib/chrome/departmentLens";
import { assembleAgencyBasePanels } from "@/lib/server/chrome/agencyBasePanels";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/server/chrome/activeDepartment";
import { AGENCY_ROLES } from "@/server/types";

/** A working day. A hat left on all week is a hat nobody chose. */
const MAX_AGE_SECONDS = 12 * 60 * 60;

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as { departmentId?: unknown } | null;

    const raw = typeof body?.departmentId === "string" ? body.departmentId.trim() : "";
    // Empty is legitimate — it is taking the hat off. Anything else must be a
    // real department, or the cookie becomes a place to put arbitrary strings.
    if (raw && !departmentProfile(raw)) {
      return NextResponse.json({ ok: false, error: "unknown department" }, { status: 400 });
    }

    // Ed's finding, 2026-08-30: *"the server stamps any globally valid
    // department without confirming that user can access it. The intended
    // departmentHasVisibleNav() filter has no consumer."* It now has one —
    // and it is this server, not the switcher's option list, because the
    // option list is a courtesy and this cookie feeds My Radar's allocation.
    // A staff member must not be able to stamp hours onto a department they
    // cannot work in: that is not access escalation, it is data corruption.
    // The check runs against the SAME narrowed panels the layout renders, via
    // the shared assembler, so the two can never disagree.
    if (raw) {
      const panels = await assembleAgencyBasePanels(session);
      if (!departmentHasVisibleNav(panels, raw)) {
        return NextResponse.json({
          ok: false,
          error: "That department has nothing you can work in.",
        }, { status: 403 });
      }
    }

    const stamped = switchDashboardWorkDepartment({
      agencyId: session.agencyId,
      userId: session.userId,
      ...(raw ? { departmentId: raw } : {}),
    });
    if (stamped) await flushPendingWrites();

    const response = NextResponse.json({
      ok: true,
      departmentId: raw || null,
      // Told plainly so the UI can say "not clocked in — this changes your view
      // but not your hours" rather than implying time is being recorded.
      stamped: Boolean(stamped),
    });
    response.cookies.set(ACTIVE_DEPARTMENT_COOKIE, raw, {
      path: "/",
      sameSite: "lax",
      maxAge: raw ? MAX_AGE_SECONDS : 0,
    });
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
