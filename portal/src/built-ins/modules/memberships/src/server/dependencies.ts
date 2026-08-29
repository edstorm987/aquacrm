// Who is still on a plan, before anyone decides to delete it.
//
// The roadmap's dependency-safe-membership-affiliate-retirement item states:
// *"Plan DELETE leaves a subscriber row but hides it from admin lists and
// removes benefits without reconciling billing."* Verified, and the mechanism is
// worse than that sentence suggests.
//
// ── Why the subscriber becomes UNREACHABLE, not merely hidden ─────────────
//
// `SubscriptionService.list()` does not walk subscriptions. It walks the
// surviving PLANS and collects each one's member set:
//
//     const plans = await this.plans.list();
//     for (const plan of plans) {
//       const userIds = await storage.get(`memberships/by-plan/${plan.id}`);
//       …
//     }
//
// Delete the plan and its members are no longer enumerable at all. The
// subscription rows still exist, and so does the `by-plan` set holding their
// user ids — but nothing can reach them, because the only path in starts from a
// plan that is gone.
//
// Three things then happen at once, and the third is what makes the first two
// dangerous:
//
//   1. the subscription row survives, so external billing is untouched and the
//      member keeps paying;
//   2. `getBenefitsForUser` resolves benefits through `plans.get(sub.planId)`,
//      which now returns null — so the member silently loses what they pay for;
//   3. the admin cannot see them in any list, so nobody can find out.
//
// A paying member who receives nothing and appears nowhere is not a data
// integrity problem; it is a billing one.
//
// ── This module deliberately decides NOTHING ───────────────────────────────
//
// The roadmap's own instruction is to *"use the existing plan archive … for
// ordinary retirement"* — `PlanService.archive` already exists and is the
// documented path, keeping existing subscribers paying while hiding the plan
// from new signups — and to define an explicit exceptional purge that preserves
// subscriber access and reconciles billing. Which applies is Ed's decision. This
// answers only what every version of it must ask first: *who is still on it?*

import type { MembershipsContainer } from "./index";
import type { StoragePort } from "./ports";
import type { Subscription } from "../lib/domain";

export interface PlanDependant {
  kind: "subscriber";
  userId: string;
  status: Subscription["status"];
  /** True when this subscriber is still being billed for the plan. */
  billable: boolean;
}

export interface PlanDependencyInventory {
  planId: string;
  dependants: PlanDependant[];
  total: number;
  /**
   * Subscribers whose billing would keep running after the plan is gone. The
   * number that decides whether deletion is a data change or a money one.
   */
  billableSubscribers: number;
  /**
   * True when deleting this plan would make its subscribers unreachable through
   * `SubscriptionService.list()`, which enumerates via surviving plans.
   */
  wouldBecomeUnreachable: boolean;
}

const BILLABLE_STATUSES = new Set<Subscription["status"]>(["active", "past_due", "trialing"]);

/**
 * Everyone still on this plan.
 *
 * Reads the plan's member set DIRECTLY rather than through
 * `subscriptions.list()`, because that method is the thing this exists to warn
 * about: it enumerates by surviving plan, so asking it after a delete returns
 * nothing and asking it before would work only by luck of ordering.
 */
export async function planDependencyInventory(
  services: Pick<MembershipsContainer, "subscriptions">,
  storage: StoragePort,
  planId: string,
): Promise<PlanDependencyInventory> {
  const empty: PlanDependencyInventory = {
    planId, dependants: [], total: 0, billableSubscribers: 0, wouldBecomeUnreachable: false,
  };
  if (!planId) return empty;

  const userIds = (await storage.get<string[]>(`memberships/by-plan/${planId}`)) ?? [];
  const dependants: PlanDependant[] = [];
  for (const userId of userIds) {
    const subscription = await services.subscriptions.getByUser(userId);
    if (!subscription || subscription.planId !== planId) continue;
    dependants.push({
      kind: "subscriber",
      userId,
      status: subscription.status,
      billable: BILLABLE_STATUSES.has(subscription.status),
    });
  }

  const billableSubscribers = dependants.filter(dependant => dependant.billable).length;
  return {
    planId,
    dependants,
    total: dependants.length,
    billableSubscribers,
    // Any subscriber at all becomes unreachable, billable or not — the list
    // walks plans, and the plan is what goes away.
    wouldBecomeUnreachable: dependants.length > 0,
  };
}
