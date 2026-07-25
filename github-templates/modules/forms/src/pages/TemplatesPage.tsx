import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function TemplatesPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const templates = await c.templates.list();
  return (
    <section className="forms-templates">
      <header><h1>Form templates</h1><p>{templates.length} total ({templates.filter(t => t.isDefault).length} default).</p></header>
      <ul className="forms-grid">
        {templates.map(t => (
          <li key={t.id}>
            <article>
              <header>
                <h3>{t.name}</h3>
                <span className={`forms-pill forms-pill-${t.status}`}>{t.status}</span>
              </header>
              {t.description && <p className="forms-meta">{t.description}</p>}
              <p className="forms-meta">{t.category} · {t.fields.length} field{t.fields.length === 1 ? "" : "s"}{t.isDefault ? " · default" : ""}</p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
