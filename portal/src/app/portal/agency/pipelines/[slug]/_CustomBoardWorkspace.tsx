"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";
import { PipelineBoard } from "./_PipelineBoard";

/**
 * One of Ed's own kanbans — the wrapper that gives PipelineBoard card CRUD.
 *
 * Ed, 2026-08-30: *"i want to be able to create my own in the app please
 * permission gated of course."* PipelineBoard is REUSED, not forked: it brings
 * the drag-drop, the optimistic overrides and the per-card move select; this
 * wrapper adds what custom boards genuinely need on top — an add-card form per
 * column footer, card delete, and the custom move transport (the default
 * transport treats card ids as client ids and would 404 on a `pcard_*`).
 */

interface BoardColumn { id: string; label: string; color?: string }
interface BoardCard { id: string; label: string; sub?: string; columnId: string }

export function CustomBoardWorkspace({ boardId, name, slug, columns, cards, editable }: {
  boardId: string;
  name: string;
  slug: string;
  columns: BoardColumn[];
  cards: BoardCard[];
  editable: boolean;
}) {
  const router = useRouter();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function moveCard(cardId: string, columnId: string) {
    try {
      await checkedJsonMutation("/api/portal/pipelines/cards", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, columnId }),
      }, { fallback: "The card could not be moved." });
      router.refresh();
      return { ok: true as const };
    } catch (cause) {
      return { ok: false as const, error: mutationErrorMessage(cause, "The card could not be moved.") };
    }
  }

  async function addCard(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !addingTo) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) { setError("A card needs a title."); return; }
    setBusy(true);
    setError("");
    try {
      await checkedJsonMutation("/api/portal/pipelines/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, columnId: addingTo, title: cleanTitle, note: note.trim() || undefined }),
      }, { fallback: "The card could not be added." });
      setTitle("");
      setNote("");
      setAddingTo(null);
      router.refresh();
    } catch (cause) {
      setError(mutationErrorMessage(cause, "The card could not be added."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCard(cardId: string) {
    try {
      await checkedJsonMutation("/api/portal/pipelines/cards", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId }),
      }, { fallback: "The card could not be removed." });
      router.refresh();
    } catch (cause) {
      setError(mutationErrorMessage(cause, "The card could not be removed."));
    }
  }

  return (
    <div className="grid gap-4">
      <PipelineBoard
        title={name}
        eyebrow="Your board"
        description="Your own columns, your own cards. Drag a card between columns, or use its move menu."
        activeSlug={slug}
        boards={[]}
        columns={columns}
        cards={cards}
        showProductOverview={false}
        embedded
        editable={editable}
        onMoveCard={moveCard}
        cardNoun="card"
      />

      {editable ? (
        <div className="rounded-md border border-black/10 bg-white p-4">
          {addingTo ? (
            <form onSubmit={addCard} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
              <input value={title} onChange={event => setTitle(event.target.value)} autoFocus maxLength={200}
                placeholder="Card title"
                aria-label="Card title"
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-black/35" />
              <input value={note} onChange={event => setNote(event.target.value)} maxLength={2000}
                placeholder="Note (optional)"
                aria-label="Card note"
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-black/35" />
              <select value={addingTo} onChange={event => setAddingTo(event.target.value)} aria-label="Column"
                className="min-h-11 rounded-md border border-black/15 px-3 text-sm">
                {columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}
              </select>
              <span className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded-md bg-black/85 px-3.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
                  {busy ? "Adding…" : "Add"}
                </button>
                <button type="button" onClick={() => { setAddingTo(null); setError(""); }} aria-label="Cancel"
                  className="grid min-h-11 w-11 place-items-center rounded-md border border-black/15 text-black/55 hover:bg-black/[0.03]">
                  <X size={15} aria-hidden />
                </button>
              </span>
            </form>
          ) : (
            <button type="button" onClick={() => setAddingTo(columns[0]?.id ?? null)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-dashed border-black/25 px-3.5 text-sm font-medium text-black/60 hover:border-black/45 hover:text-black/85">
              <Plus size={15} aria-hidden /> Add a card
            </button>
          )}
          {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}

          {cards.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-black/45 hover:text-black/70">Remove a card…</summary>
              <ul className="mt-2 grid gap-1">
                {cards.map(card => (
                  <li key={card.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-black/[0.02]">
                    <span className="truncate text-black/70">{card.label}</span>
                    <button type="button" onClick={() => void deleteCard(card.id)} aria-label={`Remove ${card.label}`}
                      className="grid size-8 shrink-0 place-items-center rounded-md text-red-600/70 hover:bg-red-50 hover:text-red-700">
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
