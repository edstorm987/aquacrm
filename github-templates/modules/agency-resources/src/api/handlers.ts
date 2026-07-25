import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ResourceForbiddenError, ResourceNotFoundError } from "../server/service";
import type {
  CreateTeamResourceInput,
  TeamResourceFilter,
  TeamResourceKind,
  UpdateTeamResourcePatch,
} from "../lib/domain";
import { RESOURCE_KINDS } from "../lib/domain";
import type { Role } from "../lib/tenancy";

const VALID_ROLES = new Set<Role>([
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const forbidden = (m: string): Response => json({ ok: false, error: m }, 403);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

function actorFor(ctx: PluginCtx): { userId: string; role: Role } {
  const role = (ctx.install?.config?.role as Role | undefined);
  return {
    userId: ctx.actor,
    role: role && VALID_ROLES.has(role) ? role : "agency-owner",
  };
}

export async function listResourcesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind");
  const kind = kindRaw && (RESOURCE_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as TeamResourceKind) : undefined;
  const filter: TeamResourceFilter = {
    kind,
    query: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    includeArchived: url.searchParams.get("archived") === "1",
  };
  const items = await build(ctx).resources.list(actorFor(ctx), filter);
  return json({ ok: true, items });
}

export async function getResourceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const slug = url.searchParams.get("slug");
  if (!id && !slug) return badRequest("id_or_slug_required");
  try {
    const c = build(ctx);
    const resource = id ? await c.resources.get(actorFor(ctx), id)
      : await c.resources.getBySlug(actorFor(ctx), slug!);
    if (!resource) return notFound("not_found");
    return json({ ok: true, resource });
  } catch (e) {
    if (e instanceof ResourceForbiddenError) return forbidden("forbidden");
    throw e;
  }
}

export async function createResourceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateTeamResourceInput>(req);
  if (!body || !body.title || !body.kind) return badRequest("invalid_body");
  if (!(RESOURCE_KINDS as readonly string[]).includes(body.kind)) return badRequest("invalid_kind");
  try {
    const r = await build(ctx).resources.create(ctx.actor, body);
    return json({ ok: true, resource: r }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateResourceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateTeamResourcePatch>(req)) ?? {};
  try {
    const r = await build(ctx).resources.update(ctx.actor, id, body);
    return json({ ok: true, resource: r });
  } catch (e) {
    if (e instanceof ResourceNotFoundError) return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}

export async function tickViewHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const r = await build(ctx).resources.tickView(actorFor(ctx), id);
    return json({ ok: true, resource: r });
  } catch (e) {
    if (e instanceof ResourceNotFoundError) return notFound("not_found");
    if (e instanceof ResourceForbiddenError) return forbidden("forbidden");
    return badRequest("tick_failed");
  }
}

export async function exportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const items = await build(ctx).resources.exportAll(actorFor(ctx));
  return json({ ok: true, items });
}

export async function recentActivityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw) || 20)) : 20;
  const entries = await build(ctx).resources.recentActivity(actorFor(ctx), limit);
  return json({ ok: true, entries });
}
