import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

export default async function TestimonialInboxPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 24 }}><p>Foundation not registered.</p></section>;
  const items = await c.testimonials.list();

  const groups = {
    pending: items.filter(t => t.status === "pending"),
    replied: items.filter(t => t.status === "replied"),
    approved: items.filter(t => t.status === "approved"),
    public: items.filter(t => t.status === "public"),
  };

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header><h1>Testimonials</h1></header>
      {(Object.keys(groups) as Array<keyof typeof groups>).map(k => (
        <div key={k} data-testimonial-status={k}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", color: "#666", letterSpacing: 0.5 }}>{k}</h2>
          {groups[k].length === 0 ? <p style={{ color: "#888", fontSize: 13 }}>None.</p> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {groups[k].map(t => (
                <li key={t.id} data-testimonial-id={t.id}
                    style={{ padding: 12, border: "1px solid #eee", borderRadius: 4, display: "grid", gap: 4 }}>
                  <strong>{t.respondent}</strong>
                  <em style={{ color: "#666", fontSize: 13 }}>{t.prompt}</em>
                  {t.reply && <blockquote style={{ margin: 0, paddingLeft: 12, borderLeft: "3px solid #ddd" }}>{t.reply}</blockquote>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
