import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { KIND_LABELS } from "../lib/domain";
import type { Role } from "../lib/tenancy";

const VALID_ROLES = new Set<Role>([
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
]);

export default async function RecentActivityPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const role = ((props.install?.config?.role as Role | undefined) && VALID_ROLES.has(props.install.config.role as Role))
    ? (props.install.config.role as Role) : "agency-owner";
  const entries = await c.resources.recentActivity({ userId: props.actor, role }, 50);

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <a href="../">← Library</a>
        <h1>Recent activity</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>{entries.length} recent entries (latest 50).</p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>When</th>
            <th style={{ padding: 6 }}>Type</th>
            <th style={{ padding: 6 }}>Resource</th>
            <th style={{ padding: 6 }}>Kind</th>
            <th style={{ padding: 6 }}>Actor</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No activity yet.</td></tr>
          )}
          {entries.map((e, i) => (
            <tr key={`${e.resourceId}-${e.type}-${i}`} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(e.ts).toISOString().slice(0, 16).replace("T", " ")}</td>
              <td style={{ padding: 6 }}>
                <span style={{
                  fontSize: 11, padding: "1px 6px", borderRadius: 4,
                  background: e.type === "edited" ? "rgba(0,80,200,0.10)" : "rgba(0,180,0,0.10)",
                }}>{e.type}</span>
              </td>
              <td style={{ padding: 6 }}>{e.title}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{KIND_LABELS[e.kind]}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{e.actor ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
