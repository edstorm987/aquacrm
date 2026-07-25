// Benefit service — CRUD + plan-association graph.
//
// Storage:
//   memberships/benefits/<id>      — Benefit row
//   memberships/benefits/index     — string[] of benefit ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Benefit,
  CreateBenefitInput,
  UpdateBenefitPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { PlanService } from "./plans";
import type { SubscriptionService } from "./subscriptions";

const BENEFIT_INDEX_KEY = "memberships/benefits/index";
const benefitKey = (id: string): string => `memberships/benefits/${id}`;

export class BenefitService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private plans: PlanService,
    private subscriptions: SubscriptionService,
  ) {}

  async list(): Promise<Benefit[]> {
    const index = (await this.storage.get<string[]>(BENEFIT_INDEX_KEY)) ?? [];
    const out: Benefit[] = [];
    for (const id of index) {
      const row = await this.storage.get<Benefit>(benefitKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  async get(id: string): Promise<Benefit | null> {
    const row = await this.storage.get<Benefit>(benefitKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async create(input: CreateBenefitInput, actor: UserId): Promise<Benefit> {
    if (!input.label.trim()) throw new Error("Benefit label required.");
    if (input.category === "discount" && (input.percentOff === undefined || input.percentOff <= 0)) {
      throw new Error("Discount benefits require percentOff > 0.");
    }
    const id = makeId("ben");
    const ts = now();
    const row: Benefit = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      label: input.label.trim(),
      description: input.description,
      category: input.category,
      percentOff: input.percentOff,
      contentRef: input.contentRef,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(benefitKey(id), row);
    const index = (await this.storage.get<string[]>(BENEFIT_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(BENEFIT_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "memberships",
      action: "membership.benefit_created",
      message: `Created benefit "${row.label}".`,
      metadata: { benefitId: id, category: row.category },
    });
    return row;
  }

  async update(id: string, patch: UpdateBenefitPatch, actor: UserId): Promise<Benefit | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: Benefit = {
      ...existing,
      ...patch,
      label: patch.label?.trim() ?? existing.label,
      updatedAt: now(),
    };
    await this.storage.set(benefitKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "memberships",
      action: "membership.benefit_updated",
      message: `Updated benefit "${next.label}".`,
      metadata: { benefitId: id, fields: Object.keys(patch) },
    });
    return next;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(benefitKey(id));
    const index = (await this.storage.get<string[]>(BENEFIT_INDEX_KEY)) ?? [];
    await this.storage.set(BENEFIT_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "memberships",
      action: "membership.benefit_deleted",
      message: `Deleted benefit "${existing.label}".`,
      metadata: { benefitId: id },
    });
    return true;
  }

  // Walk the graph: user → active subscription → plan.benefitIds →
  // benefits. Returns only `active` benefits (archived ones don't grant
  // perks even if still on a plan's benefitIds list — those are
  // grandfathered grants the agency wanted to retire).
  async getBenefitsForUser(userId: UserId): Promise<Benefit[]> {
    const sub = await this.subscriptions.getByUser(userId);
    if (!sub || (sub.status !== "active" && sub.status !== "trialing")) return [];
    const plan = await this.plans.get(sub.planId);
    if (!plan) return [];
    const out: Benefit[] = [];
    for (const benefitId of plan.benefitIds) {
      const b = await this.get(benefitId);
      if (b && b.status === "active") out.push(b);
    }
    return out;
  }
}
