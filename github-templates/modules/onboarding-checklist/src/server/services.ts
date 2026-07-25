// Onboarding-checklist service.
//
// Storage layout (per-install — install is per-client):
//   items/index               → string[] of item ids in scope
//   items/by-id/<id>          → ChecklistItem
//   seed/done                 → 1 once defaults seeded (idempotent flag)
//   completion/done           → 1 once 100% emitted (so re-tick doesn't re-emit)

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  BulkTickEntry,
  ChecklistItem,
  ChecklistStatus,
  CompletionPct,
  CreateChecklistItemInput,
  OwnerKind,
  UpdateChecklistItemPatch,
} from "../lib/domain";
import { DEFAULT_SEED_ITEMS } from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  KanbanPort,
  StoragePort,
} from "./ports";

const ITEM_INDEX = "items/index";
const SEED_FLAG = "seed/done";
const COMPLETION_FLAG = "completion/done";
const itemKey = (id: string): string => `items/by-id/${id}`;

export class ChecklistNotFoundError extends Error {
  constructor(message = "onboarding-checklist: not found") { super(message); this.name = "ChecklistNotFoundError"; }
}

export interface ChecklistDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  kanban?: KanbanPort;
}

export class ChecklistService {
  private readonly agencyId: AgencyId;
  private readonly clientId: ClientId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly kanban?: KanbanPort;

  constructor(deps: ChecklistDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    if (deps.kanban) this.kanban = deps.kanban;
  }

  private inScope(it: ChecklistItem): boolean {
    return it.agencyId === this.agencyId && it.clientId === this.clientId;
  }

  private async pushIndex(id: string): Promise<void> {
    const ids = (await this.storage.get<string[]>(ITEM_INDEX)) ?? [];
    if (!ids.includes(id)) await this.storage.set(ITEM_INDEX, [...ids, id]);
  }

  private async removeFromIndex(id: string): Promise<void> {
    const ids = (await this.storage.get<string[]>(ITEM_INDEX)) ?? [];
    const next = ids.filter(x => x !== id);
    if (next.length !== ids.length) await this.storage.set(ITEM_INDEX, next);
  }

  // ── Read ────────────────────────────────────────────────────────

  async list(filter: { ownerKind?: OwnerKind; status?: ChecklistStatus } = {}): Promise<ChecklistItem[]> {
    const ids = (await this.storage.get<string[]>(ITEM_INDEX)) ?? [];
    const out: ChecklistItem[] = [];
    for (const id of ids) {
      const it = await this.storage.get<ChecklistItem>(itemKey(id));
      if (!it || !this.inScope(it)) continue;
      if (filter.ownerKind && it.ownerKind !== filter.ownerKind) continue;
      if (filter.status && it.status !== filter.status) continue;
      out.push(it);
    }
    return out.sort((a, b) => a.ordering - b.ordering);
  }

  async get(id: string): Promise<ChecklistItem | null> {
    const it = await this.storage.get<ChecklistItem>(itemKey(id));
    return it && this.inScope(it) ? it : null;
  }

  async completionPct(): Promise<CompletionPct> {
    const items = await this.list();
    const total = items.length;
    const done = items.filter(i => i.status === "done").length;
    const skipped = items.filter(i => i.status === "skipped").length;
    const todo = items.filter(i => i.status === "todo").length;
    const handled = done + skipped;
    const pct = total === 0 ? 0 : Math.round((handled / total) * 100);
    return { total, done, skipped, todo, pct };
  }

  // ── Mutate ──────────────────────────────────────────────────────

  async create(actor: UserId, input: CreateChecklistItemInput): Promise<ChecklistItem> {
    if (!input.title.trim()) throw new Error("onboarding-checklist: title required");
    const t = now();
    const existing = await this.list();
    const ordering = existing.length === 0
      ? 0
      : Math.max(...existing.map(i => i.ordering)) + 1;
    const it: ChecklistItem = {
      id: makeId("oci"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      title: input.title.trim(),
      description: input.description,
      ownerKind: input.ownerKind,
      status: "todo",
      dueAt: input.dueAt,
      ordering,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(itemKey(it.id), it);
    await this.pushIndex(it.id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "onboarding", action: "onboarding.item.created",
      message: `Onboarding item created: ${it.title}`,
      metadata: { itemId: it.id, ownerKind: it.ownerKind },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "onboarding.item.created", { id: it.id, title: it.title, ownerKind: it.ownerKind });
    return it;
  }

  async update(actor: UserId, id: string, patch: UpdateChecklistItemPatch): Promise<ChecklistItem> {
    const cur = await this.get(id);
    if (!cur) throw new ChecklistNotFoundError();
    const t = now();
    const next: ChecklistItem = {
      ...cur,
      title: patch.title?.trim() || cur.title,
      description: patch.description !== undefined ? patch.description : cur.description,
      ownerKind: patch.ownerKind ?? cur.ownerKind,
      dueAt: patch.dueAt === null ? undefined : (patch.dueAt ?? cur.dueAt),
      status: patch.status ?? cur.status,
      updatedAt: t,
    };
    if (cur.status !== "done" && next.status === "done") {
      next.completedAt = t;
      next.completedBy = actor;
    }
    if (cur.status === "done" && next.status !== "done") {
      next.completedAt = undefined;
      next.completedBy = undefined;
    }
    await this.storage.set(itemKey(id), next);
    if (cur.status !== "done" && next.status === "done") {
      this.activity.logActivity({
        agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
        category: "onboarding", action: "onboarding.item.completed",
        message: `Onboarding item completed: ${next.title}`,
        metadata: { itemId: id, ownerKind: next.ownerKind },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
        "onboarding.item.completed", { id, title: next.title, ownerKind: next.ownerKind });
      await this.maybeEmitCompleted(actor);
    } else if (cur.status !== "skipped" && next.status === "skipped") {
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
        "onboarding.item.skipped", { id, title: next.title });
      await this.maybeEmitCompleted(actor);
    }
    return next;
  }

  async tick(actor: UserId, id: string, status: ChecklistStatus): Promise<ChecklistItem> {
    return this.update(actor, id, { status });
  }

  async bulkTick(actor: UserId, entries: BulkTickEntry[]): Promise<ChecklistItem[]> {
    const out: ChecklistItem[] = [];
    for (const e of entries) {
      try { out.push(await this.tick(actor, e.id, e.status)); }
      catch { /* skip missing ids — caller can diff */ }
    }
    return out;
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw new ChecklistNotFoundError();
    await this.storage.del(itemKey(id));
    await this.removeFromIndex(id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "onboarding", action: "onboarding.item.deleted",
      message: `Onboarding item deleted: ${cur.title}`,
      metadata: { itemId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "onboarding.item.deleted", { id, title: cur.title });
  }

  async reorder(idsInOrder: string[]): Promise<ChecklistItem[]> {
    const t = now();
    const items = await this.list();
    const known = new Set(items.map(i => i.id));
    const filtered = idsInOrder.filter(id => known.has(id));
    // Append any missing items at the tail in their existing order.
    const tail = items.map(i => i.id).filter(id => !filtered.includes(id));
    const final = [...filtered, ...tail];
    for (let idx = 0; idx < final.length; idx++) {
      const id = final[idx];
      if (!id) continue;
      const it = await this.get(id);
      if (!it) continue;
      if (it.ordering === idx) continue;
      await this.storage.set(itemKey(id), { ...it, ordering: idx, updatedAt: t });
    }
    return this.list();
  }

  // ── Seed ────────────────────────────────────────────────────────

  // Idempotent: seeds the 8 default items on first install. A flag
  // prevents re-seeding even if the operator has since deleted items.
  async seedDefaults(actor: UserId): Promise<{ seeded: boolean; itemCount: number }> {
    const flag = await this.storage.get<number>(SEED_FLAG);
    if (flag) return { seeded: false, itemCount: (await this.list()).length };
    const existing = await this.list();
    if (existing.length > 0) {
      await this.storage.set(SEED_FLAG, 1);
      return { seeded: false, itemCount: existing.length };
    }
    for (let i = 0; i < DEFAULT_SEED_ITEMS.length; i++) {
      const def = DEFAULT_SEED_ITEMS[i];
      if (!def) continue;
      await this.create(actor, {
        title: def.title,
        description: def.description,
        ownerKind: def.ownerKind,
      });
    }
    await this.storage.set(SEED_FLAG, 1);
    return { seeded: true, itemCount: DEFAULT_SEED_ITEMS.length };
  }

  // ── 100% completion ────────────────────────────────────────────

  private async maybeEmitCompleted(actor: UserId): Promise<void> {
    const flag = await this.storage.get<number>(COMPLETION_FLAG);
    if (flag) return;
    const pct = await this.completionPct();
    if (pct.total === 0 || pct.pct < 100) return;
    await this.storage.set(COMPLETION_FLAG, 1);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "onboarding", action: "onboarding.completed",
      message: `Onboarding 100% complete (${pct.done} done · ${pct.skipped} skipped)`,
      metadata: { ...pct },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "onboarding.completed", { ...pct });
    if (this.kanban?.postCardToClientTasksBoard) {
      try {
        await this.kanban.postCardToClientTasksBoard({
          agencyId: this.agencyId,
          clientId: this.clientId,
          title: "Move to Diagnostics phase",
          description: "Onboarding checklist 100% complete — promote this client to the Diagnostics phase.",
        });
      } catch { /* soft-fail kanban */ }
    }
  }
}
