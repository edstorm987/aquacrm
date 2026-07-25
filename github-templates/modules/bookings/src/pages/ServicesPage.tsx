import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ServicesPage(props: PluginPageProps) {
  if (!props.clientId) return <p>Bookings is client-scoped.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const services = await c.bookings.listServices(true);
  const apiBase = "/api/portal/bookings";

  return (
    <section className="bookings-services">
      <header style={{ marginBottom: 16 }}>
        <h1>Services</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>{services.length} services</p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Label</th>
            <th style={{ padding: 6 }}>Duration</th>
            <th style={{ padding: 6 }}>Buffer</th>
            <th style={{ padding: 6 }}>Capacity</th>
            <th style={{ padding: 6 }}>Price</th>
            <th style={{ padding: 6 }}>Active</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {services.map(s => (
            <tr key={s.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", opacity: s.active ? 1 : 0.5 }}>
              <td style={{ padding: 6 }}>{s.label}</td>
              <td style={{ padding: 6 }}>{s.durationMin}m</td>
              <td style={{ padding: 6 }}>{s.bufferMin}m</td>
              <td style={{ padding: 6 }}>{s.capacity}</td>
              <td style={{ padding: 6 }}>{s.priceCents !== undefined ? `£${(s.priceCents / 100).toFixed(2)}` : "—"}</td>
              <td style={{ padding: 6 }}>{s.active ? "✓" : "—"}</td>
              <td style={{ padding: 6 }}>
                {s.active && (
                  <form action={`${apiBase}/services/archive?id=${s.id}`} method="delete" style={{ display: "inline" }}>
                    <button type="submit" style={{ color: "#a00" }}>Archive</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>New service</h2>
      <form action={`${apiBase}/services/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Label<input name="label" required style={{ width: "100%" }} /></label>
        <label>Duration (min)<input name="durationMin" type="number" min={1} defaultValue={60} required /></label>
        <label>Buffer (min)<input name="bufferMin" type="number" min={0} defaultValue={15} /></label>
        <label>Capacity<input name="capacity" type="number" min={1} defaultValue={1} /></label>
        <label>Price (cents)<input name="priceCents" type="number" min={0} /></label>
        <button type="submit">Create service</button>
      </form>
    </section>
  );
}
