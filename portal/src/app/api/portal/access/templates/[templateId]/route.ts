import {
  accessErrorResponse,
  archiveAccessRoleTemplate,
  parseAccessCapabilities,
  parseAccessEnvironments,
  parseAccessScopeKinds,
  requireCurrentAccessActor,
  updateAccessRoleTemplate,
} from "@/server/accessControl";
import { optionalString, readAccessJson } from "../../_shared";

type Context = { params: Promise<{ templateId: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const { templateId } = await context.params;
    const body = await readAccessJson(request);
    const template = await updateAccessRoleTemplate({
      agencyId: actor.agencyId,
      actorUserId: actor.user.id,
      templateId,
      name: body.name === undefined ? undefined : optionalString(body.name),
      description: body.description === null ? null : body.description === undefined ? undefined : optionalString(body.description),
      capabilities: body.capabilities === undefined ? undefined : parseAccessCapabilities(body.capabilities),
      allowedScopeKinds: body.allowedScopeKinds === undefined ? undefined : parseAccessScopeKinds(body.allowedScopeKinds),
      allowedEnvironments: body.allowedEnvironments === undefined ? undefined : parseAccessEnvironments(body.allowedEnvironments),
    });
    return Response.json({ ok: true, template });
  } catch (error) {
    return accessErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const { templateId } = await context.params;
    const template = await archiveAccessRoleTemplate({
      agencyId: actor.agencyId,
      actorUserId: actor.user.id,
      templateId,
    });
    return Response.json({ ok: true, template });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
