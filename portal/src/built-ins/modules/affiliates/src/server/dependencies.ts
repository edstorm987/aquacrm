// What still points at an affiliate, before anyone decides to remove them.
//
// The roadmap's dependency-safe-membership-affiliate-retirement item states the
// failure plainly: *"Affiliate DELETE leaves active codes, attributions and
// payouts tied to a missing parent."* Verified — `AffiliateService.delete`
// removes the affiliate row, the by-user reverse lookup, the enrollment claim
// and the index entry, and touches nothing else.
//
// ── Why this is worse than an untidy id ────────────────────────────────────
//
// Two of the three orphans are FINANCIAL. An attribution is a record that
// somebody earned commission; a payout is a record that money is owed or was
// sent. Leaving them pointing at a deleted parent does not just break a screen —
// it detaches money from the person it belongs to, and the surfaces that would
// have shown it filter on an affiliate that no longer resolves. A referral CODE
// is worse in a different way: it stays ACTIVE, so a live link keeps attributing
// sales to nobody.
//
// ── This module deliberately decides NOTHING ───────────────────────────────
//
// The roadmap's own instruction is to *"use the existing plan archive and
// Affiliate removed states for ordinary retirement"* and to define an explicit
// exceptional purge with billing reconciliation. Which of those applies, and
// what happens to money already earned, is a product decision that is still
// open. This answers only the question every version of it has to ask first —
// *what is still attached?* — so a confirmation surface and a server command ask
// it of one implementation.

import type { AffiliatesContainer } from "./index";
import type { Attribution, Payout, ReferralCode } from "../lib/domain";
import type { StoragePort } from "./ports";

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

/** One install-wide lane for affiliate parents and every dependent money row. */
export function withAffiliateDependencyLock<T>(
  storage: StoragePort,
  agencyId: string,
  clientId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `affiliates:dependency-graph:${agencyId}:${clientId}`;
  return storage.runExclusive
    ? storage.runExclusive(key, operation)
    : localDependencyLock(key, operation);
}

export type AffiliateDependantKind = "referral-code" | "attribution" | "payout" | "stripe-account";

export interface AffiliateDependant {
  kind: AffiliateDependantKind;
  id: string;
  /** Enough for a confirmation dialog to name it without a second lookup. */
  label: string;
  /**
   * True when leaving this orphaned detaches MONEY from its owner rather than
   * merely breaking a link. Attributions and payouts are financial records;
   * a referral code is not, but it stays live.
   */
  financial: boolean;
}

export interface AffiliateDependencyInventory {
  affiliateId: string;
  dependants: AffiliateDependant[];
  total: number;
  byKind: Record<AffiliateDependantKind, number>;
  /** True when any dependant is a financial record — the ones money hangs off. */
  hasFinancialDependants: boolean;
  /**
   * Referral codes still ACTIVE. These are the sharp ones: a live link keeps
   * attributing sales to an affiliate that no longer exists.
   */
  activeReferralCodes: number;
}

export class AffiliateHasDependantsError extends Error {
  constructor(
    readonly affiliateName: string,
    readonly dependencies: AffiliateDependencyInventory,
  ) {
    super(`Affiliate ${dependencies.affiliateId} still has ${dependencies.total} dependant record(s).`);
    this.name = "AffiliateHasDependantsError";
  }
}

function inventoryFor(
  affiliateId: string,
  codes: ReferralCode[],
  attributions: Attribution[],
  payouts: Payout[],
  stripeDependency?: { id: string; pending: boolean },
): AffiliateDependencyInventory {
  const dependants: AffiliateDependant[] = [
    ...codes.map(code => ({
      kind: "referral-code" as const,
      id: code.id,
      label: `Referral code ${code.code}${code.status === "active" ? " (ACTIVE)" : ""}`,
      financial: false,
    })),
    ...attributions.map(attribution => ({
      kind: "attribution" as const,
      id: attribution.id,
      label: `Attribution ${attribution.id} · ${attribution.status}`,
      financial: true,
    })),
    ...payouts.map(payout => ({
      kind: "payout" as const,
      id: payout.id,
      label: `Payout ${payout.id} · ${payout.status}`,
      financial: true,
    })),
    ...(stripeDependency ? [{
      kind: "stripe-account" as const,
      id: stripeDependency.id,
      label: stripeDependency.pending
        ? "Stripe Connect onboarding is in progress"
        : `Stripe Connect account ${stripeDependency.id}`,
      financial: !stripeDependency.pending,
    }] : []),
  ];
  return {
    affiliateId,
    dependants,
    total: dependants.length,
    byKind: {
      "referral-code": codes.length,
      attribution: attributions.length,
      payout: payouts.length,
      "stripe-account": stripeDependency ? 1 : 0,
    },
    hasFinancialDependants: dependants.some(dependant => dependant.financial),
    activeReferralCodes: codes.filter(code => code.status === "active").length,
  };
}

/** Storage-only form used by AffiliateService while it owns the graph lock. */
export async function affiliateDependencyInventoryFromStorage(
  storage: StoragePort,
  agencyId: string,
  clientId: string,
  affiliateId: string,
): Promise<AffiliateDependencyInventory> {
  const belongs = <T extends { agencyId: string; clientId: string; affiliateId: string }>(row: T | undefined): row is T =>
    row?.agencyId === agencyId && row.clientId === clientId && row.affiliateId === affiliateId;
  const readRows = async <T extends { id: string; agencyId: string; clientId: string; affiliateId: string }>(
    rowPrefix: string,
    recoveryPrefix: string,
    recover: (value: unknown) => T | undefined,
  ): Promise<T[]> => {
    const rows = new Map<string, T>();
    for (const key of await storage.list(rowPrefix)) {
      const row = await storage.get<T>(key);
      if (belongs(row)) rows.set(row.id, row);
    }
    // Claims/operations are durable owners too: a crash can leave one before
    // the primary row/index. Its replay must not recreate a child after purge.
    for (const key of await storage.list(recoveryPrefix)) {
      const row = recover(await storage.get(key));
      if (belongs(row)) rows.set(row.id, row);
    }
    return [...rows.values()];
  };
  const [codes, attributions, payouts, affiliate, onboardingIntent] = await Promise.all([
    readRows<ReferralCode>(
      "codes/by-id/",
      "codes/claims/by-code/",
      value => (value as { row?: ReferralCode } | undefined)?.row,
    ),
    readRows<Attribution>(
      "attributions/by-id/",
      "attributions/claims/by-order/",
      value => (value as { row?: Attribution } | undefined)?.row,
    ),
    readRows<Payout>(
      "payouts/by-id/",
      `payouts/schedule-operation/${affiliateId}/`,
      value => (value as { payout?: Payout } | undefined)?.payout,
    ),
    storage.get<{ stripeAccountId?: string }>(`affiliates/by-id/${affiliateId}`),
    storage.get<{ accountId?: string; idempotencyKey?: string }>(`affiliates/onboarding-intent/${affiliateId}`),
  ]);
  const accountId = affiliate?.stripeAccountId ?? onboardingIntent?.accountId;
  const stripeDependency = accountId
    ? { id: accountId, pending: !affiliate?.stripeAccountId }
    : onboardingIntent?.idempotencyKey
      ? { id: onboardingIntent.idempotencyKey, pending: true }
      : undefined;
  return inventoryFor(affiliateId, codes, attributions, payouts, stripeDependency);
}

/**
 * Everything still attached to this affiliate.
 *
 * Composed from the services' existing `affiliateId` filters rather than a new
 * storage walk, so it cannot drift from what the module itself considers to
 * belong to an affiliate.
 */
export async function affiliateDependencyInventory(
  services: Pick<AffiliatesContainer, "affiliates" | "codes" | "attributions" | "payouts">,
  affiliateId: string,
): Promise<AffiliateDependencyInventory> {
  if (!affiliateId) return inventoryFor(affiliateId, [], [], []);

  const [codes, attributions, payouts, affiliate] = await Promise.all([
    services.codes.list({ affiliateId }),
    services.attributions.list({ affiliateId }),
    services.payouts.list({ affiliateId }),
    services.affiliates.get(affiliateId),
  ]);

  return inventoryFor(
    affiliateId,
    codes,
    attributions,
    payouts,
    affiliate?.stripeAccountId ? { id: affiliate.stripeAccountId, pending: false } : undefined,
  );
}
