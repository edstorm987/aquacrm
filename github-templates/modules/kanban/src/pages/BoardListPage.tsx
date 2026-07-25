import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { listTemplates } from "../server/templates";

export default async function BoardListPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const boards = await c.boards.list();
  const active = boards.filter(b => b.status === "active");
  const archived = boards.filter(b => b.status === "archived");
  const templates = listTemplates();
  const scopeLabel = props.clientId ? "client" : "agency";

  return (
    <section className="kanban-list">
      <header>
        <h1>Kanban boards</h1>
        <p>{active.length} active · {archived.length} archived · scope: {scopeLabel}</p>
      </header>

      <div className="kanban-templates">
        <h2>+ New board</h2>
        <ul>
          {templates.map(t => (
            <li key={t.id}>
              <strong>{t.name}</strong> — {t.description}
              <small> ({t.columns.length} columns)</small>
            </li>
          ))}
        </ul>
        <p className="kanban-hint">Pick a template via POST /api/portal/kanban/boards.</p>
      </div>

      <ul className="kanban-boards">
        {active.map(b => (
          <li key={b.id}>
            <article>
              <header>
                <h3>{b.name}</h3>
                <span className="kanban-pill">{b.scope}</span>
              </header>
              {b.description && <p className="kanban-meta">{b.description}</p>}
              <p className="kanban-meta">
                {b.columns.length} columns
                {b.templateId ? ` · template: ${b.templateId}` : ""}
              </p>
            </article>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <details className="kanban-archived">
          <summary>Archived boards ({archived.length})</summary>
          <ul>
            {archived.map(b => <li key={b.id}>{b.name}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
