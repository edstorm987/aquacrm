import {
  AccessControlError,
  accessErrorResponse,
  requireCurrentAccessActor,
  revokeAccessGrant,
} from "@/server/accessControl";
import { optionalString, readAccessJson } from "../../_shared";

type Context = { params: Promise<{ grantId: string }> };

async function revoke(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const { grantId } = await context.params;
    let reason: string | undefined;
    if (request.method === "PATCH") {
      const body = await readAccessJson(request);
      if (body.action !== "revoke") throw new AccessControlError(400, "unsupported_access_grant_action");
      reason = optionalString(body.reason);
    }
    const grant = await revokeAccessGrant({
      agencyId: actor.agencyId,
      actorUserId: actor.user.id,
      grantId,
      reason,
    });
    return Response.json({ ok: true, grant });
  } catch (error) {
    return accessErrorResponse(error);
  }
}

export const PATCH = revoke;
export const DELETE = revoke;
