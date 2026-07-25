import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

// Customer-side block — read-only over the agency-owned items;
// customer-owned items are tickable. Renders inside `/embed/[client]/customer`.
export default async function ChecklistCustomerPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 16 }}><p>No checklist available.</p></section>;
  const items = await c.checklist.list();
  const completion = await c.checklist.completionPct();
  const agencyItems = items.filter(i => i.ownerKind === "agency");
  const customerItems = items.filter(i => i.ownerKind === "customer");

  return (
    <section style={{ padding: 16, display: "grid", gap: 12 }}>
      <header>
        <h2 style={{ margin: 0 }}>Welcome — let's get you set up</h2>
        <small>{completion.pct}% complete</small>
      </header>

      <div>
        <h3 style={{ fontSize: 13, color: "#666", textTransform: "uppercase" }}>Your tasks</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
          {customerItems.map(it => (
            <li key={it.id} data-item-id={it.id} data-tickable="true"
                style={{ display: "flex", gap: 8, padding: 8, border: "1px solid #eee", borderRadius: 4 }}>
              <input type="checkbox" defaultChecked={it.status === "done"} aria-label={`Tick ${it.title}`} />
              <span style={{ flex: 1, textDecoration: it.status === "done" ? "line-through" : "none" }}>{it.title}</span>
            </li>
          ))}
          {customerItems.length === 0 && <li style={{ color: "#888" }}>Nothing assigned to you right now.</li>}
        </ul>
      </div>

      <div>
        <h3 style={{ fontSize: 13, color: "#666", textTransform: "uppercase" }}>Agency tasks</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
          {agencyItems.map(it => (
            <li key={it.id} data-item-id={it.id}
                style={{ display: "flex", gap: 8, padding: 8, border: "1px solid #f4f4f4", borderRadius: 4, color: "#666" }}>
              <span aria-hidden>{it.status === "done" ? "✓" : "·"}</span>
              <span style={{ flex: 1 }}>{it.title}</span>
              <small>{it.status}</small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
