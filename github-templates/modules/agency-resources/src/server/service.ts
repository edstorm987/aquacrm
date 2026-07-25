// AgencyResourcesService — internal-team library CRUD + view-tick
// counter + role-gated visibility + recent-activity feed.
//
// Storage layout:
//   resources/index            → string[] of resource ids
//   resources/by-id/<id>       → TeamResource
//   resources/by-slug/<slug>   → string (id)

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, Role, UserId } from "../lib/tenancy";
import type {
  CreateTeamResourceInput,
  RecentActivityEntry,
  TeamResource,
  TeamResourceFilter,
  TeamResourceSummary,
  UpdateTeamResourcePatch,
} from "../lib/domain";
import {
  ALL_VISIBLE_ROLES,
  RESOURCE_KINDS,
  slugify,
  summarise,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "resources/index";
const resourceKey = (id: string): string => `resources/by-id/${id}`;
const slugKey = (slug: string): string => `resources/by-slug/${slug}`;

export class ResourceNotFoundError extends Error {
  constructor(message = "agency-resources: not found") { super(message); this.name = "ResourceNotFoundError"; }
}
export class ResourceForbiddenError extends Error {
  constructor(message = "agency-resources: forbidden") { super(message); this.name = "ResourceForbiddenError"; }
}

// Visibility predicate. Owners/managers always see (admin override).
// `visibleToRoles: []` → any AGENCY-staff role can see (default
// behaviour — operator opts in to broaden for freelancers etc).
export function canSee(resource: TeamResource, role: Role): boolean {
  if (role === "agency-owner" || role === "agency-manager") return true;
  const allowed = resource.visibleToRoles.length === 0
    ? ALL_VISIBLE_ROLES
    : resource.visibleToRoles;
  return allowed.includes(role);
}

export class AgencyResourcesService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(r: TeamResource): boolean {
    return r.agencyId === this.agencyId;
  }

  async list(actor: { userId: UserId; role: Role }, filter: TeamResourceFilter = {}): Promise<TeamResourceSummary[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: TeamResourceSummary[] = [];
    for (const id of ids) {
      const r = await this.storage.get<TeamResource>(resourceKey(id));
      if (!r || !this.inScope(r)) continue;
      if (!canSee(r, actor.role)) continue;
      if (!filter.includeArchived && r.archived) continue;
      if (filter.kind && r.kind !== filter.kind) continue;
      if (filter.tag && !r.tags.includes(filter.tag)) continue;
      if (filter.query) {
        const q = filter.query.toLowerCase();
        const hay = `${r.title} ${r.body} ${r.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(summarise(r));
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(actor: { userId: UserId; role: Role }, id: string): Promise<TeamResource | null> {
    const r = await this.storage.get<TeamResource>(resourceKey(id));
    if (!r || !this.inScope(r)) return null;
    if (!canSee(r, actor.role)) throw new ResourceForbiddenError();
    return r;
  }

  async getBySlug(actor: { userId: UserId; role: Role }, slug: string): Promise<TeamResource | null> {
    const id = await this.storage.get<string>(slugKey(slug));
    if (!id) return null;
    return this.get(actor, id);
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let n = 2;
    while (await this.storage.get<string>(slugKey(candidate))) {
      candidate = `${base}-${n++}`;
      if (n > 999) throw new Error("agency-resources: could not generate unique slug");
    }
    return candidate;
  }

  async create(actor: UserId, input: CreateTeamResourceInput): Promise<TeamResource> {
    if (!input.title.trim()) throw new Error("agency-resources: title required");
    if (!RESOURCE_KINDS.includes(input.kind)) throw new Error("agency-resources: invalid kind");
    const t = now();
    const baseSlug = slugify(input.slug ?? input.title);
    if (!baseSlug) throw new Error("agency-resources: title produces empty slug");
    const slug = await this.uniqueSlug(baseSlug);
    const r: TeamResource = {
      id: makeId("tr"),
      agencyId: this.agencyId,
      kind: input.kind,
      title: input.title.trim(),
      slug,
      body: input.body ?? "",
      tags: dedupe(input.tags ?? []),
      visibleToRoles: dedupe(input.visibleToRoles ?? []) as Role[],
      archived: false,
      viewCount: 0,
      createdBy: actor,
      createdAt: t, updatedAt: t,
      lastEditedBy: actor,
      lastEditedAt: t,
    };
    await this.storage.set(resourceKey(r.id), r);
    await this.storage.set(slugKey(slug), r.id);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(r.id)) await this.storage.set(INDEX_KEY, [...ids, r.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "agency-resources.resource.created",
      message: `Team resource "${r.title}" created (${r.kind})`,
      metadata: { resourceId: r.id, kind: r.kind },
    });
    this.events.emit({ agencyId: this.agencyId },
      "agency-resources.resource.created", { id: r.id });
    return r;
  }

  async update(actor: UserId, id: string, patch: UpdateTeamResourcePatch): Promise<TeamResource> {
    const cur = await this.storage.get<TeamResource>(resourceKey(id));
    if (!cur || !this.inScope(cur)) throw new ResourceNotFoundError();
    const t = now();
    const next: TeamResource = {
      ...cur,
      title: patch.title?.trim() || cur.title,
      body: patch.body ?? cur.body,
      tags: patch.tags ? dedupe(patch.tags) : cur.tags,
      visibleToRoles: patch.visibleToRoles ? dedupe(patch.visibleToRoles) as Role[] : cur.visibleToRoles,
      archived: patch.archived ?? cur.archived,
      kind: patch.kind ?? cur.kind,
      updatedAt: t,
      lastEditedBy: actor,
      lastEditedAt: t,
    };
    if (patch.kind && !RESOURCE_KINDS.includes(patch.kind)) {
      throw new Error("agency-resources: invalid kind");
    }
    await this.storage.set(resourceKey(id), next);
    if (cur.archived !== next.archived && next.archived) {
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: actor,
        category: "settings", action: "agency-resources.resource.archived",
        message: `Team resource "${cur.title}" archived`,
        metadata: { resourceId: id },
      });
      this.events.emit({ agencyId: this.agencyId },
        "agency-resources.resource.archived", { id });
    } else {
      this.events.emit({ agencyId: this.agencyId },
        "agency-resources.resource.updated", { id });
    }
    return next;
  }

  // View-tick. Increments viewCount + lastViewedAt. Logs a low-noise
  // activity entry every Nth view (default every 1 — caller can
  // throttle externally if needed). Visibility is enforced — non-
  // canSee actors get a ResourceForbiddenError so view counts can't
  // be inflated by users who shouldn't see the row.
  async tickView(actor: { userId: UserId; role: Role }, id: string): Promise<TeamResource> {
    const cur = await this.storage.get<TeamResource>(resourceKey(id));
    if (!cur || !this.inScope(cur)) throw new ResourceNotFoundError();
    if (!canSee(cur, actor.role)) throw new ResourceForbiddenError();
    const t = now();
    const next: TeamResource = {
      ...cur,
      viewCount: cur.viewCount + 1,
      lastViewedAt: t,
    };
    await this.storage.set(resourceKey(id), next);
    this.events.emit({ agencyId: this.agencyId },
      "agency-resources.resource.viewed", { id, actor: actor.userId });
    return next;
  }

  // Recent activity — last N edits and views. Pulled directly from
  // the resource rows (lastEditedAt / lastViewedAt) rather than the
  // foundation activity log to keep this self-contained and bounded
  // regardless of total activity volume.
  async recentActivity(actor: { userId: UserId; role: Role }, limit = 20): Promise<RecentActivityEntry[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const entries: RecentActivityEntry[] = [];
    for (const id of ids) {
      const r = await this.storage.get<TeamResource>(resourceKey(id));
      if (!r || !this.inScope(r) || !canSee(r, actor.role)) continue;
      if (r.lastEditedAt) {
        entries.push({
          resourceId: r.id, title: r.title, kind: r.kind,
          ts: r.lastEditedAt, type: "edited", actor: r.lastEditedBy,
        });
      }
      if (r.lastViewedAt) {
        entries.push({
          resourceId: r.id, title: r.title, kind: r.kind,
          ts: r.lastViewedAt, type: "viewed",
        });
      }
    }
    entries.sort((a, b) => b.ts - a.ts);
    return entries.slice(0, limit);
  }

  async exportAll(actor: { userId: UserId; role: Role }): Promise<TeamResource[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: TeamResource[] = [];
    for (const id of ids) {
      const r = await this.storage.get<TeamResource>(resourceKey(id));
      if (!r || !this.inScope(r) || !canSee(r, actor.role)) continue;
      out.push(r);
    }
    return out.sort((a, b) => a.updatedAt - b.updatedAt);
  }
}

function dedupe<T>(xs: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}
