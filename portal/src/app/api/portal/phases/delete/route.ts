import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getSessionFromRequest, getActiveAgencyId } from "@/lib/server/auth/auth";
import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import { deletePhase, getPhase } from "@/server/phases";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import type { ClientStage } from "@/server/types";
import {
  PhaseMutationConflictError,
  PhaseMutationNotFoundError,
  PhaseMutationRequestError,
  isJsonRecord,
  phaseMutationErrorResponse,
} from "@/lib/server/phases/phaseMutationErrors";

// Stages the fulfillment plugin seeds as defaults. We refuse to delete
// phases stamped with these even if `isDefault` was never written —
// belt-and-braces because the seeder lives in T2 territory.
const DEFAULT_STAGES = new Set<ClientStage>([
  "aqua-epic-intro",
  "aqua-blueprint",
  "aqua-diagnostics",
  "aqua-brand-builder",
  "aqua-traffic",
  "aqua-mastery",
]);

const DELETE_FALLBACK = "The phase could not be deleted.";

function parsePhaseId(value: unknown): string {
  if (!isJsonRecord(value)) throw new PhaseMutationRequestError("The request body must be valid JSON.");
  if (typeof value.phaseId !== "string" || !value.phaseId.trim()) throw new PhaseMutationRequestError("Choose a phase to delete.");
  return value.phaseId.trim();
}

// POST /api/portal/phases/delete — founder / agency-owner / agency-manager
// only. Answers `{ ok: true, phaseId }` so the browser can bind the receipt
// to the phase it asked to delete.
export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const eff = effectiveRole(session);
  if (!eff.isFounder && session.role !== "agency-manager" && session.role !== "agency-owner") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let phaseId: string | undefined;
  try {
    const requested = parsePhaseId(await req.json().catch(() => null));
    phaseId = requested;
    const agencyId = getActiveAgencyId(session);
    // Lookup, guard and removal share one durable transaction, so the receipt
    // names a phase that is gone from persisted state, not merely from memory.
    await withPortalStateTransaction(`phases:${agencyId}`, () => {
      const phase = getPhase(requested);
      if (!phase || phase.agencyId !== agencyId) {
        throw new PhaseMutationNotFoundError("That phase no longer exists in this agency.");
      }
      if (phase.isDefault === true || DEFAULT_STAGES.has(phase.stage)) {
        // "default_phase_protected" is the pinned refusal code for seeded phases.
        throw new PhaseMutationConflictError("default_phase_protected: a default phase cannot be deleted.");
      }
      const removed = deletePhase(requested);
      if (!removed) throw new PhaseMutationNotFoundError("That phase no longer exists in this agency.");
    });
    return NextResponse.json({ ok: true, phaseId });
  } catch (error) {
    return phaseMutationErrorResponse(error, {
      fallback: DELETE_FALLBACK,
      breadcrumb: {
        agencyId: session.agencyId,
        userId: session.userId,
        extra: { route: "portal/phases/delete", method: "POST", phaseId },
      },
    });
  }
}
