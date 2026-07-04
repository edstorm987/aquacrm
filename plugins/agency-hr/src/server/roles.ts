// RoleService — Employee HQ's permission grid (chapter #59 §9).
//
// Stores `CustomRole` rows under `role:<id>` keys + a `role/index` list
// (same shape as Staff/Department). Default seed roles are written once
// per agency on `seedDefaults` (idempotent) and flagged `seed:true` so
// the Role Builder UI renders them clone-and-edit instead of editable.
//
// `permissionGuard()` is exported as an opt-in helper any plugin handler
// can call to enforce a `requires: PermissionKey[]` declaration.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateRoleInput,
  CustomRole,
  PermissionKey,
  UpdateRolePatch,
} from "../lib/domain";
import { ALL_PERMISSION_KEYS } from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const ROLE_INDEX_KEY = "role/index";
const roleKey = (id: string): string => `role:${id}`;

// Default seed roles per chapter §9. Founder gets every permission;
// Admin is everything except `roles.edit`; Designer / Copywriter / Ops
// are the three operating roles with deliberately narrow scopes.
export const DEFAULT_ROLES: readonly { label: string; permissions: PermissionKey[] }[] = [
  { label: "Founder",    permissions: [...ALL_PERMISSION_KEYS] },
  { label: "Admin",      permissions: ALL_PERMISSION_KEYS.filter(p => p !== "roles.edit") },
  { label: "Designer",   permissions: ["clients.view", "plugins.install", "sops.tag.service"] },
  { label: "Copywriter", permissions: ["clients.view", "sops.tag.sales", "sops.tag.service"] },
  { label: "Ops",        permissions: ["clients.view", "finance.view", "sops.tag.standards"] },
] as const;

export class RoleService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(): Promise<CustomRole[]> {
    const index = (await this.storage.get<string[]>(ROLE_INDEX_KEY)) ?? [];
    const rows: CustomRole[] = [];
    for (const id of index) {
      const row = await this.storage.get<CustomRole>(roleKey(id));
      if (row) rows.push(row);
    }
    const seedOrder = new Map(DEFAULT_ROLES.map((r, i) => [r.label, i] as const));
    return rows.sort((a, b) => {
      const sa = seedOrder.get(a.label) ?? 99;
      const sb = seedOrder.get(b.label) ?? 99;
      if (sa !== sb) return sa - sb;
      return a.label.localeCompare(b.label);
    });
  }

  async get(id: string): Promise<CustomRole | null> {
    const row = await this.storage.get<CustomRole>(roleKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async create(input: CreateRoleInput, actor: UserId): Promise<CustomRole> {
    if (!input.label.trim()) throw new Error("Role label required.");
    const existing = await this.list();
    if (existing.some(r => r.label.toLowerCase() === input.label.toLowerCase())) {
      throw new Error(`Role "${input.label}" already exists.`);
    }
    const id = makeId("role");
    const ts = now();
    const row: CustomRole = {
      id,
      agencyId: this.agencyId,
      label: input.label.trim(),
      permissions: dedupe(input.permissions),
      visibleViewIds: input.visibleViewIds ?? [],
      requiresAuth: input.requiresAuth ?? true,
      seed: false,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(roleKey(id), row);
    const index = (await this.storage.get<string[]>(ROLE_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(ROLE_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.role.created",
      message: `Created role "${row.label}".`,
      metadata: { roleId: id, permissions: row.permissions.length },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.role.created", { roleId: id });
    return row;
  }

  async update(id: string, patch: UpdateRolePatch, actor: UserId): Promise<CustomRole | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.seed) {
      throw new Error(`Seed role "${existing.label}" is read-only — clone-and-edit instead.`);
    }
    const updated: CustomRole = {
      ...existing,
      label: patch.label?.trim() ?? existing.label,
      permissions: patch.permissions ? dedupe(patch.permissions) : existing.permissions,
      visibleViewIds: patch.visibleViewIds ?? existing.visibleViewIds,
      requiresAuth: patch.requiresAuth ?? existing.requiresAuth,
      updatedAt: now(),
    };
    await this.storage.set(roleKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.role.updated",
      message: `Updated role "${updated.label}".`,
      metadata: { roleId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.role.updated", { roleId: id });
    return updated;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    if (existing.seed) {
      throw new Error(`Seed role "${existing.label}" cannot be deleted.`);
    }
    await this.storage.del(roleKey(id));
    const index = (await this.storage.get<string[]>(ROLE_INDEX_KEY)) ?? [];
    await this.storage.set(ROLE_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.role.deleted",
      message: `Deleted role "${existing.label}".`,
      metadata: { roleId: id },
    });
    return true;
  }

  // Idempotent. Writes the five default roles if no role index exists.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length };
    const index: string[] = [];
    const ts = now();
    let seeded = 0;
    for (const def of DEFAULT_ROLES) {
      const id = makeId("role");
      const row: CustomRole = {
        id,
        agencyId: this.agencyId,
        label: def.label,
        permissions: [...def.permissions],
        visibleViewIds: [],
        requiresAuth: true,
        seed: true,
        createdAt: ts,
        updatedAt: ts,
      };
      await this.storage.set(roleKey(id), row);
      index.push(id);
      seeded += 1;
    }
    await this.storage.set(ROLE_INDEX_KEY, index);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.roles.seeded",
      message: `Seeded ${seeded} default roles.`,
      metadata: { count: seeded },
    });
    return { seeded, existed: 0 };
  }
}

// ─── Permission helpers ─────────────────────────────────────────────────

export function roleHasPermission(role: CustomRole | null | undefined, perm: PermissionKey): boolean {
  if (!role) return false;
  return role.permissions.includes(perm);
}

// permissionGuard — opt-in helper. Throws a 403-shaped error when the
// role is missing any required permission. Plugins adopt incrementally;
// existing role gates (`visibleToRoles`) keep working in parallel.
export function permissionGuard(role: CustomRole | null | undefined, requires: PermissionKey[]): void {
  for (const p of requires) {
    if (!roleHasPermission(role, p)) {
      const err = new Error(`Permission denied: requires ${p}`) as Error & { status?: number };
      err.status = 403;
      throw err;
    }
  }
}

function dedupe(items: PermissionKey[]): PermissionKey[] {
  return Array.from(new Set(items));
}
