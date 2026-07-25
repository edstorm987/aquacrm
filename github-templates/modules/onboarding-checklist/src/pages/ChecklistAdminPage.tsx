import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";
import type { ChecklistItem, OwnerKind } from "../lib/domain";

export default async function ChecklistAdminPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) {
    return (
      <section style={{ padding: 24 }}>
        <h1>Onboarding checklist</h1>
        <p>Foundation not registered or no client scope.</p>
      </section>
    );
  }
  const items = await c.checklist.list();
  const completion = await c.checklist.completionPct();
  const agency = items.filter(i => i.ownerKind === "agency");
  const customer = items.filter(i => i.ownerKind === "customer");

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header>
        <h1>Onboarding checklist</h1>
        <ProgressBar pct={completion.pct} done={completion.done} skipped={completion.skipped} total={completion.total} />
      </header>

      <Group title="Agency owns" items={agency} owner="agency" />
      <Group title="Customer owns" items={customer} owner="customer" />

      <AddItemForm />
    </section>
  );
}

function ProgressBar(props: { pct: number; done: number; skipped: number; total: number }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ height: 8, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${props.pct}%`, background: "#3a8a3a", height: "100%" }} />
      </div>
      <small>{props.done} done · {props.skipped} skipped · {props.total} total — {props.pct}%</small>
    </div>
  );
}

function Group(props: { title: string; items: ChecklistItem[]; owner: OwnerKind }) {
  return (
    <div data-owner={props.owner} style={{ display: "grid", gap: 8 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "#666" }}>{props.title}</h2>
      {props.items.length === 0 ? (
        <p style={{ color: "#888", fontSize: 14 }}>No items yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
          {props.items.map(it => (
            <li key={it.id} data-item-id={it.id} data-status={it.status}
                style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, border: "1px solid #eee", borderRadius: 4 }}>
              <span aria-hidden style={{ width: 14, textAlign: "center" }}>
                {it.status === "done" ? "✓" : it.status === "skipped" ? "—" : "·"}
              </span>
              <span style={{ flex: 1, textDecoration: it.status === "done" ? "line-through" : "none" }}>{it.title}</span>
              <small style={{ color: "#888" }}>{it.status}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddItemForm() {
  // Submitted via the items/create route. Foundation enhancer wires
  // up the POST; server-side this renders read-only HTML for JS-off.
  return (
    <form data-add-item="onboarding-checklist" style={{ display: "grid", gap: 8, padding: 12, border: "1px dashed #ccc", borderRadius: 4 }}>
      <h3 style={{ margin: 0 }}>Add item</h3>
      <input name="title" placeholder="Title" required />
      <textarea name="description" placeholder="Description (optional)" rows={2} />
      <select name="ownerKind" defaultValue="agency">
        <option value="agency">Agency owns</option>
        <option value="customer">Customer owns</option>
      </select>
      <button type="submit">Add</button>
    </form>
  );
}
