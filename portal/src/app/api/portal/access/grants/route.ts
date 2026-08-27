import {
  AccessControlError,
  accessErrorResponse,
  actorHasGovernanceCapability,
  createAccessGrant,
  listAccessGrants,
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
    const url = new URL(request.url);
    const self = url.searchParams.get("self") === "1";
    const requestedUserId = url.searchParams.get("userId")?.trim();
    const userId = self ? actor.user.id : requestedUserId;
    let environments = [...ACCESS_ENVIRONMENTS];
    if (!self && userId !== actor.user.id) {
      environments = environments.filter(environment => (
        actorHasGovernanceCapability(actor, environment, "access.grant.manage")
      ));
      if (environments.length === 0) throw new AccessControlError(403, "access_capability_required");
    }
    const grants = listAccessGrants(actor.agencyId, userId)
      .filter(grant => environments.includes(grant.environment));
    return Response.json({ ok: true, grants });
  } catch (error) {
    return accessErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const body = await readAccessJson(request);
    const environment = parseAccessEnvironment(body.environment);
    const grant = await createAccessGrant({
      agencyId: actor.agencyId,
      actorUserId: actor.user.id,
      userId: optionalString(body.userId) ?? "",
      scope: parseAccessScope(body.scope),
      environment,
      capabilities: body.capabilities === undefined ? [] : parseAccessCapabilities(body.capabilities, { allowEmpty: true }),
      templateId: optionalString(body.templateId),
      expiresAt: optionalNumber(body.expiresAt),
      reason: optionalString(body.reason),
      idempotencyKey: optionalString(body.idempotencyKey),
    });
    return Response.json({ ok: true, grant }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
