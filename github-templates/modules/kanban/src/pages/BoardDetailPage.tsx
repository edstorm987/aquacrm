import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

// Server-rendered board view. The drag/drop wiring is done by a tiny
// client-side enhancer attached to the static markup — when JS is
// off, the board still reads cleanly. Move actions POST to
// /api/portal/kanban/boards/cards/move; reorder columns POSTs to
// /api/portal/kanban/boards/columns/move. Keyboard fallback uses
// arrow keys + space (pick) + enter (drop) on focusable card/column
// elements; tabIndex={0} + role="button" gives the affordance.

export default async function BoardDetailPage(props: PluginPageProps) {
  const id = (props.searchParams?.id ?? props.segments[1]) as string | undefined;
  if (!id) return <p>Missing board id.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const board = await c.boards.get(id);
  if (!board) return <p>Board not found.</p>;
  const cards = await c.cards.list({ boardId: id });
  const byCol = new Map<string, typeof cards>();
  for (const col of board.columns) byCol.set(col.id, []);
  for (const card of cards) {
    const arr = byCol.get(card.columnId) ?? [];
    arr.push(card);
    byCol.set(card.columnId, arr);
  }

  return (
    <section className="kanban-board" data-board-id={board.id}>
      <header>
        <h1>{board.name}</h1>
        <p className="kanban-meta">
          {board.columns.length} columns · {cards.length} cards
          {board.templateId ? ` · ${board.templateId}` : ""}
        </p>
      </header>

      <div className="kanban-columns" role="list">
        {board.columns.sort((a, b) => a.order - b.order).map(col => {
          const colCards = (byCol.get(col.id) ?? []).sort((a, b) => a.order - b.order);
          return (
            <div
              key={col.id}
              className="kanban-column"
              role="listitem"
              tabIndex={0}
              draggable
              data-column-id={col.id}
              style={col.color ? { borderTopColor: col.color } : undefined}
            >
              <header>
                <h3
                  contentEditable
                  suppressContentEditableWarning
                  data-column-rename
                >
                  {col.label}
                </h3>
                <small>{colCards.length}</small>
              </header>
              <ul className="kanban-cards" role="list">
                {colCards.map(card => (
                  <li
                    key={card.id}
                    className="kanban-card"
                    role="listitem"
                    tabIndex={0}
                    draggable
                    data-card-id={card.id}
                  >
                    <strong>{card.title}</strong>
                    {card.description && <p className="kanban-meta">{card.description}</p>}
                    {card.tags.length > 0 && (
                      <p className="kanban-tags">
                        {card.tags.map(t => <span key={t} className="kanban-tag">{t}</span>)}
                      </p>
                    )}
                    {card.dueAt && (
                      <p className="kanban-meta">
                        Due {new Date(card.dueAt).toISOString().slice(0, 10)}
                      </p>
                    )}
                    {card.assigneeUserId && (
                      <p className="kanban-meta">Assigned: {card.assigneeUserId}</p>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" className="kanban-add-card" data-add-card-for={col.id}>
                + Add card
              </button>
            </div>
          );
        })}
        <button type="button" className="kanban-add-column" data-add-column>
          + Add column
        </button>
      </div>
    </section>
  );
}
