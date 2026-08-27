"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { FulfilmentProductSwitcher } from "./_FulfilmentProductSwitcher";

interface Column {
  id: string;
  label: string;
  color?: string;
}

interface Card {
  id: string;
  label: string;
  sub?: string;
  href?: string;
  columnId: string;
  revision?: number;
}

interface BoardLink {
  slug: string;
  label: string;
}

export function PipelineBoard({
  title,
  eyebrow,
  description,
  activeSlug,
  boards,
  columns,
  cards,
  productKey,
  productViews,
  productBasePath,
  showProductOverview = true,
  embedded = false,
  editable = true,
}: {
  title: string;
  eyebrow: string;
  description: string;
  activeSlug: string;
  boards: BoardLink[];
  columns: Column[];
  cards: Card[];
  productKey?: string;
  productViews?: Array<{ key: string; label: string }>;
  productBasePath?: string;
  showProductOverview?: boolean;
  embedded?: boolean;
  editable?: boolean;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [revisionOverrides, setRevisionOverrides] = useState<Record<string, number>>({});
  const [draggedId, setDraggedId] = useState("");
  const [dropColumn, setDropColumn] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const grouped = useMemo(() => {
    const map = new Map(columns.map(column => [column.id, [] as Card[]]));
    for (const card of cards) {
      map.get(overrides[card.id] ?? card.columnId)?.push(card);
    }
    return map;
  }, [cards, columns, overrides]);

  async function moveClient(card: Card, columnId: string) {
    if (!editable) return;
    const previous = overrides[card.id] ?? card.columnId;
    if (previous === columnId) return;
    setOverrides(current => ({ ...current, [card.id]: columnId }));
    setBusyId(card.id);
    setError("");
    let loadedConflict = false;
    try {
      const response = await fetch("/api/portal/pipelines/move-client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: card.id,
          columnId,
          productKey,
          ...(productKey ? { expectedRevision: revisionOverrides[card.id] ?? card.revision } : {}),
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; columnId?: string; workspaceRevision?: number };
      if (!response.ok || !result.ok) {
        if (response.status === 409 && result.columnId && typeof result.workspaceRevision === "number") {
          loadedConflict = true;
          setOverrides(current => ({ ...current, [card.id]: result.columnId! }));
          setRevisionOverrides(current => ({ ...current, [card.id]: result.workspaceRevision! }));
        }
        throw new Error(result.error ?? "Could not move client.");
      }
      if (typeof result.workspaceRevision === "number") {
        setRevisionOverrides(current => ({ ...current, [card.id]: result.workspaceRevision! }));
      }
      router.refresh();
    } catch (cause) {
      if (!loadedConflict) {
        setOverrides(current => ({ ...current, [card.id]: previous }));
      }
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId("");
      setDraggedId("");
      setDropColumn("");
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="pipeline-view" data-pipeline-slug={activeSlug}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{eyebrow}</p>
          {embedded
            ? <h2 className="mt-1 text-2xl font-semibold text-black/90">{title}</h2>
            : <h1 className="mt-1 text-2xl font-semibold text-black/90">{title}</h1>}
          <p className="mt-1 max-w-2xl text-sm text-black/55">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {boards.length ? <BoardSwitcher boards={boards} activeSlug={activeSlug} /> : null}
          {productViews ? <FulfilmentProductSwitcher activeProduct={productKey} products={productViews} basePath={productBasePath} showOverview={showProductOverview} /> : null}
        </div>
      </header>
      <p className="text-xs text-black/40">{editable ? "Drag a card into another column, or use its stage menu." : "View-only board. Stage changes require Use access."}</p>
      {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="w-full min-w-0 overflow-x-auto pb-2">
        <div className="grid grid-cols-1 gap-3 md:w-max md:grid-flow-col md:auto-cols-[280px]" data-testid="pipeline-columns">
          {columns.map(column => {
            const columnCards = grouped.get(column.id) ?? [];
            return (
              <section
                key={column.id}
                onDragOver={event => {
                  if (!editable) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropColumn(column.id);
                }}
                onDragLeave={event => {
                  if (!editable) return;
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropColumn("");
                }}
                onDrop={event => {
                  if (!editable) return;
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain") || draggedId;
                  const card = cards.find(item => item.id === id);
                  if (card) void moveClient(card, column.id);
                }}
                className={`flex min-h-[380px] flex-col rounded-lg border p-3 transition ${dropColumn === column.id ? "border-brand bg-brand/[0.06]" : "border-black/10 bg-white/70"}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-black/80"><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: column.color ?? "#0EA5A4" }} />{column.label}</h2>
                  <span className="text-xs tabular-nums text-black/40">{columnCards.length}</span>
                </div>
                <ul className="flex flex-1 flex-col gap-2">
                  {columnCards.map(card => (
                    <li
                      key={card.id}
                      draggable={editable}
                      onDragStart={event => {
                        if (!editable) return;
                        setDraggedId(card.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", card.id);
                      }}
                      onDragEnd={() => { setDraggedId(""); setDropColumn(""); }}
                      className={`rounded-md border border-black/10 bg-white p-3 shadow-sm transition ${draggedId === card.id ? "opacity-45" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {editable ? <GripVertical size={16} className="mt-0.5 shrink-0 cursor-grab text-black/25" aria-label={`Drag ${card.label}`} /> : null}
                        <div className="min-w-0 flex-1">
                          {card.href ? <Link href={card.href} className="block truncate text-sm font-semibold text-black/85 hover:underline">{card.label}</Link> : <p className="truncate text-sm font-semibold text-black/85">{card.label}</p>}
                          <p className="mt-0.5 truncate text-xs text-black/45">
                            {columns.find(candidate => candidate.id === (overrides[card.id] ?? card.columnId))?.label ?? card.sub}
                          </p>
                        </div>
                      </div>
                      <select
                        value={overrides[card.id] ?? card.columnId}
                        onChange={event => void moveClient(card, event.target.value)}
                        disabled={!editable || busyId === card.id}
                        aria-label={`Move ${card.label}`}
                        className="mt-3 min-h-9 w-full rounded-md border border-black/10 bg-white px-2 text-xs text-black/60"
                      >
                        {columns.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </li>
                  ))}
                  {columnCards.length === 0 ? <li className="grid flex-1 place-items-center rounded-md border border-dashed border-black/10 p-4 text-center text-xs text-black/35">{editable ? "Drop a client here" : "No clients in this stage"}</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function BoardSwitcher({ boards, activeSlug }: { boards: BoardLink[]; activeSlug: string }) {
  return (
    <nav aria-label="Pipeline board" className="inline-flex rounded-md border border-black/10 bg-white p-1">
      {boards.map(board => (
        <Link key={board.slug} href={board.slug === "fulfilment" ? "/portal/agency/fulfilment?view=stages" : `/portal/agency/pipelines/${board.slug}`} aria-current={board.slug === activeSlug ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded px-3 text-xs font-semibold ${board.slug === activeSlug ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04]"}`}>
          {board.label}
        </Link>
      ))}
    </nav>
  );
}
