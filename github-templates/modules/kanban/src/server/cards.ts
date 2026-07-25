// CardService — card CRUD + reorder + archive/restore.
//
// Storage layout:
//   cards/by-id/<id>           → Card
//   cards/by-board/<boardId>   → string[] of card ids in this board
//                                (ordering is read from card.order)

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Card,
  CardFilter,
  CreateCardInput,
  UpdateCardPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const cardKey = (id: string): string => `cards/by-id/${id}`;
const byBoardKey = (boardId: string): string => `cards/by-board/${boardId}`;

export class CardService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId | undefined,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(c: Card): boolean {
    return c.agencyId === this.agencyId &&
      (this.clientId ? c.clientId === this.clientId : !c.clientId);
  }

  private async getRaw(id: string): Promise<Card | null> {
    const c = await this.storage.get<Card>(cardKey(id));
    return c && this.inScope(c) ? c : null;
  }

  async get(id: string): Promise<Card | null> {
    return this.getRaw(id);
  }

  async listByBoard(boardId: string, includeArchived = false): Promise<Card[]> {
    const ids = (await this.storage.get<string[]>(byBoardKey(boardId))) ?? [];
    const out: Card[] = [];
    for (const id of ids) {
      const c = await this.getRaw(id);
      if (!c) continue;
      if (!includeArchived && c.status === "archived") continue;
      out.push(c);
    }
    return out.sort((a, b) => a.order - b.order);
  }

  async list(filter?: CardFilter): Promise<Card[]> {
    if (filter?.boardId) {
      const all = await this.listByBoard(filter.boardId, filter.status === "archived");
      return this.applyFilter(all, filter);
    }
    // Cross-board scan — used by ArchivedCardsPage.
    const keys = await this.storage.list("cards/by-board/");
    const out: Card[] = [];
    for (const k of keys) {
      const ids = (await this.storage.get<string[]>(k)) ?? [];
      for (const id of ids) {
        const c = await this.getRaw(id);
        if (c) out.push(c);
      }
    }
    return this.applyFilter(out, filter);
  }

  private applyFilter(rows: Card[], filter?: CardFilter): Card[] {
    const q = filter?.query?.toLowerCase().trim();
    return rows
      .filter(c => !filter?.columnId || c.columnId === filter.columnId)
      .filter(c => !filter?.status || c.status === filter.status)
      .filter(c => filter?.status ? true : c.status === "active")
      .filter(c => !filter?.tag || c.tags.includes(filter.tag))
      .filter(c => !filter?.assigneeUserId || c.assigneeUserId === filter.assigneeUserId)
      .filter(c => !q || `${c.title} ${c.description ?? ""}`.toLowerCase().includes(q));
  }

  async create(input: CreateCardInput, actor: UserId): Promise<Card> {
    if (!input.title.trim()) throw new Error("Card title required.");
    const id = makeId("crd");
    const ts = now();
    // Append to the end of the column.
    const peers = await this.listByBoard(input.boardId);
    const colPeers = peers.filter(c => c.columnId === input.columnId);
    const order = colPeers.length;
    const card: Card = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      boardId: input.boardId,
      columnId: input.columnId,
      order,
      title: input.title.trim(),
      description: input.description?.trim(),
      assigneeUserId: input.assigneeUserId,
      dueAt: input.dueAt,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(cardKey(id), card);
    const ix = (await this.storage.get<string[]>(byBoardKey(input.boardId))) ?? [];
    if (!ix.includes(id)) await this.storage.set(byBoardKey(input.boardId), [...ix, id]);
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.card.created",
      message: `Created card "${card.title}".`,
      metadata: { cardId: id, boardId: input.boardId, columnId: input.columnId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.card.created", { cardId: id, boardId: input.boardId });
    return card;
  }

  async update(id: string, patch: UpdateCardPatch, actor: UserId): Promise<Card | null> {
    const existing = await this.getRaw(id);
    if (!existing) return null;
    const next: Card = {
      ...existing,
      title: patch.title?.trim() ?? existing.title,
      description: patch.description !== undefined
        ? (patch.description?.trim() || undefined)
        : existing.description,
      assigneeUserId: patch.assigneeUserId === null
        ? undefined
        : patch.assigneeUserId ?? existing.assigneeUserId,
      dueAt: patch.dueAt === null ? undefined : patch.dueAt ?? existing.dueAt,
      tags: patch.tags ?? existing.tags,
      metadata: patch.metadata ?? existing.metadata,
      updatedAt: now(),
    };
    await this.storage.set(cardKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.card.updated",
      message: `Updated card "${next.title}".`,
      metadata: { cardId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.card.updated", { cardId: id });
    return next;
  }

  // Move a card to a (possibly different) column at a specific index.
  // Renormalizes order on both source and destination columns.
  async moveCard(cardId: string, toColumnId: string, toIndex: number, actor: UserId): Promise<Card | null> {
    const card = await this.getRaw(cardId);
    if (!card) return null;
    const fromColumnId = card.columnId;
    const peers = await this.listByBoard(card.boardId);

    const srcCol = peers.filter(c => c.columnId === fromColumnId && c.id !== cardId);
    const dstColRaw = fromColumnId === toColumnId
      ? srcCol
      : peers.filter(c => c.columnId === toColumnId);

    const moved: Card = { ...card, columnId: toColumnId };
    const dst = [...dstColRaw];
    const target = Math.max(0, Math.min(toIndex, dst.length));
    dst.splice(target, 0, moved);

    const renumberedDst = dst.map((c, i) => ({ ...c, order: i, updatedAt: now() }));
    const renumberedSrc = fromColumnId === toColumnId
      ? []
      : srcCol.map((c, i) => ({ ...c, order: i, updatedAt: now() }));

    for (const c of [...renumberedDst, ...renumberedSrc]) {
      await this.storage.set(cardKey(c.id), c);
    }
    const movedFinal = renumberedDst.find(c => c.id === cardId) ?? null;

    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.card.moved",
      message: `Moved card "${card.title}".`,
      metadata: { cardId, fromColumnId, toColumnId, toIndex: target },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.card.moved", { cardId, fromColumnId, toColumnId, toIndex: target });
    return movedFinal;
  }

  async archive(cardId: string, actor: UserId): Promise<Card | null> {
    const existing = await this.getRaw(cardId);
    if (!existing) return null;
    if (existing.status === "archived") return existing;
    // Renumber peers in the source column to close the gap.
    const peers = await this.listByBoard(existing.boardId);
    const remaining = peers
      .filter(c => c.columnId === existing.columnId && c.id !== cardId)
      .map((c, i) => ({ ...c, order: i, updatedAt: now() }));
    const next: Card = { ...existing, status: "archived", updatedAt: now() };
    await this.storage.set(cardKey(cardId), next);
    for (const c of remaining) await this.storage.set(cardKey(c.id), c);
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.card.archived",
      message: `Archived card "${existing.title}".`,
      metadata: { cardId, boardId: existing.boardId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.card.archived", { cardId });
    return next;
  }

  async restore(cardId: string, actor: UserId): Promise<Card | null> {
    const existing = await this.getRaw(cardId);
    if (!existing) return null;
    if (existing.status === "active") return existing;
    // Append back to the end of its (still-existing) column.
    const peers = await this.listByBoard(existing.boardId);
    const colPeers = peers.filter(c => c.columnId === existing.columnId);
    const next: Card = { ...existing, status: "active", order: colPeers.length, updatedAt: now() };
    await this.storage.set(cardKey(cardId), next);
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.card.restored",
      message: `Restored card "${existing.title}".`,
      metadata: { cardId, boardId: existing.boardId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "kanban.card.restored", { cardId });
    return next;
  }

  async delete(cardId: string, actor: UserId): Promise<boolean> {
    const existing = await this.getRaw(cardId);
    if (!existing) return false;
    await this.storage.del(cardKey(cardId));
    const ix = (await this.storage.get<string[]>(byBoardKey(existing.boardId))) ?? [];
    await this.storage.set(byBoardKey(existing.boardId), ix.filter(i => i !== cardId));
    await this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "kanban", action: "kanban.card.archived",
      message: `Deleted card "${existing.title}".`,
      metadata: { cardId, boardId: existing.boardId, hardDelete: true },
    });
    return true;
  }

  // Internal — used by BoardService when creating from a template
  // to insert the seeded cards.
  async _seedCards(seeds: Array<{ boardId: string; columnId: string; title: string; description?: string; tags?: string[] }>, actor: UserId): Promise<Card[]> {
    const out: Card[] = [];
    for (const s of seeds) {
      out.push(await this.create({
        boardId: s.boardId,
        columnId: s.columnId,
        title: s.title,
        description: s.description,
        tags: s.tags,
      }, actor));
    }
    return out;
  }
}
