// Subscription service — Stripe customer + subscription lifecycle.
//
// Storage:
//   memberships/subscribers/<userId>     — Subscription row
//   memberships/by-plan/<planId>         — string[] of subscriber userIds
//   memberships/customer-by-user/<uid>   — Stripe customer id (cached)
//
// One active subscription per (clientId, endCustomerUserId). If the
// user calls subscribe with a different plan, the existing
// subscription is updated in-place (Stripe `changeSubscriptionPlan`).
//
// Idempotency on Stripe ids: every write either creates a new
// Stripe-side resource or upserts on the stored stripeSubscriptionId.
// Webhook handlers call `upsertFromStripe` which is the canonical
// reconciliation entry point.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Billing,
  CancelInput,
  Subscription,
  SubscriptionStatus,
  SubscribeInput,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripeCheckoutSession,
  StripePort,
  StripeSubscription,
  UserPort,
} from "./ports";
import type { PlanService } from "./plans";
import { withMembershipDependencyLock } from "./dependencies";
import {
  assertBilling,
  assertCancelInput,
  assertProviderCheckoutSession,
  assertProviderId,
  assertProviderSubscription,
  assertProviderUrl,
  assertSubscribeInput,
  assertSubscription,
} from "../lib/runtimeValidation";

const subKey = (userId: UserId): string => `memberships/subscribers/${userId}`;
const byPlanKey = (planId: string): string => `memberships/by-plan/${planId}`;
const customerCacheKey = (userId: UserId): string => `memberships/customer-by-user/${userId}`;
const commandKey = (userId: UserId): string => `memberships/subscription-command/${userId}`;
const commandArchiveKey = (userId: UserId, commandId: string): string =>
  `memberships/subscription-operation-commands/${encodeURIComponent(userId)}/${encodeURIComponent(commandId)}`;
const operationBindingKey = (userId: UserId, requestedId: string): string =>
  `memberships/subscription-operation-bindings/${encodeURIComponent(userId)}/${encodeURIComponent(requestedId)}`;

export type SubscribeSuccess =
  | { ok: true; mode: "checkout"; checkoutUrl: string; operationId: string; planId: string; billing: Billing }
  | { ok: true; mode: "free" | "changed"; subscription: Subscription; operationId: string; planId: string; billing: Billing };

interface SubscriptionCommand {
  id: string;
  signature: string;
  /** Browser-visible intent, kept separate from mutable provider execution terms. */
  requestSignature?: string;
  kind: "subscribe" | "cancel";
  stage: "pending" | "provider_applied" | "completed";
  userId: UserId;
  planId?: string;
  planName?: string;
  billing?: Billing;
  subscribeMode?: SubscribeIntentMode;
  providerSubscriptionId?: string;
  retiredProviderSubscriptionIds?: string[];
  priceId?: string;
  trialDays?: number;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  customerName?: string;
  atPeriodEnd?: boolean;
  subscriptionSnapshot?: Subscription;
  customerId?: string;
  providerSubscription?: StripeSubscription;
  checkout?: StripeCheckoutSession;
  checkoutReconciledAt?: number;
  subscribeResult?: SubscribeSuccess;
  cancelResult?: Subscription;
  createdAt: number;
  updatedAt: number;
}

interface SubscriptionOperationBinding {
  requestedId: string;
  canonicalId: string;
  kind: SubscriptionCommand["kind"];
  signature: string;
  requestSignature?: string;
  createdAt: number;
}

const localUserCommandTails = new Map<string, Promise<void>>();
const localUserProviderTails = new Map<string, Promise<void>>();

async function localUserExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localUserCommandTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  localUserCommandTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (localUserCommandTails.get(key) === tail) localUserCommandTails.delete(key);
  }
}

async function localUserProviderExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localUserProviderTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  localUserProviderTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (localUserProviderTails.get(key) === tail) localUserProviderTails.delete(key);
  }
}

const commandStageRank: Record<SubscriptionCommand["stage"], number> = {
  pending: 0,
  provider_applied: 1,
  completed: 2,
};

const DEFAULT_CHECKOUT_LIFETIME_MS = 24 * 60 * 60 * 1_000;

export class SubscriptionOperationConflictError extends Error {
  constructor(readonly operationId: string, message: string) {
    super(message);
    this.name = "SubscriptionOperationConflictError";
  }
}

export class MembershipCheckoutPendingReconciliationError extends Error {
  constructor(readonly operationId: string) {
    super(
      "A previous membership checkout can still produce a paid subscription. "
      + "Reconcile or expire it with the payment provider before starting another checkout.",
    );
    this.name = "MembershipCheckoutPendingReconciliationError";
  }
}

export class MembershipLegacyOperationRecoveryError extends Error {
  constructor(readonly operationId: string) {
    super(
      "This membership change predates durable provider snapshots and has no recorded provider outcome. "
      + "Reconcile the customer with the payment provider before retrying it.",
    );
    this.name = "MembershipLegacyOperationRecoveryError";
  }
}

function operationId(value?: string): string {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160);
  return cleaned || makeId("membership_operation");
}

type SubscribeIntentMode = "checkout" | "free" | "change-plan" | "cancel-for-free" | "current";

function legacySubscribeTerms(command: SubscriptionCommand): { planId: string; billing: Billing } | null {
  if (!command.planId || !command.billing) return null;
  return command.signature === `subscribe:${command.planId}:${command.billing}`
    ? { planId: command.planId, billing: command.billing }
    : null;
}

function isLegacyCancelCommand(command: SubscriptionCommand): boolean {
  return command.requestSignature === undefined
    && command.kind === "cancel"
    && command.signature === `cancel:${command.atPeriodEnd ? "period-end" : "immediate"}`;
}

function subscribeSignature(input: {
  planId: string;
  billing: Billing;
  mode: SubscribeIntentMode;
  providerSubscriptionId?: string;
  priceId?: string;
  trialDays?: number;
  successUrl?: string;
  cancelUrl?: string;
}): string {
  // Keep the property order explicit: this string is a persisted fingerprint,
  // so refactors must not let object-construction order redefine an intent.
  return JSON.stringify({
    kind: "subscribe",
    mode: input.mode,
    planId: input.planId,
    billing: input.billing,
    providerSubscriptionId: input.providerSubscriptionId ?? null,
    priceId: input.priceId ?? null,
    trialDays: input.trialDays ?? null,
    successUrl: input.successUrl ?? null,
    cancelUrl: input.cancelUrl ?? null,
  });
}

function subscribeRequestSignature(
  input: Pick<SubscribeInput, "planId" | "billing" | "successUrl" | "cancelUrl">,
  mode: SubscribeIntentMode,
): string {
  return JSON.stringify({
    kind: "subscribe",
    planId: input.planId,
    billing: input.billing,
    // Hosted checkout owns these destinations. Other modes never send them to
    // the provider, so changing an irrelevant default URL is not intent drift.
    successUrl: mode === "checkout" ? input.successUrl : null,
    cancelUrl: mode === "checkout" ? input.cancelUrl : null,
  });
}

function storedSubscribeMode(command: SubscriptionCommand): SubscribeIntentMode | undefined {
  if (command.subscribeMode) return command.subscribeMode;
  try {
    const parsed = JSON.parse(command.signature) as { mode?: SubscribeIntentMode };
    return parsed.mode;
  } catch {
    return undefined;
  }
}

function storedSubscribeRequestSignature(
  command: SubscriptionCommand,
  mode: SubscribeIntentMode,
): string | undefined {
  if (command.requestSignature) return command.requestSignature;
  if (!command.planId || !command.billing) return undefined;
  try {
    const parsed = JSON.parse(command.signature) as { successUrl?: string | null; cancelUrl?: string | null };
    return subscribeRequestSignature({
      planId: command.planId,
      billing: command.billing,
      successUrl: parsed.successUrl ?? "",
      cancelUrl: parsed.cancelUrl ?? "",
    }, mode);
  } catch {
    return undefined;
  }
}

function storedSubscribeExecution(command: SubscriptionCommand): {
  mode: SubscribeIntentMode;
  planId: string;
  planName: string;
  billing: Billing;
  providerSubscriptionId?: string;
  priceId?: string;
  trialDays?: number;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  customerName?: string;
} | null {
  const mode = storedSubscribeMode(command);
  if (!mode || !command.planId || !command.billing) return null;
  let parsed: {
    providerSubscriptionId?: string | null;
    priceId?: string | null;
    trialDays?: number | null;
    successUrl?: string | null;
    cancelUrl?: string | null;
  } = {};
  try {
    parsed = JSON.parse(command.signature) as typeof parsed;
  } catch {
    // New commands carry the fields directly. A malformed legacy fingerprint
    // will fail closed below if a required execution value is absent.
  }
  return {
    mode,
    planId: command.planId,
    planName: command.planName ?? command.planId,
    billing: command.billing,
    providerSubscriptionId: command.providerSubscriptionId
      ?? parsed.providerSubscriptionId
      ?? command.providerSubscription?.id
      ?? undefined,
    priceId: command.priceId ?? parsed.priceId ?? undefined,
    trialDays: command.trialDays ?? parsed.trialDays ?? undefined,
    successUrl: command.successUrl ?? parsed.successUrl ?? undefined,
    cancelUrl: command.cancelUrl ?? parsed.cancelUrl ?? undefined,
    customerEmail: command.customerEmail,
    customerName: command.customerName,
  };
}

function cancelRequestSignature(input: Pick<CancelInput, "atPeriodEnd">): string {
  return JSON.stringify({ kind: "cancel", atPeriodEnd: input.atPeriodEnd });
}

function cancelSignature(subscription: Subscription, atPeriodEnd: boolean): string {
  return JSON.stringify({
    kind: "cancel",
    mode: atPeriodEnd ? "period-end" : "immediate",
    subscriptionId: subscription.id,
    providerSubscriptionId: subscription.stripeSubscriptionId ?? null,
    planId: subscription.planId,
    billing: subscription.billing,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    // A resumed or otherwise reconciled row is a new lifecycle generation even
    // when Stripe keeps the same subscription id.
    subscriptionUpdatedAt: subscription.updatedAt,
  });
}

// Map raw Stripe statuses to our typed enum. Anything we don't
// recognise becomes "incomplete" so the UI shows a "needs attention"
// state instead of confidently rendering a bad status.
function mapStripeStatus(raw: string, collectionPaused = false): SubscriptionStatus {
  if (collectionPaused) return "paused";
  switch (raw) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "unpaid": return "past_due";
    case "canceled": return "canceled";
    case "paused": return "paused";
    case "incomplete":
    case "incomplete_expired":
    default: return "incomplete";
  }
}

function fromStripe(
  agencyId: AgencyId,
  clientId: ClientId,
  userId: UserId,
  planId: string,
  billing: Billing,
  stripeSub: StripeSubscription,
  existingId?: string,
): Subscription {
  const ts = now();
  return {
    id: existingId ?? makeId("sub"),
    agencyId,
    clientId,
    endCustomerUserId: userId,
    planId,
    stripeCustomerId: stripeSub.customerId,
    stripeSubscriptionId: stripeSub.id,
    billing,
    status: mapStripeStatus(stripeSub.status, stripeSub.collectionPaused),
    currentPeriodEnd: stripeSub.currentPeriodEnd
      ? new Date(stripeSub.currentPeriodEnd * 1000).toISOString()
      : undefined,
    cancelAtPeriodEnd: stripeSub.cancelAtPeriodEnd,
    trialEndsAt: stripeSub.trialEnd
      ? new Date(stripeSub.trialEnd * 1000).toISOString()
      : undefined,
    createdAt: ts,
    updatedAt: ts,
  };
}

function retiredProviderIds(subscription: Subscription | null | undefined): string[] {
  return [...new Set([
    ...(subscription?.retiredStripeSubscriptionIds ?? []),
    ...(subscription?.retiredStripeSubscriptionId ? [subscription.retiredStripeSubscriptionId] : []),
  ])];
}

function addRetiredProviderIds(
  subscription: Subscription,
  ...ids: Array<string | undefined>
): Subscription {
  const retiredStripeSubscriptionIds = [...new Set([
    ...retiredProviderIds(subscription),
    ...ids.filter((id): id is string => Boolean(id)),
  ])];
  return {
    ...subscription,
    retiredStripeSubscriptionId: undefined,
    retiredStripeSubscriptionIds: retiredStripeSubscriptionIds.length > 0
      ? retiredStripeSubscriptionIds
      : undefined,
  };
}

export class SubscriptionService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private stripe: StripePort,
    private user: UserPort,
    private plans: PlanService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────

  async getByUser(userId: UserId): Promise<Subscription | null> {
    const row = await this.storage.get<Subscription>(subKey(userId));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async list(filter?: { planId?: string; status?: SubscriptionStatus }): Promise<Subscription[]> {
    // Walk known planIds + collect their member sets.
    const plans = await this.plans.list();
    const seen = new Set<UserId>();
    const out: Subscription[] = [];
    for (const plan of plans) {
      if (filter?.planId && plan.id !== filter.planId) continue;
      const userIds = (await this.storage.get<string[]>(byPlanKey(plan.id))) ?? [];
      for (const uid of userIds) {
        if (seen.has(uid)) continue;
        seen.add(uid);
        const sub = await this.getByUser(uid);
        if (sub && (!filter?.status || sub.status === filter.status)) out.push(sub);
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ─── Subscribe ─────────────────────────────────────────────────────────
  //
  // Returns either a Stripe Checkout session URL (for paid plans) or a
  // synthesised "free-tier" Subscription row directly (for $0 plans).

  async subscribe(input: SubscribeInput): Promise<
    | SubscribeSuccess
    | { ok: false; error: string }
  > {
    assertSubscribeInput(input);
    return this.withUserCommand(input.endCustomerUserId, async () => {
      const requestedOperationId = operationId(input.operationId);
      const requestedCommand = await this.withDependencyGraph(() =>
        this.commandForRequestedOperation(input.endCustomerUserId, requestedOperationId));
      const requestedLegacySubscribe = requestedCommand?.kind === "subscribe"
        ? legacySubscribeTerms(requestedCommand)
        : null;
      if (requestedCommand?.kind === "subscribe") {
        if (requestedLegacySubscribe) {
          if (
            requestedLegacySubscribe.planId !== input.planId
            || requestedLegacySubscribe.billing !== input.billing
          ) {
            throw new SubscriptionOperationConflictError(
              requestedOperationId,
              "operationId was already used for a different membership change.",
            );
          }
          if (requestedCommand.stage === "completed" && requestedCommand.subscribeResult) {
            return this.completedSubscribeResult(requestedCommand);
          }
          if (!requestedCommand.checkout && !requestedCommand.providerSubscription) {
            throw new MembershipLegacyOperationRecoveryError(requestedOperationId);
          }
        } else {
          const mode = storedSubscribeMode(requestedCommand);
          const incomingRequestSignature = mode
            ? subscribeRequestSignature(input, mode)
            : undefined;
          const persistedRequestSignature = mode
            ? storedSubscribeRequestSignature(requestedCommand, mode)
            : undefined;
          if (
            !mode
            || !persistedRequestSignature
            || persistedRequestSignature !== incomingRequestSignature
          ) {
            throw new SubscriptionOperationConflictError(
              requestedOperationId,
              "operationId was already used for a different membership change.",
            );
          }
          if (requestedCommand.stage === "completed" && requestedCommand.subscribeResult) {
            return this.completedSubscribeResult(requestedCommand);
          }
        }
      } else if (requestedCommand) {
        throw new SubscriptionOperationConflictError(
          requestedOperationId,
          "operationId was already used for a different membership change.",
        );
      }

      const profile = requestedCommand?.customerEmail
        ? null
        : await this.user.getUser(input.endCustomerUserId);
      if (!requestedCommand && !profile) {
        return { ok: false, error: "End customer not found." } as const;
      }
      const prepared = await this.withDependencyGraph(async () => {
        if (requestedCommand?.kind === "subscribe") {
          if (requestedLegacySubscribe) {
            const plan = await this.plans.get(requestedLegacySubscribe.planId);
            if (!plan) {
              throw new Error("Legacy membership recovery cannot find its target plan.");
            }
            const existing = await this.getByUser(input.endCustomerUserId);
            const mode: SubscribeIntentMode = requestedCommand.checkout
              ? "checkout"
              : requestedCommand.providerSubscription?.status === "canceled"
                ? "cancel-for-free"
                : "change-plan";
            return {
              ok: true,
              mode,
              planId: requestedLegacySubscribe.planId,
              planName: plan.name,
              billing: requestedLegacySubscribe.billing,
              providerSubscriptionId: requestedCommand.providerSubscription?.id
                ?? existing?.stripeSubscriptionId,
              priceId: undefined,
              trialDays: 0,
              successUrl: undefined,
              cancelUrl: undefined,
              customerEmail: profile?.email ?? input.endCustomerUserId,
              customerName: profile?.name,
              existing,
              command: requestedCommand,
            } as const;
          }
          const execution = storedSubscribeExecution(requestedCommand);
          if (!execution) {
            throw new Error("Membership operation history is missing its execution snapshot.");
          }
          const existing = await this.getByUser(input.endCustomerUserId);
          const customerEmail = execution.customerEmail ?? profile?.email ?? input.endCustomerUserId;
          const customerName = execution.customerName ?? profile?.name;
          if (!customerEmail) {
            throw new Error("Membership operation history is missing its customer identity.");
          }
          if (
            execution.mode === "checkout"
            && !requestedCommand.checkout
            && (!execution.priceId || !execution.successUrl || !execution.cancelUrl)
          ) {
            throw new Error("Membership checkout history is missing immutable provider terms.");
          }
          if (
            execution.mode === "change-plan"
            && !requestedCommand.providerSubscription
            && (!execution.providerSubscriptionId || !execution.priceId)
          ) {
            throw new Error("Membership plan-change history is missing immutable provider terms.");
          }
          if (
            (execution.mode === "current" || execution.mode === "cancel-for-free")
            && !execution.providerSubscriptionId
          ) {
            throw new Error("Membership operation history is missing its provider subscription identity.");
          }
          if (execution.mode === "current" && !existing) {
            throw new Error("Membership operation history is missing its subscription row.");
          }
          return {
            ok: true,
            ...execution,
            trialDays: execution.trialDays ?? 0,
            customerEmail,
            customerName,
            existing,
            command: requestedCommand,
          } as const;
        }

        const plan = await this.plans.get(input.planId);
        if (!plan || plan.status !== "active") {
          return { ok: false, error: "Plan not found or not active." } as const;
        }
        if (input.billing === "annual" && plan.priceAnnual <= 0) {
          return { ok: false, error: `Plan ${plan.name} is not available with annual billing.` } as const;
        }
        const isFree = input.billing === "monthly" && plan.priceMonthly === 0;
        const priceId = input.billing === "monthly" ? plan.stripePriceIdMonthly : plan.stripePriceIdAnnual;
        if (!isFree && !priceId) {
          return { ok: false, error: `Plan ${plan.name} has no Stripe price for billing=${input.billing}.` } as const;
        }
        const existing = await this.getByUser(input.endCustomerUserId);
        const hasLiveProviderSubscription = Boolean(
          existing?.stripeSubscriptionId && existing.status !== "canceled",
        );
        const alreadyCurrent = Boolean(
          hasLiveProviderSubscription
          && existing?.planId === plan.id
          && existing.billing === input.billing,
        );
        const mode: SubscribeIntentMode = alreadyCurrent
          ? "current"
          : hasLiveProviderSubscription
            ? (isFree ? "cancel-for-free" : "change-plan")
            : isFree
              ? "free"
              : "checkout";
        const providerSubscriptionId = existing?.stripeSubscriptionId;
        const retiredProviderSubscriptionIds = [...new Set([
          ...retiredProviderIds(existing),
          ...(providerSubscriptionId && existing?.status === "canceled"
            ? [providerSubscriptionId]
            : []),
        ])];
        if (
          (mode === "current" || mode === "change-plan" || mode === "cancel-for-free")
          && !providerSubscriptionId
        ) {
          throw new Error("Membership operation lost its provider subscription identity.");
        }
        const signature = subscribeSignature({
          planId: plan.id,
          billing: input.billing,
          mode,
          ...(mode === "checkout"
            ? {
                priceId: priceId!,
                trialDays: plan.trialDays ?? 0,
                successUrl: input.successUrl,
                cancelUrl: input.cancelUrl,
              }
            : {}),
          ...(mode === "change-plan" ? { priceId: priceId! } : {}),
          ...(mode === "current" || mode === "change-plan" || mode === "cancel-for-free"
            ? { providerSubscriptionId: providerSubscriptionId! }
            : {}),
        });
        const command = await this.beginCommand({
          userId: input.endCustomerUserId,
          kind: "subscribe",
          signature,
          requestSignature: subscribeRequestSignature(input, mode),
          requestedId: requestedOperationId,
          planId: plan.id,
          planName: plan.name,
          billing: input.billing,
          subscribeMode: mode,
          providerSubscriptionId: mode === "checkout" ? undefined : providerSubscriptionId,
          retiredProviderSubscriptionIds: mode === "checkout"
            ? retiredProviderSubscriptionIds
            : undefined,
          priceId: mode === "checkout" || mode === "change-plan" ? priceId! : undefined,
          trialDays: mode === "checkout" ? plan.trialDays ?? 0 : undefined,
          successUrl: mode === "checkout" ? input.successUrl : undefined,
          cancelUrl: mode === "checkout" ? input.cancelUrl : undefined,
          customerEmail: profile!.email,
          customerName: profile!.name,
        });
        return {
          ok: true,
          mode,
          planId: plan.id,
          planName: plan.name,
          billing: input.billing,
          providerSubscriptionId,
          priceId: mode === "checkout" || mode === "change-plan" ? priceId! : undefined,
          trialDays: mode === "checkout" ? plan.trialDays ?? 0 : undefined,
          successUrl: mode === "checkout" ? input.successUrl : undefined,
          cancelUrl: mode === "checkout" ? input.cancelUrl : undefined,
          customerEmail: profile!.email,
          customerName: profile!.name,
          existing,
          command,
        } as const;
      });
      if (!prepared.ok) return prepared;
      const {
        mode,
        planId,
        planName,
        billing,
        providerSubscriptionId,
        priceId,
        trialDays,
        successUrl,
        cancelUrl,
        customerEmail,
        customerName,
        existing,
      } = prepared;
      let command = prepared.command;

      if (command.stage === "completed" && command.subscribeResult) {
        return this.completedSubscribeResult(command);
      }

      if (mode === "current") {
        return this.withDependencyGraph(async () => {
          const current = await this.loadCommand(command);
          if (current.stage === "completed" && current.subscribeResult) {
            return this.completedSubscribeResult(current);
          }
          if (!existing) throw new Error("Membership operation history is missing its subscription row.");
          const result: SubscribeSuccess = {
            ok: true,
            mode: "changed",
            subscription: existing,
            operationId: current.id,
            planId,
            billing,
          };
          const saved = await this.saveCommand({
            ...current,
            stage: "completed",
            subscribeResult: result,
          });
          return saved.subscribeResult ?? result;
        });
      }

      if (mode === "change-plan" || mode === "cancel-for-free") {
        return this.withUserProviderCall(input.endCustomerUserId, async () => {
          let providerCommand = await this.loadCommand(command);
          if (providerCommand.stage === "completed" && providerCommand.subscribeResult) {
            return this.completedSubscribeResult(providerCommand);
          }
          if (!providerCommand.providerSubscription) {
            const providerSubscription = mode === "cancel-for-free"
              ? await this.stripe.cancelSubscription(
                  providerSubscriptionId!,
                  false,
                  this.providerKey(providerCommand, "cancel-for-free"),
                )
              : await this.stripe.changeSubscriptionPlan({
                  id: providerSubscriptionId!,
                  newPriceId: priceId!,
                  metadata: {
                    agencyId: this.agencyId,
                    clientId: this.clientId,
                    endCustomerUserId: input.endCustomerUserId,
                    planId,
                    billing,
                  },
                  idempotencyKey: this.providerKey(providerCommand, "change-plan"),
                });
            providerCommand = await this.checkpointProviderSubscription(
              providerCommand,
              providerSubscription,
            );
          }
          if (providerCommand.stage === "completed" && providerCommand.subscribeResult) {
            return this.completedSubscribeResult(providerCommand);
          }
          // Keep the cross-process provider lane through authoritative state
          // adoption. A webhook for this same customer cannot persist a newer
          // provider snapshot in the former release-before-adopt gap.
          return this.withDependencyGraph(async () => {
            const latestCommand = await this.loadCommand(providerCommand);
            if (latestCommand.stage === "completed" && latestCommand.subscribeResult) {
              return this.completedSubscribeResult(latestCommand);
            }
            const providerSubscription = latestCommand.providerSubscription;
            if (!providerSubscription) throw new Error("Membership provider outcome was not recorded.");
            const currentSubscription = await this.getByUser(input.endCustomerUserId);
            const subscription = mode === "cancel-for-free"
              ? await this.persistFreeSubscription(input.endCustomerUserId, currentSubscription, planId, billing)
              : await this.upsertFromStripeForUser(
                  input.endCustomerUserId,
                  planId,
                  billing,
                  providerSubscription,
                );
            const resultMode = mode === "cancel-for-free" ? "free" : "changed";
            await this.logSubscribe(
              latestCommand,
              subscription,
              customerEmail,
              planName,
              true,
            );
            const result: SubscribeSuccess = {
              ok: true,
              mode: resultMode,
              subscription,
              operationId: latestCommand.id,
              planId,
              billing,
            };
            const saved = await this.saveCommand({ ...latestCommand, stage: "completed", subscribeResult: result });
            return saved.subscribeResult ?? result;
          });
        });
      }

      if (mode === "free") {
        return this.withDependencyGraph(async () => {
          const latestCommand = await this.loadCommand(command);
          if (latestCommand.stage === "completed" && latestCommand.subscribeResult) {
            return this.completedSubscribeResult(latestCommand);
          }
          const current = await this.getByUser(input.endCustomerUserId);
          const subscription = await this.persistFreeSubscription(
            input.endCustomerUserId,
            current,
            planId,
            billing,
          );
          await this.logSubscribe(
            latestCommand,
            subscription,
            customerEmail,
            planName,
            Boolean(current && current.status !== "canceled"),
          );
          const result: SubscribeSuccess = {
            ok: true,
            mode: "free",
            subscription,
            operationId: latestCommand.id,
            planId,
            billing,
          };
          const saved = await this.saveCommand({ ...latestCommand, stage: "completed", subscribeResult: result });
          return saved.subscribeResult ?? result;
        });
      }

      command = await this.withUserProviderCall(input.endCustomerUserId, async () => {
        let current = await this.loadCommand(command);
        if (current.stage === "completed") return current;
        let customerId = current.customerId
          ?? existing?.stripeCustomerId
          ?? await this.storage.get<string>(customerCacheKey(input.endCustomerUserId));
        if (!customerId) {
          const customer = await this.stripe.createCustomer({
            email: customerEmail,
            name: customerName,
            metadata: {
              agencyId: this.agencyId,
              clientId: this.clientId,
              endCustomerUserId: input.endCustomerUserId,
            },
            idempotencyKey: this.providerKey(current, "create-customer"),
          });
          assertProviderId(customer.id, "stripeCustomerId");
          customerId = customer.id;
          current = await this.withDependencyGraph(async () => {
            const latest = await this.loadCommand(current);
            if (latest.stage === "completed" || latest.customerId) return latest;
            return this.saveCommand({ ...latest, customerId });
          });
          if (current.stage === "completed") return current;
          customerId = current.customerId ?? customerId;
        }
        await this.withDependencyGraph(() =>
          this.storage.set(customerCacheKey(input.endCustomerUserId), customerId));
        let checkout = current.checkout;
        if (!checkout) {
          checkout = await this.stripe.createCheckoutSession({
            customerId,
            priceId: priceId!,
            successUrl: successUrl!,
            cancelUrl: cancelUrl!,
            trialDays,
            metadata: {
              planId,
              billing,
              endCustomerUserId: input.endCustomerUserId,
              agencyId: this.agencyId,
              clientId: this.clientId,
            },
            idempotencyKey: this.providerKey(current, "create-checkout"),
          });
          assertProviderCheckoutSession(checkout);
        }
        return this.withDependencyGraph(async () => {
          const latest = await this.loadCommand(current);
          if (latest.stage === "completed") return latest;
          if (latest.stage === "provider_applied" && latest.checkout) return latest;
          return this.saveCommand({
            ...latest,
            customerId: latest.customerId ?? customerId,
            checkout: latest.checkout ?? checkout,
            stage: "provider_applied",
          });
        });
      });
      if (command.stage === "completed" && command.subscribeResult) return this.completedSubscribeResult(command);
      return this.withDependencyGraph(async () => {
        const latestCommand = await this.loadCommand(command);
        if (latestCommand.stage === "completed" && latestCommand.subscribeResult) {
          return this.completedSubscribeResult(latestCommand);
        }
        const checkout = latestCommand.checkout;
        if (!checkout) throw new Error("Membership checkout outcome was not recorded.");
        const result: SubscribeSuccess = {
          ok: true,
          mode: "checkout",
          checkoutUrl: checkout.url,
          operationId: latestCommand.id,
          planId,
          billing,
        };
        const saved = await this.saveCommand({
          ...latestCommand,
          checkout,
          stage: "completed",
          subscribeResult: result,
        });
        return saved.subscribeResult ?? result;
      });
    });
  }

  // ─── Cancel ─────────────────────────────────────────────────────────────

  async cancel(input: CancelInput): Promise<Subscription | null> {
    assertCancelInput(input);
    return this.withUserCommand(input.endCustomerUserId, async () => {
      const requestedOperationId = operationId(input.operationId);
      const requestedCommand = await this.withDependencyGraph(() =>
        this.commandForRequestedOperation(input.endCustomerUserId, requestedOperationId));
      let requestedLegacyCancelSnapshot: Subscription | null = null;
      if (requestedCommand) {
        const expectedRequestSignature = cancelRequestSignature(input);
        const storedRequestSignature = requestedCommand.requestSignature;
        const isLegacyCancel = isLegacyCancelCommand(requestedCommand);
        if (isLegacyCancel) {
          const current = requestedCommand.cancelResult || requestedCommand.subscriptionSnapshot
            ? null
            : await this.withDependencyGraph(() => this.getByUser(input.endCustomerUserId));
          const currentIsOriginalProviderGeneration = Boolean(
            current
            && requestedCommand.providerSubscription
            && current.stripeSubscriptionId === requestedCommand.providerSubscription.id
            && current.updatedAt <= requestedCommand.createdAt
            && (!requestedCommand.providerSubscriptionId
              || current.stripeSubscriptionId === requestedCommand.providerSubscriptionId)
            && (!requestedCommand.planId || current.planId === requestedCommand.planId)
            && (!requestedCommand.billing || current.billing === requestedCommand.billing),
          );
          requestedLegacyCancelSnapshot = requestedCommand.cancelResult
            ?? requestedCommand.subscriptionSnapshot
            ?? (currentIsOriginalProviderGeneration ? current : null);
          if (!requestedLegacyCancelSnapshot) {
            throw new MembershipLegacyOperationRecoveryError(requestedOperationId);
          }
        }
        const legacySnapshot = isLegacyCancel ? requestedLegacyCancelSnapshot : null;
        const legacyRequestMatches = isLegacyCancel
          && requestedCommand.atPeriodEnd === Boolean(legacySnapshot?.stripeSubscriptionId && input.atPeriodEnd);
        if (
          requestedCommand.kind !== "cancel"
          || (storedRequestSignature !== expectedRequestSignature && !legacyRequestMatches)
        ) {
          throw new SubscriptionOperationConflictError(
            requestedOperationId,
            "operationId was already used for a different membership change.",
          );
        }
        if (requestedCommand.stage === "completed" && requestedCommand.cancelResult) {
          return requestedCommand.cancelResult;
        }
      }

      const prepared = await this.withDependencyGraph(async () => {
        if (requestedCommand?.kind === "cancel") {
          const snapshot = requestedCommand.subscriptionSnapshot
            ?? requestedCommand.cancelResult
            ?? requestedLegacyCancelSnapshot;
          if (!snapshot) {
            throw new Error("Membership cancellation history is missing its subscription snapshot.");
          }
          return {
            done: false,
            sub: snapshot,
            effectiveAtPeriodEnd: requestedCommand.atPeriodEnd === true,
            command: requestedCommand,
          } as const;
        }
        const sub = await this.getByUser(input.endCustomerUserId);
        if (!sub) return { done: true, subscription: sub } as const;
        if (sub.status === "canceled") {
          const effectiveAtPeriodEnd = Boolean(sub.stripeSubscriptionId && input.atPeriodEnd);
          const command = await this.beginCommand({
            userId: input.endCustomerUserId,
            kind: "cancel",
            signature: cancelSignature(sub, effectiveAtPeriodEnd),
            requestSignature: cancelRequestSignature(input),
            requestedId: requestedOperationId,
            planId: sub.planId,
            billing: sub.billing,
            providerSubscriptionId: sub.stripeSubscriptionId,
            atPeriodEnd: effectiveAtPeriodEnd,
            subscriptionSnapshot: sub,
          });
          const saved = command.stage === "completed" && command.cancelResult
            ? command
            : await this.saveCommand({ ...command, stage: "completed", cancelResult: sub });
          return { done: true, subscription: saved.cancelResult ?? sub } as const;
        }
        if (sub.stripeSubscriptionId && sub.cancelAtPeriodEnd && input.atPeriodEnd) {
          const command = await this.beginCommand({
            userId: input.endCustomerUserId,
            kind: "cancel",
            signature: cancelSignature(sub, true),
            requestSignature: cancelRequestSignature(input),
            requestedId: requestedOperationId,
            planId: sub.planId,
            billing: sub.billing,
            providerSubscriptionId: sub.stripeSubscriptionId,
            atPeriodEnd: true,
            subscriptionSnapshot: sub,
          });
          const saved = command.stage === "completed" && command.cancelResult
            ? command
            : await this.saveCommand({ ...command, stage: "completed", cancelResult: sub });
          return { done: true, subscription: saved.cancelResult ?? sub } as const;
        }
        // A free row has no provider period or webhook. Treat its mounted
        // end-of-period request as immediate so benefits cannot remain active forever.
        const effectiveAtPeriodEnd = Boolean(sub.stripeSubscriptionId && input.atPeriodEnd);
        const signature = cancelSignature(sub, effectiveAtPeriodEnd);
        const command = await this.beginCommand({
          userId: input.endCustomerUserId,
          kind: "cancel",
          signature,
          requestSignature: cancelRequestSignature(input),
          requestedId: requestedOperationId,
          planId: sub.planId,
          billing: sub.billing,
          providerSubscriptionId: sub.stripeSubscriptionId,
          atPeriodEnd: effectiveAtPeriodEnd,
          subscriptionSnapshot: sub,
        });
        return { done: false, sub, effectiveAtPeriodEnd, command } as const;
      });
      if (prepared.done) return prepared.subscription;
      const { sub, effectiveAtPeriodEnd } = prepared;
      let command = prepared.command;
      if (command.stage === "completed" && command.cancelResult) return command.cancelResult;

      if (sub.stripeSubscriptionId) {
        return this.withUserProviderCall(input.endCustomerUserId, async () => {
          let providerCommand = await this.loadCommand(command);
          if (providerCommand.stage === "completed" && providerCommand.cancelResult) {
            return providerCommand.cancelResult;
          }
          if (!providerCommand.providerSubscription) {
            const providerSubscription = await this.stripe.cancelSubscription(
              sub.stripeSubscriptionId!,
              effectiveAtPeriodEnd,
              this.providerKey(providerCommand, "cancel"),
            );
            providerCommand = await this.checkpointProviderSubscription(
              providerCommand,
              providerSubscription,
            );
          }
          if (providerCommand.stage === "completed" && providerCommand.cancelResult) {
            return providerCommand.cancelResult;
          }
          // As with plan changes, the provider lease covers the final graph
          // write so webhook reconciliation cannot be overwritten by an older
          // command snapshot after the lease is released.
          return this.finalizeCancellation(providerCommand, sub, effectiveAtPeriodEnd);
        });
      }
      return this.finalizeCancellation(command, sub, effectiveAtPeriodEnd);
    });
  }

  // ─── Pause / resume / change plan ──────────────────────────────────────

  async pause(userId: UserId): Promise<Subscription | null> {
    return this.withUserCommand(userId, async () => {
      const sub = await this.withDependencyGraph(() => this.getByUser(userId));
      if (!sub?.stripeSubscriptionId) return null;
      if (sub.status === "paused") return sub;
      return this.withUserProviderCall(userId, async () => {
        const applied = await this.stripe.pauseSubscription(sub.stripeSubscriptionId!);
        const stripeSub = (await this.stripe.retrieveSubscription(sub.stripeSubscriptionId!)) ?? applied;
        return this.withDependencyGraph(async () => {
          const current = await this.getByUser(userId);
          if (!current || current.stripeSubscriptionId !== sub.stripeSubscriptionId) return current;
          return this.upsertFromStripeForUser(userId, current.planId, current.billing, stripeSub);
        });
      });
    });
  }

  async resume(userId: UserId): Promise<Subscription | null> {
    return this.withUserCommand(userId, async () => {
      const sub = await this.withDependencyGraph(() => this.getByUser(userId));
      if (!sub?.stripeSubscriptionId) return null;
      if (sub.status !== "paused" && !sub.cancelAtPeriodEnd) return sub;
      return this.withUserProviderCall(userId, async () => {
        const applied = await this.stripe.resumeSubscription(sub.stripeSubscriptionId!);
        const stripeSub = (await this.stripe.retrieveSubscription(sub.stripeSubscriptionId!)) ?? applied;
        return this.withDependencyGraph(async () => {
          const current = await this.getByUser(userId);
          if (!current || current.stripeSubscriptionId !== sub.stripeSubscriptionId) return current;
          return this.upsertFromStripeForUser(userId, current.planId, current.billing, stripeSub);
        });
      });
    });
  }

  async changePlan(userId: UserId, newPlanId: string): Promise<Subscription | null> {
    const sub = await this.getByUser(userId);
    if (!sub?.stripeSubscriptionId) return null;
    const result = await this.subscribe({
      endCustomerUserId: userId,
      planId: newPlanId,
      billing: sub.billing,
      successUrl: "about:blank",
      cancelUrl: "about:blank",
      operationId: `legacy-change-plan:${sub.id}:${sub.updatedAt}:${newPlanId}`,
    });
    return result.ok && result.mode !== "checkout" ? result.subscription : null;
  }

  // ─── Webhook entry point — reconcile state from Stripe ────────────────
  //
  // Idempotent. Used by WebhookService for `customer.subscription.{created,
  // updated, deleted}` events. Looks up the existing row by stripe sub
  // id when possible; falls back to (clientId, userId) lookup via metadata.

  async upsertFromStripe(
    stripeSub: StripeSubscription,
    metadata: Record<string, string>,
  ): Promise<Subscription | null> {
    const userId = metadata.endCustomerUserId;
    const planId = metadata.planId;
    const billing = metadata.billing ?? "monthly";
    if (!userId || !planId) return null;
    assertBilling(billing);
    return this.withUserCommand(userId, () =>
      this.withDependencyGraph(() => this.upsertFromStripeForUser(
        userId,
        planId,
        billing,
        stripeSub,
      )));
  }

  /** WebhookService-only entry point; its caller already owns the dependency graph lane. */
  async upsertFromStripeWithinDependencyGraph(
    stripeSub: StripeSubscription,
    metadata: Record<string, string>,
  ): Promise<Subscription | null> {
    const userId = metadata.endCustomerUserId;
    const planId = metadata.planId;
    const billing = metadata.billing ?? "monthly";
    if (!userId || !planId) return null;
    assertBilling(billing);
    return this.upsertFromStripeForUser(userId, planId, billing, stripeSub);
  }

  async expireCheckout(
    userId: UserId,
    checkoutId: string,
    planId: string,
    billing: Billing,
  ): Promise<boolean> {
    assertProviderId(checkoutId, "checkout.id");
    assertBilling(billing);
    return this.withUserCommand(userId, () => this.withDependencyGraph(() =>
      this.expireCheckoutWithinDependencyGraph(userId, checkoutId, planId, billing)));
  }

  /** WebhookService-only entry point; its caller already owns the dependency graph lane. */
  async expireCheckoutWithinDependencyGraph(
    userId: UserId,
    checkoutId: string,
    planId: string,
    billing: Billing,
  ): Promise<boolean> {
    assertProviderId(checkoutId, "checkout.id");
    assertBilling(billing);
    const command = await this.storage.get<SubscriptionCommand>(commandKey(userId));
    if (
      command?.kind !== "subscribe"
      || command.planId !== planId
      || command.billing !== billing
      || command.checkout?.id !== checkoutId
      || command.checkoutReconciledAt
    ) return false;
    await this.saveCommand({ ...command, checkoutReconciledAt: now() });
    return true;
  }

  async billingPortalUrl(userId: UserId, returnUrl: string): Promise<string | null> {
    const sub = await this.getByUser(userId);
    if (!sub?.stripeCustomerId) return null;
    const session = await this.stripe.createBillingPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl,
    });
    assertProviderId(session.id, "billingPortal.id");
    assertProviderUrl(session.url, "billingPortal.url");
    return session.url;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private async withUserCommand<T>(userId: UserId, operation: () => Promise<T>): Promise<T> {
    // Avoid duplicate work in this process. Graph/reference phases use their
    // own short install-wide transaction and are never nested inside provider I/O.
    return localUserExclusive(`${this.agencyId}:${this.clientId}:${userId}`, operation);
  }

  private async withDependencyGraph<T>(operation: () => Promise<T>): Promise<T> {
    return withMembershipDependencyLock(this.storage, this.agencyId, this.clientId, operation);
  }

  private async withUserProviderCall<T>(userId: UserId, operation: () => Promise<T>): Promise<T> {
    const key = `membership-subscription-provider:${this.agencyId}:${this.clientId}:${userId}`;
    // `StoragePort.runExclusive` maps to a whole PortalState transaction for
    // file/Postgres installs. Never hold that transaction across Stripe I/O:
    // provider idempotency keys converge command retries across processes,
    // while this lane suppresses duplicate calls within this process.
    return this.storage.runProviderExclusive
      ? this.storage.runProviderExclusive(key, operation)
      : localUserProviderExclusive(key, operation);
  }

  private checkpointProviderSubscription(
    command: SubscriptionCommand,
    providerSubscription: StripeSubscription,
  ): Promise<SubscriptionCommand> {
    // The provider call has already completed. Adopt its outcome in a fresh,
    // short transaction so a late worker cannot regress a completed command.
    return this.withDependencyGraph(async () => {
      const latest = await this.loadCommand(command);
      if (latest.stage === "completed" || latest.providerSubscription) return latest;
      return this.saveCommand({
        ...latest,
        stage: "provider_applied",
        providerSubscription,
      });
    });
  }

  private finalizeCancellation(
    command: SubscriptionCommand,
    fallbackSnapshot: Subscription,
    effectiveAtPeriodEnd: boolean,
  ): Promise<Subscription> {
    return this.withDependencyGraph(async () => {
      const latestCommand = await this.loadCommand(command);
      if (latestCommand.stage === "completed" && latestCommand.cancelResult) {
        return latestCommand.cancelResult;
      }
      const snapshot = latestCommand.subscriptionSnapshot ?? fallbackSnapshot;
      let updated: Subscription;
      let persistTransition = true;
      let emitTransition = true;
      if (snapshot.stripeSubscriptionId) {
        const providerSubscription = latestCommand.providerSubscription;
        if (!providerSubscription) throw new Error("Membership cancellation outcome was not recorded.");
        assertProviderSubscription(providerSubscription);
        updated = fromStripe(
          this.agencyId,
          this.clientId,
          snapshot.endCustomerUserId,
          snapshot.planId,
          snapshot.billing,
          providerSubscription,
          snapshot.id,
        );
        updated = addRetiredProviderIds(
          updated,
          ...retiredProviderIds(snapshot),
          providerSubscription.id !== snapshot.stripeSubscriptionId
            ? snapshot.stripeSubscriptionId
            : undefined,
        );
        updated.createdAt = snapshot.createdAt;
        updated.updatedAt = Math.max(updated.updatedAt, snapshot.updatedAt + 1);
        const current = await this.getByUser(snapshot.endCustomerUserId);
        if (current?.stripeSubscriptionId !== snapshot.stripeSubscriptionId) {
          // A newer generation won while this provider result was in flight.
          // Complete the historical command for exact replay, but never write
          // or announce its stale snapshot over the current generation.
          persistTransition = false;
          emitTransition = false;
        } else if (current.status === "canceled" && updated.status === "canceled") {
          // Webhook reconciliation won the graph race and already published
          // the terminal transition. Adopt that row without a duplicate event.
          updated = current;
          persistTransition = false;
          emitTransition = false;
        }
      } else {
        updated = {
          ...snapshot,
          status: "canceled",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: undefined,
          updatedAt: Math.max(now(), snapshot.updatedAt + 1),
        };
      }
      if (persistTransition) await this.persist(updated);
      const remainsScheduled = effectiveAtPeriodEnd && updated.status !== "canceled";
      if (emitTransition) await this.logCancel(updated, remainsScheduled, latestCommand.id);
      const saved = await this.saveCommand({
        ...latestCommand,
        stage: "completed",
        cancelResult: updated,
      });
      return saved.cancelResult ?? updated;
    });
  }

  private async beginCommand(input: {
    userId: UserId;
    kind: SubscriptionCommand["kind"];
    signature: string;
    requestSignature?: string;
    requestedId?: string;
    planId?: string;
    planName?: string;
    billing?: Billing;
    subscribeMode?: SubscribeIntentMode;
    providerSubscriptionId?: string;
    retiredProviderSubscriptionIds?: string[];
    priceId?: string;
    trialDays?: number;
    successUrl?: string;
    cancelUrl?: string;
    customerEmail?: string;
    customerName?: string;
    atPeriodEnd?: boolean;
    subscriptionSnapshot?: Subscription;
  }): Promise<SubscriptionCommand> {
    const requestedId = operationId(input.requestedId);
    const bound = await this.commandForRequestedOperation(input.userId, requestedId);
    if (bound) {
      if (
        bound.signature !== input.signature
        || bound.kind !== input.kind
        || (bound.requestSignature && bound.requestSignature !== (input.requestSignature ?? input.signature))
      ) {
        throw new SubscriptionOperationConflictError(
          requestedId,
          "operationId was already used for a different membership change.",
        );
      }
      return bound;
    }

    const current = await this.storage.get<SubscriptionCommand>(commandKey(input.userId));
    if (current) await this.ensureCommandArchived(current);
    if (
      current?.id === requestedId
      && (current.signature !== input.signature || current.kind !== input.kind)
    ) {
      throw new SubscriptionOperationConflictError(
        requestedId,
        "operationId was already used for a different membership change.",
      );
    }
    if (
      current?.signature === input.signature
      && current.kind === input.kind
      && current.requestSignature === (input.requestSignature ?? input.signature)
      && !this.checkoutWasReconciled(current)
    ) {
      if (this.checkoutAwaitsReconciliation(current)) {
        if (!this.checkoutCommandIsReusable(current)) {
          throw new MembershipCheckoutPendingReconciliationError(requestedId);
        }
      }
      await this.bindRequestedOperation(input.userId, requestedId, current);
      return current;
    }
    if (current && this.checkoutAwaitsReconciliation(current)) {
      throw new MembershipCheckoutPendingReconciliationError(requestedId);
    }
    if (current && current.stage !== "completed") {
      throw new Error(
        "A previous membership change has an unfinished provider outcome. Retry that change before starting another.",
      );
    }
    const ts = now();
    const command = await this.saveCommand({
      id: requestedId,
      signature: input.signature,
      requestSignature: input.requestSignature ?? input.signature,
      kind: input.kind,
      stage: "pending",
      userId: input.userId,
      planId: input.planId,
      planName: input.planName,
      billing: input.billing,
      subscribeMode: input.subscribeMode,
      providerSubscriptionId: input.providerSubscriptionId,
      retiredProviderSubscriptionIds: input.retiredProviderSubscriptionIds,
      priceId: input.priceId,
      trialDays: input.trialDays,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      atPeriodEnd: input.atPeriodEnd,
      subscriptionSnapshot: input.subscriptionSnapshot,
      createdAt: ts,
      updatedAt: ts,
    }, true);
    await this.bindRequestedOperation(input.userId, requestedId, command);
    return command;
  }

  private checkoutCommandIsReusable(command: SubscriptionCommand): boolean {
    if (!command.checkout || command.checkoutReconciledAt) return false;
    const expiresAt = command.checkout.expiresAt === undefined
      ? command.createdAt + DEFAULT_CHECKOUT_LIFETIME_MS
      : command.checkout.expiresAt * 1_000;
    return expiresAt > now();
  }

  private checkoutAwaitsReconciliation(command: SubscriptionCommand): boolean {
    return command.kind === "subscribe"
      && command.stage === "completed"
      && (Boolean(command.checkout) || command.subscribeResult?.mode === "checkout")
      && !command.checkoutReconciledAt;
  }

  private checkoutWasReconciled(command: SubscriptionCommand): boolean {
    return command.kind === "subscribe"
      && command.stage === "completed"
      && (Boolean(command.checkout) || command.subscribeResult?.mode === "checkout")
      && Boolean(command.checkoutReconciledAt);
  }

  private async markCheckoutReconciled(
    userId: UserId,
    planId: string,
    billing: Billing,
    providerSubscriptionId: string,
    providerCustomerId: string,
  ): Promise<void> {
    const command = await this.storage.get<SubscriptionCommand>(commandKey(userId));
    if (
      command?.kind !== "subscribe"
      || (!command.checkout && command.subscribeResult?.mode !== "checkout")
      || command.checkoutReconciledAt
      || command.planId !== planId
      || command.billing !== billing
      || command.retiredProviderSubscriptionIds?.includes(providerSubscriptionId)
      || (
        storedSubscribeMode(command) === "checkout"
        && command.providerSubscriptionId === providerSubscriptionId
      )
      || (command.customerId !== undefined && command.customerId !== providerCustomerId)
    ) return;
    await this.saveCommand({ ...command, checkoutReconciledAt: now() });
  }

  private async saveCommand(command: SubscriptionCommand, activate = false): Promise<SubscriptionCommand> {
    const active = await this.storage.get<SubscriptionCommand>(commandKey(command.userId));
    const archived = await this.storage.get<SubscriptionCommand>(commandArchiveKey(command.userId, command.id));
    const current = archived ?? (active?.id === command.id ? active : undefined);
    if (
      current
      && current.signature === command.signature
      && current.kind === command.kind
      && commandStageRank[current.stage] > commandStageRank[command.stage]
    ) {
      return current;
    }
    const next = current
      && current.signature === command.signature
      && current.kind === command.kind
      ? {
          ...current,
          ...command,
          customerId: command.customerId ?? current.customerId,
          retiredProviderSubscriptionIds: command.retiredProviderSubscriptionIds
            ?? current.retiredProviderSubscriptionIds,
          providerSubscription: command.providerSubscription ?? current.providerSubscription,
          checkout: command.checkout ?? current.checkout,
          subscribeResult: command.subscribeResult ?? current.subscribeResult,
          cancelResult: command.cancelResult ?? current.cancelResult,
          updatedAt: now(),
        }
      : { ...command, updatedAt: now() };
    await this.storage.set(commandArchiveKey(command.userId, command.id), next);
    if (activate || !active || active.id === command.id) {
      await this.storage.set(commandKey(command.userId), next);
    }
    return next;
  }

  private completedSubscribeResult(command: SubscriptionCommand): SubscribeSuccess {
    const result = command.subscribeResult as (SubscribeSuccess & { planId?: string; billing?: Billing }) | undefined;
    const planId = result?.planId ?? command.planId;
    const billing = result?.billing ?? command.billing;
    if (!result || !planId || (billing !== "monthly" && billing !== "annual")) {
      throw new Error("Completed membership operation is missing its requested plan or billing cadence.");
    }
    return { ...result, planId, billing };
  }

  private async commandForRequestedOperation(
    userId: UserId,
    requestedId: string,
  ): Promise<SubscriptionCommand | undefined> {
    const binding = await this.storage.get<SubscriptionOperationBinding>(operationBindingKey(userId, requestedId));
    if (binding) {
      if (binding.requestedId !== requestedId) {
        throw new Error("Membership operation binding is invalid.");
      }
      const archived = await this.storage.get<SubscriptionCommand>(commandArchiveKey(userId, binding.canonicalId));
      const active = archived ?? await this.storage.get<SubscriptionCommand>(commandKey(userId));
      if (!active || active.id !== binding.canonicalId) {
        throw new Error("Membership operation history is incomplete. Retry after restoring its durable command record.");
      }
      if (
        active.kind !== binding.kind
        || active.signature !== binding.signature
        || (binding.requestSignature && active.requestSignature !== binding.requestSignature)
      ) {
        throw new Error("Membership operation history does not match its durable binding.");
      }
      return active;
    }

    // Lazy compatibility for installs written before the per-operation ledger.
    const active = await this.storage.get<SubscriptionCommand>(commandKey(userId));
    if (active?.id !== requestedId) return undefined;
    await this.ensureCommandArchived(active);
    await this.bindRequestedOperation(userId, requestedId, active);
    return active;
  }

  private async ensureCommandArchived(command: SubscriptionCommand): Promise<void> {
    const key = commandArchiveKey(command.userId, command.id);
    if (!await this.storage.get<SubscriptionCommand>(key)) {
      await this.storage.set(key, command);
    }
  }

  private async loadCommand(command: SubscriptionCommand): Promise<SubscriptionCommand> {
    const archived = await this.storage.get<SubscriptionCommand>(commandArchiveKey(command.userId, command.id));
    if (archived) return archived;
    const active = await this.storage.get<SubscriptionCommand>(commandKey(command.userId));
    if (active?.id === command.id) return active;
    throw new Error("Membership operation history is incomplete. Retry after restoring its durable command record.");
  }

  private async bindRequestedOperation(
    userId: UserId,
    requestedId: string,
    command: SubscriptionCommand,
  ): Promise<void> {
    const key = operationBindingKey(userId, requestedId);
    const existing = await this.storage.get<SubscriptionOperationBinding>(key);
    if (existing) {
      if (
        existing.requestedId !== requestedId
        || existing.canonicalId !== command.id
        || existing.kind !== command.kind
        || existing.signature !== command.signature
        || existing.requestSignature !== command.requestSignature
      ) {
        throw new SubscriptionOperationConflictError(
          requestedId,
          "operationId was already used for a different membership change.",
        );
      }
      return;
    }
    await this.ensureCommandArchived(command);
    await this.storage.set(key, {
      requestedId,
      canonicalId: command.id,
      kind: command.kind,
      signature: command.signature,
      requestSignature: command.requestSignature,
      createdAt: now(),
    } satisfies SubscriptionOperationBinding);
  }

  private providerKey(command: SubscriptionCommand, step: string): string {
    return [
      "memberships",
      this.agencyId,
      this.clientId,
      command.userId,
      command.id,
      step,
    ].join(":");
  }

  private async persistFreeSubscription(
    userId: UserId,
    existing: Subscription | null,
    planId: string,
    billing: Billing,
  ): Promise<Subscription> {
    const ts = Math.max(now(), (existing?.updatedAt ?? 0) + 1);
    const subscription = addRetiredProviderIds({
      id: existing?.id ?? makeId("sub"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      endCustomerUserId: existing?.endCustomerUserId ?? userId,
      planId,
      stripeCustomerId: existing?.stripeCustomerId,
      stripeSubscriptionId: undefined,
      billing,
      status: "active",
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      trialEndsAt: undefined,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    }, existing?.stripeSubscriptionId, ...retiredProviderIds(existing));
    await this.persist(subscription);
    if (!existing || existing.status === "canceled") {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_started",
        { subscriptionId: subscription.id, userId: subscription.endCustomerUserId, planId, billing },
      );
    } else if (
      existing.planId !== planId ||
      existing.billing !== billing ||
      existing.status !== subscription.status
    ) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_changed",
        {
          subscriptionId: subscription.id,
          userId: subscription.endCustomerUserId,
          oldStatus: existing.status,
          newStatus: subscription.status,
          oldPlanId: existing.planId,
          newPlanId: planId,
        },
      );
    }
    return subscription;
  }

  private async logSubscribe(
    command: SubscriptionCommand,
    subscription: Subscription,
    email: string,
    planName: string,
    changed: boolean,
  ): Promise<void> {
    await this.activity.logActivity({
      idempotencyKey: this.providerKey(command, "activity"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: subscription.endCustomerUserId,
      category: "memberships",
      action: changed ? "membership.subscription_changed" : "membership.subscription_started",
      message: changed
        ? `${email} changed membership to ${planName}.`
        : `${email} subscribed to ${planName}${subscription.stripeSubscriptionId ? "" : " (free tier)"}.`,
      metadata: {
        subscriptionId: subscription.id,
        planId: subscription.planId,
        billing: subscription.billing,
        operationId: command.id,
      },
    });
  }

  private async upsertFromStripeForUser(
    userId: UserId,
    planId: string,
    billing: Billing,
    stripeSub: StripeSubscription,
  ): Promise<Subscription> {
    assertProviderSubscription(stripeSub);
    const existing = await this.getByUser(userId);
    if (
      existing
      && (
        existing.stripeSubscriptionId !== stripeSub.id
        || existing.planId !== planId
        || existing.billing !== billing
      )
    ) {
      const command = await this.storage.get<SubscriptionCommand>(commandKey(userId));
      const commandMode = command ? storedSubscribeMode(command) : undefined;
      const matchesCurrentCheckout = Boolean(
        command?.kind === "subscribe"
        && (commandMode === "checkout" || (legacySubscribeTerms(command) && command.checkout))
        && command.planId === planId
        && command.billing === billing
        && command.checkout
        && !command.checkoutReconciledAt
        && !new Set([
          ...(command.retiredProviderSubscriptionIds ?? []),
          ...(command.providerSubscriptionId ? [command.providerSubscriptionId] : []),
        ]).has(stripeSub.id)
        && (!command.customerId || command.customerId === stripeSub.customerId),
      );
      const matchesCurrentPlanChange = Boolean(
        command?.kind === "subscribe"
        && commandMode === "change-plan"
        && command.planId === planId
        && command.billing === billing
        && command.providerSubscription?.id === stripeSub.id,
      );
      if (existing.stripeSubscriptionId !== stripeSub.id && !matchesCurrentCheckout) return existing;
      if (
        existing.stripeSubscriptionId === stripeSub.id
        && (existing.planId !== planId || existing.billing !== billing)
        && !matchesCurrentPlanChange
      ) return existing;
    }
    let next = fromStripe(
      this.agencyId,
      this.clientId,
      userId,
      planId,
      billing,
      stripeSub,
      existing?.id,
    );
    next = addRetiredProviderIds(
      next,
      ...retiredProviderIds(existing),
      existing?.stripeSubscriptionId !== stripeSub.id
        ? existing?.stripeSubscriptionId
        : undefined,
    );
    if (existing) {
      next.createdAt = existing.createdAt;
      next.updatedAt = Math.max(next.updatedAt, existing.updatedAt + 1);
    }
    await this.persist(next);
    await this.markCheckoutReconciled(userId, planId, billing, stripeSub.id, stripeSub.customerId);
    const becameCanceled = existing?.status !== "canceled" && next.status === "canceled";
    if (
      existing && (
        existing.status !== next.status ||
        existing.planId !== next.planId ||
        existing.billing !== next.billing
      )
    ) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_changed",
        {
          subscriptionId: next.id,
          userId,
          oldStatus: existing.status,
          newStatus: next.status,
          oldPlanId: existing.planId,
          newPlanId: next.planId,
        },
      );
    }
    if (becameCanceled) {
      await this.logCancel(next, false, `provider-terminal-${stripeSub.id}`);
    } else if (!existing) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_started",
        { subscriptionId: next.id, userId, planId, billing },
      );
    }
    return next;
  }

  private async persist(sub: Subscription): Promise<void> {
    assertSubscription(sub);
    const plan = await this.plans.get(sub.planId);
    if (!plan) throw new Error(`planId: plan ${sub.planId} does not exist in this install`);
    const userId = sub.endCustomerUserId;
    const previous = await this.storage.get<Subscription>(subKey(userId));
    if (previous && previous.planId !== sub.planId) {
      await this.movePlanIndex(userId, previous.planId, sub.planId);
    } else if (!previous) {
      const ix = (await this.storage.get<string[]>(byPlanKey(sub.planId))) ?? [];
      if (!ix.includes(userId)) {
        await this.storage.set(byPlanKey(sub.planId), [...ix, userId]);
      }
    }
    await this.storage.set(subKey(userId), sub);
  }

  private async movePlanIndex(userId: UserId, oldPlanId: string, newPlanId: string): Promise<void> {
    const oldIx = (await this.storage.get<string[]>(byPlanKey(oldPlanId))) ?? [];
    await this.storage.set(byPlanKey(oldPlanId), oldIx.filter(u => u !== userId));
    const newIx = (await this.storage.get<string[]>(byPlanKey(newPlanId))) ?? [];
    if (!newIx.includes(userId)) {
      await this.storage.set(byPlanKey(newPlanId), [...newIx, userId]);
    }
  }

  private async logCancel(sub: Subscription, atPeriodEnd: boolean, operationId?: string): Promise<void> {
    await this.activity.logActivity({
      idempotencyKey: operationId ? `memberships:${this.agencyId}:${this.clientId}:${sub.endCustomerUserId}:${operationId}:cancel-activity` : undefined,
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: sub.endCustomerUserId,
      category: "memberships",
      action: atPeriodEnd ? "membership.subscription_canceling" : "membership.subscription_canceled",
      message: atPeriodEnd
        ? `Subscription will cancel at the end of the current period.`
        : `Subscription canceled immediately.`,
      metadata: {
        subscriptionId: sub.id,
        planId: sub.planId,
        billing: sub.billing,
        atPeriodEnd,
      },
    });
    if (!atPeriodEnd) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "membership.subscription_canceled",
        {
          subscriptionId: sub.id,
          userId: sub.endCustomerUserId,
          planId: sub.planId,
          billing: sub.billing,
        },
      );
    }
  }
}
