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

const AFFIL_INDEX_KEY = "affiliates/index";
const affilKey = (id: string): string => `affiliates/by-id/${id}`;
const userKey = (uid: UserId): string => `affiliates/by-user/${uid}`;

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
    if (!input.displayName.trim()) throw new Error("displayName required.");
    if (!input.payoutEmail.trim()) throw new Error("payoutEmail required.");
    const profile = await this.user.getUser(input.endCustomerUserId);
    if (!profile) throw new Error(`User ${input.endCustomerUserId} not found.`);

    const existing = await this.getByUser(input.endCustomerUserId);
    if (existing) {
      throw new Error(`User ${input.endCustomerUserId} is already an affiliate (status: ${existing.status}).`);
    }

    const id = makeId("aff");
    const ts = now();
    const row: Affiliate = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      endCustomerUserId: input.endCustomerUserId,
      displayName: input.displayName.trim(),
      status: "pending",                // owner approves via update()
      defaultCommissionPercent: input.defaultCommissionPercent,
      payoutEmail: input.payoutEmail.trim(),
      totalReferred: 0,
      lifetimeEarnings: 0,
      joinedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(affilKey(id), row);
    await this.storage.set(userKey(input.endCustomerUserId), id);
    const ix = (await this.storage.get<string[]>(AFFIL_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(AFFIL_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.enrolled",
      message: `${row.displayName} enrolled as an affiliate.`,
      metadata: { affiliateId: id, userId: input.endCustomerUserId, status: row.status },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "affiliate.enrolled", {
      affiliateId: id, userId: input.endCustomerUserId,
    });
    return row;
  }

  async update(id: string, patch: UpdateAffiliatePatch, actor: UserId): Promise<Affiliate | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: Affiliate = {
      ...existing,
      ...patch,
      displayName: patch.displayName?.trim() ?? existing.displayName,
      payoutEmail: patch.payoutEmail?.trim() ?? existing.payoutEmail,
      updatedAt: now(),
    };
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
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(affilKey(id));
    await this.storage.del(userKey(existing.endCustomerUserId));
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
    const next: Affiliate = {
      ...existing,
      stripeAccountId: patch.stripeAccountId ?? existing.stripeAccountId,
      stripeOnboardingStatus: patch.stripeOnboardingStatus ?? existing.stripeOnboardingStatus,
      updatedAt: now(),
    };
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
  async _incrementCounters(id: string, args: { addReferred?: number; addEarningsCents?: number }): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    const next: Affiliate = {
      ...existing,
      totalReferred: existing.totalReferred + (args.addReferred ?? 0),
      lifetimeEarnings: existing.lifetimeEarnings + (args.addEarningsCents ?? 0),
      lastActiveAt: now(),
      updatedAt: now(),
    };
    await this.storage.set(affilKey(id), next);
  }
}
