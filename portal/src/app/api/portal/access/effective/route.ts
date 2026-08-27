import {
  accessErrorResponse,
  parseAccessScope,
  requireCurrentAccessActor,
  resolveActorAccess,
} from "@/server/accessControl";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireCurrentAccessActor();
    const params = new URL(request.url).searchParams;
    const scope = parseAccessScope({
      kind: params.get("kind"),
      id: params.get("id"),
      clientId: params.get("clientId") ?? undefined,
      projectId: params.get("projectId") ?? undefined,
    });
    const resolution = resolveActorAccess(actor, scope);
    return Response.json({ ok: true, resolution });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
