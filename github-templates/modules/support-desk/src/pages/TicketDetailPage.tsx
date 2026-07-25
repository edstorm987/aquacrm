import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { STATUS_LABELS } from "../lib/domain";

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function TicketDetailPage(props: PluginPageProps) {
  if (!props.clientId) return <section><h1>Ticket</h1><p>Open from a client portal.</p></section>;
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const id = pickStr(props.searchParams?.id);
  const t = id ? await c.tickets.get(id) : null;
  if (!t) return <section><h1>Ticket</h1><p>Not found.</p><a href=".">← Inbox</a></section>;
  return (
    <section>
      <header style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
          <a href=".">← Inbox</a> · <code>{t.ref}</code>
        </p>
        <h1 style={{ margin: "4px 0" }}>{t.subject}</h1>
        <p style={{ margin: 0, color: "rgba(0,0,0,0.6)" }}>
          {STATUS_LABELS[t.status]} · {t.priority} priority · {t.customerEmail}
          {t.assignedTo && <> · assigned to <code>{t.assignedTo}</code></>}
          {t.tags.length > 0 && <> · tags: {t.tags.join(", ")}</>}
        </p>
      </header>
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {t.messages.map(m => (
          <li key={m.id} style={{
            padding: 12, marginBottom: 8, borderRadius: 6,
            background: m.fromKind === "customer" ? "rgba(60,120,200,0.06)" : "rgba(40,160,80,0.06)",
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
              <strong>{m.fromKind}</strong>
              {m.authorEmail && <> · {m.authorEmail}</>}
              {" · "}{new Date(m.sentAt).toISOString().slice(0, 16).replace("T", " ")}
            </p>
            <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 16, fontSize: 13, color: "rgba(0,0,0,0.55)" }}>
        Reply via <code>POST /api/portal/{`<scope>`}/support-desk/reply?id={t.id}</code>{" "}
        with <code>{`{"body":"..."}`}</code>.
      </p>
    </section>
  );
}
