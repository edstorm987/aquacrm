// Department service. Persists `Department` rows under `dept:<id>` keys
// + a `dept/index` list. Tree validation refuses cycles via parentId.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateDepartmentInput,
  Department,
  UpdateDepartmentPatch,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const DEPT_INDEX_KEY = "dept/index";
const deptKey = (id: string): string => `dept:${id}`;

// Default departments seeded on plugin install. Per the prompt: a
// fresh agency starts with the same five so the directory has
// something to assign new staff to.
export const DEFAULT_DEPARTMENTS: readonly { name: string; description?: string }[] = [
  { name: "Engineering", description: "Build, fix, ship." },
  { name: "Design", description: "Brand, UX, illustration." },
  { name: "Marketing", description: "Demand, content, growth." },
  { name: "Operations", description: "Internal tooling, finance, HR." },
  { name: "Sales", description: "Pipeline, close, renew." },
] as const;

export class DepartmentService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(): Promise<Department[]> {
    const index = (await this.storage.get<string[]>(DEPT_INDEX_KEY)) ?? [];
    const rows: Department[] = [];
    for (const id of index) {
      const row = await this.storage.get<Department>(deptKey(id));
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Department | null> {
    const row = await this.storage.get<Department>(deptKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async create(input: CreateDepartmentInput, actor: UserId): Promise<Department> {
    if (!input.name.trim()) throw new Error("Department name required.");
    // Reject duplicate names (case-insensitive) within the agency.
    const existing = await this.list();
    if (existing.some(d => d.name.toLowerCase() === input.name.toLowerCase())) {
      throw new Error(`Department "${input.name}" already exists.`);
    }
    if (input.parentId) {
      const parent = await this.get(input.parentId);
      if (!parent) throw new Error(`Parent department ${input.parentId} not found.`);
    }
    const id = makeId("dept");
    const ts = now();
    const row: Department = {
      id,
      agencyId: this.agencyId,
      name: input.name.trim(),
      parentId: input.parentId,
      description: input.description,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(deptKey(id), row);
    const index = (await this.storage.get<string[]>(DEPT_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(DEPT_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.department.created",
      message: `Created department "${row.name}".`,
      metadata: { departmentId: id, parentId: row.parentId },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.department.created", { departmentId: id });
    return row;
  }

  async update(id: string, patch: UpdateDepartmentPatch, actor: UserId): Promise<Department | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    if (patch.parentId && patch.parentId !== null) {
      if (patch.parentId === id) throw new Error("Department cannot be its own parent.");
      // Cycle check: walk up the proposed parent's ancestry.
      const seen = new Set<string>([id]);
      let cursor: string | undefined = patch.parentId;
      while (cursor) {
        if (seen.has(cursor)) throw new Error("Parent change would create a cycle.");
        seen.add(cursor);
        const above: Department | null = await this.get(cursor);
        cursor = above?.parentId;
      }
    }

    if (patch.name && patch.name.toLowerCase() !== existing.name.toLowerCase()) {
      const all = await this.list();
      if (all.some(d => d.id !== id && d.name.toLowerCase() === patch.name!.toLowerCase())) {
        throw new Error(`Department "${patch.name}" already exists.`);
      }
    }

    const updated: Department = {
      ...existing,
      ...patch,
      parentId: patch.parentId === null ? undefined : patch.parentId ?? existing.parentId,
      name: patch.name?.trim() ?? existing.name,
      updatedAt: now(),
    };
    await this.storage.set(deptKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.department.updated",
      message: `Updated department "${updated.name}".`,
      metadata: { departmentId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.department.updated", { departmentId: id });
    return updated;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(deptKey(id));
    const index = (await this.storage.get<string[]>(DEPT_INDEX_KEY)) ?? [];
    await this.storage.set(DEPT_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.department.archived",
      message: `Removed department "${existing.name}".`,
      metadata: { departmentId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.department.archived", { departmentId: id });
    return true;
  }

  // Idempotent: seed the default departments if none exist for this
  // agency. Called from `onInstall`. Safe to call repeatedly.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length };
    let seeded = 0;
    for (const def of DEFAULT_DEPARTMENTS) {
      try {
        await this.create({ name: def.name, description: def.description }, actor);
        seeded += 1;
      } catch {
        // Already exists from a concurrent seed — ignore.
      }
    }
    return { seeded, existed: 0 };
  }
}
