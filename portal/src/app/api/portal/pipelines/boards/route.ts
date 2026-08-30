import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { logActivity } from "@/server/activity";
import {
  createPipeline,
  getPipeline,
  deletePipeline,
  listCards,
  moveCard,
  updatePipeline,
} from "@/server/pipelines";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES, type PipelineColumn } from "@/server/types";

// Ed's own kanbans — board CRUD (2026-08-30: *"i want to be able to create my
// own in the app please permission gated of course"*).
//
// CUSTOM boards only, on every verb. The seeded leads/fulfilment/sales boards
// carry product semantics — lead journey stages, FULFILMENT_STAGE_TO_COLUMN —
// and editing or deleting them here would break the seed's idempotency
// contract and the surfaces built on those columns. The wall is the
// `kind === "custom"` check, not trust in the UI.
//
// Gate: `growth.leads` at manage. The growth workspace joined the governed set
// today for exactly this feature; owners/managers hold manage through the
// legacy levels, and a delegated grant can widen or narrow it per person.

const MAX_COLUMNS = 12;
const MAX_NAME = 80;
const MAX_COLUMN_LABEL = 40;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function cleanColumns(raw: unknown): PipelineColumn[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_COLUMNS) return null;
  const seen = new Set<string>();
  const columns: PipelineColumn[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") return null;
    const label = typeof (entry as { label?: unknown }).label === "string"
      ? ((entry as { label: string }).label).trim().slice(0, MAX_COLUMN_LABEL)
      : "";
    if (!label) return null;
    const color = typeof (entry as { color?: unknown }).color === "string"
      && HEX.test((entry as { color: string }).color)
      ? (entry as { color: string }).color
      : undefined;
    // Server-generated ids: slug of the label, uniquified — the id is storage
    // identity and must not be a value the browser invents.
    let id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `column-${index + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    columns.push({ id, label, ...(color ? { color } : {}), order: index });
  }
  return columns;
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    await requireCurrentWorkspaceElementAccess("growth", "growth.leads", "manage");

    const body = await request.json().catch(() => null) as { name?: unknown; columns?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "";
    if (!name) return NextResponse.json({ ok: false, error: "Give the board a name." }, { status: 400 });
    const columns = cleanColumns(body?.columns);
    if (!columns) return NextResponse.json({ ok: false, error: "A board needs 1–12 named columns." }, { status: 400 });

    const board = createPipeline({
      agencyId: session.agencyId,
      kind: "custom",
      name,
      columns,
      allowedCardKinds: ["custom"],
    });

    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "settings",
      action: "kanban.board_created",
      message: `${session.email} created the "${name}" board.`,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, board: { id: board.id, slug: board.slug, name: board.name } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    await requireCurrentWorkspaceElementAccess("growth", "growth.leads", "manage");

    const body = await request.json().catch(() => null) as { boardId?: unknown; name?: unknown; columns?: unknown } | null;
    const boardId = typeof body?.boardId === "string" ? body.boardId : "";
    const board = boardId ? getPipeline(boardId) : null;
    if (!board || board.agencyId !== session.agencyId) {
      return NextResponse.json({ ok: false, error: "board not found" }, { status: 404 });
    }
    if (board.kind !== "custom") {
      return NextResponse.json({ ok: false, error: "Only custom boards can be edited here." }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME) : undefined;
    const columns = body?.columns !== undefined ? cleanColumns(body.columns) : undefined;
    if (body?.columns !== undefined && !columns) {
      return NextResponse.json({ ok: false, error: "A board needs 1–12 named columns." }, { status: 400 });
    }

    if (columns) {
      // Re-home before the columns change: the board silently HIDES any card
      // whose column no longer exists, so a column delete without this strands
      // cards invisibly — there one moment, unreachable the next.
      const keep = new Set(columns.map(column => column.id));
      const fallback = columns[0]!.id;
      for (const card of listCards(board.id)) {
        if (!keep.has(card.columnId)) moveCard(session.agencyId, card.id, fallback);
      }
    }

    updatePipeline(session.agencyId, board.id, {
      ...(name ? { name } : {}),
      ...(columns ? { columns } : {}),
    });
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
    await requireCurrentWorkspaceElementAccess("growth", "growth.leads", "manage");

    const body = await request.json().catch(() => null) as { boardId?: unknown } | null;
    const boardId = typeof body?.boardId === "string" ? body.boardId : "";
    const board = boardId ? getPipeline(boardId) : null;
    if (!board || board.agencyId !== session.agencyId) {
      return NextResponse.json({ ok: false, error: "board not found" }, { status: 404 });
    }
    if (board.kind !== "custom") {
      return NextResponse.json({ ok: false, error: "The built-in boards cannot be deleted." }, { status: 400 });
    }
    deletePipeline(session.agencyId, board.id);
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "settings",
      action: "kanban.board_deleted",
      message: `${session.email} deleted the "${board.name}" board.`,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
