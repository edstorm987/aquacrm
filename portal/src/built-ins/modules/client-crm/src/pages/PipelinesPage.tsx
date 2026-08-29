"use client";

// The client's journey board.
//
// Ed, 28 August 2026: *"give them a kanban board as well so that they can
// create their own journey pipelines and move contacts about and set
// automations and more"*. This is that board.
//
// ── Moving a card has to work three ways, not one ────────────────────────
//
// Dragging is the obvious one and the only one a kanban usually ships. It is
// also the one that excludes the most people: it is unusable by keyboard, and
// poor on touch. So every card carries a "Move to" select as well. That is not
// a fallback bolted on for an audit — it is the primary control on a phone,
// and it is the only one that works for somebody tabbing through the board.
//
// ── Why the server's board is redrawn after every move ───────────────────
//
// An automation can move the card again the instant it lands. If this drew its
// own optimistic result, a rule that sends everything entering "Quoted"
// straight to "Won" would leave the card visibly in the wrong column until the
// next refresh. `moveCard` therefore returns the board AFTER the rules have
// run, and that is what gets rendered.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FeatureDisabledError,
  addCard,
  addStage,
  createPipeline,
  deleteStage,
  fetchBoard,
  fetchContacts,
  fetchPipelines,
  moveCard,
  removeCard,
  updateCard,
  updateStage,
  type ContactLite,
} from "../lib/journeyClient";
import type {
  Automation,
  AutomationRunOutcome,
  BoardCard,
  JourneyBoard,
  Pipeline,
  StageKind,
  StageTone,
} from "../lib/journey";
import { STAGE_TONES } from "../lib/journey";

// Tailwind cannot build a class name at runtime, so the tones map to literal
// strings. Keeping the map beside the tone list means adding a tone without a
// style is a compile error rather than an invisible unstyled column.
const TONE_CLASS: Record<StageTone, { bar: string; chip: string }> = {
  slate: { bar: "bg-slate-400", chip: "bg-slate-100 text-slate-700" },
  blue: { bar: "bg-blue-500", chip: "bg-blue-100 text-blue-700" },
  teal: { bar: "bg-teal-500", chip: "bg-teal-100 text-teal-700" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-800" },
  violet: { bar: "bg-violet-500", chip: "bg-violet-100 text-violet-700" },
  green: { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  red: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-700" },
};

const KIND_LABEL: Record<StageKind, string> = {
  open: "In progress",
  won: "Won",
  lost: "Lost",
};

function money(minor: number, currency?: string): string {
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(amount);
  } catch {
    // An unrecognised currency code must not take the board down with it.
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

export default function PipelinesPage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params?.clientId ?? "";

  const [board, setBoard] = useState<JourneyBoard | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ranRules, setRanRules] = useState<AutomationRunOutcome[]>([]);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const liveRegion = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async (pipelineId?: string) => {
    if (!clientId) return;
    setError(null);
    try {
      const [boardResult, pipelineList, contactList] = await Promise.all([
        fetchBoard(clientId, pipelineId),
        fetchPipelines(clientId),
        fetchContacts(clientId),
      ]);
      setBoard(boardResult.board);
      setAutomations(boardResult.automations);
      setPipelines(pipelineList.pipelines);
      setContacts(contactList.contacts);
      if (boardResult.board) setSelectedPipelineId(boardResult.board.pipeline.id);
    } catch (caught) {
      if (caught instanceof FeatureDisabledError) { setDisabled(true); return; }
      // A client with no boards yet is not an error — it is the empty state.
      if (caught instanceof Error && caught.message === "pipeline_not_found") {
        setBoard(null);
        try { setPipelines((await fetchPipelines(clientId)).pipelines); } catch { /* handled below */ }
        try { setContacts((await fetchContacts(clientId)).contacts); } catch { /* handled below */ }
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const announce = useCallback((message: string) => {
    if (liveRegion.current) liveRegion.current.textContent = message;
  }, []);

  /** Every mutation goes through here, so nothing can forget to redraw or to
   *  surface its error, and no two writes can overlap. */
  const run = useCallback(async (work: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      if (success) announce(success);
    } catch (caught) {
      if (caught instanceof FeatureDisabledError) { setDisabled(true); return; }
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  }, [announce]);

  const doMove = useCallback((cardId: string, toStageId: string) => run(async () => {
    const result = await moveCard(clientId, cardId, toStageId);
    setBoard(result.board);
    setRanRules(result.automations);
    const stage = result.board?.stages.find(s => s.id === toStageId);
    announce(`Moved to ${stage?.name ?? "new stage"}.`);
  }), [clientId, run, announce]);

  const onBoard = useMemo(
    () => new Set((board?.stages ?? []).flatMap(stage => stage.cards.map(card => card.contactId))),
    [board],
  );
  const addable = useMemo(
    () => contacts.filter(contact => !onBoard.has(contact.id)),
    [contacts, onBoard],
  );

  if (disabled) return <AddOnDisabled />;
  if (loading) return <p className="p-6 text-sm text-slate-500">Loading your board…</p>;

  return (
    <section className="flex min-h-0 flex-col gap-4 p-4 sm:p-6">
      <p ref={liveRegion} aria-live="polite" className="sr-only" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">Journey pipelines</h1>
          <p className="mt-1 text-sm text-slate-500">
            {board
              ? <>{board.totalCards} {board.totalCards === 1 ? "person" : "people"} on “{board.pipeline.name}”
                  {board.mixedCurrency && <span className="ml-1 text-amber-700">· mixed currencies, not totalled</span>}</>
              : "Build a board to track people through your own stages."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pipelines.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Pipeline</span>
              <select
                value={selectedPipelineId}
                onChange={event => { setSelectedPipelineId(event.target.value); void load(event.target.value); }}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                {pipelines.map(pipeline => (
                  <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
                ))}
              </select>
            </label>
          )}
          <Link
            href={`/portal/clients/${clientId}/client-crm/automations`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Automations{automations.length > 0 && <span className="ml-1.5 text-slate-500">{automations.length}</span>}
          </Link>
          <button
            type="button"
            onClick={() => setCreatingPipeline(true)}
            className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
          >
            New pipeline
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      )}

      {ranRules.length > 0 && (
        <AutomationReceipt outcomes={ranRules} onDismiss={() => setRanRules([])} />
      )}

      {creatingPipeline && (
        <NewPipelineForm
          busy={busy}
          onCancel={() => setCreatingPipeline(false)}
          onCreate={(name, description) => run(async () => {
            const created = await createPipeline(clientId, name, description);
            setCreatingPipeline(false);
            await load(created.pipeline.id);
          }, "Pipeline created.")}
        />
      )}

      {!board ? (
        <EmptyBoards onCreate={() => setCreatingPipeline(true)} />
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto pb-2">
          <ol className="flex min-h-[24rem] items-start gap-3 sm:gap-4">
            {board.stages.map(stage => {
              const tone = TONE_CLASS[stage.tone];
              return (
                <li
                  key={stage.id}
                  className={`flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50/70 sm:w-80 ${
                    dropStageId === stage.id ? "border-slate-900 ring-2 ring-slate-900/15" : "border-slate-200"
                  }`}
                  onDragOver={event => { event.preventDefault(); setDropStageId(stage.id); }}
                  onDragLeave={() => setDropStageId(current => current === stage.id ? null : current)}
                  onDrop={event => {
                    event.preventDefault();
                    setDropStageId(null);
                    const cardId = dragCardId ?? event.dataTransfer.getData("text/plain");
                    setDragCardId(null);
                    const card = board.stages.flatMap(s => s.cards).find(c => c.id === cardId);
                    if (card && card.stageId !== stage.id) void doMove(cardId, stage.id);
                  }}
                >
                  <div className={`h-1 rounded-t-xl ${tone.bar}`} />
                  <div className="flex items-start justify-between gap-2 px-3 pt-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-slate-900">{stage.name}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {stage.cards.length} {stage.cards.length === 1 ? "person" : "people"}
                        {stage.valuedCardCount > 0 && <> · {money(stage.valueMinor, board.currency)}</>}
                        {stage.kind !== "open" && <> · {KIND_LABEL[stage.kind]}</>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingStageId(editingStageId === stage.id ? null : stage.id)}
                      aria-expanded={editingStageId === stage.id}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                    >
                      <span aria-hidden="true">⋯</span>
                      <span className="sr-only">Edit {stage.name}</span>
                    </button>
                  </div>

                  {editingStageId === stage.id && (
                    <StageEditor
                      stage={stage}
                      siblings={board.stages.filter(s => s.id !== stage.id)}
                      busy={busy}
                      onClose={() => setEditingStageId(null)}
                      onSave={patch => run(async () => {
                        await updateStage(clientId, board.pipeline.id, stage.id, patch);
                        setEditingStageId(null);
                        await load(board.pipeline.id);
                      }, "Stage updated.")}
                      onDelete={moveCardsTo => run(async () => {
                        await deleteStage(clientId, board.pipeline.id, stage.id, moveCardsTo);
                        setEditingStageId(null);
                        await load(board.pipeline.id);
                      }, "Stage removed.")}
                    />
                  )}

                  <ul className="flex flex-1 flex-col gap-2 p-3">
                    {stage.cards.map(card => (
                      <CardTile
                        key={card.id}
                        card={card}
                        stages={board.stages.map(s => ({ id: s.id, name: s.name }))}
                        currency={board.currency}
                        open={openCardId === card.id}
                        busy={busy}
                        onToggle={() => setOpenCardId(openCardId === card.id ? null : card.id)}
                        onDragStart={() => setDragCardId(card.id)}
                        onDragEnd={() => { setDragCardId(null); setDropStageId(null); }}
                        onMove={toStageId => doMove(card.id, toStageId)}
                        onSave={patch => run(async () => {
                          await updateCard(clientId, card.id, patch);
                          setOpenCardId(null);
                          await load(board.pipeline.id);
                        }, "Card updated.")}
                        onRemove={() => run(async () => {
                          await removeCard(clientId, card.id);
                          setOpenCardId(null);
                          await load(board.pipeline.id);
                        }, "Removed from the board.")}
                      />
                    ))}

                    {stage.cards.length === 0 && (
                      <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                        Drop someone here
                      </li>
                    )}

                    <li>
                      {addingTo === stage.id ? (
                        <AddContactForm
                          contacts={addable}
                          busy={busy}
                          onCancel={() => setAddingTo(null)}
                          onAdd={contactId => run(async () => {
                            const result = await addCard(clientId, {
                              pipelineId: board.pipeline.id, contactId, stageId: stage.id,
                            });
                            setRanRules(result.automations);
                            setAddingTo(null);
                            await load(board.pipeline.id);
                          }, "Added to the board.")}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingTo(stage.id)}
                          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
                        >
                          + Add someone
                        </button>
                      )}
                    </li>
                  </ul>
                </li>
              );
            })}

            <li className="w-56 shrink-0">
              {addingStage ? (
                <NewStageForm
                  busy={busy}
                  onCancel={() => setAddingStage(false)}
                  onCreate={seed => run(async () => {
                    await addStage(clientId, board.pipeline.id, seed);
                    setAddingStage(false);
                    await load(board.pipeline.id);
                  }, "Stage added.")}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingStage(true)}
                  className="min-h-11 w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
                >
                  + Add stage
                </button>
              )}
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────

function AddOnDisabled() {
  return (
    <section className="mx-auto max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Journey pipelines are not switched on</h1>
      <p className="mt-2 text-sm text-slate-600">
        Pipelines, boards and automations are an add-on to your CRM. Your agency can enable them
        from the CRM&rsquo;s settings — nothing here is missing or broken.
      </p>
    </section>
  );
}

function EmptyBoards({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
      <h2 className="text-base font-semibold text-slate-900">No pipelines yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        A pipeline is your own set of stages — “New enquiry”, “Quoted”, “Booked” — that you move
        people through. Your first one starts with five stages you can rename or delete.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
      >
        Create your first pipeline
      </button>
    </div>
  );
}

/**
 * What the rules actually did, after a move.
 *
 * Shown rather than hidden because an automation the client cannot observe is
 * an automation they cannot trust. Failures are listed with their reason —
 * including the correct refusals, like declining to email somebody who has
 * unsubscribed, which is a thing they need to see rather than a bug.
 */
function AutomationReceipt({ outcomes, onDismiss }: { outcomes: AutomationRunOutcome[]; onDismiss: () => void }) {
  const halted = outcomes.filter(outcome => outcome.haltedByDepth);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <ul className="min-w-0 space-y-1">
          {outcomes.filter(outcome => !outcome.haltedByDepth).map(outcome => (
            <li key={outcome.automationId} className="text-slate-700">
              <span className="font-medium">{outcome.automationName}</span>
              {" · "}
              {outcome.actionsRun} {outcome.actionsRun === 1 ? "action" : "actions"}
              {outcome.failures.map((failure, index) => (
                <span key={`${failure.action}-${index}`} className="ml-2 text-amber-800">
                  {failure.action}: {failure.reason}
                </span>
              ))}
            </li>
          ))}
          {halted.length > 0 && (
            <li className="text-amber-800">
              {halted.length} {halted.length === 1 ? "rule" : "rules"} stopped — your automations move
              cards in a loop. Check the rules on this pipeline.
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <span aria-hidden="true">×</span><span className="sr-only">Dismiss</span>
        </button>
      </div>
    </div>
  );
}

function CardTile(props: {
  card: BoardCard;
  stages: Array<{ id: string; name: string }>;
  currency?: string;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (toStageId: string) => void;
  onSave: (patch: { valueMinor?: number | null; note?: string }) => void;
  onRemove: () => void;
}): React.ReactElement {
  const { card } = props;
  const [note, setNote] = useState(card.note ?? "");
  const [value, setValue] = useState(card.valueMinor === undefined ? "" : String(card.valueMinor / 100));

  return (
    <li
      draggable
      onDragStart={event => { event.dataTransfer.setData("text/plain", card.id); props.onDragStart(); }}
      onDragEnd={props.onDragEnd}
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{card.contactName ?? card.contactEmail}</p>
            {card.contactName && <p className="truncate text-xs text-slate-500">{card.contactEmail}</p>}
          </div>
          {card.valueMinor !== undefined && (
            <span className="shrink-0 text-xs font-semibold text-slate-700">{money(card.valueMinor, card.currency ?? props.currency)}</span>
          )}
        </div>

        {card.contactTags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {card.contactTags.slice(0, 4).map(tag => (
              <li key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{tag}</li>
            ))}
          </ul>
        )}

        {card.idle && (
          <p className="mt-2 text-xs font-medium text-amber-800">
            Waiting {card.idleDays} {card.idleDays === 1 ? "day" : "days"} in this stage
          </p>
        )}
        {card.note && !props.open && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{card.note}</p>}

        <div className="mt-3 flex items-center gap-2">
          {/* The keyboard and touch path. Not a fallback — on a phone this is
              the only way anyone will move a card. */}
          <label className="min-w-0 flex-1">
            <span className="sr-only">Move {card.contactName ?? card.contactEmail} to another stage</span>
            <select
              value={card.stageId}
              disabled={props.busy}
              onChange={event => props.onMove(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700"
            >
              {props.stages.map(stage => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={props.onToggle}
            aria-expanded={props.open}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <span aria-hidden="true">✎</span>
            <span className="sr-only">Edit card</span>
          </button>
        </div>
      </div>

      {props.open && (
        <div className="border-t border-slate-200 bg-slate-50 p-3">
          <label className="block text-xs font-medium text-slate-700">
            Value
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="Leave blank if not tracked"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="mt-2 block text-xs font-medium text-slate-700">
            Note
            <textarea
              value={note}
              rows={3}
              onChange={event => setNote(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={props.busy}
              onClick={() => props.onSave({
                // Blank means "not tracked", which is not the same as zero — a
                // board used for onboarding must not total to £0.00.
                valueMinor: value.trim() === "" ? null : Math.round(Number(value) * 100),
                note,
              })}
              className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              disabled={props.busy}
              onClick={props.onRemove}
              className="min-h-11 rounded-lg border border-rose-300 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              Remove from board
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Removing takes them off this board. It does not delete the contact.
          </p>
        </div>
      )}
    </li>
  );
}

function AddContactForm(props: {
  contacts: ContactLite[];
  busy: boolean;
  onCancel: () => void;
  onAdd: (contactId: string) => void;
}): React.ReactElement {
  const [selected, setSelected] = useState("");
  if (props.contacts.length === 0) {
    return (
      <div className="rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-600">
        Everyone in your contacts is already on this board.
        <button type="button" onClick={props.onCancel} className="mt-2 block min-h-11 text-sm font-medium text-slate-900 underline">
          Close
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3">
      <label className="block text-xs font-medium text-slate-700">
        Add a contact
        <select
          value={selected}
          onChange={event => setSelected(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        >
          <option value="">Choose someone…</option>
          {props.contacts.map(contact => (
            <option key={contact.id} value={contact.id}>{contact.name ?? contact.email}</option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!selected || props.busy}
          onClick={() => props.onAdd(selected)}
          className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Add
        </button>
        <button type="button" onClick={props.onCancel} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function StageEditor(props: {
  stage: { id: string; name: string; kind: StageKind; tone: StageTone; idleAfterDays?: number; cards: unknown[] };
  siblings: Array<{ id: string; name: string }>;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: { name?: string; kind?: StageKind; tone?: StageTone; idleAfterDays?: number | null }) => void;
  onDelete: (moveCardsTo?: string) => void;
}): React.ReactElement {
  const [name, setName] = useState(props.stage.name);
  const [kind, setKind] = useState<StageKind>(props.stage.kind);
  const [tone, setTone] = useState<StageTone>(props.stage.tone);
  const [idle, setIdle] = useState(props.stage.idleAfterDays === undefined ? "" : String(props.stage.idleAfterDays));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moveTo, setMoveTo] = useState(props.siblings[0]?.id ?? "");
  const occupied = props.stage.cards.length > 0;

  return (
    <div className="border-y border-slate-200 bg-white p-3">
      <label className="block text-xs font-medium text-slate-700">
        Name
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-slate-700">
          Means
          <select
            value={kind}
            onChange={event => setKind(event.target.value as StageKind)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
          >
            <option value="open">In progress</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Colour
          <select
            value={tone}
            onChange={event => setTone(event.target.value as StageTone)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
          >
            {STAGE_TONES.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-2 block text-xs font-medium text-slate-700">
        Flag a card after (days)
        <input
          type="number"
          min={1}
          value={idle}
          onChange={event => setIdle(event.target.value)}
          placeholder="Never"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.busy || !name.trim()}
          onClick={() => props.onSave({
            name, kind, tone,
            idleAfterDays: idle.trim() === "" ? null : Number(idle),
          })}
          className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Save
        </button>
        <button type="button" onClick={props.onClose} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
          Close
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="min-h-11 rounded-lg border border-rose-300 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          Delete stage
        </button>
      </div>

      {confirmingDelete && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          {occupied ? (
            <>
              {/* The server refuses a non-empty stage without a destination.
                  Asking here means the client answers the question once,
                  instead of meeting a refusal they cannot act on. */}
              <p className="text-xs text-rose-900">
                {props.stage.cards.length} {props.stage.cards.length === 1 ? "person is" : "people are"} in this
                stage. Where should they go?
              </p>
              <select
                value={moveTo}
                onChange={event => setMoveTo(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-rose-300 px-2 text-sm"
              >
                {props.siblings.map(sibling => (
                  <option key={sibling.id} value={sibling.id}>{sibling.name}</option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-xs text-rose-900">This stage is empty. Delete it?</p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={props.busy || (occupied && !moveTo)}
              onClick={() => props.onDelete(occupied ? moveTo : undefined)}
              className="min-h-11 rounded-lg bg-rose-700 px-3 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {occupied ? "Move and delete" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewStageForm(props: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (seed: { name: string; kind: StageKind; tone: StageTone }) => void;
}): React.ReactElement {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StageKind>("open");
  const [tone, setTone] = useState<StageTone>("slate");
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-3">
      <label className="block text-xs font-medium text-slate-700">
        Stage name
        <input
          value={name}
          autoFocus
          onChange={event => setName(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>
      <label className="mt-2 block text-xs font-medium text-slate-700">
        Means
        <select
          value={kind}
          onChange={event => setKind(event.target.value as StageKind)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        >
          <option value="open">In progress</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      </label>
      <label className="mt-2 block text-xs font-medium text-slate-700">
        Colour
        <select
          value={tone}
          onChange={event => setTone(event.target.value as StageTone)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        >
          {STAGE_TONES.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={props.busy || !name.trim()}
          onClick={() => props.onCreate({ name, kind, tone })}
          className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Add
        </button>
        <button type="button" onClick={props.onCancel} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function NewPipelineForm(props: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string, description?: string) => void;
}): React.ReactElement {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">New pipeline</h2>
      <p className="mt-1 text-xs text-slate-500">
        It starts with five stages — New enquiry, Contacted, Quoted, Won, Lost — which you can rename,
        recolour or delete.
      </p>
      <label className="mt-3 block text-xs font-medium text-slate-700">
        Name
        <input
          value={name}
          autoFocus
          onChange={event => setName(event.target.value)}
          placeholder="e.g. Wedding enquiries"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>
      <label className="mt-2 block text-xs font-medium text-slate-700">
        Description (optional)
        <input
          value={description}
          onChange={event => setDescription(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={props.busy || !name.trim()}
          onClick={() => props.onCreate(name, description || undefined)}
          className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Create
        </button>
        <button type="button" onClick={props.onCancel} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
