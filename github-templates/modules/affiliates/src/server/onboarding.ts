// Stripe Connect onboarding service for affiliates (R12).
//
// Three operations: start (create Connect account + AccountLink),
// refreshStatus (re-read Stripe + persist), and snapshotToStatus
// (translate Stripe's `chargesEnabled / payoutsEnabled / detailsSubmitted`
// triplet into our 3-state `stripeOnboardingStatus`).
//
// Idempotency on `start`: if the affiliate already has a stripeAccountId
// we re-issue an AccountLink against the existing account rather than
// creating a second connected account (Stripe charges per-account on
// some plans + Felicia's affiliate would otherwise see two accounts).

import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type { Affiliate, StripeOnboardingStatus } from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StripeConnectAccountSnapshot,
  StripeConnectPort,
} from "./ports";
import type { AffiliateService } from "./affiliates";

export interface StartStripeOnboardingArgs {
  affiliateId: string;
  returnUrl: string;             // where Stripe lands the affiliate post-onboarding
  refreshUrl: string;            // where Stripe re-issues the link if expired
}

export interface StartStripeOnboardingResult {
  affiliate: Affiliate;
  onboardingUrl: string;
  expiresAt: number;
}

export class OnboardingService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private affiliates: AffiliateService,
    private stripe: StripeConnectPort,
  ) {}

  // Start (or resume) the Connect Express onboarding flow.
  async start(input: StartStripeOnboardingArgs, actor: UserId): Promise<StartStripeOnboardingResult> {
    const affiliate = await this.affiliates.get(input.affiliateId);
    if (!affiliate) throw new Error(`Affiliate ${input.affiliateId} not found.`);

    let accountId = affiliate.stripeAccountId;
    let isNew = false;
    if (!accountId) {
      const created = await this.stripe.createAccount({
        email: affiliate.payoutEmail,
        affiliateId: affiliate.id,
        agencyId: this.agencyId,
        clientId: this.clientId,
      });
      accountId = created.accountId;
      isNew = true;
      await this.affiliates._setStripe(affiliate.id, {
        stripeAccountId: accountId,
        stripeOnboardingStatus: "pending",
      });
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "affiliates",
        action: "affiliate.stripe_onboarding_started",
        message: `Started Stripe Connect onboarding for ${affiliate.displayName}.`,
        metadata: { affiliateId: affiliate.id, stripeAccountId: accountId },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "affiliate.stripe_onboarding_started",
        { affiliateId: affiliate.id, stripeAccountId: accountId },
      );
    }

    const link = await this.stripe.createOnboardingLink({
      accountId,
      returnUrl: input.returnUrl,
      refreshUrl: input.refreshUrl,
    });
    const refreshed = isNew
      ? await this.affiliates.get(affiliate.id) ?? affiliate
      : affiliate;
    return { affiliate: refreshed, onboardingUrl: link.url, expiresAt: link.expiresAt };
  }

  // Re-read Stripe + persist whatever status they report. Called by:
  //   (a) the account.updated webhook (stripeAccountId resolved to affiliateId
  //       via AffiliateService.getByStripeAccount)
  //   (b) the customer-facing /me/stripe/refresh handler (affiliate clicks
  //       "I'm done" after returning from the hosted flow)
  async refreshStatus(affiliateId: string, actor?: UserId): Promise<Affiliate | null> {
    const affiliate = await this.affiliates.get(affiliateId);
    if (!affiliate || !affiliate.stripeAccountId) return affiliate;
    const snapshot = await this.stripe.retrieveAccount(affiliate.stripeAccountId);
    return this._applySnapshot(affiliate, snapshot, actor);
  }

  // Webhook entry point. Foundation calls this from the
  // account.updated handler with the raw Stripe `Account` projected
  // into our snapshot shape.
  async applySnapshotForAccount(accountId: string, snapshot: StripeConnectAccountSnapshot): Promise<Affiliate | null> {
    const affiliate = await this.affiliates.getByStripeAccount(accountId);
    if (!affiliate) return null;
    return this._applySnapshot(affiliate, snapshot);
  }

  private async _applySnapshot(
    affiliate: Affiliate,
    snapshot: StripeConnectAccountSnapshot,
    actor?: UserId,
  ): Promise<Affiliate | null> {
    const next = snapshotToStatus(snapshot);
    if (affiliate.stripeOnboardingStatus === next) {
      // No-op transition; persist any new accountId form just in case.
      return affiliate;
    }
    const updated = await this.affiliates._setStripe(affiliate.id, {
      stripeOnboardingStatus: next,
    });
    if (!updated) return null;
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.stripe_onboarding_status_changed",
      message: `Stripe onboarding for ${updated.displayName}: ${affiliate.stripeOnboardingStatus ?? "absent"} → ${next}.`,
      metadata: {
        affiliateId: updated.id,
        stripeAccountId: snapshot.accountId,
        previous: affiliate.stripeOnboardingStatus ?? null,
        next,
        chargesEnabled: snapshot.chargesEnabled,
        payoutsEnabled: snapshot.payoutsEnabled,
        disabledReason: snapshot.disabledReason,
        ts: now(),
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.stripe_onboarding_status_changed",
      { affiliateId: updated.id, status: next, stripeAccountId: snapshot.accountId },
    );
    return updated;
  }
}

export function snapshotToStatus(snapshot: StripeConnectAccountSnapshot): StripeOnboardingStatus {
  if (snapshot.chargesEnabled && snapshot.payoutsEnabled) return "complete";
  if (snapshot.disabledReason || (snapshot.detailsSubmitted && !snapshot.payoutsEnabled)) {
    return "restricted";
  }
  return "pending";
}
