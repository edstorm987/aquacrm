// PlanService — recurring plan tiers + per-client assignment.
// R007 addition.
//
// Storage layout:
//   plans/index               → string[] of plan ids
//   plans/by-id/<id>          → Plan
//   plans/by-client/<cid>     → string (single plan id)  // v1: 1 plan/client

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreatePlanInput,
  Plan,
  UpdatePlanPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "plans/index";
const planKey = (id: string): string => `plans/by-id/${id}`;
const byClientKey = (cid: ClientId): string => `plans/by-client/${cid}`;

export class PlanService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(p: Plan): boolean {
    return p.agencyId === this.agencyId;
  }

  async list(includeInactive = false): Promise<Plan[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: Plan[] = [];
    for (const id of ids) {
      const p = await this.storage.get<Plan>(planKey(id));
      if (!p || !this.inScope(p)) continue;
      if (!includeInactive && !p.active) continue;
      out.push(p);
    }
    return out.sort((a, b) => b.monthlyAmountCents - a.monthlyAmountCents);
  }

  async get(id: string): Promise<Plan | null> {
    const p = await this.storage.get<Plan>(planKey(id));
    return p && this.inScope(p) ? p : null;
  }

  async getForClient(clientId: ClientId): Promise<Plan | null> {
    const id = await this.storage.get<string>(byClientKey(clientId));
    if (!id) return null;
    return this.get(id);
  }

  async create(actor: UserId, input: CreatePlanInput): Promise<Plan> {
    if (!input.label.trim()) throw new Error("agency-finance: plan label required");
    if (input.monthlyAmountCents < 0) throw new Error("agency-finance: monthlyAmountCents must be >= 0");
    const t = now();
    const plan: Plan = {
      id: makeId("plan"),
      agencyId: this.agencyId,
      tier: input.tier,
      label: input.label.trim(),
      monthlyAmountCents: input.monthlyAmountCents,
      currency: input.currency ?? "gbp",
      lockInMonths: input.lockInMonths ?? 0,
      lockInFeeCents: input.lockInFeeCents ?? 0,
      clientIds: [],
      active: input.active ?? true,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(planKey(plan.id), plan);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(plan.id)) await this.storage.set(INDEX_KEY, [...ids, plan.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "finance", action: "plan.created",
      message: `Plan "${plan.label}" created (${plan.tier}, ${plan.monthlyAmountCents}/mo)`,
      metadata: { planId: plan.id, tier: plan.tier },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.plan.created", { planId: plan.id });
    return plan;
  }

  async update(actor: UserId, id: string, patch: UpdatePlanPatch): Promise<Plan> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-finance: plan not found");
    const next: Plan = {
      ...cur,
      label: patch.label?.trim() || cur.label,
      monthlyAmountCents: patch.monthlyAmountCents ?? cur.monthlyAmountCents,
      lockInMonths: patch.lockInMonths ?? cur.lockInMonths,
      lockInFeeCents: patch.lockInFeeCents ?? cur.lockInFeeCents,
      active: patch.active ?? cur.active,
      updatedAt: now(),
    };
    if (next.monthlyAmountCents < 0) throw new Error("agency-finance: monthlyAmountCents must be >= 0");
    await this.storage.set(planKey(id), next);
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.plan.updated", { planId: id });
    return next;
  }

  // Move a client to this plan (or unassign if planId === null).
  // v1: a client can only be on one plan at a time.
  async assignClient(actor: UserId, clientId: ClientId, planId: string | null): Promise<void> {
    // First strip any prior assignment.
    const prev = await this.getForClient(clientId);
    if (prev) {
      const updated: Plan = {
        ...prev,
        clientIds: prev.clientIds.filter(c => c !== clientId),
        updatedAt: now(),
      };
      await this.storage.set(planKey(prev.id), updated);
    }
    if (!planId) {
      await this.storage.del(byClientKey(clientId));
    } else {
      const next = await this.get(planId);
      if (!next) throw new Error("agency-finance: plan not found");
      const updated: Plan = {
        ...next,
        clientIds: next.clientIds.includes(clientId) ? next.clientIds : [...next.clientIds, clientId],
        updatedAt: now(),
      };
      await this.storage.set(planKey(planId), updated);
      await this.storage.set(byClientKey(clientId), planId);
    }
    this.activity.logActivity({
      agencyId: this.agencyId, clientId, actorUserId: actor,
      category: "finance", action: "plan.assigned",
      message: planId
        ? `Client ${clientId} assigned to plan ${planId}`
        : `Client ${clientId} unassigned from plan ${prev?.id ?? "(none)"}`,
      metadata: { planId, prevPlanId: prev?.id ?? null },
    });
    this.events.emit({ agencyId: this.agencyId, clientId },
      "agency-finance.plan.assigned", { clientId, planId, prevPlanId: prev?.id ?? null });
  }
}
