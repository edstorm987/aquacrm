// `/portal/clients/<cid>/memberships/subscribers/:userId` — per-subscriber
// detail with full subscription metadata, current benefits, and Stripe
// links.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SubscriberDetailPage(props: PluginPageProps) {
  if (!props.clientId) return <p>memberships requires a client scope.</p>;
  const userId = props.segments[0];
  if (!userId) return <p>userId required in URL.</p>;

  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });

  const [subscription, benefits, plan] = await Promise.all([
    c.subscriptions.getByUser(userId),
    c.benefits.getBenefitsForUser(userId),
    (async () => {
      const sub = await c.subscriptions.getByUser(userId);
      return sub ? c.plans.get(sub.planId) : null;
    })(),
  ]);

  if (!subscription) return <p>No subscription for {userId}.</p>;

  return (
    <section className="memberships-subscriber-detail">
      <header>
        <h1>{userId}</h1>
        <span className={`memberships-pill memberships-pill-${subscription.status}`}>{subscription.status}</span>
      </header>
      <dl>
        <div><dt>Plan</dt><dd>{plan?.name ?? subscription.planId}</dd></div>
        <div><dt>Billing</dt><dd>{subscription.billing}</dd></div>
        <div><dt>Renews</dt><dd>{subscription.currentPeriodEnd ?? "—"}</dd></div>
        <div><dt>Cancel at period end</dt><dd>{subscription.cancelAtPeriodEnd ? "yes" : "no"}</dd></div>
        <div><dt>Trial ends</dt><dd>{subscription.trialEndsAt ?? "—"}</dd></div>
        {subscription.stripeCustomerId && (
          <div><dt>Stripe customer</dt><dd>{subscription.stripeCustomerId}</dd></div>
        )}
        {subscription.stripeSubscriptionId && (
          <div><dt>Stripe subscription</dt><dd>{subscription.stripeSubscriptionId}</dd></div>
        )}
      </dl>
      {benefits.length > 0 && (
        <section>
          <h2>Active benefits</h2>
          <ul>{benefits.map(b => <li key={b.id}>{b.label}</li>)}</ul>
        </section>
      )}
    </section>
  );
}
