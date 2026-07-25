import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { CADENCE_LABELS, type Cadence } from "../lib/domain";

export default async function RecurringTasksPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const tasks = await c.tasks.list();
  const apiBase = "/api/portal/agency-ops";
  const refNow = Date.now();

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Recurring tasks</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {tasks.length} tracked · {tasks.filter(t => t.active && t.nextDue <= refNow).length} overdue
        </p>
        <p style={{ marginTop: 8 }}>
          <form action={`${apiBase}/tasks/seed`} method="post" style={{ display: "inline" }}>
            <button type="submit">Seed defaults</button>
          </form>
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Title</th>
            <th style={{ padding: 6 }}>Cadence</th>
            <th style={{ padding: 6 }}>Next due</th>
            <th style={{ padding: 6 }}>Last done</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No tasks yet.</td></tr>
          )}
          {tasks.map(t => {
            const overdue = t.active && t.nextDue <= refNow;
            return (
              <tr key={t.id} style={{
                borderBottom: "1px solid rgba(0,0,0,0.05)",
                background: overdue ? "rgba(220,160,0,0.10)" : "transparent",
                opacity: t.active ? 1 : 0.5,
              }}>
                <td style={{ padding: 6 }}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  {t.description && <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{t.description}</div>}
                </td>
                <td style={{ padding: 6 }}>{CADENCE_LABELS[t.cadence]}</td>
                <td style={{ padding: 6, fontSize: 13 }}>{new Date(t.nextDue).toISOString().slice(0, 10)}</td>
                <td style={{ padding: 6, fontSize: 13 }}>{t.lastDoneAt ? new Date(t.lastDoneAt).toISOString().slice(0, 10) : "—"}</td>
                <td style={{ padding: 6 }}>
                  {t.active && (
                    <form action={`${apiBase}/tasks/complete?id=${t.id}`} method="post" style={{ display: "inline" }}>
                      <button type="submit">Mark done</button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>New task</h2>
      <form action={`${apiBase}/tasks/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Title<input name="title" required /></label>
        <label>Cadence
          <select name="cadence" defaultValue={"weekly" satisfies Cadence}>
            {(Object.keys(CADENCE_LABELS) as Cadence[]).map(c => (
              <option key={c} value={c}>{CADENCE_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label>Description<textarea name="description" rows={2} /></label>
        <button type="submit">Create</button>
      </form>
    </section>
  );
}
