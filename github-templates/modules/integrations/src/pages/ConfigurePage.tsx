import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { KIND_CONFIG_SHAPES, KIND_LABELS } from "../lib/domain";

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ConfigurePage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const id = pickStr(props.searchParams?.id);
  const integration = id ? await c.integrations.get(id) : null;
  if (!integration) {
    return <section><h1>Configure</h1><p>Integration not found.</p><a href=".">← Back</a></section>;
  }
  const fields = KIND_CONFIG_SHAPES[integration.kind];
  return (
    <section>
      <h1>Configure: {integration.label}</h1>
      <p style={{ color: "rgba(0,0,0,0.6)" }}>
        {KIND_LABELS[integration.kind]} · status <strong>{integration.status}</strong>
        {integration.credentialsRef ? <> · credentials ref <code>{integration.credentialsRef}</code></> : null}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Field</th>
            <th style={{ padding: 6 }}>Value</th>
            <th style={{ padding: 6 }}>Hint</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <tr key={f.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}>{f.label}{f.required ? " *" : ""}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 13 }}>{integration.config[f.id] ?? <span style={{ color: "rgba(0,0,0,0.3)" }}>—</span>}</td>
              <td style={{ padding: 6, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{f.hint ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16, fontSize: 13, color: "rgba(0,0,0,0.55)" }}>
        Values come from the operator-paste config — credentials live in the credentials-vault by reference.
        Real OAuth flows arrive in T6.
      </p>
    </section>
  );
}
