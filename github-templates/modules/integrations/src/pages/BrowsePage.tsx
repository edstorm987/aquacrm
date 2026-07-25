import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { INTEGRATION_KINDS, KIND_CONFIG_SHAPES, KIND_LABELS } from "../lib/domain";

export default async function BrowsePage(_props: PluginPageProps) {
  return (
    <section>
      <h1>Browse integrations</h1>
      <p style={{ color: "rgba(0,0,0,0.6)" }}>
        Catalog of supported kinds. Click <strong>Add</strong> on the Connections page to wire one up.
        Real OAuth flows arrive in T6 — until then this surface tracks connection intent + config.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12, marginTop: 16 }}>
        {INTEGRATION_KINDS.map(k => (
          <div key={k} style={{ padding: 12, borderRadius: 8, background: "rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: 0 }}>{KIND_LABELS[k]}</h3>
            <p style={{ color: "rgba(0,0,0,0.6)", fontSize: 13, margin: "4px 0 6px" }}>
              {KIND_CONFIG_SHAPES[k].length} field{KIND_CONFIG_SHAPES[k].length === 1 ? "" : "s"}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "rgba(0,0,0,0.7)" }}>
              {KIND_CONFIG_SHAPES[k].slice(0, 3).map(f => (
                <li key={f.id}>{f.label}{f.required ? " *" : ""}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
