import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getSessionFromRequest, getActiveAgencyId } from "@/lib/server/auth/auth";
import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import { upsertPhase, getPhase, listPhasesForAgency } from "@/server/phases";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import type { ClientStage, PhaseDefinition } from "@/server/types";
import {
  PhaseMutationNotFoundError,
  PhaseMutationRequestError,
  isJsonRecord,
  optionalText,
  phaseMutationErrorResponse,
} from "@/lib/server/phases/phaseMutationErrors";

interface Body {
  phaseId?: string;
  name?: string;
  description?: string;
  ordering?: number;
  stage?: string;
  customCss?: string;
  customJs?: string;
  welcomeHeading?: string;
  welcomeBody?: string;
  isPublicPreset?: boolean;
}

const SAVE_FALLBACK = "The phase could not be saved.";
const NAME_MAX = 160;
const CODE_MAX = 200_000;

/**
 * Exact request validation. Every field the create form and the editor send
 * is type-checked here so a malformed request is a safe 400 with an authored
 * message, never a coerced write or a leaked internal error.
 */
function parseBody(value: unknown): Body {
  if (!isJsonRecord(value)) throw new PhaseMutationRequestError("The request body must be valid JSON.");
  if (value.phaseId !== undefined && (typeof value.phaseId !== "string" || !value.phaseId.trim())) {
    throw new PhaseMutationRequestError("Choose a valid phase.");
  }
  if (typeof value.name !== "string" || !value.name.trim()) throw new PhaseMutationRequestError("A phase name is required.");
  if (value.name.trim().length > NAME_MAX) throw new PhaseMutationRequestError(`A phase name must be ${NAME_MAX} characters or fewer.`);
  if (value.ordering !== undefined && (typeof value.ordering !== "number" || !Number.isFinite(value.ordering))) {
    throw new PhaseMutationRequestError("Ordering must be a number.");
  }
  if (value.stage !== undefined && (typeof value.stage !== "string" || !value.stage.trim())) {
    throw new PhaseMutationRequestError("Choose a valid stage.");
  }
  if (value.isPublicPreset !== undefined && typeof value.isPublicPreset !== "boolean") {
    throw new PhaseMutationRequestError("Public preset must be on or off.");
  }
  return {
    phaseId: typeof value.phaseId === "string" ? value.phaseId.trim() : undefined,
    name: value.name.trim(),
    description: optionalText(value.description, "Description", 4_000),
    ordering: typeof value.ordering === "number" ? value.ordering : undefined,
    stage: typeof value.stage === "string" ? value.stage.trim() : undefined,
    customCss: optionalText(value.customCss, "customCss", CODE_MAX),
    customJs: optionalText(value.customJs, "customJs", CODE_MAX),
    welcomeHeading: optionalText(value.welcomeHeading, "Welcome heading", 400),
    welcomeBody: optionalText(value.welcomeBody, "Welcome body", 4_000),
    isPublicPreset: typeof value.isPublicPreset === "boolean" ? value.isPublicPreset : undefined,
  };
}

// POST /api/portal/phases/upsert — create / edit a phase. Founder or
// agency-manager only (Admin grid). Idempotent on phaseId. Answers the
// authoritative saved phase so the browser can validate its receipt.
export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const eff = effectiveRole(session);
  if (!eff.isFounder && session.role !== "agency-manager" && session.role !== "agency-owner") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let requestedPhaseId: string | undefined;
  try {
    const body = parseBody(await req.json().catch(() => null));
    requestedPhaseId = body.phaseId;
    const name = body.name ?? "";
    const agencyId = getActiveAgencyId(session);
    const ordering = Number.isFinite(body.ordering) ? Number(body.ordering) : 0;
    const stage = (body.stage ?? "discovery") as ClientStage;

    // The lookup and the write share one durable transaction, so the receipt
    // describes a phase that is persisted, not merely queued, and two saves
    // of the same phase from separate processes cannot interleave.
    const saved = await withPortalStateTransaction(`phases:${agencyId}`, () => {
      let row: PhaseDefinition;
      if (body.phaseId) {
        const existing = getPhase(body.phaseId);
        if (!existing || existing.agencyId !== agencyId) {
          throw new PhaseMutationNotFoundError("That phase no longer exists in this agency.");
        }
        row = {
          ...existing,
          label: name,
          description: body.description ?? existing.description,
          order: ordering,
          customCss: body.customCss ?? existing.customCss,
          customJs: body.customJs ?? existing.customJs,
          welcomeHeading: body.welcomeHeading ?? existing.welcomeHeading,
          welcomeBody: body.welcomeBody ?? existing.welcomeBody,
          isPublicPreset: body.isPublicPreset ?? existing.isPublicPreset,
        };
      } else {
        const id = `phase_${agencyId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        row = {
          id,
          agencyId,
          stage,
          label: name,
          description: body.description ?? "",
          order: ordering || (listPhasesForAgency(agencyId).length + 1) * 10,
          pluginPreset: [],
          checklist: [],
          isDefault: false,
          customCss: body.customCss,
          customJs: body.customJs,
          welcomeHeading: body.welcomeHeading,
          welcomeBody: body.welcomeBody,
          isPublicPreset: body.isPublicPreset ?? false,
        };
      }
      return upsertPhase(row);
    });
    return NextResponse.json({ ok: true, phase: saved });
  } catch (error) {
    return phaseMutationErrorResponse(error, {
      fallback: SAVE_FALLBACK,
      breadcrumb: {
        agencyId: session.agencyId,
        userId: session.userId,
        extra: { route: "portal/phases/upsert", method: "POST", phaseId: requestedPhaseId },
      },
    });
  }
}
