"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, SquareKanban, Trash2, X } from "lucide-react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

/**
 * Every board in one place, and the way to make your own.
 *
 * Ed, 2026-08-30: *"make a new tab on journey called kanbans and move all the
 * kanbans here instead as its all too crowded ... i want to be able to create
 * my own in the app please permission gated of course."*
 *
 * A DIRECTORY, deliberately — rows that open each board on its own full-width
 * page — rather than boards embedded here. The per-client task kanban is not
 * listed: it lives inside each client's workspace on a different tenancy
 * surface, and a row here would be a door into the wrong house.
 */

export interface KanbanDirectoryRow {
  id: string;
  name: string;
  kindLabel: string;
  columnCount: number;
  cardCount: number;
  href: string;
  /** Only kind === "custom" boards can be deleted — the seeded ones carry product semantics. */
  deletable: boolean;
}

const PRESET_COLUMNS = [{ label: "To do" }, { label: "Doing" }, { label: "Done" }];

export function JourneyKanbansDesk({ rows, level }: {
  rows: KanbanDirectoryRow[];
  level: "hidden" | "view" | "use" | "manage";
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<Array<{ label: string }>>(PRESET_COLUMNS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createBoard(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const cleanName = name.trim();
    if (!cleanName) { setError("Give the board a name."); return; }
    const cleanColumns = columns.map(column => ({ label: column.label.trim() })).filter(column => column.label);
    if (!cleanColumns.length) { setError("A board needs at least one column."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await checkedJsonMutation<{ board?: { slug?: string } }>("/api/portal/pipelines/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: cleanName, columns: cleanColumns }),
      }, { fallback: "The board could not be created.", validate: value => Boolean(value?.board?.slug) });
      router.push(`/portal/agency/pipelines/${result.board!.slug}`);
    } catch (cause) {
      setError(mutationErrorMessage(cause, "The board could not be created."));
      setBusy(false);
    }
  }

  async function deleteBoard(row: KanbanDirectoryRow) {
    try {
      await checkedJsonMutation("/api/portal/pipelines/boards", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId: row.id }),
      }, { fallback: "The board could not be deleted." });
      router.refresh();
    } catch (cause) {
      setError(mutationErrorMessage(cause, "The board could not be deleted."));
    }
  }

  if (level === "hidden") return null;

  return (
    <section aria-labelledby="kanbans-heading" className="rounded-lg border border-black/10 bg-white p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-black/40">Boards</p>
          <h2 id="kanbans-heading" className="mt-1 text-lg font-semibold text-black/85">Every kanban, one place</h2>
        </div>
        {level === "manage" ? (
          <button type="button" onClick={() => { setCreating(true); setError(""); }}
            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-black/85 px-3 text-sm font-semibold text-white hover:bg-black">
            <Plus size={15} aria-hidden /> New board
          </button>
        ) : null}
      </div>

      {creating ? (
        <form onSubmit={createBoard} className="mt-4 grid gap-3 rounded-md border border-black/10 bg-black/[0.015] p-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Board name</span>
            <input value={name} onChange={event => setName(event.target.value)} autoFocus maxLength={80}
              placeholder="Content production"
              className="min-h-11 rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35" />
          </label>
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold text-black/55">Columns</span>
            {columns.map((column, index) => (
              <span key={index} className="flex items-center gap-2">
                <input value={column.label} maxLength={40} aria-label={`Column ${index + 1} name`}
                  onChange={event => setColumns(current => current.map((entry, i) => i === index ? { label: event.target.value } : entry))}
                  className="min-h-10 flex-1 rounded-md border border-black/15 bg-white px-3 text-sm outline-none focus:border-black/35" />
                <button type="button" disabled={columns.length <= 1} aria-label={`Remove column ${index + 1}`}
                  onClick={() => setColumns(current => current.filter((_, i) => i !== index))}
                  className="grid size-9 place-items-center rounded-md text-black/40 hover:bg-black/[0.05] hover:text-black/70 disabled:opacity-30">
                  <X size={14} aria-hidden />
                </button>
              </span>
            ))}
            {columns.length < 12 ? (
              <button type="button" onClick={() => setColumns(current => [...current, { label: "" }])}
                className="justify-self-start text-xs font-medium text-black/50 hover:text-black/80">
                + Add a column
              </button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-black/40">
            Cards are free-text for now. Linked lead, client and task cards come later.
          </p>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-black/85 px-3.5 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
              {busy ? "Creating…" : "Create board"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-md border border-black/15 px-3.5 py-2 text-sm font-medium text-black/60 hover:bg-black/[0.03]">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <ul className="mt-4 divide-y divide-black/[0.08]">
        {rows.map(row => (
          <li key={row.id} className="group flex items-center gap-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-brand/15 bg-brand/[0.07] text-brand">
              <SquareKanban size={16} aria-hidden />
            </span>
            <Link href={row.href} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-black/80 group-hover:text-black">{row.name}</span>
              <span className="block text-xs text-black/45">{row.kindLabel} · {row.columnCount} columns · {row.cardCount} cards</span>
            </Link>
            {row.deletable && level === "manage" ? (
              <button type="button" onClick={() => void deleteBoard(row)} aria-label={`Delete the ${row.name} board`}
                className="grid size-8 shrink-0 place-items-center rounded-md text-red-600/0 transition group-hover:text-red-600/70 hover:!text-red-700 focus-visible:text-red-600/70">
                <Trash2 size={14} aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-black/[0.07] pt-3 text-xs leading-5 text-black/40">
        Client task boards live in each client&apos;s own workspace.
      </p>
    </section>
  );
}
