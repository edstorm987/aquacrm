import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import {
  createClientMilestone,
  deleteClientMilestone,
  listClientMilestones,
  updateClientMilestone,
  type ClientMilestoneInput,
} from "@/server/clientMilestones";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES, type ClientMilestone, type ClientMilestoneStatus } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  PerformanceMutationNotFoundError,
  PerformanceMutationRequestError,
  isJsonRecord,
  performanceMutationErrorResponse,
} from "@/lib/server/performance/performanceMutationErrors";

type MilestoneAction = "create" | "update" | "delete";

interface MilestoneRequest {
  action: MilestoneAction;
  clientId: string;
  milestoneId?: string;
  input: Partial<ClientMilestoneInput>;
}

const MILESTONE_STATUSES = new Set<ClientMilestoneStatus>(["not-started", "in-progress", "complete", "blocked"]);
const MILESTONE_METRICS = new Set<NonNullable<ClientMilestone["metric"]>>(["pageviews", "visitors", "conversions", "search-clicks"]);
const MILESTONE_FALLBACK = "The milestone could not be updated.";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (!getClientForAgency(session.agencyId, clientId)) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", "view");
    return NextResponse.json({ ok: true, milestones: listClientMilestones(session.agencyId, clientId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function refuse(message: string): never {
  throw new PerformanceMutationRequestError(message);
}

/**
 * Exact request validation. Every field the row and the New Milestone dialog
 * send is checked for type and range here so a malformed request is a safe
 * 400, never a coerced write or a leaked internal error. The domain module
 * keeps the business rule (a title is required to create).
 */
interface MilestoneTarget {
  action: MilestoneAction;
  clientId: string;
  milestoneId?: string;
  value: Record<string, unknown>;
}

/** The addressing half: who and what, needed before the caller can be authenticated for that client. */
function parseMilestoneTarget(value: unknown): MilestoneTarget {
  if (!isJsonRecord(value)) refuse("clientId and a valid action are required");
  const { action, clientId, milestoneId } = value;
  if (
    typeof clientId !== "string"
    || !clientId.trim()
    || (action !== "create" && action !== "update" && action !== "delete")
  ) refuse("clientId and a valid action are required");
  if ((action === "update" || action === "delete") && (typeof milestoneId !== "string" || !milestoneId.trim())) {
    refuse("milestoneId required");
  }
  return { action, clientId, milestoneId: typeof milestoneId === "string" ? milestoneId : undefined, value };
}

/** The field half, checked only once the caller is authenticated and permitted for the client. */
function parseMilestoneFields(target: MilestoneTarget): MilestoneRequest {
  const { action, clientId, milestoneId, value } = target;
  if (action === "delete") return { action, clientId, milestoneId: milestoneId as string, input: {} };

  const input: Partial<ClientMilestoneInput> = {};
  if (value.title !== undefined) {
    if (typeof value.title !== "string") refuse("Milestone title must be text.");
    input.title = value.title;
  }
  if (action === "create" && !(typeof value.title === "string" && value.title.trim())) refuse("Milestone title required.");
  if (value.description !== undefined) {
    if (typeof value.description !== "string") refuse("Milestone description must be text.");
    input.description = value.description;
  }
  if (value.status !== undefined) {
    if (typeof value.status !== "string" || !MILESTONE_STATUSES.has(value.status as ClientMilestoneStatus)) refuse("Choose a valid milestone status.");
    input.status = value.status as ClientMilestoneStatus;
  }
  if (value.progress !== undefined) {
    if (typeof value.progress !== "number" || !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 100) {
      refuse("Progress must be a number between 0 and 100.");
    }
    input.progress = value.progress;
  }
  if (value.targetAt !== undefined) {
    if (typeof value.targetAt !== "number" || !Number.isFinite(value.targetAt) || value.targetAt <= 0) refuse("Choose a valid target date.");
    input.targetAt = value.targetAt;
  }
  if (value.metric !== undefined) {
    if (typeof value.metric !== "string" || !MILESTONE_METRICS.has(value.metric as NonNullable<ClientMilestone["metric"]>)) refuse("Choose a valid milestone metric.");
    input.metric = value.metric as ClientMilestone["metric"];
  }
  if (value.targetValue !== undefined) {
    if (typeof value.targetValue !== "number" || !Number.isFinite(value.targetValue) || value.targetValue <= 0) refuse("Target value must be a number above zero.");
    input.targetValue = value.targetValue;
  }
  if (value.autoTrack !== undefined) {
    if (typeof value.autoTrack !== "boolean") refuse("autoTrack must be true or false.");
    input.autoTrack = value.autoTrack;
  }
  return { action, clientId, milestoneId, input };
}

type MilestoneOutcome =
  | { kind: "write"; milestone: ClientMilestone; milestones: ClientMilestone[] }
  | { kind: "delete"; milestoneId: string; milestones: ClientMilestone[] };

export async function POST(request: Request) {
  let target: MilestoneTarget;
  try {
    await ensureHydrated();
    target = parseMilestoneTarget(await request.json().catch(() => null));
  } catch (error) {
    return performanceMutationErrorResponse(error, { fallback: MILESTONE_FALLBACK });
  }
  let agencyId: string | undefined;
  let userId: string | undefined;
  try {
    const session = await requireRoleForClient([...AGENCY_ROLES], target.clientId);
    agencyId = session.agencyId;
    userId = session.userId;
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (!getClientForAgency(session.agencyId, target.clientId)) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(
      target.clientId,
      "client.fulfilment",
      target.action === "delete" ? "manage" : "use",
    );
    // Field validation only after the caller is authenticated and permitted.
    const parsed = parseMilestoneFields(target);
    // The milestone record, its client ledger event and the activity entry are
    // one write. The transaction keeps them atomic and serialises competing
    // milestone changes for the same client, so the returned collection is the
    // authoritative snapshot the browser replaces its copy with.
    const result = await withPortalStateTransaction(`client-milestones:${session.agencyId}:${parsed.clientId}`, (): MilestoneOutcome => {
      if (!getClientForAgency(session.agencyId, parsed.clientId)) throw new PerformanceMutationNotFoundError("client not found");
      if (parsed.action === "delete") {
        const ok = deleteClientMilestone(session.agencyId, parsed.clientId, parsed.milestoneId!);
        if (!ok) throw new PerformanceMutationNotFoundError("milestone not found");
        return { kind: "delete", milestoneId: parsed.milestoneId!, milestones: listClientMilestones(session.agencyId, parsed.clientId) };
      }
      const milestone = parsed.action === "create"
        ? createClientMilestone(session.agencyId, parsed.clientId, { ...parsed.input, title: parsed.input.title ?? "" }, session.userId)
        : updateClientMilestone(session.agencyId, parsed.clientId, parsed.milestoneId!, parsed.input, session.userId);
      if (!milestone) throw new PerformanceMutationNotFoundError("milestone not found");
      return { kind: "write", milestone, milestones: listClientMilestones(session.agencyId, parsed.clientId) };
    });
    if (result.kind === "delete") {
      return NextResponse.json({
        ok: true,
        clientId: parsed.clientId,
        milestoneId: result.milestoneId,
        milestones: result.milestones,
      });
    }
    return NextResponse.json({
      ok: true,
      milestone: result.milestone,
      milestones: result.milestones,
    });
  } catch (error) {
    return performanceMutationErrorResponse(error, {
      fallback: MILESTONE_FALLBACK,
      breadcrumb: {
        agencyId,
        clientId: target.clientId,
        userId,
        extra: { route: "tenants/client-milestones", method: "POST", action: target.action, milestoneId: target.milestoneId },
      },
    });
  }
}
