import {
  accessErrorResponse,
  createAccessRoleTemplate,
  listAccessRoleTemplates,
  parseAccessCapabilities,
  parseAccessEnvironments,
  parseAccessScopeKinds,
  requireCurrentAccessActor,
} from "@/server/accessControl";
import { optionalString, readAccessJson } from "../_shared";

export async function GET(): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    return Response.json({ ok: true, templates: listAccessRoleTemplates(actor.agencyId) });
  } catch (error) {
    return accessErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const body = await readAccessJson(request);
    const template = await createAccessRoleTemplate({
      agencyId: actor.agencyId,
      actorUserId: actor.user.id,
      name: optionalString(body.name) ?? "",
      description: optionalString(body.description),
      capabilities: parseAccessCapabilities(body.capabilities),
      allowedScopeKinds: body.allowedScopeKinds === undefined ? undefined : parseAccessScopeKinds(body.allowedScopeKinds),
      allowedEnvironments: body.allowedEnvironments === undefined ? undefined : parseAccessEnvironments(body.allowedEnvironments),
      idempotencyKey: optionalString(body.idempotencyKey),
    });
    return Response.json({ ok: true, template }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
