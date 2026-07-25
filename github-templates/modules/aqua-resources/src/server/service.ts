// AquaResourcesService — collection CRUD + item editing + phase
// filter + idempotent default seeder.
//
// Storage layout:
//   collections/index        → string[] of collection ids
//   collections/by-id/<id>   → ResourceCollection

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  AddItemInput,
  AquaPhase,
  CollectionFilter,
  CreateCollectionInput,
  ResourceCollection,
  ResourceItem,
  UpdateCollectionPatch,
  UpdateItemPatch,
} from "../lib/domain";
import { DEFAULT_COLLECTIONS, RESOURCE_KINDS } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "collections/index";
const collectionKey = (id: string): string => `collections/by-id/${id}`;

export class CollectionNotFoundError extends Error {
  constructor(message = "aqua-resources: collection not found") { super(message); this.name = "CollectionNotFoundError"; }
}
export class ItemNotFoundError extends Error {
  constructor(message = "aqua-resources: item not found") { super(message); this.name = "ItemNotFoundError"; }
}
export class BuiltInDeleteError extends Error {
  constructor() { super("aqua-resources: cannot delete a built-in collection"); this.name = "BuiltInDeleteError"; }
}

export class AquaResourcesService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(c: ResourceCollection): boolean {
    return c.agencyId === this.agencyId;
  }

  async list(filter: CollectionFilter = {}): Promise<ResourceCollection[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: ResourceCollection[] = [];
    for (const id of ids) {
      const c = await this.storage.get<ResourceCollection>(collectionKey(id));
      if (!c || !this.inScope(c)) continue;
      if (filter.builtIn !== undefined && c.builtIn !== filter.builtIn) continue;
      if (filter.phase) {
        // Empty phaseScope means "all phases"; otherwise the phase
        // must be present in the array.
        if (c.phaseScope.length > 0 && !c.phaseScope.includes(filter.phase)) continue;
      }
      if (filter.query) {
        const q = filter.query.toLowerCase();
        const hay = `${c.name} ${c.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(c);
    }
    return out.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }

  async get(id: string): Promise<ResourceCollection | null> {
    const c = await this.storage.get<ResourceCollection>(collectionKey(id));
    return c && this.inScope(c) ? c : null;
  }

  async create(actor: UserId, input: CreateCollectionInput): Promise<ResourceCollection> {
    if (!input.name.trim()) throw new Error("aqua-resources: name required");
    const t = now();
    const all = await this.list();
    const items: ResourceItem[] = (input.items ?? []).map((it, i) => ({
      id: makeId("ri"),
      kind: it.kind, ref: it.ref, title: it.title, coverImg: it.coverImg, notes: it.notes,
      order: i,
    }));
    const collection: ResourceCollection = {
      id: makeId("rc"),
      agencyId: this.agencyId,
      name: input.name.trim(),
      description: input.description,
      phaseScope: input.phaseScope ?? [],
      items,
      builtIn: false,
      order: all.length,
      createdBy: actor,
      createdAt: t, updatedAt: t,
    };
    await this.persistCollection(collection);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "aqua-resources.collection.created",
      message: `Resource collection "${collection.name}" created`,
      metadata: { collectionId: collection.id },
    });
    this.events.emit({ agencyId: this.agencyId },
      "aqua-resources.collection.created", { id: collection.id });
    return collection;
  }

  async update(actor: UserId, id: string, patch: UpdateCollectionPatch): Promise<ResourceCollection> {
    const cur = await this.get(id);
    if (!cur) throw new CollectionNotFoundError();
    const next: ResourceCollection = {
      ...cur,
      name: patch.name?.trim() || cur.name,
      description: patch.description ?? cur.description,
      phaseScope: patch.phaseScope ?? cur.phaseScope,
      order: patch.order ?? cur.order,
      updatedAt: now(),
    };
    await this.storage.set(collectionKey(id), next);
    this.events.emit({ agencyId: this.agencyId },
      "aqua-resources.collection.updated", { id });
    return next;
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw new CollectionNotFoundError();
    if (cur.builtIn) throw new BuiltInDeleteError();
    await this.storage.del(collectionKey(id));
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    await this.storage.set(INDEX_KEY, ids.filter(x => x !== id));
    this.events.emit({ agencyId: this.agencyId },
      "aqua-resources.collection.deleted", { id });
  }

  async addItem(actor: UserId, collectionId: string, input: AddItemInput): Promise<ResourceItem> {
    if (!RESOURCE_KINDS.includes(input.kind)) throw new Error("aqua-resources: invalid item kind");
    if (!input.title.trim()) throw new Error("aqua-resources: item title required");
    const cur = await this.get(collectionId);
    if (!cur) throw new CollectionNotFoundError();
    const item: ResourceItem = {
      id: makeId("ri"),
      kind: input.kind, ref: input.ref, title: input.title.trim(),
      coverImg: input.coverImg, notes: input.notes,
      order: cur.items.length,
    };
    const next: ResourceCollection = { ...cur, items: [...cur.items, item], updatedAt: now() };
    await this.storage.set(collectionKey(collectionId), next);
    this.events.emit({ agencyId: this.agencyId },
      "aqua-resources.item.added", { collectionId, itemId: item.id });
    return item;
  }

  async updateItem(actor: UserId, collectionId: string, itemId: string, patch: UpdateItemPatch): Promise<ResourceItem> {
    const cur = await this.get(collectionId);
    if (!cur) throw new CollectionNotFoundError();
    const idx = cur.items.findIndex(i => i.id === itemId);
    if (idx < 0) throw new ItemNotFoundError();
    const item = cur.items[idx]!;
    const updated: ResourceItem = {
      ...item,
      kind: patch.kind ?? item.kind,
      ref: patch.ref ?? item.ref,
      title: patch.title?.trim() || item.title,
      coverImg: patch.coverImg ?? item.coverImg,
      notes: patch.notes ?? item.notes,
    };
    const items = [...cur.items];
    items[idx] = updated;
    await this.storage.set(collectionKey(collectionId), { ...cur, items, updatedAt: now() });
    return updated;
  }

  async removeItem(actor: UserId, collectionId: string, itemId: string): Promise<void> {
    const cur = await this.get(collectionId);
    if (!cur) throw new CollectionNotFoundError();
    const items = cur.items.filter(i => i.id !== itemId);
    if (items.length === cur.items.length) throw new ItemNotFoundError();
    // Reorder remaining items so order is contiguous.
    const compacted = items.map((it, i) => ({ ...it, order: i }));
    await this.storage.set(collectionKey(collectionId), { ...cur, items: compacted, updatedAt: now() });
    this.events.emit({ agencyId: this.agencyId },
      "aqua-resources.item.removed", { collectionId, itemId });
  }

  async reorderItems(actor: UserId, collectionId: string, itemIds: string[]): Promise<ResourceCollection> {
    const cur = await this.get(collectionId);
    if (!cur) throw new CollectionNotFoundError();
    const indexById = new Map(itemIds.map((id, i) => [id, i]));
    const reordered = [...cur.items]
      .sort((a, b) => (indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER))
      .map((it, i) => ({ ...it, order: i }));
    const next: ResourceCollection = { ...cur, items: reordered, updatedAt: now() };
    await this.storage.set(collectionKey(collectionId), next);
    return next;
  }

  // Idempotent — reads existing collection names; only seeds rows
  // whose name doesn't already exist. builtIn=true on every seed.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const all = await this.list();
    const existingNames = new Set(all.map(c => c.name));
    let seeded = 0;
    const t = now();
    for (const def of DEFAULT_COLLECTIONS) {
      if (existingNames.has(def.name)) continue;
      const items: ResourceItem[] = def.items.map((it, i) => ({
        id: makeId("ri"),
        kind: it.kind, ref: it.ref, title: it.title, coverImg: it.coverImg, notes: it.notes,
        order: i,
      }));
      const collection: ResourceCollection = {
        id: makeId("rc"),
        agencyId: this.agencyId,
        name: def.name,
        description: def.description,
        phaseScope: [...def.phaseScope],
        items,
        builtIn: true,
        order: all.length + seeded,
        createdBy: actor,
        createdAt: t, updatedAt: t,
      };
      await this.persistCollection(collection);
      seeded++;
    }
    if (seeded > 0) {
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: actor,
        category: "settings", action: "aqua-resources.seed",
        message: `Seeded ${seeded} default resource collections`,
        metadata: { seeded, existed: all.length },
      });
    }
    return { seeded, existed: all.length };
  }

  private async persistCollection(c: ResourceCollection): Promise<void> {
    await this.storage.set(collectionKey(c.id), c);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(c.id)) await this.storage.set(INDEX_KEY, [...ids, c.id]);
  }

  // Read-only view consumed by T4's Incubator Resources Lite cards.
  // Returns collections matching the phase, with each collection's
  // items already sorted by order.
  async resourcesForPhase(phase: AquaPhase): Promise<ResourceCollection[]> {
    const list = await this.list({ phase });
    return list.map(c => ({
      ...c,
      items: [...c.items].sort((a, b) => a.order - b.order),
    }));
  }
}
