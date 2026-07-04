"use client";

// Founder-only home widget — chapter §11 ("Ed's mythos register").
// Surfaces the kanban plugin's `founder-todos` board (T2 R2-seeded
// template) as a small card on /portal/agency. Renders nothing for
// non-Founder roles — strict zero-space when not applicable.

import Link from "next/link";
import { useEffect, useState } from "react";

interface Column { id: string; label: string; order: number }
interface Board {
  id: string;
  name: string;
  templateId?: string;
  scope: string;
  columns: Column[];
}
interface Card {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  updatedAt: number;
}

const TODAY_LABEL = "Today";
const WEEK_LABEL = "This Week";
const MAX_VISIBLE = 5;

export function FounderTodosWidget({ isFounder }: { isFounder: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!isFounder) return;
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch("/api/portal/kanban/boards?role=founder", { method: "GET" });
        if (!listRes.ok) {
          setError("Kanban plugin not installed.");
          return;
        }
        const listJson = await listRes.json() as { ok: boolean; boards?: Board[] };
        let founderBoard = (listJson.boards ?? []).find(b => b.templateId === "founder-todos");
        if (!founderBoard) {
          const created = await fetch("/api/portal/kanban/boards", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Founder to-dos", scope: "agency", templateId: "founder-todos" }),
          });
          const createdJson = await created.json() as { ok: boolean; board?: Board };
          if (!createdJson.ok || !createdJson.board) {
            setError("Could not create founder-todos board.");
            return;
          }
          founderBoard = createdJson.board;
        }
        if (cancelled) return;
        setBoard(founderBoard);
        const cardsRes = await fetch(`/api/portal/kanban/boards/cards?boardId=${encodeURIComponent(founderBoard.id)}&status=active`, { method: "GET" });
        const cardsJson = await cardsRes.json() as { ok: boolean; cards?: Card[] };
        if (!cancelled) setCards(cardsJson.cards ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [isFounder]);

  if (!isFounder) return null;

  const todayColumn = board?.columns.find(c => c.label === TODAY_LABEL);
  const weekColumn = board?.columns.find(c => c.label === WEEK_LABEL);
  const focusColumnIds = new Set(
    [todayColumn?.id, weekColumn?.id].filter((x): x is string => Boolean(x)),
  );
  const focusCards = (cards ?? [])
    .filter(c => focusColumnIds.has(c.columnId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_VISIBLE);

  async function addQuest() {
    if (!draft.trim() || !board || !todayColumn) return;
    setAdding(true);
    try {
      const res = await fetch("/api/portal/kanban/boards/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boardId: board.id,
          columnId: todayColumn.id,
          title: draft.trim(),
          tags: ["founder"],
        }),
      });
      const data = await res.json() as { ok: boolean; card?: Card };
      if (data.ok && data.card) {
        setCards(prev => [...(prev ?? []), data.card!]);
        setDraft("");
      }
    } finally {
      setAdding(false);
    }
  }

  const columnLabelById = new Map(board?.columns.map(c => [c.id, c.label] as const) ?? []);

  return (
    <section
      aria-labelledby="founder-todos-title"
      data-testid="founder-todos-widget"
      className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm"
    >
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h2 id="founder-todos-title" className="text-sm font-semibold uppercase tracking-wide text-amber-900">
            Today's Quests
          </h2>
          <p className="text-[11px] text-amber-900/70">
            Founder-only · {board ? "Today + This Week" : "loading…"}
          </p>
        </div>
        {board && (
          <Link
            href={`/portal/agency/kanban/boards/${encodeURIComponent(board.id)}`}
            className="text-xs text-amber-900 underline-offset-2 hover:underline"
          >
            Open board →
          </Link>
        )}
      </header>

      <div className="mt-3">
        {error && <p className="text-xs text-amber-900/80">{error}</p>}
        {!error && focusCards.length === 0 && cards !== null && (
          <p className="text-sm italic text-amber-900/70">No quests today. Forge one.</p>
        )}
        {focusCards.length > 0 && (
          <ul className="flex flex-col gap-1">
            {focusCards.map(c => (
              <li key={c.id}>
                <Link
                  href={`/portal/agency/kanban/boards/${encodeURIComponent(c.boardId)}#card-${encodeURIComponent(c.id)}`}
                  className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-sm text-amber-950 hover:bg-amber-100/80"
                >
                  <span className="min-w-0 truncate">{c.title}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-900/60">
                    {columnLabelById.get(c.columnId) ?? ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {board && todayColumn && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={e => { e.preventDefault(); addQuest(); }}
        >
          <input
            type="text"
            value={draft}
            disabled={adding}
            onChange={e => setDraft(e.target.value)}
            placeholder="+ Add quest to Today"
            className="flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm placeholder:text-amber-900/45 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={adding || !draft.trim()}
            className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
      )}
    </section>
  );
}
