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

const AFFIL_INDEX_KEY = "affiliates/index";
const affilKey = (id: string): string => `affiliates/by-id/${id}`;
const userKey = (uid: UserId): string => `affiliates/by-user/${uid}`;
const enrollmentClaimKey = (uid: UserId): string => `affiliates/claims/user/${encodeURIComponent(uid)}`;
const counterBaselineKey = (id: string): string => `affiliates/counter-baseline/${id}`;
const counterOperationKey = (id: string, operationId: string): string => `affiliates/counter-operation/${id}/${encodeURIComponent(operationId)}`;

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
    return this.withLock("enrollment-collection", async () => {
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
    return this.withLock("enrollment-collection", async () => {
      const existing = await this.get(id);
      if (!existing) return false;
      await this.storage.del(affilKey(id));
      await this.storage.del(userKey(existing.endCustomerUserId));
      await this.storage.del(enrollmentClaimKey(existing.endCustomerUserId));
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
