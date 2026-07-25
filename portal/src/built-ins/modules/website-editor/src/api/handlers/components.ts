// R028 — Component handlers.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import type { Block } from "../../types/block";
import {
  createComponent, listComponents, getComponent, updateComponent, deleteComponent,
  COMPONENT_CATEGORIES, type ComponentCategory,
} from "../../server/components";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

// GET /components — full list
export async function handleListComponents(_req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const components = await listComponents(ctx.storage, scope.agencyId, scope.clientId);
  return ok({ components, categories: COMPONENT_CATEGORIES });
}

// GET /components/get?id=…
export async function handleGetComponent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.id) return fail("id required", 400);
  const rec = await getComponent(ctx.storage, scope.agencyId, scope.clientId, q.id);
  if (!rec) return fail("component not found", 404);
  return ok({ component: rec });
}

// POST /components — body { name, tree, category?, description? }
export async function handleCreateComponent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{
    name?: string; tree?: Block[]; category?: ComponentCategory; description?: string;
  }>(req);
  if (!body?.name) return fail("name required", 400);
  if (!Array.isArray(body.tree)) return fail("tree (Block[]) required", 400);
  if (body.category && !(COMPONENT_CATEGORIES as readonly string[]).includes(body.category)) {
    return fail("invalid category", 400);
  }
  const rec = await createComponent(ctx.storage, {
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    name: body.name,
    tree: body.tree,
    ...(body.category ? { category: body.category } : {}),
    ...(body.description ? { description: body.description } : {}),
    createdBy: String(ctx.actor ?? "u_unknown"),
  });
  return ok({ component: rec }, { status: 201 });
}

// PATCH /components?id=…  body UpdateComponentPatch
export async function handleUpdateComponent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.id) return fail("id required", 400);
  const body = await readJsonBody<{
    name?: string; tree?: Block[]; category?: ComponentCategory; description?: string;
  }>(req);
  if (!body) return fail("body required", 400);
  if (body.category && !(COMPONENT_CATEGORIES as readonly string[]).includes(body.category)) {
    return fail("invalid category", 400);
  }
  const next = await updateComponent(ctx.storage, scope.agencyId, scope.clientId, q.id, body);
  if (!next) return fail("component not found", 404);
  return ok({ component: next });
}

// DELETE /components?id=…
export async function handleDeleteComponent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.id) return fail("id required", 400);
  const removed = await deleteComponent(ctx.storage, scope.agencyId, scope.clientId, q.id);
  if (!removed) return fail("component not found", 404);
  return ok({ id: q.id });
}
