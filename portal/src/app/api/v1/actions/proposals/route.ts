import {
  authenticateExternalAssistant,
  ExternalAssistantApiError,
  externalApiErrorResponse,
  externalApiHeaders,
  requireExternalAssistantModule,
  requireExternalAssistantPermission,
} from "@/lib/server/assistants/externalAssistantApi";
import {
  listProposalsForExternalAssistant,
  submitExternalAssistantActionProposal,
} from "@/lib/server/assistants/externalAssistantProposals";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { AgencyTaskPriority, ExternalAssistantProposalCategory } from "@/server/types";

export async function GET(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const auth = await authenticateExternalAssistant(request);
    requireProposalAccess(auth);
    return Response.json({
      ok: true,
      proposals: listProposalsForExternalAssistant(auth.agencyId, auth.tokenFingerprint),
      generatedAt: new Date().toISOString(),
    }, { headers: externalApiHeaders() });
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const auth = await authenticateExternalAssistant(request);
    requireProposalAccess(auth);
    const body = await request.json().catch(() => null) as {
      title?: string;
      detail?: string;
      evidence?: string[];
      category?: ExternalAssistantProposalCategory;
      priority?: AgencyTaskPriority;
      suggestedDueAt?: string | number;
      sourceIds?: string[];
      sourceHref?: string;
      expectedOutcome?: string;
    } | null;
    if (!body) throw new ExternalAssistantApiError(400, "invalid_body", "A JSON proposal is required.");
    const proposal = submitExternalAssistantActionProposal({
      agencyId: auth.agencyId,
      assistantKeyId: auth.keyId,
      assistantFingerprint: auth.tokenFingerprint,
      assistantName: auth.keyName,
      title: body.title ?? "",
      detail: body.detail ?? "",
      evidence: body.evidence,
      category: body.category,
      priority: body.priority,
      suggestedDueAt: timestamp(body.suggestedDueAt),
      sourceIds: body.sourceIds,
      sourceHref: body.sourceHref,
      expectedOutcome: body.expectedOutcome,
    });
    await flushPendingWrites();
    return Response.json({ ok: true, proposal, message: "Proposal submitted for human approval. No task was created." }, { status: 202, headers: externalApiHeaders() });
  } catch (error) {
    if (error instanceof ExternalAssistantApiError) return externalApiErrorResponse(error);
    const message = error instanceof Error && error.message === "proposal_limit_reached"
      ? "This assistant already has 50 open proposals. Wait for a human decision before submitting more."
      : error instanceof Error && error.message === "proposal_title_required"
        ? "Proposal title is required."
        : error instanceof Error && error.message === "proposal_detail_required"
          ? "Proposal detail is required."
          : "The proposal could not be submitted safely.";
    return externalApiErrorResponse(new ExternalAssistantApiError(400, "invalid_proposal", message));
  }
}

function requireProposalAccess(auth: Awaited<ReturnType<typeof authenticateExternalAssistant>>) {
  requireExternalAssistantPermission(auth, "actions:propose");
  requireExternalAssistantModule(auth, "tasks");
}

function timestamp(value: string | number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ExternalAssistantApiError(400, "invalid_due_date", "suggestedDueAt must be an ISO date-time.");
  return parsed;
}
