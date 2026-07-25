import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ArchivedCardsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const cards = await c.cards.list({ status: "archived" });

  return (
    <section className="kanban-archived">
      <header>
        <h1>Archived cards</h1>
        <p>{cards.length} archived cards across all boards.</p>
      </header>
      <ul className="kanban-cards">
        {cards.map(card => (
          <li key={card.id} className="kanban-card kanban-card-archived" data-card-id={card.id}>
            <strong>{card.title}</strong>
            {card.description && <p className="kanban-meta">{card.description}</p>}
            <p className="kanban-meta">
              Board: {card.boardId} · column: {card.columnId}
            </p>
            <button type="button" data-restore-card={card.id}>Restore</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
