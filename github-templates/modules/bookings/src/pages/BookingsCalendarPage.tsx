import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { dayKeyUTC } from "../lib/domain";

const DAY_MS = 86_400_000;

export default async function BookingsCalendarPage(props: PluginPageProps) {
  if (!props.clientId) return <p>Bookings is client-scoped.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const sp = props.searchParams ?? {};
  const fromRaw = typeof sp.from === "string" ? Number(sp.from) : Date.now();
  const startOfWeek = Math.floor(fromRaw / DAY_MS) * DAY_MS;
  const bookings = await c.bookings.listBookings({
    windowStart: startOfWeek,
    windowEnd: startOfWeek + 7 * DAY_MS,
  });
  const services = await c.bookings.listServices(true);
  const svcLabel = (id: string): string => services.find(s => s.id === id)?.label ?? id;

  // Bucket by day.
  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const k = dayKeyUTC(b.startAt);
    const arr = byDay.get(k) ?? [];
    arr.push(b);
    byDay.set(k, arr);
  }
  const days = Array.from({ length: 7 }, (_, i) => dayKeyUTC(startOfWeek + i * DAY_MS));

  return (
    <section className="bookings-calendar">
      <header style={{ marginBottom: 12 }}>
        <h1>Bookings</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {bookings.length} bookings this week ({days[0]} → {days[6]})
        </p>
        <p style={{ marginTop: 4 }}>
          <a href={`?from=${startOfWeek - 7 * DAY_MS}`}>← Prev week</a>
          {"  "}
          <a href="?">Today</a>
          {"  "}
          <a href={`?from=${startOfWeek + 7 * DAY_MS}`}>Next week →</a>
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 8 }}>
        {days.map(d => {
          const items = byDay.get(d) ?? [];
          return (
            <div key={d} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: 6, minHeight: 120 }}>
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginBottom: 6 }}>{d}</div>
              {items.length === 0 && <div style={{ color: "rgba(0,0,0,0.3)", fontSize: 12 }}>—</div>}
              {items.map(b => (
                <div key={b.id} style={{
                  fontSize: 12, padding: 4, marginBottom: 4, borderRadius: 4,
                  background: b.status === "cancelled" ? "rgba(200,0,0,0.08)" : "rgba(0,0,0,0.04)",
                  textDecoration: b.status === "cancelled" ? "line-through" : "none",
                }}>
                  <div>{new Date(b.startAt).toISOString().slice(11, 16)} {svcLabel(b.serviceId)}</div>
                  <div style={{ color: "rgba(0,0,0,0.6)" }}>{b.endCustomerName}</div>
                  <div style={{ fontSize: 10, color: "rgba(0,0,0,0.5)" }}>{b.status}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
