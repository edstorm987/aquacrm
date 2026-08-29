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

export type AffiliateDependantKind = "referral-code" | "attribution" | "payout";

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

/**
 * Everything still attached to this affiliate.
 *
 * Composed from the services' existing `affiliateId` filters rather than a new
 * storage walk, so it cannot drift from what the module itself considers to
 * belong to an affiliate.
 */
export async function affiliateDependencyInventory(
  services: Pick<AffiliatesContainer, "codes" | "attributions" | "payouts">,
  affiliateId: string,
): Promise<AffiliateDependencyInventory> {
  const empty: AffiliateDependencyInventory = {
    affiliateId,
    dependants: [],
    total: 0,
    byKind: { "referral-code": 0, attribution: 0, payout: 0 },
    hasFinancialDependants: false,
    activeReferralCodes: 0,
  };
  if (!affiliateId) return empty;

  const [codes, attributions, payouts] = await Promise.all([
    services.codes.list({ affiliateId }),
    services.attributions.list({ affiliateId }),
    services.payouts.list({ affiliateId }),
  ]);

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
  ];

  return {
    affiliateId,
    dependants,
    total: dependants.length,
    byKind: {
      "referral-code": codes.length,
      attribution: attributions.length,
      payout: payouts.length,
    },
    hasFinancialDependants: dependants.some(dependant => dependant.financial),
    activeReferralCodes: codes.filter(code => code.status === "active").length,
  };
}
