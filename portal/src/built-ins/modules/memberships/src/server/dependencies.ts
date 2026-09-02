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

const dependencyLockTails = new Map<string, Promise<void>>();

async function localDependencyLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = dependencyLockTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  dependencyLockTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (dependencyLockTails.get(key) === tail) dependencyLockTails.delete(key);
  }
}

/** One install-wide lane for plan parents and every subscription reference. */
export function withMembershipDependencyLock<T>(
  storage: StoragePort,
  agencyId: string,
  clientId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `memberships:dependency-graph:${agencyId}:${clientId}`;
  return storage.runExclusive
    ? storage.runExclusive(key, operation)
    : localDependencyLock(key, operation);
}

export interface PlanDependant {
  kind: "subscriber" | "subscription-command" | "plan-price-command";
  userId: string;
  status: Subscription["status"] | "pending";
  /** True when this subscriber is still being billed for the plan. */
  billable: boolean;
  operationId?: string;
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
  /** Provider/signup commands that can still materialise a subscription. */
  pendingSubscriptions: number;
  /** Price changes whose provider outcome still targets this plan. */
  pendingPlanChanges: number;
  /**
   * True when deleting this plan would make its subscribers unreachable through
   * `SubscriptionService.list()`, which enumerates via surviving plans.
   */
  wouldBecomeUnreachable: boolean;
}

export class PlanHasDependantsError extends Error {
  constructor(
    readonly planName: string,
    readonly dependencies: PlanDependencyInventory,
  ) {
    super(`Plan ${dependencies.planId} still has ${dependencies.total} blocking dependant(s).`);
    this.name = "PlanHasDependantsError";
  }
}

const BILLABLE_STATUSES = new Set<Subscription["status"]>(["active", "past_due", "trialing"]);

function inventoryFor(planId: string, dependants: PlanDependant[]): PlanDependencyInventory {
  return {
    planId,
    dependants,
    total: dependants.length,
    billableSubscribers: dependants.filter(dependant => dependant.billable).length,
    pendingSubscriptions: dependants.filter(dependant => dependant.kind === "subscription-command").length,
    pendingPlanChanges: dependants.filter(dependant => dependant.kind === "plan-price-command").length,
    wouldBecomeUnreachable: dependants.length > 0,
  };
}

interface StoredSubscriptionCommand {
  kind?: string;
  stage?: string;
  userId?: string;
  planId?: string;
}

interface StoredPlanPriceCommand {
  id?: string;
  kind?: string;
  stage?: string;
  actor?: string;
  planId?: string;
  agencyId?: string;
  clientId?: string;
}

async function pendingCommandDependants(
  storage: StoragePort,
  planId: string,
  seenUsers: Set<string>,
): Promise<PlanDependant[]> {
  const dependants: PlanDependant[] = [];
  const keys = await storage.list("memberships/subscription-command/");
  for (const key of keys) {
    const command = await storage.get<StoredSubscriptionCommand>(key);
    if (command?.kind !== "subscribe" || command.planId !== planId || !command.userId || seenUsers.has(command.userId)) continue;
    seenUsers.add(command.userId);
    dependants.push({
      kind: "subscription-command",
      userId: command.userId,
      status: "pending",
      billable: false,
    });
  }
  return dependants;
}

async function pendingPlanChangeDependants(
  storage: StoragePort,
  agencyId: string,
  clientId: string,
  planId: string,
): Promise<PlanDependant[]> {
  const dependants: PlanDependant[] = [];
  const keys = await storage.list("memberships/plan-price-command/");
  for (const key of keys) {
    const command = await storage.get<StoredPlanPriceCommand>(key);
    if (
      command?.kind !== "update"
      || command.planId !== planId
      || command.agencyId !== agencyId
      || command.clientId !== clientId
      || (command.stage !== "pending" && command.stage !== "provider_applied")
    ) continue;
    dependants.push({
      kind: "plan-price-command",
      userId: command.actor ?? "",
      status: "pending",
      billable: false,
      operationId: command.id,
    });
  }
  return dependants;
}

/** Storage-only form used by the Plan service while it owns the graph lock. */
export async function planDependencyInventoryFromStorage(
  storage: StoragePort,
  agencyId: string,
  clientId: string,
  planId: string,
): Promise<PlanDependencyInventory> {
  if (!planId) return inventoryFor(planId, []);
  const userIds = (await storage.get<string[]>(`memberships/by-plan/${planId}`)) ?? [];
  const dependants: PlanDependant[] = [];
  const seenUsers = new Set<string>();
  for (const userId of userIds) {
    const subscription = await storage.get<Subscription>(`memberships/subscribers/${userId}`);
    if (
      subscription
      && subscription.agencyId === agencyId
      && subscription.clientId === clientId
      && subscription.planId === planId
    ) {
      seenUsers.add(subscription.endCustomerUserId);
      dependants.push({
        kind: "subscriber",
        userId: subscription.endCustomerUserId,
        status: subscription.status,
        billable: BILLABLE_STATUSES.has(subscription.status),
      });
    } else if (typeof userId === "string" && userId) {
      // A member-index write can durably precede its row. Treat that recovery
      // candidate as a dependant rather than declaring the plan empty.
      seenUsers.add(userId);
      dependants.push({ kind: "subscription-command", userId, status: "pending", billable: false });
    }
  }
  dependants.push(...await pendingCommandDependants(storage, planId, seenUsers));
  dependants.push(...await pendingPlanChangeDependants(storage, agencyId, clientId, planId));
  return inventoryFor(planId, dependants);
}

/**
 * Everyone still on this plan.
 *
 * Reads the plan's member set DIRECTLY rather than through
 * `subscriptions.list()`, because that method is the thing this exists to warn
 * about: it enumerates by surviving plan, so asking it after a delete returns
 * nothing and asking it before would work only by luck of ordering.
 */
export async function planDependencyInventory(
  services: Pick<MembershipsContainer, "subscriptions" | "plans">,
  storage: StoragePort,
  planId: string,
): Promise<PlanDependencyInventory> {
  if (!planId) return inventoryFor(planId, []);

  const userIds = (await storage.get<string[]>(`memberships/by-plan/${planId}`)) ?? [];
  const dependants: PlanDependant[] = [];
  const seenUsers = new Set<string>();
  for (const userId of userIds) {
    const subscription = await services.subscriptions.getByUser(userId);
    if (subscription?.planId === planId) {
      seenUsers.add(subscription.endCustomerUserId);
      dependants.push({
        kind: "subscriber",
        userId: subscription.endCustomerUserId,
        status: subscription.status,
        billable: BILLABLE_STATUSES.has(subscription.status),
      });
    } else if (typeof userId === "string" && userId) {
      seenUsers.add(userId);
      dependants.push({ kind: "subscription-command", userId, status: "pending", billable: false });
    }
  }
  dependants.push(...await pendingCommandDependants(storage, planId, seenUsers));
  const plan = await services.plans.get(planId);
  if (plan) {
    dependants.push(...await pendingPlanChangeDependants(
      storage,
      plan.agencyId,
      plan.clientId,
      planId,
    ));
  }
  return inventoryFor(planId, dependants);
}
