// R022 — Page version handlers (auto-save + named).

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import type { Block } from "../../types/block";
import {
  saveVersion, listVersions, getVersion, deleteVersion, renameVersion,
} from "../../server/pageVersions";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

// POST /pages/versions — body { pageId, blocks, label? }
export async function handleSaveVersion(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ pageId?: string; blocks?: Block[]; label?: string }>(req);
  if (!body?.pageId) return fail("pageId required", 400);
  if (!Array.isArray(body.blocks)) return fail("blocks (Block[]) required", 400);
  const result = await saveVersion(ctx.storage, {
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    pageId: body.pageId,
    blocks: body.blocks,
    savedBy: String(ctx.actor ?? "u_unknown"),
    ...(body.label ? { label: body.label } : {}),
  });
  return ok({ version: result.version, pruned: result.pruned }, { status: 201 });
}

// GET /pages/versions?pageId=…&limit=…
export async function handleListVersions(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.pageId) return fail("pageId required", 400);
  const limit = q.limit ? Math.max(1, Math.min(100, Number(q.limit))) : undefined;
  const versions = await listVersions(ctx.storage, scope.agencyId, scope.clientId, q.pageId, limit);
  return ok({ versions });
}

// GET /pages/versions/get?pageId=…&versionId=…
export async function handleGetVersion(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.pageId) return fail("pageId required", 400);
  if (!q.versionId) return fail("versionId required", 400);
  const v = await getVersion(ctx.storage, scope.agencyId, scope.clientId, q.pageId, q.versionId);
  if (!v) return fail("version not found", 404);
  return ok({ version: v });
}

// DELETE /pages/versions?pageId=…&versionId=…
export async function handleDeleteVersion(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.pageId) return fail("pageId required", 400);
  if (!q.versionId) return fail("versionId required", 400);
  const removed = await deleteVersion(ctx.storage, scope.agencyId, scope.clientId, q.pageId, q.versionId);
  if (!removed) return fail("version not found", 404);
  return ok({ id: q.versionId });
}

// PATCH /pages/versions?pageId=…&versionId=…  body { label }
export async function handleRenameVersion(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.pageId) return fail("pageId required", 400);
  if (!q.versionId) return fail("versionId required", 400);
  const body = await readJsonBody<{ label?: string }>(req);
  if (typeof body?.label !== "string") return fail("label (string) required", 400);
  const next = await renameVersion(ctx.storage, scope.agencyId, scope.clientId, q.pageId, q.versionId, body.label);
  if (!next) return fail("version not found", 404);
  return ok({ version: next });
}
