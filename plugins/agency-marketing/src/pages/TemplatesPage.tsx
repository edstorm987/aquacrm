import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function TemplatesPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const templates = await c.templates.list();
  return (
    <section className="marketing-templates">
      <header><h1>Email templates</h1><p>{templates.length} total.</p></header>
      <ul className="marketing-list">
        {templates.map(t => (
          <li key={t.id}>
            <article>
              <header>
                <h3>{t.name}</h3>
                <span className={`marketing-pill marketing-pill-${t.status}`}>{t.status}</span>
              </header>
              <p className="marketing-meta">{t.category}{t.isDefault ? " · default" : ""}</p>
              <p className="marketing-meta">Subject: {t.subject}</p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
