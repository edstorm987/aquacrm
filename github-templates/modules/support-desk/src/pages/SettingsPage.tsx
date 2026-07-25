import type { PluginPageProps } from "../lib/aquaPluginTypes";

export default async function SettingsPage(props: PluginPageProps) {
  const rules = (props.install?.config?.autoAssignRules as { tag: string; userId: string }[] | undefined) ?? [];
  const replyTemplate = (props.install?.config?.replyTemplate as string | undefined) ?? "";
  return (
    <section>
      <h1>Support desk settings</h1>
      <h2>Auto-assign rules</h2>
      {rules.length === 0
        ? <p style={{ color: "rgba(0,0,0,0.55)" }}>No rules configured. Add via <code>install.config.autoAssignRules = [{`{tag, userId}`}]</code>.</p>
        : (
          <table style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
                <th style={{ padding: 6 }}>Tag</th>
                <th style={{ padding: 6 }}>Assignee</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <td style={{ padding: 6 }}>{r.tag}</td>
                  <td style={{ padding: 6 }}><code>{r.userId}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <h2 style={{ marginTop: 24 }}>Auto-reply template</h2>
      <pre style={{ padding: 12, background: "rgba(0,0,0,0.05)", borderRadius: 6, whiteSpace: "pre-wrap" }}>
        {replyTemplate || "(none)"}
      </pre>
    </section>
  );
}
