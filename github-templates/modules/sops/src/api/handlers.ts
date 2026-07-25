// HTTP handlers for the SOPs plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { renderMarkdown } from "../server/markdown";
import type {
  CreateSopInput,
  SopFilter,
  TagFamily,
  UpdateSopPatch,
} from "../lib/domain";
import { TAG_FAMILIES } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const unprocessable = (m: string): Response => json({ ok: false, error: m }, 422);
function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

function build(ctx: PluginCtx) {
  return containerFor({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId,
    storage: ctx.storage,
    install: ctx.install,
  });
}

function parseTag(v: string | null): TagFamily | undefined {
  if (!v) return undefined;
  return (TAG_FAMILIES as string[]).includes(v) ? (v as TagFamily) : undefined;
}

export async function listSopsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: SopFilter = {
    tag: parseTag(url.searchParams.get("tag")),
    status: (url.searchParams.get("status") ?? undefined) as SopFilter["status"],
    query: url.searchParams.get("q") ?? undefined,
  };
  return json({ ok: true, sops: await build(ctx).sops.list(filter) });
}

export async function getSopHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const slug = url.searchParams.get("slug");
  if (!id && !slug) return badRequest("id or slug required.");
  const c = build(ctx);
  const sop = id ? await c.sops.get(id) : await c.sops.getBySlug(slug!);
  if (!sop) return notFound("sop not found");
  return json({ ok: true, sop, html: renderMarkdown(sop.body) });
}

export async function createSopHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateSopInput>(req);
  if (!body?.title) return badRequest("title required.");
  try {
    const sop = await build(ctx).sops.create(body, ctx.actor);
    return json({ ok: true, sop }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateSopHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateSopPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  const sop = await build(ctx).sops.update(body.id, body.patch ?? {}, ctx.actor);
  return sop ? json({ ok: true, sop }) : notFound("sop not found");
}

export async function archiveSopHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const sop = await build(ctx).sops.archive(id, ctx.actor);
  return sop ? json({ ok: true, sop }) : notFound("sop not found");
}

export async function restoreSopHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const sop = await build(ctx).sops.restore(body.id, ctx.actor);
  return sop ? json({ ok: true, sop }) : notFound("sop not found");
}

export async function tagCountsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, counts: await build(ctx).sops.tagCounts() });
}

export async function seedSopsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const created = await build(ctx).sops.seedDefaults(ctx.actor);
  return json({ ok: true, created });
}
