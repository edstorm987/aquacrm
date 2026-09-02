import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  decideExternalAssistantActionProposal,
  listExternalAssistantActionProposals,
} from "@/lib/server/assistants/externalAssistantProposals";
import { ensureHydrated } from "@/server/storage";
import { privateObjectLifecycleLockKey } from "@/lib/server/privateObjectLifecycle";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { SopReferenceValidationError } from "@/engines/sop/server/sopReferences";

const ALLOWED_ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);

async function agencySession(request: NextRequest) {
  await ensureHydrated({ fresh: true });
  const session = await getSessionFromRequest(request);
  if (!session || !ALLOWED_ROLES.has(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    return NextResponse.json({ ok: true, proposals: listExternalAssistantActionProposals(session.agencyId) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    if (!validOrigin(request)) return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
    const body = await request.json().catch(() => null) as {
      proposalId?: string;
      decision?: "accept" | "park" | "reject";
      assigneeUserId?: string;
      dueAt?: number;
      parkedUntil?: number;
      note?: string;
    } | null;
    if (!body?.proposalId || !body.decision) return NextResponse.json({ ok: false, error: "Proposal and decision are required." }, { status: 400 });
    const proposalId = body.proposalId;
    const decision = body.decision;
    const result = await withPortalStateTransaction(privateObjectLifecycleLockKey(session.agencyId), () =>
      decideExternalAssistantActionProposal({
        agencyId: session.agencyId,
        proposalId,
        decision,
        actorUserId: session.userId,
        assigneeUserId: body.assigneeUserId,
        dueAt: body.dueAt,
        parkedUntil: body.parkedUntil,
        note: body.note,
      }));
    return NextResponse.json({ ok: true, ...result, proposals: listExternalAssistantActionProposals(session.agencyId) });
  } catch (error) {
    if (error instanceof SopReferenceValidationError) {
      return NextResponse.json({ ok: false, reason: error.code, error: error.message, field: error.field, sopIds: error.sopIds }, { status: 422 });
    }
    if (error instanceof Error && ["proposal_not_found", "proposal_already_decided"].includes(error.message)) {
      return NextResponse.json({ ok: false, error: error.message === "proposal_not_found" ? "Proposal not found." : "This proposal has already been decided." }, { status: error.message === "proposal_not_found" ? 404 : 409 });
    }
    return authErrorResponse(error);
  }
}

function validOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === request.nextUrl.origin;
}
