"use client";

// Per-client Kanban tab (T1 R8) — wires T2's `client-tasks` template
// (Backlog · This Week · Doing · Waiting On Client · Review · Done)
// to the per-client overview. Auto-creates the board on first mount
// for this clientId; quick-add is pinned in Backlog; HTML5 drag-and-
// drop delegates to the plugin's `cards/move` endpoint.

import { useEffect, useMemo, useState } from "react";

interface Column { id: string; label: string; order: number; color?: string }
interface Board {
  id: string;
  clientId?: string;
  scope: string;
  name: string;
  templateId?: string;
  columns: Column[];
}
interface Card {
  id: string;
  boardId: string;
  columnId: string;
  order: number;
  title: string;
  tags: string[];
  status: string;
  updatedAt: number;
}

const TEMPLATE_ID = "client-tasks";
const TEMPLATE_COLUMNS = ["Backlog", "This Week", "Doing", "Waiting On Client", "Review", "Done"];
const WAITING_LABEL = "Waiting On Client";

export function KanbanTabClient({
  clientId,
  clientName,
  onWaitingCount,
}: {
  clientId: string;
  clientName: string;
  onWaitingCount?: (count: number) => void;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");

  const qs = `?clientId=${encodeURIComponent(clientId)}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch(`/api/portal/kanban/boards${qs}`, { method: "GET" });
        if (!listRes.ok) {
          setError("Kanban plugin not installed.");
          return;
        }
        const listJson = await listRes.json() as { ok: boolean; boards?: Board[] };
        let b = (listJson.boards ?? []).find(
          x => x.templateId === TEMPLATE_ID && x.scope === "client" && x.clientId === clientId,
        );
        if (!b) {
          const created = await fetch(`/api/portal/kanban/boards${qs}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: `${clientName} — tasks`,
              scope: "client",
              templateId: TEMPLATE_ID,
            }),
          });
          const cj = await created.json() as { ok: boolean; board?: Board; error?: string };
          if (!cj.ok || !cj.board) {
            setError(cj.error ?? "Could not create board.");
            return;
          }
          b = cj.board;
        }
        if (cancelled) return;
        setBoard(b);
        const cardsRes = await fetch(
          `/api/portal/kanban/boards/cards${qs}&boardId=${encodeURIComponent(b.id)}&status=active`,
          { method: "GET" },
        );
        const cj2 = await cardsRes.json() as { ok: boolean; cards?: Card[] };
        if (!cancelled) setCards(cj2.cards ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, clientName, qs]);

  const columns = useMemo(() => {
    if (!board) return [] as Column[];
    return [...board.columns].sort((a, b) => a.order - b.order);
  }, [board]);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of (cards ?? [])) {
      const arr = map.get(c.columnId) ?? [];
      arr.push(c);
      map.set(c.columnId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.order - b.order);
    return map;
  }, [cards]);

  const waitingColumn = columns.find(c => c.label === WAITING_LABEL);
  const waitingCount = waitingColumn ? (cardsByColumn.get(waitingColumn.id)?.length ?? 0) : 0;

  useEffect(() => {
    onWaitingCount?.(waitingCount);
  }, [waitingCount, onWaitingCount]);

  const backlogColumn = columns.find(c => c.label === "Backlog");

  async function quickAdd() {
    if (!draft.trim() || !board || !backlogColumn) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/kanban/boards/cards${qs}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boardId: board.id,
          columnId: backlogColumn.id,
          title: draft.trim(),
          tags: ["client"],
        }),
      });
      const data = await res.json() as { ok: boolean; card?: Card };
      if (data.ok && data.card) {
        setCards(prev => [...(prev ?? []), data.card!]);
        setDraft("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function moveCard(cardId: string, toColumnId: string, toIndex: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/kanban/boards/cards/move${qs}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, toColumnId, toIndex }),
      });
      const data = await res.json() as { ok: boolean; card?: Card };
      if (data.ok && data.card) {
        const updated = data.card;
        setCards(prev => (prev ?? []).map(c => (c.id === updated.id ? updated : c)));
      }
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>;
  }
  if (!board) {
    return <p className="text-sm text-black/55">Loading kanban…</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="client-tasks-kanban">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium text-black/90">{board.name}</h2>
        <div className="flex items-center gap-2 text-[11px] text-black/55">
          {waitingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
              {waitingCount} waiting on client
            </span>
          )}
          <a
            href={`/portal/clients/${clientId}/kanban/boards/${encodeURIComponent(board.id)}`}
            className="underline-offset-2 hover:underline"
          >
            Open full board →
          </a>
        </div>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {columns.map(col => {
          const isWaiting = col.label === WAITING_LABEL;
          const isBacklog = col.label === "Backlog";
          const colCards = cardsByColumn.get(col.id) ?? [];
          return (
            <section
              key={col.id}
              data-column={col.label}
              data-testid={`kanban-col-${col.id}`}
              className={[
                "flex w-64 shrink-0 flex-col rounded-lg border p-2",
                isWaiting ? "border-amber-300 bg-amber-50/60" : "border-black/10 bg-black/[0.02]",
              ].join(" ")}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => {
                e.preventDefault();
                const cardId = e.dataTransfer.getData("text/x-card-id");
                if (cardId) moveCard(cardId, col.id, colCards.length);
              }}
            >
              <header className="mb-1 flex items-baseline justify-between px-1">
                <h3
                  className={[
                    "text-[11px] font-semibold uppercase tracking-wide",
                    isWaiting ? "text-amber-900" : "text-black/55",
                  ].join(" ")}
                >
                  {col.label}
                </h3>
                <span className="text-[10px] text-black/40">{colCards.length}</span>
              </header>
              <ul className="flex min-h-[2rem] flex-col gap-1">
                {colCards.map(c => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData("text/x-card-id", c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="cursor-grab rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm text-black/85 shadow-sm hover:bg-black/[0.02] active:cursor-grabbing"
                  >
                    {c.title}
                  </li>
                ))}
              </ul>
              {isBacklog && (
                <form
                  className="mt-2 flex items-center gap-1"
                  onSubmit={e => { e.preventDefault(); quickAdd(); }}
                >
                  <input
                    type="text"
                    value={draft}
                    disabled={busy}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="+ New task"
                    className="flex-1 rounded-md border border-black/15 bg-white px-2 py-1 text-xs placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/40 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="rounded-md bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
                  >
                    Add
                  </button>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export const _CLIENT_TASKS_TEMPLATE_COLUMNS = TEMPLATE_COLUMNS;
