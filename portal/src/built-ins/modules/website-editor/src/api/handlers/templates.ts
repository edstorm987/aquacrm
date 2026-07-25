// R006 — Template marketplace handlers.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import type { Block } from "../../types/block";
import {
  listAllTemplates,
  saveTemplate,
  deleteSavedTemplate,
  filterTemplates,
  bumpInstallCount,
  listFeaturedIds,
  setFeaturedIds,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from "../../server/templateMarketplace";
import { fail, ok, readJsonBody, readQuery } from "../helpers";

// GET /templates?q=…&category=…&tag=…&sort=newest|most-installed — gallery feed.
export async function handleListTemplates(req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const all = await listAllTemplates(ctx.storage, ctx.agencyId);
  const q = readQuery(req);
  const filter: Parameters<typeof filterTemplates>[1] = {};
  if (q.q) filter.query = q.q;
  if (q.tag) filter.tag = q.tag;
  if (q.category && (TEMPLATE_CATEGORIES as readonly string[]).includes(q.category)) {
    filter.category = q.category as TemplateCategory;
  }
  if (q.sort === "newest" || q.sort === "most-installed") filter.sort = q.sort;
  const templates = filterTemplates(all, filter);
  return ok({ templates, categories: TEMPLATE_CATEGORIES });
}

// POST /templates/install-tick?id=… — bumps the install counter on
// `applyStarterVariant`. Operator UI (or applyStarterVariant itself) calls
// this so "most-installed" sort is meaningful.
export async function handleInstallTick(req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const q = readQuery(req);
  if (!q.id) return fail("id required", 400);
  const next = await bumpInstallCount(ctx.storage, ctx.agencyId, q.id);
  return ok({ id: q.id, installCount: next });
}

// GET /templates/featured — featured row template ids per agency.
export async function handleGetFeatured(_req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const ids = await listFeaturedIds(ctx.storage, ctx.agencyId);
  return ok({ featured: ids });
}

// POST /templates/featured — body { ids: string[] }, max 8.
export async function handleSetFeatured(req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const body = await readJsonBody<{ ids?: unknown }>(req);
  if (!body || !Array.isArray(body.ids)) return fail("ids (string[]) required", 400);
  const cleaned = await setFeaturedIds(
    ctx.storage,
    ctx.agencyId,
    body.ids.map(s => String(s ?? "")),
  );
  return ok({ featured: cleaned });
}

// POST /templates — operator saves the current page as a template.
// body: { label, description?, tags?, coverUrl?, blocks }
export async function handleSaveTemplate(req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const body = await readJsonBody<{
    label?: string;
    description?: string;
    tags?: string[];
    coverUrl?: string;
    blocks?: Block[];
  }>(req);
  if (!body?.label) return fail("label required", 400);
  if (!Array.isArray(body.blocks)) return fail("blocks (BlockTree[]) required", 400);
  const saved = await saveTemplate(ctx.storage, ctx.agencyId, {
    label: body.label,
    ...(body.description ? { description: body.description } : {}),
    ...(body.tags ? { tags: body.tags } : {}),
    ...(body.coverUrl ? { coverUrl: body.coverUrl } : {}),
    blocks: body.blocks,
    savedBy: String(ctx.actor ?? "u_unknown"),
  });
  return ok({ template: saved }, { status: 201 });
}

// DELETE /templates?id=...
export async function handleDeleteTemplate(req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const q = readQuery(req);
  if (!q.id) return fail("id required", 400);
  const removed = await deleteSavedTemplate(ctx.storage, ctx.agencyId, q.id);
  if (!removed) return fail("template not found", 404);
  return ok({ id: q.id });
}
