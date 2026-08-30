import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { parseCustomCardPayload } from "@/server/customBoardCards";
import {
  addCard,
  deleteCard,
  getPipeline,
  moveCard,
  updateCardPayload,
} from "@/server/pipelines";
import { ensureHydrated, flushPendingWrites, getState } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Free-text cards on Ed's own kanbans.
//
// Every handler resolves the card's PIPELINE and refuses unless it is
// `kind: "custom"`. That check is the wall keeping this free-card API off lead
// cards (whose moves emit journey events) and off fulfilment cards (whose
// moves must go through move-client's product-stage transactions). The gate is
// `growth.leads` at use — moving your own cards is working the board, not
// managing it.

function customBoardForCard(agencyId: string, cardId: string) {
  const card = getState().pipelineCards[cardId];
  if (!card) return null;
  const board = getPipeline(card.pipelineId);
  if (!board || board.agencyId !== agencyId || board.kind !== "custom") return null;
  return { card, board };
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    await requireCurrentWorkspaceElementAccess("growth", "growth.leads", "use");

    const body = await request.json().catch(() => null) as
      { boardId?: unknown; columnId?: unknown; title?: unknown; note?: unknown } | null;
    const boardId = typeof body?.boardId === "string" ? body.boardId : "";
    const board = boardId ? getPipeline(boardId) : null;
    if (!board || board.agencyId !== session.agencyId || board.kind !== "custom") {
      return NextResponse.json({ ok: false, error: "board not found" }, { status: 404 });
    }
    const columnId = typeof body?.columnId === "string" ? body.columnId : "";
    const payload = parseCustomCardPayload({ title: body?.title, note: body?.note });
    if (!payload) return NextResponse.json({ ok: false, error: "A card needs a title (200 characters at most)." }, { status: 400 });

    const card = addCard(session.agencyId, board.id, { kind: "custom", payload: payload as never, columnId });
    if (!card) return NextResponse.json({ ok: false, error: "That column does not exist on this board." }, { status: 400 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, card: { id: card.id, columnId: card.columnId } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    await requireCurrentWorkspaceElementAccess("growth", "growth.leads", "use");

    const body = await request.json().catch(() => null) as
      { cardId?: unknown; title?: unknown; note?: unknown; columnId?: unknown } | null;
    const cardId = typeof body?.cardId === "string" ? body.cardId : "";
    const found = cardId ? customBoardForCard(session.agencyId, cardId) : null;
    if (!found) return NextResponse.json({ ok: false, error: "card not found" }, { status: 404 });

    if (body?.title !== undefined || body?.note !== undefined) {
      const existing = found.card.kind === "custom" ? found.card.payload as Record<string, unknown> : {};
      const payload = parseCustomCardPayload({
        title: body?.title ?? existing.title,
        note: body?.note ?? existing.note,
      });
      if (!payload) return NextResponse.json({ ok: false, error: "A card needs a title (200 characters at most)." }, { status: 400 });
      updateCardPayload(session.agencyId, cardId, payload as never);
    }
    if (typeof body?.columnId === "string" && body.columnId) {
      const moved = moveCard(session.agencyId, cardId, body.columnId);
      if (!moved) return NextResponse.json({ ok: false, error: "That column does not exist on this board." }, { status: 400 });
    }
    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    await requireCurrentWorkspaceElementAccess("growth", "growth.leads", "use");

    const body = await request.json().catch(() => null) as { cardId?: unknown } | null;
    const cardId = typeof body?.cardId === "string" ? body.cardId : "";
    const found = cardId ? customBoardForCard(session.agencyId, cardId) : null;
    if (!found) return NextResponse.json({ ok: false, error: "card not found" }, { status: 404 });
    deleteCard(session.agencyId, cardId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
