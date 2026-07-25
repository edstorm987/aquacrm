import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { CHANNEL_KEYS, CHANNEL_LABELS } from "../lib/domain";

export default async function NotificationRulesPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const rules = await c.notifications.listRules();
  const config = await c.notifications.getConfig();
  const apiBase = "/api/portal/notifications";

  return (
    <section className="notifications-rules">
      <header style={{ marginBottom: 16 }}>
        <h1>Notification rules</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {rules.length} rules · channels configured: {Object.entries(config).filter(([_, v]) => v && Object.values(v).some(Boolean)).length}/4
        </p>
      </header>

      <h2>Rules</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>User</th>
            <th style={{ padding: 6 }}>Categories</th>
            <th style={{ padding: 6 }}>Channels</th>
            <th style={{ padding: 6 }}>Cooldown</th>
            <th style={{ padding: 6 }}>Enabled</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No rules yet.</td></tr>
          )}
          {rules.map(r => (
            <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 13 }}>{r.userId}</td>
              <td style={{ padding: 6 }}>
                {r.eventCategories.length === 0 ? <em>all</em> : r.eventCategories.join(", ")}
              </td>
              <td style={{ padding: 6 }}>{r.channels.map(c => CHANNEL_LABELS[c]).join(" · ")}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{r.cooldownSeconds ? `${r.cooldownSeconds}s` : "—"}</td>
              <td style={{ padding: 6 }}>{r.enabled ? "✓" : "—"}</td>
              <td style={{ padding: 6 }}>
                <form action={`${apiBase}/rules/archive?id=${r.id}`} method="delete" style={{ display: "inline" }}>
                  <button type="submit" style={{ color: "#a00" }}>Archive</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>New rule</h2>
      <form action={`${apiBase}/rules/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>
          User id
          <input name="userId" required style={{ width: "100%" }} />
        </label>
        <fieldset>
          <legend>Channels</legend>
          {CHANNEL_KEYS.map(k => (
            <label key={k} style={{ display: "inline-block", marginRight: 12 }}>
              <input type="checkbox" name="channels" value={k} /> {CHANNEL_LABELS[k]}
            </label>
          ))}
        </fieldset>
        <label>
          Cooldown (seconds)
          <input name="cooldownSeconds" type="number" min={0} defaultValue={60} />
        </label>
        <button type="submit">Create rule</button>
      </form>
    </section>
  );
}
