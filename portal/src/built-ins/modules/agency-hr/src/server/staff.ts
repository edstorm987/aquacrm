// Staff directory service. Persists `Staff` rows under
// `staff:<id>` keys + an `staff/index` set for cheap listing.
//
// Why store keys instead of a single blob: the foundation's
// PluginStorage is a key-value store; storing one row per key keeps
// individual reads O(1), and the index key holds the id list so list
// pages don't fan out to `list("staff:")` every render.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type {
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type {
  CreateStaffInput,
  Staff,
  StaffFilter,
  UpdateStaffPatch,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const STAFF_INDEX_KEY = "staff/index";
const staffKey = (id: string): string => `staff:${id}`;

export class StaffService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: StaffFilter): Promise<Staff[]> {
    const index = (await this.storage.get<string[]>(STAFF_INDEX_KEY)) ?? [];
    const rows: Staff[] = [];
    for (const id of index) {
      const row = await this.storage.get<Staff>(staffKey(id));
      if (row) rows.push(row);
    }
    if (!filter) return rows.sort(byName);
    const q = filter.query?.toLowerCase().trim();
    return rows
      .filter(s => !filter.status || s.status === filter.status)
      .filter(s => !filter.departmentId || s.departmentId === filter.departmentId)
      .filter(s => !filter.managerId || s.managerId === filter.managerId)
      .filter(s => !q || `${s.name} ${s.email} ${s.title}`.toLowerCase().includes(q))
      .sort(byName);
  }

  async get(id: string): Promise<Staff | null> {
    const row = await this.storage.get<Staff>(staffKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async create(input: CreateStaffInput, actor: UserId): Promise<Staff> {
    if (!input.name.trim()) throw new Error("Staff name required.");
    if (!input.email.trim()) throw new Error("Staff email required.");
    if (!input.title.trim()) throw new Error("Staff title required.");
    if (!input.joinedAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error("joinedAt must be a YYYY-MM-DD date.");
    }
    // Email uniqueness check — case-insensitive within the agency.
    const existing = await this.list();
    const dup = existing.find(s => s.email.toLowerCase() === input.email.toLowerCase());
    if (dup) throw new Error(`Email ${input.email} already in directory.`);

    const id = makeId("stf");
    const ts = now();
    const row: Staff = {
      id,
      agencyId: this.agencyId,
      userId: input.userId,
      name: input.name.trim(),
      email: input.email.trim(),
      role: input.role,
      departmentId: input.departmentId,
      title: input.title.trim(),
      joinedAt: input.joinedAt,
      status: "active",
      managerId: input.managerId,
      locationType: input.locationType,
      hourlyRate: input.hourlyRate,
      agencyEmployee: input.agencyEmployee,
      customRoleId: input.customRoleId,
      assignments: input.assignments,
      metadata: input.metadata,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(staffKey(id), row);
    const index = (await this.storage.get<string[]>(STAFF_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(STAFF_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.staff.created",
      message: `Added ${row.name} (${row.title}) to the directory.`,
      metadata: { staffId: id, role: row.role, departmentId: row.departmentId },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.staff.created", { staffId: id });
    return row;
  }

  async update(id: string, patch: UpdateStaffPatch, actor: UserId): Promise<Staff | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    // Email uniqueness when changed.
    if (patch.email && patch.email.toLowerCase() !== existing.email.toLowerCase()) {
      const all = await this.list();
      if (all.some(s => s.id !== id && s.email.toLowerCase() === patch.email!.toLowerCase())) {
        throw new Error(`Email ${patch.email} already in directory.`);
      }
    }

    // Manager self-reference + cycle check.
    if (patch.managerId && patch.managerId !== null) {
      if (patch.managerId === id) throw new Error("Staff cannot manage themselves.");
      // Walk up the chain to ensure no cycle.
      const seen = new Set<string>([id]);
      let cursor: string | undefined = patch.managerId;
      while (cursor) {
        if (seen.has(cursor)) throw new Error("Manager change would create a cycle.");
        seen.add(cursor);
        const above: Staff | null = await this.get(cursor);
        cursor = above?.managerId;
      }
    }

    const updated: Staff = {
      ...existing,
      ...patch,
      managerId: patch.managerId === null ? undefined : patch.managerId ?? existing.managerId,
      customRoleId: patch.customRoleId === null ? undefined : patch.customRoleId ?? existing.customRoleId,
      // Merge metadata bag rather than clobber so partial patches keep siblings.
      metadata: patch.metadata ? { ...(existing.metadata ?? {}), ...patch.metadata } : existing.metadata,
      name: patch.name?.trim() ?? existing.name,
      email: patch.email?.trim() ?? existing.email,
      title: patch.title?.trim() ?? existing.title,
      updatedAt: now(),
    };
    await this.storage.set(staffKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.staff.updated",
      message: `Updated ${updated.name}.`,
      metadata: { staffId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.staff.updated", { staffId: id });
    return updated;
  }

  // Soft archive — flips status to alumni + leftAt, keeps the row so
  // org history / past leave audit stays intact.
  async archive(id: string, actor: UserId, leftAt: string): Promise<Staff | null> {
    const updated = await this.update(id, { status: "alumni", leftAt }, actor);
    if (updated) {
      this.events.emit({ agencyId: this.agencyId }, "hr.staff.archived", { staffId: id });
    }
    return updated;
  }

  // Hard delete — drops the row + removes from index. Use sparingly;
  // archive is the documented v1 path.
  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(staffKey(id));
    const index = (await this.storage.get<string[]>(STAFF_INDEX_KEY)) ?? [];
    await this.storage.set(STAFF_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.staff.deleted",
      message: `Removed ${existing.name} from the directory.`,
      metadata: { staffId: id },
    });
    return true;
  }
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}
