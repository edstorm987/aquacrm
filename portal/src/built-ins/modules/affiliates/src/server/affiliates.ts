// Affiliate service — CRUD + status transitions.
//
// Storage:
//   affiliates/by-id/<id>            → Affiliate
//   affiliates/by-user/<userId>      → affiliateId (uniqueness lookup)
//   affiliates/index                 → string[] of affiliate ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Affiliate,
  AffiliateFilter,
  CreateAffiliateInput,
  StripeOnboardingStatus,
  UpdateAffiliatePatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort, UserPort } from "./ports";
import {
  assertAffiliate,
  assertCreateAffiliateInput,
  assertProviderId,
  assertUpdateAffiliatePatch,
} from "../lib/runtimeValidation";
import {
  AffiliateHasDependantsError,
  affiliateDependencyInventoryFromStorage,
  withAffiliateDependencyLock,
} from "./dependencies";

const AFFIL_INDEX_KEY = "affiliates/index";
const affilKey = (id: string): string => `affiliates/by-id/${id}`;
const userKey = (uid: UserId): string => `affiliates/by-user/${uid}`;
const enrollmentClaimKey = (uid: UserId): string => `affiliates/claims/user/${encodeURIComponent(uid)}`;
const counterBaselineKey = (id: string): string => `affiliates/counter-baseline/${id}`;
const counterOperationKey = (id: string, operationId: string): string => `affiliates/counter-operation/${id}/${encodeURIComponent(operationId)}`;
const onboardingIntentKey = (id: string): string => `affiliates/onboarding-intent/${id}`;
const stripeStatusObservationKey = (id: string): string => `affiliates/stripe-status-observation/${id}`;

interface EnrollmentClaim {
  signature: string;
  row: Affiliate;
  status: "pending" | "completed";
  updatedAt: number;
}

interface CounterBaseline {
  totalReferred: number;
  lifetimeEarnings: number;
}

interface CounterOperation {
  addReferred: number;
  addEarningsCents: number;
}

export interface StripeOnboardingIntent {
  affiliateId: string;
  idempotencyKey: string;
  stage: "pending" | "account_created" | "account_attached";
  accountId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PreparedStripeOnboarding {
  affiliate: Affiliate;
  intent: StripeOnboardingIntent;
}

interface StripeStatusObservation {
  affiliateId: string;
  accountId: string;
  issuedSequence: number;
  appliedSequence: number;
  updatedAt: number;
}

export interface StripeStatusApplication {
  affiliate: Affiliate;
  applied: boolean;
  changed: boolean;
  previousStatus?: StripeOnboardingStatus;
}

const localTails = new Map<string, Promise<void>>();

async function localExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  localTails.set(key, tail);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

function enrollmentSignature(input: CreateAffiliateInput): string {
  return JSON.stringify({
    userId: input.endCustomerUserId,
    displayName: input.displayName.trim(),
    payoutEmail: input.payoutEmail.trim().toLowerCase(),
    defaultCommissionPercent: input.defaultCommissionPercent ?? null,
  });
}

export class AffiliateService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private user: UserPort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: AffiliateFilter): Promise<Affiliate[]> {
    const ids = (await this.storage.get<string[]>(AFFIL_INDEX_KEY)) ?? [];
    const out: Affiliate[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Affiliate>(affilKey(id));
      if (row) out.push(row);
    }
    const q = filter?.query?.toLowerCase().trim();
    return out
      .filter(a => !filter?.status || a.status === filter.status)
      .filter(a => !q || `${a.displayName} ${a.payoutEmail}`.toLowerCase().includes(q))
      .sort((a, b) => b.joinedAt - a.joinedAt);
  }

  async get(id: string): Promise<Affiliate | null> {
    const row = await this.storage.get<Affiliate>(affilKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async getByUser(userId: UserId): Promise<Affiliate | null> {
    const id = await this.storage.get<string>(userKey(userId));
    return id ? this.get(id) : null;
  }

  // Public sign-up entry point. Refuses if the user is already enrolled
  // (any status) — agency owners flip status via update() to re-admit
  // or remove.
  async enroll(input: CreateAffiliateInput, actor: UserId): Promise<Affiliate> {
    assertCreateAffiliateInput(input);
    const profile = await this.user.getUser(input.endCustomerUserId);
    if (!profile) throw new Error(`User ${input.endCustomerUserId} not found.`);
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const signature = enrollmentSignature(input);
      const claimKey = enrollmentClaimKey(input.endCustomerUserId);
      let claim = await this.storage.get<EnrollmentClaim>(claimKey);
      const existing = await this.getByUser(input.endCustomerUserId);
      if (existing) {
        if (claim?.signature === signature && claim.status === "completed") return existing;
        if (!claim && enrollmentSignature({
          endCustomerUserId: existing.endCustomerUserId,
          displayName: existing.displayName,
          payoutEmail: existing.payoutEmail,
          defaultCommissionPercent: existing.defaultCommissionPercent,
        }) === signature) return existing;
        if (claim?.signature === signature) claim = { ...claim, row: existing };
        else {
          throw new Error(`User ${input.endCustomerUserId} is already an affiliate (status: ${existing.status}).`);
        }
      }
      if (claim && claim.signature !== signature) {
        throw new Error(`User ${input.endCustomerUserId} is already claimed by another affiliate enrolment.`);
      }
      if (!claim) {
        const ts = now();
        const row: Affiliate = {
          id: makeId("aff"),
          agencyId: this.agencyId,
          clientId: this.clientId,
          endCustomerUserId: input.endCustomerUserId,
          displayName: input.displayName.trim(),
          status: "pending",
          defaultCommissionPercent: input.defaultCommissionPercent,
          payoutEmail: input.payoutEmail.trim(),
          totalReferred: 0,
          lifetimeEarnings: 0,
          lifetimeEarningsByCurrency: {},
          joinedAt: ts,
          createdAt: ts,
          updatedAt: ts,
        };
        assertAffiliate(row);
        claim = { signature, row, status: "pending", updatedAt: ts };
        await this.storage.set(claimKey, claim);
      }
      const row = await this.get(claim.row.id) ?? claim.row;
      await this.storage.set(affilKey(row.id), row);
      await this.storage.set(userKey(input.endCustomerUserId), row.id);
      const index = (await this.storage.get<string[]>(AFFIL_INDEX_KEY)) ?? [];
      if (!index.includes(row.id)) await this.storage.set(AFFIL_INDEX_KEY, [...index, row.id]);
      await this.activity.logActivity({
        idempotencyKey: `affiliates:enrolment:${row.id}`,
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "affiliates",
        action: "affiliate.enrolled",
        message: `${row.displayName} enrolled as an affiliate.`,
        metadata: { affiliateId: row.id, userId: input.endCustomerUserId, status: row.status },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "affiliate.enrolled", {
        affiliateId: row.id, userId: input.endCustomerUserId,
      });
      await this.storage.set(claimKey, { ...claim, row, status: "completed", updatedAt: now() });
      return row;
    });
  }

  async update(id: string, patch: UpdateAffiliatePatch, actor: UserId): Promise<Affiliate | null> {
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, () =>
      this.updateWithinDependencyLock(id, patch, actor));
  }

  private async updateWithinDependencyLock(id: string, patch: UpdateAffiliatePatch, actor: UserId): Promise<Affiliate | null> {
    assertUpdateAffiliatePatch(patch);
    const existing = await this.get(id);
    if (!existing) return null;
    const next: Affiliate = {
      ...existing,
      ...patch,
      displayName: patch.displayName?.trim() ?? existing.displayName,
      payoutEmail: patch.payoutEmail?.trim() ?? existing.payoutEmail,
      updatedAt: now(),
    };
    assertAffiliate(next);
    await this.storage.set(affilKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.updated",
      message: `Updated affiliate ${next.displayName}.`,
      metadata: { affiliateId: id, fields: Object.keys(patch) },
    });
    return next;
  }

  // Hard delete — drops the row + by-user reverse lookup. Use sparingly;
  // status:"removed" via update() is the documented v1 path.
  async delete(id: string, actor: UserId): Promise<boolean> {
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const existing = await this.get(id);
      if (!existing) return false;
      const dependencies = await affiliateDependencyInventoryFromStorage(
        this.storage,
        this.agencyId,
        this.clientId,
        id,
      );
      if (dependencies.total > 0) throw new AffiliateHasDependantsError(existing.displayName, dependencies);
      await this.storage.del(affilKey(id));
      await this.storage.del(userKey(existing.endCustomerUserId));
      await this.storage.del(enrollmentClaimKey(existing.endCustomerUserId));
      await this.storage.del(stripeStatusObservationKey(id));
      const ix = (await this.storage.get<string[]>(AFFIL_INDEX_KEY)) ?? [];
      await this.storage.set(AFFIL_INDEX_KEY, ix.filter(x => x !== id));
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "affiliates",
        action: "affiliate.deleted",
        message: `Removed ${existing.displayName} from affiliates.`,
        metadata: { affiliateId: id },
      });
      return true;
    });
  }

  // R12 — persists Stripe Connect identifiers onto the Affiliate. Used
  // by OnboardingService.startOnboarding (sets accountId + initial
  // status) and by webhook / refreshStripeStatus (overwrites status
  // when Stripe's account.updated arrives). Doesn't log activity at
  // the bare-set level — the OnboardingService writes one
  // `affiliate.stripe_onboarding_started` / `*_status_changed` entry.
  async _setStripe(
    id: string,
    patch: { stripeAccountId?: string; stripeOnboardingStatus?: StripeOnboardingStatus },
  ): Promise<Affiliate | null> {
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      if (patch.stripeAccountId !== undefined) assertProviderId(patch.stripeAccountId, "stripeAccountId");
      const next: Affiliate = {
        ...existing,
        stripeAccountId: patch.stripeAccountId ?? existing.stripeAccountId,
        stripeOnboardingStatus: patch.stripeOnboardingStatus ?? existing.stripeOnboardingStatus,
        updatedAt: now(),
      };
      assertAffiliate(next);
      await this.storage.set(affilKey(id), next);
      return next;
    });
  }

  /**
   * Issue a durable observation sequence before a provider status read starts.
   * A slower, older response can then be recognised after it returns, including
   * when the competing reads ran in different application processes.
   */
  async _beginStripeStatusObservation(id: string, accountId: string): Promise<number | null> {
    assertProviderId(accountId, "stripeAccountId");
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const affiliate = await this.get(id);
      if (!affiliate) return null;
      if (affiliate.stripeAccountId !== accountId) {
        throw new Error(`Affiliate ${id} no longer owns Stripe Connect account ${accountId}.`);
      }
      const key = stripeStatusObservationKey(id);
      const existing = await this.storage.get<StripeStatusObservation>(key);
      const compatible = existing?.affiliateId === id && existing.accountId === accountId;
      const issuedSequence = (compatible ? existing.issuedSequence : 0) + 1;
      await this.storage.set(key, {
        affiliateId: id,
        accountId,
        issuedSequence,
        appliedSequence: compatible ? existing.appliedSequence : 0,
        updatedAt: now(),
      } satisfies StripeStatusObservation);
      return issuedSequence;
    });
  }

  /**
   * Apply only the newest completed observation. The sequence record and the
   * affiliate row share the dependency-graph transaction/lock, so a stale
   * response cannot pass its check and then overwrite a newer state.
   */
  async _applyStripeStatusObservation(
    id: string,
    accountId: string,
    sequence: number,
    stripeOnboardingStatus: StripeOnboardingStatus,
  ): Promise<StripeStatusApplication | null> {
    assertProviderId(accountId, "stripeAccountId");
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Stripe status observation sequence is invalid.");
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const affiliate = await this.get(id);
      if (!affiliate) return null;
      if (affiliate.stripeAccountId !== accountId) {
        throw new Error(`Affiliate ${id} no longer owns Stripe Connect account ${accountId}.`);
      }
      const key = stripeStatusObservationKey(id);
      const observation = await this.storage.get<StripeStatusObservation>(key);
      if (
        !observation
        || observation.affiliateId !== id
        || observation.accountId !== accountId
        || sequence > observation.issuedSequence
      ) {
        throw new Error(`Affiliate ${id} has no matching Stripe status observation ${sequence}.`);
      }
      if (sequence <= observation.appliedSequence) {
        return { affiliate, applied: false, changed: false };
      }
      const previousStatus = affiliate.stripeOnboardingStatus;
      const changed = previousStatus !== stripeOnboardingStatus;
      const next: Affiliate = changed
        ? { ...affiliate, stripeOnboardingStatus, updatedAt: now() }
        : affiliate;
      if (changed) {
        assertAffiliate(next);
        await this.storage.set(affilKey(id), next);
      }
      await this.storage.set(key, {
        ...observation,
        appliedSequence: sequence,
        updatedAt: now(),
      } satisfies StripeStatusObservation);
      return { affiliate: next, applied: true, changed, previousStatus };
    });
  }

  /**
   * Keep one in-process provider call per affiliate. Cross-process retries use
   * the durable intent's provider idempotency key and converge in the short
   * graph-locked phases below.
   */
  async _withStripeOnboardingCommand<T>(id: string, operation: () => Promise<T>): Promise<T> {
    return localExclusive(`${this.agencyId}:${this.clientId}:stripe-onboarding:${id}`, operation);
  }

  /** Create the durable owner before any Stripe account call starts. */
  async _beginStripeOnboarding(id: string): Promise<PreparedStripeOnboarding | null> {
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      let affiliate = await this.get(id);
      if (!affiliate) return null;
      const key = onboardingIntentKey(id);
      const existing = await this.storage.get<StripeOnboardingIntent>(key);
      const ts = now();
      const idempotencyKey = existing?.idempotencyKey
        ?? `affiliate-account:${this.agencyId}:${this.clientId}:${id}`;
      const accountId = affiliate.stripeAccountId ?? existing?.accountId;
      if (accountId && affiliate.stripeAccountId !== accountId) {
        assertProviderId(accountId, "stripeAccountId");
        affiliate = {
          ...affiliate,
          stripeAccountId: accountId,
          stripeOnboardingStatus: affiliate.stripeOnboardingStatus ?? "pending",
          updatedAt: ts,
        };
        assertAffiliate(affiliate);
        await this.storage.set(affilKey(id), affiliate);
      }
      const intent: StripeOnboardingIntent = {
        affiliateId: id,
        idempotencyKey,
        stage: accountId ? "account_attached" : "pending",
        accountId,
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      };
      await this.storage.set(key, intent);
      return { affiliate, intent };
    });
  }

  /**
   * Serialize account creation by affiliate across application processes and
   * persist the provider result before releasing that narrow lane. A crash
   * after Stripe succeeds can therefore recover without provisioning again.
   */
  async _provisionStripeOnboardingAccount(
    id: string,
    expectedIntentKey: string,
    provision: () => Promise<{ accountId: string }>,
  ): Promise<string> {
    const operation = async () => {
      const key = onboardingIntentKey(id);
      const intent = await this.storage.get<StripeOnboardingIntent>(key);
      if (!intent || intent.affiliateId !== id || intent.idempotencyKey !== expectedIntentKey) {
        throw new Error(`Affiliate ${id} has no matching Stripe onboarding intent.`);
      }
      if (intent.accountId) return intent.accountId;
      const created = await provision();
      assertProviderId(created.accountId, "stripeAccountId");
      await this.storage.set(key, {
        ...intent,
        stage: "account_created",
        accountId: created.accountId,
        updatedAt: now(),
      } satisfies StripeOnboardingIntent);
      return created.accountId;
    };
    if (this.storage.runExclusive) {
      return this.storage.runExclusive(`affiliate-onboarding-provider:${id}`, operation);
    }
    return operation();
  }

  /** Attach one provider result, rejecting non-idempotent or deleted targets. */
  async _attachStripeOnboardingAccount(
    id: string,
    expectedIntentKey: string,
    accountId: string,
  ): Promise<{ affiliate: Affiliate; attached: boolean }> {
    assertProviderId(accountId, "stripeAccountId");
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const affiliate = await this.get(id);
      if (!affiliate) {
        throw new Error(`Affiliate ${id} no longer exists; Stripe onboarding was not attached.`);
      }
      const key = onboardingIntentKey(id);
      const intent = await this.storage.get<StripeOnboardingIntent>(key);
      if (!intent || intent.affiliateId !== id || intent.idempotencyKey !== expectedIntentKey) {
        throw new Error(`Affiliate ${id} has no matching Stripe onboarding intent.`);
      }
      const ownedAccountId = affiliate.stripeAccountId ?? intent.accountId;
      if (ownedAccountId && ownedAccountId !== accountId) {
        throw new Error(`Affiliate ${id} already owns a different Stripe Connect account.`);
      }
      const attached = !affiliate.stripeAccountId;
      const next: Affiliate = {
        ...affiliate,
        stripeAccountId: accountId,
        stripeOnboardingStatus: affiliate.stripeOnboardingStatus ?? "pending",
        updatedAt: now(),
      };
      assertAffiliate(next);
      await this.storage.set(affilKey(id), next);
      await this.storage.set(key, {
        ...intent,
        stage: "account_attached",
        accountId,
        updatedAt: now(),
      } satisfies StripeOnboardingIntent);
      return { affiliate: next, attached };
    });
  }

  /** Final read under the graph lock, so a stale start can never report success. */
  async _validateStripeOnboardingTarget(id: string, accountId: string): Promise<Affiliate> {
    return withAffiliateDependencyLock(this.storage, this.agencyId, this.clientId, async () => {
      const affiliate = await this.get(id);
      const intent = await this.storage.get<StripeOnboardingIntent>(onboardingIntentKey(id));
      if (
        !affiliate
        || affiliate.stripeAccountId !== accountId
        || intent?.affiliateId !== id
        || intent.accountId !== accountId
        || intent.stage !== "account_attached"
      ) {
        throw new Error(`Affiliate ${id} no longer owns Stripe Connect account ${accountId}.`);
      }
      return affiliate;
    });
  }

  // Lookup by Stripe Connect account id. Used by webhook handlers
  // (account.updated, transfer.paid) to find the affiliate / payouts
  // tied to a Stripe accountId. Linear scan is fine for v1; if the
  // pool grows past low-thousands a `affiliates/by-stripe-account/<id>`
  // reverse index is the obvious next step.
  async getByStripeAccount(accountId: string): Promise<Affiliate | null> {
    const all = await this.list();
    return all.find(a => a.stripeAccountId === accountId) ?? null;
  }

  // Internal — bumps counters from AttributionService. Doesn't log
  // activity (the attribution row is the canonical audit entry).
  async _incrementCounters(
    id: string,
    args: { addReferred?: number; addEarningsCents?: number },
    operationId?: string,
    lockHeld = false,
  ): Promise<void> {
    const increment = async () => {
      const existing = await this.get(id);
      if (!existing) return;
      let totalReferred: number;
      let lifetimeEarnings: number;
      if (operationId) {
        let baseline = await this.storage.get<CounterBaseline>(counterBaselineKey(id));
        if (!baseline) {
          baseline = { totalReferred: existing.totalReferred, lifetimeEarnings: existing.lifetimeEarnings };
          await this.storage.set(counterBaselineKey(id), baseline);
        }
        const operationKey = counterOperationKey(id, operationId);
        const requestedOperation = {
          addReferred: args.addReferred ?? 0,
          addEarningsCents: args.addEarningsCents ?? 0,
        } satisfies CounterOperation;
        const storedOperation = await this.storage.get<CounterOperation>(operationKey);
        if (
          storedOperation
          && (
            storedOperation.addReferred !== requestedOperation.addReferred
            || storedOperation.addEarningsCents !== requestedOperation.addEarningsCents
          )
        ) {
          throw new Error(`Affiliate counter operation ${operationId} was replayed with different values.`);
        }
        if (!storedOperation) await this.storage.set(operationKey, requestedOperation);
        const keys = await this.storage.list(`affiliates/counter-operation/${id}/`);
        let referredDelta = 0;
        let earningsDelta = 0;
        for (const key of keys) {
          const operation = await this.storage.get<CounterOperation>(key);
          referredDelta += operation?.addReferred ?? 0;
          earningsDelta += operation?.addEarningsCents ?? 0;
        }
        totalReferred = baseline.totalReferred + referredDelta;
        lifetimeEarnings = baseline.lifetimeEarnings + earningsDelta;
      } else {
        totalReferred = existing.totalReferred + (args.addReferred ?? 0);
        lifetimeEarnings = existing.lifetimeEarnings + (args.addEarningsCents ?? 0);
        const baseline = await this.storage.get<CounterBaseline>(counterBaselineKey(id));
        if (baseline) {
          await this.storage.set(counterBaselineKey(id), {
            totalReferred: baseline.totalReferred + (args.addReferred ?? 0),
            lifetimeEarnings: baseline.lifetimeEarnings + (args.addEarningsCents ?? 0),
          } satisfies CounterBaseline);
        }
      }
      const next: Affiliate = {
        ...existing,
        totalReferred,
        lifetimeEarnings,
        lastActiveAt: now(),
        updatedAt: now(),
      };
      assertAffiliate(next);
      await this.storage.set(affilKey(id), next);
    };
    if (lockHeld) return increment();
    await this.withLock(`counter:${id}`, increment);
  }

  // Payout completion reconciles this projection from canonical paid
  // attributions instead of incrementing it. Retrying after any write boundary
  // therefore converges on one earnings total rather than paying the counter twice.
  async _setLifetimeEarnings(id: string, lifetimeEarnings: number): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Affiliate ${id} not found while reconciling earnings.`);
    const next: Affiliate = {
      ...existing,
      lifetimeEarnings,
      lastActiveAt: now(),
      updatedAt: now(),
    };
    assertAffiliate(next);
    await this.storage.set(affilKey(id), next);
    const baseline = await this.storage.get<CounterBaseline>(counterBaselineKey(id));
    if (baseline) {
      await this.storage.set(counterBaselineKey(id), {
        ...baseline,
        lifetimeEarnings: next.lifetimeEarnings,
      });
    }
  }

  async _setLifetimeEarningsByCurrency(
    id: string,
    lifetimeEarningsByCurrency: Record<string, number>,
  ): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Affiliate ${id} not found while reconciling earnings.`);
    const normalized: Record<string, number> = Object.fromEntries(
      Object.entries(lifetimeEarningsByCurrency)
        .map(([currency, amount]): [string, number] => [currency.toLowerCase(), Math.max(0, Math.round(amount))])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const next: Affiliate = {
      ...existing,
      // Compatibility-only aggregate; mounted surfaces render the map.
      lifetimeEarnings: Object.values(normalized).reduce((sum, amount) => sum + amount, 0),
      lifetimeEarningsByCurrency: normalized,
      lastActiveAt: now(),
      updatedAt: now(),
    };
    assertAffiliate(next);
    await this.storage.set(affilKey(id), next);
    const baseline = await this.storage.get<CounterBaseline>(counterBaselineKey(id));
    if (baseline) {
      await this.storage.set(counterBaselineKey(id), {
        ...baseline,
        lifetimeEarnings: next.lifetimeEarnings,
      });
    }
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.storage.runExclusive) {
      return this.storage.runExclusive(`affiliate:${key}`, operation);
    }
    return localExclusive(`${this.agencyId}:${this.clientId}:${key}`, operation);
  }
}
