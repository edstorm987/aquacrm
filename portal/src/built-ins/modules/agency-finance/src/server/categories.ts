// Expense category service. CRUD + idempotent seedDefaults. Mirrors
// agency-HR's department service shape (same patterns: index list,
// uniqueness check on name).

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateCategoryInput,
  ExpenseCategory,
  UpdateCategoryPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import {
  assertNonEmptyText,
  assertKnownFields,
  assertOptionalAllowedValue,
  assertOptionalText,
} from "../lib/runtimeValidation";

import { listRowIds } from "./rowIndex";

const CAT_INDEX_KEY = "categories/index";
const catKey = (id: string): string => `categories/by-id/${id}`;
const CATEGORY_STATUSES = ["active", "archived"] as const;

// Seeded on plugin install — the default chart of accounts an
// agency starts with. Customisable post-install via
// CategoryService.create.
export const DEFAULT_CATEGORIES: readonly { name: string; description?: string }[] = [
  { name: "Salaries", description: "Wages, contractors, payroll" },
  { name: "Software", description: "SaaS subscriptions, tools" },
  { name: "Travel", description: "Flights, hotels, transport" },
  { name: "Marketing", description: "Ads, sponsorships, content" },
  { name: "Office", description: "Rent, utilities, supplies" },
  { name: "Other", description: "Catch-all for uncategorised expenses" },
] as const;

export class CategoryService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  // Index + row scan (see server/rowIndex.ts): a category lost to a concurrent
  // create would silently drop its expenses out of every picker and report.
  async list(): Promise<ExpenseCategory[]> {
    const ids = await listRowIds(this.storage, CAT_INDEX_KEY, "categories/by-id/");
    const out: ExpenseCategory[] = [];
    for (const id of ids) {
      const row = await this.storage.get<ExpenseCategory>(catKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listActive(): Promise<ExpenseCategory[]> {
    return (await this.list()).filter(c => c.status === "active");
  }

  async get(id: string): Promise<ExpenseCategory | null> {
    const row = await this.storage.get<ExpenseCategory>(catKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async create(input: CreateCategoryInput, actor: UserId): Promise<ExpenseCategory> {
    assertKnownFields(input, ["name", "description"]);
    assertNonEmptyText(input.name, "name");
    assertOptionalText(input.description, "description");
    const name = input.name.trim();
    const all = await this.list();
    if (all.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Category "${name}" already exists.`);
    }
    const id = makeId("cat");
    const ts = now();
    const row: ExpenseCategory = {
      id,
      agencyId: this.agencyId,
      name,
      isDefault: false,
      status: "active",
      description: input.description,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(catKey(id), row);
    const ix = (await this.storage.get<string[]>(CAT_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(CAT_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "finance",
      action: "category.created",
      message: `Created expense category "${row.name}".`,
      metadata: { categoryId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "category.created", { categoryId: id });
    return row;
  }

  async update(id: string, patch: UpdateCategoryPatch, actor: UserId): Promise<ExpenseCategory | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    assertKnownFields(patch, ["name", "description", "status"]);
    if (patch.name !== undefined) assertNonEmptyText(patch.name, "name");
    assertOptionalText(patch.description, "description");
    assertOptionalAllowedValue(patch.status, CATEGORY_STATUSES, "status");
    const name = patch.name?.trim();
    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      const all = await this.list();
      if (all.some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Category "${name}" already exists.`);
      }
    }
    const next: ExpenseCategory = {
      ...existing,
      ...patch,
      name: name ?? existing.name,
      updatedAt: now(),
    };
    await this.storage.set(catKey(id), next);
    if (patch.status === "archived" && existing.status === "active") {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "finance",
        action: "category.archived",
        message: `Archived category "${existing.name}".`,
        metadata: { categoryId: id },
      });
      this.events.emit({ agencyId: this.agencyId }, "category.archived", { categoryId: id });
    }
    return next;
  }

  // Idempotent. Seeds DEFAULT_CATEGORIES on first install.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length };
    let seeded = 0;
    for (const def of DEFAULT_CATEGORIES) {
      try {
        const cat = await this.create({ name: def.name, description: def.description }, actor);
        // Mark seeded entries as default so the UI can hide / treat
        // them differently.
        await this.storage.set(catKey(cat.id), { ...cat, isDefault: true });
        seeded += 1;
      } catch {
        // Concurrent seed — ignore.
      }
    }
    return { seeded, existed: 0 };
  }
}
