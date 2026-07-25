// BoardService — board + column CRUD and reorder.
//
// Storage layout:
//   boards/index            → string[] of board ids
//   boards/by-id/<id>       → Board

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Board,
  BoardScope,
  Column,
  CreateBoardInput,
  TemplateId,
  UpdateBoardPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { getTemplate } from "./templates";

const INDEX_KEY = "boards/index";
const boardKey = (id: string): string => `boards/by-id/${id}`;

export class BoardService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId | undefined,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private scope(): BoardScope {
    return this.clientId ? "client" : "agency";
  }

  private inScope(b: Board): boolean {
    return b.agencyId === this.agencyId &&
      (this.clientId ? b.clientId === this.clientId : !b.clientId);
  }

  async list(): Promise<Board[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: Board[] = [];
    for (const id of ids) {
      const b = await this.storage.get<Board>(boardKey(id));
      if (b && this.inScope(b)) out.push(b);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Board | null> {
    const b = await this.storage.get<Board>(boardKey(id));
    return b && this.inScope(b) ? b : null;
  }

  async create(input: CreateBoardInput, actor: UserId): Promise<{ board: Board; cardSeeds: { columnId: string; title: string; description?: string; tags?: string[] }[] }> {
    if (!input.name?.trim()) throw new Error("Board name required.");
    if (input.scope === "client" && !this.clientId) {
      throw new Error("Cannot create client-scoped board outside a client context.");
    }
    if (input.scope === "agency" && this.clientId) {
      throw new Error("Cannot create agency-scoped board inside a client context.");
    }

    let columns: Column[];
    let cardSeeds: { columnId: string; title: string; description?: string; tags?: string[] }[] = [];
    if (input.templateId) {
      const tpl = getTemplate(input.templateId);
      if (tpl.requiresScope && tpl.requiresScope !== input.scope) {
        throw new Error(`Template ${tpl.id} requires scope ${tpl.requiresScope}, got ${input.scope}.`);
      }
      columns = tpl.columns.map((c, i) => ({
        id: makeId("col"),
        label: c.label,
        order: i,
        color: c.color,
      }));
      cardSeeds = tpl.cards.map(c => {
        const col = columns[c.columnIndex];
        if (!col) throw new Error(`Template ${input.templateId} card references missing column index ${c.columnIndex}.`);
        return {
          columnId: col.id,
          title: c.title,
          description: c.description,
          tags: c.tags,
        };
      });
    } else if (input.columns?.length) {
      columns = input.columns.map((c, i) => ({
        id: makeId("col"),
        label: c.label,
        order: i,
        color: c.color,
      }));
    } else {
      columns = [{ id: makeId("col"), label: "To do", order: 0 }];
    }

    const id = makeId("brd");
    const ts = now();
    const board: Board = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      scope: this.scope(),
      name: input.name.trim(),
      description: input.description?.trim(),
      templateId: input.templateId,
      columns,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(boardKey(id), board);
    const ix = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ix.includes(id)) await this.storage.set(INDEX_KEY, [...ix, id]);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "kanban",
      action: "kanban.board.created",
      message: `Created board "${board.name}"${input.templateId ? ` from template ${input.templateId}` : ""}.`,
      metadata: { boardId: id, templateId: input.templateId, scope: board.scope },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.board.created", { boardId: id, templateId: input.templateId });
    return { board, cardSeeds };
  }

  async update(id: string, patch: UpdateBoardPatch, actor: UserId): Promise<Board | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: Board = {
      ...existing,
      name: patch.name?.trim() ?? existing.name,
      description: patch.description?.trim() ?? existing.description,
      status: patch.status ?? existing.status,
      updatedAt: now(),
    };
    await this.storage.set(boardKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "kanban",
      action: "kanban.board.updated",
      message: `Updated board "${next.name}".`,
      metadata: { boardId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.board.updated", { boardId: id });
    return next;
  }

  async archive(id: string, actor: UserId): Promise<Board | null> {
    const next = await this.update(id, { status: "archived" }, actor);
    if (next) {
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
        "kanban.board.archived", { boardId: id });
    }
    return next;
  }

  // ─── Column ops ────────────────────────────────────────────────────────

  async addColumn(boardId: string, label: string, actor: UserId, color?: string): Promise<Column | null> {
    const board = await this.get(boardId);
    if (!board) return null;
    if (!label.trim()) throw new Error("Column label required.");
    const col: Column = {
      id: makeId("col"),
      label: label.trim(),
      order: board.columns.length,
      color,
    };
    const next: Board = { ...board, columns: [...board.columns, col], updatedAt: now() };
    await this.storage.set(boardKey(boardId), next);
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.column.added",
      message: `Added column "${col.label}" to "${board.name}".`,
      metadata: { boardId, columnId: col.id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.column.added", { boardId, columnId: col.id });
    return col;
  }

  async renameColumn(boardId: string, columnId: string, label: string, actor: UserId): Promise<Column | null> {
    const board = await this.get(boardId);
    if (!board) return null;
    if (!label.trim()) throw new Error("Column label required.");
    const idx = board.columns.findIndex(c => c.id === columnId);
    if (idx < 0) return null;
    const before = board.columns[idx]!;
    const updated: Column = { ...before, label: label.trim() };
    const cols = [...board.columns];
    cols[idx] = updated;
    await this.storage.set(boardKey(boardId), { ...board, columns: cols, updatedAt: now() });
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.column.renamed",
      message: `Renamed column "${before.label}" → "${updated.label}".`,
      metadata: { boardId, columnId, from: before.label, to: updated.label },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.column.renamed", { boardId, columnId });
    return updated;
  }

  async recolorColumn(boardId: string, columnId: string, color: string | undefined, actor: UserId): Promise<Column | null> {
    const board = await this.get(boardId);
    if (!board) return null;
    const idx = board.columns.findIndex(c => c.id === columnId);
    if (idx < 0) return null;
    const updated: Column = { ...board.columns[idx]!, color };
    const cols = [...board.columns];
    cols[idx] = updated;
    await this.storage.set(boardKey(boardId), { ...board, columns: cols, updatedAt: now() });
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.column.renamed",
      message: `Recolored column "${updated.label}".`,
      metadata: { boardId, columnId, color },
    });
    return updated;
  }

  async moveColumn(boardId: string, columnId: string, toIndex: number, actor: UserId): Promise<Board | null> {
    const board = await this.get(boardId);
    if (!board) return null;
    const idx = board.columns.findIndex(c => c.id === columnId);
    if (idx < 0) return null;
    const cols = [...board.columns];
    const [moved] = cols.splice(idx, 1);
    if (!moved) return null;
    const target = Math.max(0, Math.min(toIndex, cols.length));
    cols.splice(target, 0, moved);
    const renumbered = cols.map((c, i) => ({ ...c, order: i }));
    const next: Board = { ...board, columns: renumbered, updatedAt: now() };
    await this.storage.set(boardKey(boardId), next);
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.column.reordered",
      message: `Moved column "${moved.label}" to position ${target}.`,
      metadata: { boardId, columnId, toIndex: target },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.column.reordered", { boardId, columnId, toIndex: target });
    return next;
  }

  // Returns the removed column id when successful. Cards in the
  // removed column must be moved or archived first by the caller —
  // refuses if hasCards is true.
  async removeColumn(boardId: string, columnId: string, hasCards: boolean, actor: UserId): Promise<Board | null> {
    if (hasCards) throw new Error("Column still has cards; move or archive them first.");
    const board = await this.get(boardId);
    if (!board) return null;
    if (board.columns.length <= 1) {
      throw new Error("Cannot remove the last column on a board.");
    }
    const idx = board.columns.findIndex(c => c.id === columnId);
    if (idx < 0) return null;
    const removed = board.columns[idx]!;
    const cols = board.columns
      .filter(c => c.id !== columnId)
      .map((c, i) => ({ ...c, order: i }));
    const next: Board = { ...board, columns: cols, updatedAt: now() };
    await this.storage.set(boardKey(boardId), next);
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.column.removed",
      message: `Removed column "${removed.label}".`,
      metadata: { boardId, columnId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.column.removed", { boardId, columnId });
    return next;
  }
}
