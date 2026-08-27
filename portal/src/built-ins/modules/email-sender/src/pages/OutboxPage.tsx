import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { isoDateTimeValue } from "../lib/safeDate";

export default async function OutboxPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const [messages, provider] = await Promise.all([
    c.emails.list({}),
    c.provider.get(),
  ]);
  const providerReady = provider.provider !== "none" && provider.status === "active";
  const byStatus = {
    queued: messages.filter(m => m.status === "queued").length,
    sending: messages.filter(m => m.status === "sending").length,
    sent: messages.filter(m => m.status === "sent").length,
    failed: messages.filter(m => m.status === "failed").length,
    bounced: messages.filter(m => m.status === "bounced").length,
  };
  const recent = messages
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 50);
  return (
    <section className="email-sender-outbox">
      <header>
        <h1>Outbox</h1>
        <p>{messages.length} messages · {byStatus.queued} queued · {byStatus.sending} sending · {byStatus.sent} sent · {byStatus.failed} failed · {byStatus.bounced} bounced</p>
      </header>
      {!providerReady ? (
        <p className="email-sender-provider-warning" role="status">
          {provider.provider === "none"
            ? "Email delivery is disabled. Messages remain queued until a real provider is configured and tested."
            : `${provider.provider} is ${provider.status}. Messages cannot be reported as delivered until a test send succeeds.`}
        </p>
      ) : null}
      {recent.length === 0 ? (
        <p className="email-sender-empty">No messages yet. Other plugins enqueue here, or use Settings → Send test.</p>
      ) : (
        <table className="email-sender-table">
          <thead>
            <tr><th>To</th><th>Subject</th><th>Status</th><th>Trigger</th><th>Sent</th></tr>
          </thead>
          <tbody>
            {recent.map(m => (
              <tr key={m.id}>
                <td>{m.to.join(", ")}</td>
                <td>{m.subject}</td>
                <td className={`email-sender-status email-sender-status--${m.status}`}>{m.status}</td>
                <td>{m.triggeredByPlugin}</td>
                <td>{m.sentAt ? isoDateTimeValue(m.sentAt) ?? "Date needs review" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
