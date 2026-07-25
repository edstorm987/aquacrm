"use client";

// Founder-only home widget. Intentionally built in and local-first:
// it gives Ed a simple daily list without depending on a separate
// kanban endpoint.

import { useEffect, useState } from "react";

interface Card {
  id: string;
  title: string;
  status: "today" | "week" | "done";
  updatedAt: number;
}

const MAX_VISIBLE = 5;

export function FounderTodosWidget({ isFounder }: { isFounder: boolean }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!isFounder) return;
    try {
      const stored = window.localStorage.getItem("milesymedia-founder-todos");
      setCards(stored ? JSON.parse(stored) as Card[] : []);
    } catch {
      setCards([]);
    }
  }, [isFounder]);

  useEffect(() => {
    if (!isFounder) return;
    window.localStorage.setItem("milesymedia-founder-todos", JSON.stringify(cards));
  }, [cards, isFounder]);

  if (!isFounder) return null;

  const focusCards = cards
    .filter(c => c.status !== "done")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_VISIBLE);

  function addQuest() {
    if (!draft.trim()) return;
    setAdding(true);
    setCards(prev => [
      ...prev,
      { id: `todo_${Date.now().toString(36)}`, title: draft.trim(), status: "today", updatedAt: Date.now() },
    ]);
    setDraft("");
    window.setTimeout(() => {
      setAdding(false);
    }, 120);
  }

  function toggleDone(id: string) {
    setCards(prev => prev.map(card => (
      card.id === id
        ? { ...card, status: card.status === "done" ? "today" : "done", updatedAt: Date.now() }
        : card
    )));
  }

  return (
    <section
      aria-labelledby="founder-todos-title"
      data-testid="founder-todos-widget"
      className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm"
    >
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h2 id="founder-todos-title" className="text-sm font-semibold uppercase tracking-wide text-amber-900">
            Today
          </h2>
          <p className="text-[11px] text-amber-900/70">
            Founder-only quick notes for what needs attention.
          </p>
        </div>
      </header>

      <div className="mt-3">
        {focusCards.length === 0 && (
          <p className="text-sm italic text-amber-900/70">Nothing pinned for today.</p>
        )}
        {focusCards.length > 0 && (
          <ul className="flex flex-col gap-1">
            {focusCards.map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggleDone(c.id)}
                  className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-sm text-amber-950 hover:bg-amber-100/80"
                >
                  <span className="min-w-0 truncate">{c.title}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-900/60">
                    Done
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={e => { e.preventDefault(); addQuest(); }}
      >
        <input
          type="text"
          value={draft}
          disabled={adding}
          onChange={e => setDraft(e.target.value)}
          placeholder="+ Add priority"
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
    </section>
  );
}
