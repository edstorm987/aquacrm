// SopService — agency-scoped SOP CRUD + tag-family / status filters.
//
// Storage layout:
//   sops/index            → string[] of SOP ids
//   sops/by-id/<id>       → Sop
//   sops/by-slug/<slug>   → string (id)
//
// SOPs are agency-scoped: clientId is irrelevant, scopePolicy "agency".

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateSopInput,
  Sop,
  SopFilter,
  SopStatus,
  TagFamily,
  UpdateSopPatch,
} from "../lib/domain";
import { TAG_FAMILIES, slugify } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "sops/index";
const sopKey = (id: string): string => `sops/by-id/${id}`;
const slugKey = (slug: string): string => `sops/by-slug/${slug}`;

function uniqTags(tags: TagFamily[] | undefined): TagFamily[] {
  if (!tags?.length) return [];
  const valid = new Set<TagFamily>(TAG_FAMILIES);
  const seen = new Set<TagFamily>();
  const out: TagFamily[] = [];
  for (const t of tags) {
    if (!valid.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export class SopService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(s: Sop): boolean {
    return s.agencyId === this.agencyId;
  }

  async list(filter: SopFilter = {}): Promise<Sop[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: Sop[] = [];
    for (const id of ids) {
      const s = await this.storage.get<Sop>(sopKey(id));
      if (!s || !this.inScope(s)) continue;
      if (filter.status && s.status !== filter.status) continue;
      if (filter.tag && !s.tags.includes(filter.tag)) continue;
      if (filter.query) {
        const q = filter.query.toLowerCase();
        if (!s.title.toLowerCase().includes(q)) continue;
      }
      out.push(s);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Sop | null> {
    const s = await this.storage.get<Sop>(sopKey(id));
    return s && this.inScope(s) ? s : null;
  }

  async getBySlug(slug: string): Promise<Sop | null> {
    const id = await this.storage.get<string>(slugKey(slug));
    if (!id) return null;
    return this.get(id);
  }

  // Returns counts by tag family — only counts non-archived rows.
  async tagCounts(): Promise<Record<TagFamily, number>> {
    const counts: Record<TagFamily, number> = {
      sales: 0, service: 0, leads: 0, standards: 0, mastery: 0,
    };
    const all = await this.list();
    for (const s of all) {
      if (s.status === "archived") continue;
      for (const t of s.tags) counts[t]++;
    }
    return counts;
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let n = 2;
    while (await this.storage.get<string>(slugKey(candidate))) {
      candidate = `${base}-${n++}`;
      if (n > 999) throw new Error("Could not generate unique slug.");
    }
    return candidate;
  }

  async create(input: CreateSopInput, actor: UserId): Promise<Sop> {
    const title = input.title?.trim();
    if (!title) throw new Error("SOP title required.");
    const slug = await this.uniqueSlug(slugify(input.slug ?? title));
    const id = makeId("sop");
    const ts = now();
    const sop: Sop = {
      id,
      agencyId: this.agencyId,
      title,
      slug,
      body: input.body ?? "",
      tags: uniqTags(input.tags),
      status: input.status ?? "draft",
      createdAt: ts,
      createdBy: actor,
      updatedAt: ts,
      updatedBy: actor,
    };
    await this.storage.set(sopKey(id), sop);
    await this.storage.set(slugKey(slug), id);
    const ix = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ix.includes(id)) await this.storage.set(INDEX_KEY, [...ix, id]);
    await this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "sops", action: "sops.sop.created",
      message: `Created SOP "${sop.title}".`,
      metadata: { sopId: id, tags: sop.tags, status: sop.status },
    });
    this.events.emit({ agencyId: this.agencyId },
      "sops.sop.created", { sopId: id });
    return sop;
  }

  async update(id: string, patch: UpdateSopPatch, actor: UserId): Promise<Sop | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: Sop = {
      ...existing,
      title: patch.title?.trim() || existing.title,
      body: patch.body ?? existing.body,
      tags: patch.tags !== undefined ? uniqTags(patch.tags) : existing.tags,
      status: patch.status ?? existing.status,
      updatedAt: now(),
      updatedBy: actor,
    };
    await this.storage.set(sopKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "sops", action: "sops.sop.updated",
      message: `Updated SOP "${next.title}".`,
      metadata: { sopId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId },
      patch.status === "published" ? "sops.sop.published" : "sops.sop.updated",
      { sopId: id });
    return next;
  }

  async setStatus(id: string, status: SopStatus, actor: UserId): Promise<Sop | null> {
    return this.update(id, { status }, actor);
  }

  async archive(id: string, actor: UserId): Promise<Sop | null> {
    const next = await this.update(id, { status: "archived" }, actor);
    if (next) {
      this.events.emit({ agencyId: this.agencyId },
        "sops.sop.archived", { sopId: id });
    }
    return next;
  }

  async restore(id: string, actor: UserId): Promise<Sop | null> {
    const next = await this.update(id, { status: "draft" }, actor);
    if (next) {
      this.events.emit({ agencyId: this.agencyId },
        "sops.sop.restored", { sopId: id });
    }
    return next;
  }

  // Pre-seeds one placeholder SOP per tag family if the index is empty.
  // Titles pulled from chapter #59 §9c — Ed pastes the bodies in later.
  async seedDefaults(actor: UserId): Promise<Sop[]> {
    const ix = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (ix.length) return [];
    const seeds: { title: string; tags: TagFamily[] }[] = [
      { title: "Sales Presentation", tags: ["sales"] },
      { title: "Lead Magnets", tags: ["sales"] },
      { title: "Aqua Incubator 3.0 — Onboarding Walkthrough", tags: ["service"] },
      { title: "Recurring Actions", tags: ["service"] },
      { title: "Pre-Sales HQ", tags: ["leads"] },
      { title: "Re-Nurturing", tags: ["leads"] },
      { title: "Communication SOP", tags: ["standards"] },
      { title: "Behaviour Standards", tags: ["standards"] },
      { title: "Mastery Plan — 200+ reviews", tags: ["mastery"] },
    ];
    const out: Sop[] = [];
    for (const s of seeds) {
      out.push(await this.create({ ...s, body: "" }, actor));
    }
    return out;
  }
}
