import {
  AccessControlError,
  accessErrorResponse,
  approveAccessRequest,
  cancelAccessRequest,
  denyAccessRequest,
  parseAccessCapabilities,
  requireCurrentAccessActor,
} from "@/server/accessControl";
import { optionalNumber, optionalString, readAccessJson } from "../../_shared";

type Context = { params: Promise<{ requestId: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const { requestId } = await context.params;
    const existing = actor.governanceState.accessRequests[requestId];
    if (!existing || existing.agencyId !== actor.agencyId) throw new AccessControlError(404, "access_request_not_found");
    const body = await readAccessJson(request);
    if (body.action === "approve") {
      const result = await approveAccessRequest({
        agencyId: actor.agencyId,
        actorUserId: actor.user.id,
        requestId,
        capabilities: body.capabilities === undefined ? undefined : parseAccessCapabilities(body.capabilities),
        expiresAt: optionalNumber(body.expiresAt),
        reason: optionalString(body.reason),
      });
      return Response.json({ ok: true, request: result.request, grant: result.grant });
    }
    if (body.action === "deny") {
      const accessRequest = await denyAccessRequest({
        agencyId: actor.agencyId,
        actorUserId: actor.user.id,
        requestId,
        reason: optionalString(body.reason),
      });
      return Response.json({ ok: true, request: accessRequest });
    }
    if (body.action === "cancel") {
      const accessRequest = await cancelAccessRequest({
        agencyId: actor.agencyId,
        actorUserId: actor.user.id,
        requestId,
      });
      return Response.json({ ok: true, request: accessRequest });
    }
    throw new AccessControlError(400, "unsupported_access_request_action");
  } catch (error) {
    return accessErrorResponse(error);
  }
}
