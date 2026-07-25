import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

export default async function StripeSettingsPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, storage: props.storage });
  if (!c) return <section style={{ padding: 24 }}><p>Foundation not registered.</p></section>;
  const events = await c.stripe.listEvents({ limit: 25 });
  const subs = await c.stripe.listSubscriptions();

  return (
    <section style={{ padding: 24, display: "grid", gap: 16, fontFamily: "system-ui, sans-serif" }}>
      <header>
        <h1 style={{ margin: 0 }}>Stripe events</h1>
        <small style={{ color: "#666" }}>Webhook ingestion + subscription mirror. NO charges flow through this plugin.</small>
      </header>

      <div>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", color: "#666", letterSpacing: 0.5 }}>Subscriptions</h2>
        {subs.length === 0 ? <p style={{ color: "#888" }}>None mirrored yet.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {subs.map(s => (
              <li key={s.id} data-sub-id={s.id} data-status={s.status}
                  style={{ padding: 8, border: "1px solid #eee", borderRadius: 4, display: "flex", gap: 8 }}>
                <strong style={{ width: 220 }}>{s.id}</strong>
                <span>{s.status}</span>
                <span style={{ color: "#888" }}>{s.customerId}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", color: "#666", letterSpacing: 0.5 }}>Recent events</h2>
        {events.length === 0 ? <p style={{ color: "#888" }}>None received yet.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {events.map(e => (
              <li key={e.id} data-event-id={e.id}
                  style={{ padding: 8, border: "1px solid #eee", borderRadius: 4, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                <strong>{e.type}</strong>{" · "}<small style={{ color: "#666" }}>{e.id}</small>
                {e.summary?.subscriptionId && <small style={{ color: "#888" }}>{" · sub: " + e.summary.subscriptionId}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ color: "#888", fontSize: 13 }}>
        Webhook URL: <code>/api/portal/stripe-events/webhook</code> — set this in your Stripe dashboard, then paste the signing secret into install settings.
      </p>
    </section>
  );
}
