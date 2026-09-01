import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { requireClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { unavailableAttentionPlanReads } from "@/lib/inbox/attentionPlanRead";
import { loadAttentionPlanReads } from "@/lib/server/attentionPlanReads";
import {
  resolutionEvidenceFor,
  resolutionExplainFor,
  resolutionPlanFor,
} from "@/lib/server/resolutionPlans";
import { ensureHydrated } from "@/server/storage";
import { listAgencyTasks } from "@/server/tasks";
import { AGENCY_ROLES } from "@/server/types";

/**
 * The plan for an in-progress resolution.
 *
 * Served by id rather than handed to the destination page, so the banner works
 * on ANY page — including one the operator navigated to themselves, or came
 * back to hours later from a bookmark. Progress is recomputed from live
 * records on every call, so it cannot go stale.
 */
export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const alertId = new URL(request.url).searchParams.get("alert")?.trim();
    if (!alertId) {
      return NextResponse.json({ ok: false, error: "An alert id is required." }, { status: 400 });
    }

    // An alert whose id is `task:<id>` is an alert ABOUT an Action, and the
    // evidence card answers with that Action's title and its notes verbatim
    // (`taskEvidence` in resolutionPlans.ts). That is the same read
    // `GET /api/portal/tasks` filters its list on, so it answers to the same
    // association — otherwise the row the list withholds comes back by asking
    // for the alert about it instead. Refused HERE rather than inside the
    // evidence builder: a refusal must be a 403, never an unavailable read or
    // a silently empty panel.
    if (alertId.startsWith("task:")) {
      const taskId = alertId.slice("task:".length);
      const task = listAgencyTasks(session.agencyId).find(entry => entry.id === taskId);
      await requireClientAssociation("agency-task", task?.clientId, "view");
    }

    const reads = await loadAttentionPlanReads({
      // A null plan is the normal case, not an error — most resolutions are
      // one step and need no checklist. Availability distinguishes that valid
      // absence from a builder that rejected.
      plan: () => resolutionPlanFor(session.agencyId, alertId),
      // The explanation matters most when there is nothing to press: it is the
      // difference between "this alert is broken" and "here is what will clear
      // it". Built even when a plan exists, so the panel is always useful.
      explain: () => resolutionExplainFor(session.agencyId, alertId),
      // The records themselves, so the operator can judge without navigating.
      evidence: () => resolutionEvidenceFor(session.agencyId, alertId),
    });
    return NextResponse.json(
      {
        ok: true,
        reads,
        // Preserve the original response fields for older internal consumers;
        // truthful clients use `reads.*.available` before stating a fact.
        plan: reads.plan.data,
        explain: reads.explain.data,
        evidence: reads.evidence.data,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("[attention] plan lookup failed", error);
      const reads = unavailableAttentionPlanReads(
        "Resolution details could not be read. The page is still available; retry the details before acting on an empty result.",
      );
      return NextResponse.json(
        { ok: false, error: "Resolution details could not be read.", reads },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  }
}
