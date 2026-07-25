import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { Weekday } from "../lib/domain";

const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

export default async function AvailabilityPage(props: PluginPageProps) {
  if (!props.clientId) return <p>Bookings is client-scoped.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const a = await c.bookings.getAvailability();

  return (
    <section className="bookings-availability">
      <header style={{ marginBottom: 16 }}>
        <h1>Weekly availability</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          Open windows per weekday. Times are HH:MM in your operating timezone (operator runbook for tz lift).
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Day</th>
            <th style={{ padding: 6 }}>Windows</th>
          </tr>
        </thead>
        <tbody>
          {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map(wd => (
            <tr key={wd} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontWeight: 600 }}>{WEEKDAY_LABELS[wd]}</td>
              <td style={{ padding: 6 }}>
                {(a.weekdayPattern[wd] ?? []).length === 0
                  ? <em style={{ color: "rgba(0,0,0,0.4)" }}>closed</em>
                  : (a.weekdayPattern[wd] ?? []).map((w, i) => (
                      <span key={i} style={{ marginRight: 8, padding: "2px 6px", background: "rgba(0,0,0,0.05)", borderRadius: 4 }}>
                        {w.start} – {w.end}
                      </span>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Exceptions</h2>
      <p>{a.exceptions.length === 0 ? <em>none</em> : a.exceptions.join(", ")}</p>

      <p style={{ color: "rgba(0,0,0,0.5)", fontSize: 13, marginTop: 24 }}>
        v1: edit availability JSON via <code>PATCH /api/portal/bookings/availability/save</code>. A
        rich weekly schedule editor is an R+1 candidate.
      </p>
    </section>
  );
}
