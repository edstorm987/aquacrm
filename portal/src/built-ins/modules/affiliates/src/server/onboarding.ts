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
    return this.affiliates._withStripeOnboardingCommand(input.affiliateId, async () => {
      const prepared = await this.affiliates._beginStripeOnboarding(input.affiliateId);
      if (!prepared) throw new Error(`Affiliate ${input.affiliateId} not found.`);

      let affiliate = prepared.affiliate;
      let accountId = affiliate.stripeAccountId;
      if (!accountId) {
        accountId = await this.affiliates._provisionStripeOnboardingAccount(
          affiliate.id,
          prepared.intent.idempotencyKey,
          () => this.stripe.createAccount({
            email: affiliate.payoutEmail,
            affiliateId: affiliate.id,
            agencyId: this.agencyId,
            clientId: this.clientId,
            idempotencyKey: prepared.intent.idempotencyKey,
          }),
        );
        const attached = await this.affiliates._attachStripeOnboardingAccount(
          affiliate.id,
          prepared.intent.idempotencyKey,
          accountId,
        );
        affiliate = attached.affiliate;
        if (attached.attached) {
          await this.activity.logActivity({
            idempotencyKey: `${prepared.intent.idempotencyKey}:activity`,
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
      }

      const link = await this.stripe.createOnboardingLink({
        accountId,
        returnUrl: input.returnUrl,
        refreshUrl: input.refreshUrl,
      });
      const validated = await this.affiliates._validateStripeOnboardingTarget(affiliate.id, accountId);
      return { affiliate: validated, onboardingUrl: link.url, expiresAt: link.expiresAt };
    });
  }

  // Re-read Stripe + persist whatever status they report. Called by:
  //   (a) the account.updated webhook (stripeAccountId resolved to affiliateId
  //       via AffiliateService.getByStripeAccount)
  //   (b) the customer-facing /me/stripe/refresh handler (affiliate clicks
  //       "I'm done" after returning from the hosted flow)
  async refreshStatus(affiliateId: string, actor?: UserId): Promise<Affiliate | null> {
    const affiliate = await this.affiliates.get(affiliateId);
    if (!affiliate || !affiliate.stripeAccountId) return affiliate;
    const sequence = await this.affiliates._beginStripeStatusObservation(affiliate.id, affiliate.stripeAccountId);
    if (sequence === null) return null;
    const snapshot = await this.stripe.retrieveAccount(affiliate.stripeAccountId);
    return this._applySnapshot(affiliate, snapshot, sequence, actor);
  }

  // Webhook entry point. Foundation passes the signed event's projected
  // account so ownership can be checked; the event then wakes an authoritative
  // provider read because Stripe webhook delivery is not ordered.
  async applySnapshotForAccount(accountId: string, snapshot: StripeConnectAccountSnapshot): Promise<Affiliate | null> {
    if (snapshot.accountId !== accountId) {
      throw new Error(`Stripe snapshot account ${snapshot.accountId} does not match webhook account ${accountId}.`);
    }
    const affiliate = await this.affiliates.getByStripeAccount(accountId);
    if (!affiliate) return null;
    const sequence = await this.affiliates._beginStripeStatusObservation(affiliate.id, accountId);
    if (sequence === null) return null;
    // Stripe does not guarantee webhook delivery order. Treat the signed event
    // as a wake-up signal, then retrieve the provider's current account state;
    // otherwise a valid but older account.updated delivery can arrive last and
    // regress a newer durable observation.
    const currentSnapshot = await this.stripe.retrieveAccount(accountId);
    return this._applySnapshot(affiliate, currentSnapshot, sequence);
  }

  private async _applySnapshot(
    affiliate: Affiliate,
    snapshot: StripeConnectAccountSnapshot,
    sequence: number,
    actor?: UserId,
  ): Promise<Affiliate | null> {
    if (snapshot.accountId !== affiliate.stripeAccountId) {
      throw new Error(`Stripe snapshot account ${snapshot.accountId} does not match affiliate ${affiliate.id}.`);
    }
    const next = snapshotToStatus(snapshot);
    const application = await this.affiliates._applyStripeStatusObservation(
      affiliate.id,
      snapshot.accountId,
      sequence,
      next,
    );
    if (!application) return null;
    const updated = application.affiliate;
    if (!application.applied || !application.changed) return updated;
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.stripe_onboarding_status_changed",
      message: `Stripe onboarding for ${updated.displayName}: ${application.previousStatus ?? "absent"} → ${next}.`,
      metadata: {
        affiliateId: updated.id,
        stripeAccountId: snapshot.accountId,
        previous: application.previousStatus ?? null,
        next,
        observationSequence: sequence,
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
