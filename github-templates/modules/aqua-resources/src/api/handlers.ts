import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  BuiltInDeleteError,
  CollectionNotFoundError,
  ItemNotFoundError,
} from "../server/service";
import type {
  AddItemInput,
  AquaPhase,
  CreateCollectionInput,
  UpdateCollectionPatch,
  UpdateItemPatch,
} from "../lib/domain";
import { ALL_PHASES } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const conflict = (m: string): Response => json({ ok: false, error: m }, 409);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

function parsePhase(v: string | null): AquaPhase | undefined {
  if (!v) return undefined;
  return (ALL_PHASES as readonly string[]).includes(v) ? (v as AquaPhase) : undefined;
}

// Read endpoint — public-friendly so T4 Incubator can fetch
// per-phase resources without client-side auth ceremony. Server
// route handler is still gated on a session cookie at the framework
// level via `public: false` here we keep it agency-viewer to mirror
// the rest of the manifest; T4 wires up via the same agency origin.
export async function listResourcesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const phase = parsePhase(url.searchParams.get("phase"));
  const builtInRaw = url.searchParams.get("builtIn");
  const builtIn = builtInRaw === null ? undefined : builtInRaw === "1";
  const collections = phase
    ? await build(ctx).resources.resourcesForPhase(phase)
    : await build(ctx).resources.list({ builtIn });
  return json({ ok: true, collections });
}

export async function createCollectionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateCollectionInput>(req);
  if (!body || !body.name) return badRequest("invalid_body");
  try {
    const c = await build(ctx).resources.create(ctx.actor, body);
    return json({ ok: true, collection: c }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateCollectionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateCollectionPatch>(req)) ?? {};
  try {
    const c = await build(ctx).resources.update(ctx.actor, id, body);
    return json({ ok: true, collection: c });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return notFound("not_found");
    return badRequest("update_failed");
  }
}

export async function deleteCollectionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).resources.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return notFound("not_found");
    if (e instanceof BuiltInDeleteError) return conflict("built_in");
    return badRequest("delete_failed");
  }
}

export async function addItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const collectionId = url.searchParams.get("collectionId");
  if (!collectionId) return badRequest("collectionId_required");
  const body = await safeJson<AddItemInput>(req);
  if (!body || !body.kind || !body.title || !body.ref) return badRequest("invalid_body");
  try {
    const item = await build(ctx).resources.addItem(ctx.actor, collectionId, body);
    return json({ ok: true, item }, 201);
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "add_failed");
  }
}

export async function updateItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const collectionId = url.searchParams.get("collectionId");
  const itemId = url.searchParams.get("itemId");
  if (!collectionId || !itemId) return badRequest("collectionId_itemId_required");
  const body = (await safeJson<UpdateItemPatch>(req)) ?? {};
  try {
    const item = await build(ctx).resources.updateItem(ctx.actor, collectionId, itemId, body);
    return json({ ok: true, item });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return notFound("collection_not_found");
    if (e instanceof ItemNotFoundError) return notFound("item_not_found");
    return badRequest("update_failed");
  }
}

export async function removeItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const collectionId = url.searchParams.get("collectionId");
  const itemId = url.searchParams.get("itemId");
  if (!collectionId || !itemId) return badRequest("collectionId_itemId_required");
  try {
    await build(ctx).resources.removeItem(ctx.actor, collectionId, itemId);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return notFound("collection_not_found");
    if (e instanceof ItemNotFoundError) return notFound("item_not_found");
    return badRequest("remove_failed");
  }
}

export async function reorderItemsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const collectionId = url.searchParams.get("collectionId");
  if (!collectionId) return badRequest("collectionId_required");
  const body = await safeJson<{ itemIds: string[] }>(req);
  if (!body || !Array.isArray(body.itemIds)) return badRequest("invalid_body");
  try {
    const c = await build(ctx).resources.reorderItems(ctx.actor, collectionId, body.itemIds);
    return json({ ok: true, collection: c });
  } catch (e) {
    if (e instanceof CollectionNotFoundError) return notFound("not_found");
    return badRequest("reorder_failed");
  }
}

export async function seedHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const result = await build(ctx).resources.seedDefaults(ctx.actor);
  return json({ ok: true, ...result });
}
