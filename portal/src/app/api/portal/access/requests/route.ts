import {
  AccessControlError,
  accessErrorResponse,
  actorHasGovernanceCapability,
  createAccessRequest,
  listAccessRequests,
  parseAccessCapabilities,
  parseAccessEnvironment,
  parseAccessScope,
  requireCurrentAccessActor,
} from "@/server/accessControl";
import { ACCESS_ENVIRONMENTS } from "@/server/types";
import { optionalNumber, optionalString, readAccessJson } from "../_shared";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const all = new URL(request.url).searchParams.get("all") === "1";
    const environments = all
      ? ACCESS_ENVIRONMENTS.filter(environment => (
        actorHasGovernanceCapability(actor, environment, "access.request.review")
      ))
      : ACCESS_ENVIRONMENTS;
    if (all && environments.length === 0) throw new AccessControlError(403, "access_capability_required");
    const requests = listAccessRequests(actor.agencyId, all ? undefined : actor.user.id)
      .filter(item => environments.includes(item.environment));
    return Response.json({ ok: true, requests });
  } catch (error) {
    return accessErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const body = await readAccessJson(request);
    const environment = parseAccessEnvironment(body.environment);
    const accessRequest = await createAccessRequest({
      agencyId: actor.agencyId,
      requesterUserId: actor.user.id,
      scope: parseAccessScope(body.scope),
      environment,
      capabilities: parseAccessCapabilities(body.capabilities),
      reason: optionalString(body.reason) ?? "",
      expiresAt: optionalNumber(body.expiresAt),
      idempotencyKey: optionalString(body.idempotencyKey),
    });
    return Response.json({ ok: true, request: accessRequest }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
