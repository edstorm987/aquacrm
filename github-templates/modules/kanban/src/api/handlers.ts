// HTTP handlers for the kanban plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { listTemplates, listTemplatesForRoles } from "../server/templates";
import type {
  CardFilter,
  CreateBoardInput,
  CreateCardInput,
  UpdateBoardPatch,
  UpdateCardPatch,
} from "../lib/domain";

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

// ─── Templates ─────────────────────────────────────────────────────────

export async function listTemplatesHandler(req: Request, _ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  // Honour ?role=foo[,bar] so role-gated templates (e.g. founder-todos)
  // stay hidden from non-matching operators.
  const url = new URL(req.url);
  const roleParam = url.searchParams.get("role");
  if (roleParam) {
    const roles = roleParam.split(",").map(r => r.trim()).filter(Boolean);
    return json({ ok: true, templates: listTemplatesForRoles(roles) });
  }
  return json({ ok: true, templates: listTemplates() });
}

// ─── Boards ────────────────────────────────────────────────────────────

export async function listBoardsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, boards: await build(ctx).boards.list() });
}

export async function createBoardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateBoardInput>(req);
  if (!body?.name || !body?.scope) return badRequest("name and scope required.");
  try {
    const c = build(ctx);
    const { board, cardSeeds } = await c.boards.create(body, ctx.actor);
    if (cardSeeds.length) {
      await c.cards._seedCards(cardSeeds.map(s => ({ ...s, boardId: board.id })), ctx.actor);
    }
    return json({ ok: true, board }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function getBoardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const board = await build(ctx).boards.get(id);
  return board ? json({ ok: true, board }) : notFound("board not found");
}

export async function updateBoardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateBoardPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  const board = await build(ctx).boards.update(body.id, body.patch ?? {}, ctx.actor);
  return board ? json({ ok: true, board }) : notFound("board not found");
}

export async function archiveBoardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const board = await build(ctx).boards.archive(id, ctx.actor);
  return board ? json({ ok: true, board }) : notFound("board not found");
}

// ─── Columns ───────────────────────────────────────────────────────────

export async function addColumnHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ boardId: string; label: string; color?: string }>(req);
  if (!body?.boardId || !body.label) return badRequest("boardId + label required.");
  try {
    const col = await build(ctx).boards.addColumn(body.boardId, body.label, ctx.actor, body.color);
    return col ? json({ ok: true, column: col }, 201) : notFound("board not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateColumnHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ boardId: string; columnId: string; label?: string; color?: string }>(req);
  if (!body?.boardId || !body.columnId) return badRequest("boardId + columnId required.");
  try {
    const c = build(ctx);
    let col = null;
    if (body.label !== undefined) {
      col = await c.boards.renameColumn(body.boardId, body.columnId, body.label, ctx.actor);
    }
    if (body.color !== undefined) {
      col = await c.boards.recolorColumn(body.boardId, body.columnId, body.color || undefined, ctx.actor);
    }
    return col ? json({ ok: true, column: col }) : notFound("column not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function moveColumnHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ boardId: string; columnId: string; toIndex: number }>(req);
  if (!body?.boardId || !body.columnId || typeof body.toIndex !== "number") {
    return badRequest("boardId + columnId + toIndex required.");
  }
  const board = await build(ctx).boards.moveColumn(body.boardId, body.columnId, body.toIndex, ctx.actor);
  return board ? json({ ok: true, board }) : notFound("board/column not found");
}

export async function removeColumnHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  const columnId = url.searchParams.get("columnId");
  if (!boardId || !columnId) return badRequest("boardId + columnId required.");
  try {
    const c = build(ctx);
    const cards = await c.cards.list({ boardId, columnId, status: "active" });
    const board = await c.boards.removeColumn(boardId, columnId, cards.length > 0, ctx.actor);
    return board ? json({ ok: true, board }) : notFound("board not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Cards ─────────────────────────────────────────────────────────────

export async function listCardsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: CardFilter = {
    boardId: url.searchParams.get("boardId") ?? undefined,
    columnId: url.searchParams.get("columnId") ?? undefined,
    status: (url.searchParams.get("status") ?? undefined) as CardFilter["status"],
    query: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    assigneeUserId: url.searchParams.get("assigneeUserId") ?? undefined,
  };
  return json({ ok: true, cards: await build(ctx).cards.list(filter) });
}

export async function createCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateCardInput>(req);
  if (!body?.boardId || !body.columnId || !body.title) {
    return badRequest("boardId + columnId + title required.");
  }
  try {
    const card = await build(ctx).cards.create(body, ctx.actor);
    return json({ ok: true, card }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateCardPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  const card = await build(ctx).cards.update(body.id, body.patch ?? {}, ctx.actor);
  return card ? json({ ok: true, card }) : notFound("card not found");
}

export async function moveCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ cardId: string; toColumnId: string; toIndex: number }>(req);
  if (!body?.cardId || !body.toColumnId || typeof body.toIndex !== "number") {
    return badRequest("cardId + toColumnId + toIndex required.");
  }
  const card = await build(ctx).cards.moveCard(body.cardId, body.toColumnId, body.toIndex, ctx.actor);
  return card ? json({ ok: true, card }) : notFound("card not found");
}

export async function archiveCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const card = await build(ctx).cards.archive(id, ctx.actor);
  return card ? json({ ok: true, card }) : notFound("card not found");
}

export async function restoreCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const card = await build(ctx).cards.restore(body.id, ctx.actor);
  return card ? json({ ok: true, card }) : notFound("card not found");
}
