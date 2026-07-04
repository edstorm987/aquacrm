import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function LogsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const messages = await c.emails.list({});
  const failed = messages.filter(m => m.status === "failed" || m.status === "bounced");
  const recent = failed
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 100);
  return (
    <section className="email-sender-logs">
      <header>
        <h1>Logs</h1>
        <p>Failed + bounced messages (most recent first). Last 100.</p>
      </header>
      {recent.length === 0 ? (
        <p className="email-sender-empty">No failures. Lovely.</p>
      ) : (
        <table className="email-sender-table">
          <thead>
            <tr><th>Time</th><th>To</th><th>Subject</th><th>Status</th><th>Reason</th><th>Trigger</th></tr>
          </thead>
          <tbody>
            {recent.map(m => (
              <tr key={m.id}>
                <td>{m.updatedAt ? new Date(m.updatedAt).toISOString() : "—"}</td>
                <td>{m.to.join(", ")}</td>
                <td>{m.subject}</td>
                <td className={`email-sender-status email-sender-status--${m.status}`}>{m.status}</td>
                <td>{m.failureReason ?? "—"}</td>
                <td>{m.triggeredByPlugin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
