// Plan service — CRUD + ordering + Stripe-price-id sync.
//
// Storage layout (per-install):
//   memberships/plans/<planId>     — Plan row
//   memberships/plans/index        — string[] of plan ids
//
// Stripe sync rule: when `priceMonthly` / `priceAnnual` / `currency`
// change OR when a plan is created from scratch, we create new Stripe
// Price objects (Stripe Prices are immutable) and stash their ids on
// the plan. Existing subscribers stay on their old prices; new
// signups use the new ones.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type {
  AgencyId,
  ClientId,
  UserId,
} from "../lib/tenancy";
import type {
  CreatePlanInput,
  Currency,
  Plan,
  UpdatePlanPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort, StripePort } from "./ports";

const PLAN_INDEX_KEY = "memberships/plans/index";
const planKey = (id: string): string => `memberships/plans/${id}`;

export class PlanService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private stripe: StripePort,
  ) {}

  async list(): Promise<Plan[]> {
    const index = (await this.storage.get<string[]>(PLAN_INDEX_KEY)) ?? [];
    const out: Plan[] = [];
    for (const id of index) {
      const row = await this.storage.get<Plan>(planKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async listActive(): Promise<Plan[]> {
    return (await this.list()).filter(p => p.status === "active");
  }

  async get(id: string): Promise<Plan | null> {
    const row = await this.storage.get<Plan>(planKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async create(input: CreatePlanInput, actor: UserId): Promise<Plan> {
    if (!input.name.trim()) throw new Error("Plan name required.");
    if (input.priceMonthly < 0) throw new Error("priceMonthly must be ≥ 0.");
    if (input.priceAnnual && input.priceAnnual < 0) throw new Error("priceAnnual must be ≥ 0.");

    // Order: place at the end of the current list unless caller specified.
    const existing = await this.list();
    const order = input.order ?? (existing.length > 0
      ? Math.max(...existing.map(p => p.order)) + 10
      : 10);
    const id = makeId("plan");
    const ts = now();

    const plan: Plan = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      name: input.name.trim(),
      description: input.description,
      priceMonthly: input.priceMonthly,
      priceAnnual: input.priceAnnual ?? 0,
      currency: input.currency,
      features: input.features ?? [],
      benefitIds: input.benefitIds ?? [],
      status: "active",
      order,
      trialDays: input.trialDays,
      createdAt: ts,
      updatedAt: ts,
    };

    // Create matching Stripe Prices unless this is a $0 plan (free
    // tiers don't need Stripe at all — they just gate access).
    if (plan.priceMonthly > 0) {
      const monthly = await this.stripe.createPrice({
        product: { name: plan.name, description: plan.description },
        unitAmount: plan.priceMonthly,
        currency: plan.currency,
        recurring: { interval: "month" },
        metadata: { planId: id, billing: "monthly" },
      });
      plan.stripePriceIdMonthly = monthly.id;
    }
    if (plan.priceAnnual > 0) {
      const annual = await this.stripe.createPrice({
        product: { name: plan.name, description: plan.description },
        unitAmount: plan.priceAnnual,
        currency: plan.currency,
        recurring: { interval: "year" },
        metadata: { planId: id, billing: "annual" },
      });
      plan.stripePriceIdAnnual = annual.id;
    }

    await this.storage.set(planKey(id), plan);
    const index = (await this.storage.get<string[]>(PLAN_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(PLAN_INDEX_KEY, [...index, id]);
    }

    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "memberships",
      action: "membership.plan_created",
      message: `Created plan "${plan.name}" at ${formatMoney(plan.priceMonthly, plan.currency)}/mo.`,
      metadata: { planId: id, priceMonthly: plan.priceMonthly, currency: plan.currency },
    });

    return plan;
  }

  async update(id: string, patch: UpdatePlanPatch, actor: UserId): Promise<Plan | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const priceChanged = (patch.priceMonthly !== undefined && patch.priceMonthly !== existing.priceMonthly)
      || (patch.priceAnnual !== undefined && patch.priceAnnual !== existing.priceAnnual)
      || (patch.currency !== undefined && patch.currency !== existing.currency);

    const next: Plan = {
      ...existing,
      ...patch,
      name: patch.name?.trim() ?? existing.name,
      features: patch.features ?? existing.features,
      benefitIds: patch.benefitIds ?? existing.benefitIds,
      updatedAt: now(),
    };

    // Stripe Prices are immutable. If price/currency changed, mint
    // new Price ids and orphan the old ones (subscribers on the old
    // price keep paying; new signups go through the new price).
    if (priceChanged) {
      if (next.priceMonthly > 0) {
        const monthly = await this.stripe.createPrice({
          product: { name: next.name, description: next.description },
          unitAmount: next.priceMonthly,
          currency: next.currency,
          recurring: { interval: "month" },
          metadata: { planId: id, billing: "monthly" },
        });
        next.stripePriceIdMonthly = monthly.id;
      } else {
        next.stripePriceIdMonthly = undefined;
      }
      if (next.priceAnnual > 0) {
        const annual = await this.stripe.createPrice({
          product: { name: next.name, description: next.description },
          unitAmount: next.priceAnnual,
          currency: next.currency,
          recurring: { interval: "year" },
          metadata: { planId: id, billing: "annual" },
        });
        next.stripePriceIdAnnual = annual.id;
      } else {
        next.stripePriceIdAnnual = undefined;
      }
    }

    await this.storage.set(planKey(id), next);

    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "memberships",
      action: "membership.plan_updated",
      message: `Updated plan "${next.name}".`,
      metadata: { planId: id, fields: Object.keys(patch), priceChanged },
    });

    return next;
  }

  // Soft archive: status flips to "archived"; existing subscribers keep
  // paying their old plan. New signups can't pick this plan from the
  // tier grid because we filter by status === "active" everywhere
  // public-facing.
  async archive(id: string, actor: UserId): Promise<Plan | null> {
    return this.update(id, { status: "archived" }, actor);
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(planKey(id));
    const index = (await this.storage.get<string[]>(PLAN_INDEX_KEY)) ?? [];
    await this.storage.set(PLAN_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "memberships",
      action: "membership.plan_deleted",
      message: `Deleted plan "${existing.name}".`,
      metadata: { planId: id },
    });
    return true;
  }

  // Idempotent. Seeds Bronze / Silver / Gold defaults if no plans exist
  // yet for this client. Called from `onInstall`.
  async seedDefaults(actor: UserId, currency: Currency = "usd"): Promise<{ seeded: number; existed: number }> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length };

    const defaults: CreatePlanInput[] = [
      {
        name: "Bronze",
        description: "Free tier — basic access.",
        priceMonthly: 0,
        priceAnnual: 0,
        currency,
        features: ["Read-only access", "Community support"],
        order: 10,
      },
      {
        name: "Silver",
        description: "Most popular — full access plus member perks.",
        priceMonthly: 999,            // $9.99
        priceAnnual: 9999,            // $99.99 = ~17% off monthly
        currency,
        features: ["Full access", "Member discount on store", "Priority support"],
        trialDays: 7,
        order: 20,
      },
      {
        name: "Gold",
        description: "Top tier — everything in Silver plus exclusive content + concierge.",
        priceMonthly: 2499,           // $24.99
        priceAnnual: 24999,           // $249.99
        currency,
        features: ["Everything in Silver", "Exclusive content", "1-on-1 concierge"],
        trialDays: 14,
        order: 30,
      },
    ];

    let seeded = 0;
    for (const def of defaults) {
      try {
        await this.create(def, actor);
        seeded += 1;
      } catch {
        // Concurrent seed — ignore and keep going.
      }
    }
    return { seeded, existed: 0 };
  }
}

function formatMoney(cents: number, currency: string): string {
  const dollars = (cents / 100).toFixed(2);
  const symbol = currency === "usd" ? "$" : currency === "gbp" ? "£" : currency === "eur" ? "€" : "";
  return `${symbol}${dollars}`;
}
