// Pipeline + card storage, and the board projection the page renders.
//
// This file owns the MECHANICS — where a card is, what order the columns are
// in, what the board totals to. It deliberately knows nothing about
// automations: rules live in `automations.ts` and drive this through its public
// methods, which keeps "where things are" separable from "what should happen
// when they move".
//
// Storage:
//   journey/pipelines/index               → string[] of pipeline ids
//   journey/pipelines/by-id/<id>          → Pipeline
//   journey/cards/by-id/<id>              → JourneyCard
//   journey/cards/by-pipeline/<pipelineId>→ string[] of card ids
//   journey/cards/by-contact/<contactId>  → string[] of card ids
//
// The two reverse indexes exist for the two questions actually asked: "draw
// this board" and "is this contact already on a board". Without the second,
// deleting a contact would have to scan every card of every pipeline.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type { Contact } from "../lib/domain";
import {
  STARTER_STAGES,
  type BoardCard,
  type BoardStage,
  type CreateCardInput,
  type CreatePipelineInput,
  type JourneyBoard,
  type JourneyCard,
  type Pipeline,
  type PipelineStage,
  type StageKind,
  type StageTone,
  type UpdateCardPatch,
  type UpdatePipelinePatch,
} from "../lib/journey";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const PIPELINE_INDEX_KEY = "journey/pipelines/index";
const pipelineKey = (id: string): string => `journey/pipelines/by-id/${id}`;
const cardKey = (id: string): string => `journey/cards/by-id/${id}`;
const cardsByPipelineKey = (pipelineId: string): string => `journey/cards/by-pipeline/${pipelineId}`;
const cardsByContactKey = (contactId: string): string => `journey/cards/by-contact/${contactId}`;

const DAY_MS = 86_400_000;

/** What a completed move was, handed to the automation runner. */
export interface CardTransition {
  card: JourneyCard;
  fromStageId: string | null;
  toStageId: string;
}

export class PipelineService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  // ─── Pipelines ─────────────────────────────────────────────────────────

  async list(): Promise<Pipeline[]> {
    const ids = (await this.storage.get<string[]>(PIPELINE_INDEX_KEY)) ?? [];
    const out: Pipeline[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Pipeline>(pipelineKey(id));
      // The tenant check is on the ROW, not the index, because an index is a
      // list of ids and cannot be wrong about ownership on its own.
      if (row && row.agencyId === this.agencyId && row.clientId === this.clientId) out.push(row);
    }
    return out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt - b.createdAt);
  }

  async get(id: string): Promise<Pipeline | null> {
    const row = await this.storage.get<Pipeline>(pipelineKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  /** The board to open when none was named. */
  async getDefault(): Promise<Pipeline | null> {
    const all = await this.list();
    return all.find(p => p.isDefault) ?? all[0] ?? null;
  }

  async create(input: CreatePipelineInput, actor: UserId): Promise<Pipeline> {
    const name = input.name.trim();
    if (!name) throw new Error("Pipeline name required.");

    const seeds = input.stages?.length ? input.stages : STARTER_STAGES;
    const ts = now();
    const existing = await this.list();

    const pipeline: Pipeline = {
      id: makeId("pipe"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      name,
      description: input.description?.trim() || undefined,
      stages: seeds.map((seed, index) => ({
        id: makeId("stg"),
        name: seed.name.trim(),
        order: index,
        kind: seed.kind,
        tone: seed.tone,
        idleAfterDays: seed.idleAfterDays,
      })),
      // The first board a client ever makes is their default whatever they
      // asked for — otherwise `getDefault` has nothing to open.
      isDefault: input.isDefault === true || existing.length === 0,
      createdAt: ts,
      updatedAt: ts,
    };

    if (pipeline.isDefault) await this.clearDefaultExcept(pipeline.id);

    await this.storage.set(pipelineKey(pipeline.id), pipeline);
    const ids = (await this.storage.get<string[]>(PIPELINE_INDEX_KEY)) ?? [];
    await this.storage.set(PIPELINE_INDEX_KEY, [...ids, pipeline.id]);
    await this.storage.set(cardsByPipelineKey(pipeline.id), []);

    await this.log(actor, "pipeline.created", `Pipeline "${pipeline.name}" created`, { pipelineId: pipeline.id });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.pipeline.created", { pipelineId: pipeline.id });
    return pipeline;
  }

  async update(id: string, patch: UpdatePipelinePatch, actor: UserId): Promise<Pipeline | null> {
    const pipeline = await this.get(id);
    if (!pipeline) return null;
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Pipeline name required.");

    const next: Pipeline = {
      ...pipeline,
      name: patch.name?.trim() ?? pipeline.name,
      description: patch.description === undefined ? pipeline.description : (patch.description.trim() || undefined),
      isDefault: patch.isDefault ?? pipeline.isDefault,
      updatedAt: now(),
    };
    if (patch.isDefault === true) await this.clearDefaultExcept(id);
    await this.storage.set(pipelineKey(id), next);
    await this.log(actor, "pipeline.updated", `Pipeline "${next.name}" updated`, { pipelineId: id });
    return next;
  }

  /**
   * Delete a pipeline and everything hanging off it.
   *
   * Cards go with it. They cannot be kept: a card's whole identity is a
   * position in a stage of this pipeline, and there is nowhere else for it to
   * be. The CONTACTS are untouched — deleting a board must never delete the
   * people on it, which is the mistake this ordering exists to prevent.
   */
  async delete(id: string, actor: UserId): Promise<boolean> {
    const pipeline = await this.get(id);
    if (!pipeline) return false;

    for (const card of await this.listCards(id)) {
      await this.detachCardFromContact(card);
      await this.storage.del(cardKey(card.id));
    }
    await this.storage.del(cardsByPipelineKey(id));
    await this.storage.del(pipelineKey(id));
    const ids = (await this.storage.get<string[]>(PIPELINE_INDEX_KEY)) ?? [];
    await this.storage.set(PIPELINE_INDEX_KEY, ids.filter(x => x !== id));

    // A client is never left with boards but no default.
    if (pipeline.isDefault) {
      const remaining = await this.list();
      const heir = remaining.find(p => p.isDefault) ? undefined : remaining[0];
      if (heir) await this.storage.set(pipelineKey(heir.id), { ...heir, isDefault: true, updatedAt: now() });
    }

    await this.log(actor, "pipeline.deleted", `Pipeline "${pipeline.name}" deleted`, { pipelineId: id });
    return true;
  }

  private async clearDefaultExcept(keepId: string): Promise<void> {
    for (const other of await this.list()) {
      if (other.id !== keepId && other.isDefault) {
        await this.storage.set(pipelineKey(other.id), { ...other, isDefault: false, updatedAt: now() });
      }
    }
  }

  // ─── Stages ────────────────────────────────────────────────────────────

  async addStage(
    pipelineId: string,
    seed: { name: string; kind?: StageKind; tone?: StageTone; idleAfterDays?: number },
    actor: UserId,
  ): Promise<Pipeline | null> {
    const pipeline = await this.get(pipelineId);
    if (!pipeline) return null;
    const name = seed.name.trim();
    if (!name) throw new Error("Stage name required.");

    const stage: PipelineStage = {
      id: makeId("stg"),
      name,
      order: pipeline.stages.length,
      kind: seed.kind ?? "open",
      tone: seed.tone ?? "slate",
      idleAfterDays: seed.idleAfterDays,
    };
    const next = { ...pipeline, stages: [...pipeline.stages, stage], updatedAt: now() };
    await this.storage.set(pipelineKey(pipelineId), next);
    await this.log(actor, "stage.added", `Stage "${name}" added to "${pipeline.name}"`, { pipelineId, stageId: stage.id });
    return next;
  }

  async updateStage(
    pipelineId: string,
    stageId: string,
    patch: { name?: string; kind?: StageKind; tone?: StageTone; idleAfterDays?: number | null },
    actor: UserId,
  ): Promise<Pipeline | null> {
    const pipeline = await this.get(pipelineId);
    if (!pipeline) return null;
    if (!pipeline.stages.some(s => s.id === stageId)) return null;
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Stage name required.");

    const next: Pipeline = {
      ...pipeline,
      stages: pipeline.stages.map(stage => stage.id !== stageId ? stage : {
        ...stage,
        name: patch.name?.trim() ?? stage.name,
        kind: patch.kind ?? stage.kind,
        tone: patch.tone ?? stage.tone,
        idleAfterDays: patch.idleAfterDays === undefined
          ? stage.idleAfterDays
          : (patch.idleAfterDays === null ? undefined : patch.idleAfterDays),
      }),
      updatedAt: now(),
    };
    await this.storage.set(pipelineKey(pipelineId), next);
    await this.log(actor, "stage.updated", `Stage updated in "${pipeline.name}"`, { pipelineId, stageId });
    return next;
  }

  /**
   * Remove a stage, moving anything standing in it.
   *
   * `moveCardsTo` is REQUIRED when the stage holds cards. Deleting a column
   * with people in it is the one operation here that can lose a client's work
   * silently, so the caller has to say where they go — and the last stage
   * cannot be removed at all, because a board with no columns cannot be drawn
   * or added to.
   */
  async deleteStage(
    pipelineId: string,
    stageId: string,
    actor: UserId,
    moveCardsTo?: string,
  ): Promise<{ ok: true; pipeline: Pipeline } | { ok: false; error: string }> {
    const pipeline = await this.get(pipelineId);
    if (!pipeline) return { ok: false, error: "pipeline_not_found" };
    if (!pipeline.stages.some(s => s.id === stageId)) return { ok: false, error: "stage_not_found" };
    if (pipeline.stages.length <= 1) return { ok: false, error: "last_stage" };

    const stranded = (await this.listCards(pipelineId)).filter(card => card.stageId === stageId);
    if (stranded.length > 0) {
      if (!moveCardsTo) {
        return { ok: false, error: `stage_not_empty:${stranded.length}` };
      }
      const destination = pipeline.stages.find(s => s.id === moveCardsTo && s.id !== stageId);
      if (!destination) return { ok: false, error: "destination_not_found" };
      let position = (await this.listCards(pipelineId)).filter(c => c.stageId === moveCardsTo).length;
      for (const card of stranded) {
        await this.storage.set(cardKey(card.id), {
          ...card, stageId: moveCardsTo, position: position++, enteredStageAt: now(), updatedAt: now(),
        });
      }
    }

    const next: Pipeline = {
      ...pipeline,
      stages: pipeline.stages.filter(s => s.id !== stageId).map((stage, index) => ({ ...stage, order: index })),
      updatedAt: now(),
    };
    await this.storage.set(pipelineKey(pipelineId), next);
    await this.log(actor, "stage.deleted", `Stage removed from "${pipeline.name}"`, {
      pipelineId, stageId, movedCards: stranded.length,
    });
    return { ok: true, pipeline: next };
  }

  /** Reorder columns. Any id the caller omits keeps its relative order at the end. */
  async reorderStages(pipelineId: string, stageIds: string[], actor: UserId): Promise<Pipeline | null> {
    const pipeline = await this.get(pipelineId);
    if (!pipeline) return null;
    const ordered: PipelineStage[] = [];
    for (const id of stageIds) {
      const stage = pipeline.stages.find(s => s.id === id);
      if (stage && !ordered.includes(stage)) ordered.push(stage);
    }
    for (const stage of pipeline.stages) if (!ordered.includes(stage)) ordered.push(stage);

    const next: Pipeline = {
      ...pipeline,
      stages: ordered.map((stage, index) => ({ ...stage, order: index })),
      updatedAt: now(),
    };
    await this.storage.set(pipelineKey(pipelineId), next);
    await this.log(actor, "stage.reordered", `Columns reordered in "${pipeline.name}"`, { pipelineId });
    return next;
  }

  // ─── Cards ─────────────────────────────────────────────────────────────

  async listCards(pipelineId: string): Promise<JourneyCard[]> {
    const ids = (await this.storage.get<string[]>(cardsByPipelineKey(pipelineId))) ?? [];
    const out: JourneyCard[] = [];
    for (const id of ids) {
      const row = await this.storage.get<JourneyCard>(cardKey(id));
      if (row && row.agencyId === this.agencyId && row.clientId === this.clientId) out.push(row);
    }
    return out.sort((a, b) => a.position - b.position);
  }

  async getCard(id: string): Promise<JourneyCard | null> {
    const row = await this.storage.get<JourneyCard>(cardKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  /** Every card for a contact, across all boards. Used when a contact is removed. */
  async listCardsForContact(contactId: string): Promise<JourneyCard[]> {
    const ids = (await this.storage.get<string[]>(cardsByContactKey(contactId))) ?? [];
    const out: JourneyCard[] = [];
    for (const id of ids) {
      const row = await this.storage.get<JourneyCard>(cardKey(id));
      if (row && row.agencyId === this.agencyId && row.clientId === this.clientId) out.push(row);
    }
    return out;
  }

  async createCard(input: CreateCardInput, actor: UserId): Promise<{ card: JourneyCard; transition: CardTransition }> {
    const pipeline = await this.get(input.pipelineId);
    if (!pipeline) throw new Error("Pipeline not found.");
    const stage = input.stageId
      ? pipeline.stages.find(s => s.id === input.stageId)
      : [...pipeline.stages].sort((a, b) => a.order - b.order)[0];
    if (!stage) throw new Error("Stage not found.");

    // One card per contact per board. The same person in two columns of one
    // pipeline is not a richer model, it is a board nobody can trust.
    const already = (await this.listCards(input.pipelineId)).find(c => c.contactId === input.contactId);
    if (already) throw new Error("That contact is already on this pipeline.");

    const ts = now();
    const card: JourneyCard = {
      id: makeId("card"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      pipelineId: input.pipelineId,
      stageId: stage.id,
      contactId: input.contactId,
      position: (await this.listCards(input.pipelineId)).filter(c => c.stageId === stage.id).length,
      valueMinor: input.valueMinor,
      currency: input.currency,
      note: input.note?.trim() || undefined,
      enteredStageAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };

    await this.storage.set(cardKey(card.id), card);
    const pipelineIds = (await this.storage.get<string[]>(cardsByPipelineKey(input.pipelineId))) ?? [];
    await this.storage.set(cardsByPipelineKey(input.pipelineId), [...pipelineIds, card.id]);
    const contactIds = (await this.storage.get<string[]>(cardsByContactKey(input.contactId))) ?? [];
    await this.storage.set(cardsByContactKey(input.contactId), [...contactIds, card.id]);

    await this.log(actor, "card.created", `Contact added to "${pipeline.name}" · ${stage.name}`, {
      pipelineId: input.pipelineId, cardId: card.id, contactId: input.contactId,
    });
    return { card, transition: { card, fromStageId: null, toStageId: stage.id } };
  }

  /**
   * Move a card, returning what the move WAS.
   *
   * The transition is returned rather than acted on here: automations are the
   * caller's business, and a service that fired rules from inside a storage
   * write would make every test of "where is this card" also a test of "what
   * did the rules do".
   */
  async moveCard(cardId: string, toStageId: string, toPosition: number | undefined, actor: UserId): Promise<CardTransition | null> {
    const card = await this.getCard(cardId);
    if (!card) return null;
    const pipeline = await this.get(card.pipelineId);
    if (!pipeline) return null;
    const stage = pipeline.stages.find(s => s.id === toStageId);
    if (!stage) return null;

    const fromStageId = card.stageId;
    const changedStage = fromStageId !== toStageId;

    const siblings = (await this.listCards(card.pipelineId))
      .filter(c => c.stageId === toStageId && c.id !== cardId)
      .sort((a, b) => a.position - b.position);
    const index = toPosition === undefined
      ? siblings.length
      : Math.max(0, Math.min(toPosition, siblings.length));

    const moved: JourneyCard = {
      ...card,
      stageId: toStageId,
      position: index,
      // Only a genuine stage change restarts the clock. Reordering within a
      // column is not progress and must not reset "idle for 9 days".
      enteredStageAt: changedStage ? now() : card.enteredStageAt,
      updatedAt: now(),
    };
    await this.storage.set(cardKey(cardId), moved);

    // Renumber the destination column so positions stay contiguous.
    const reordered = [...siblings];
    reordered.splice(index, 0, moved);
    for (const [i, sibling] of reordered.entries()) {
      if (sibling.id === cardId) continue;
      await this.storage.set(cardKey(sibling.id), { ...sibling, position: i });
    }
    // And the column it left, so a gap does not accumulate there.
    if (changedStage) {
      const source = (await this.listCards(card.pipelineId))
        .filter(c => c.stageId === fromStageId)
        .sort((a, b) => a.position - b.position);
      for (const [i, left] of source.entries()) {
        await this.storage.set(cardKey(left.id), { ...left, position: i });
      }
    }

    if (changedStage) {
      await this.log(actor, "card.moved", `Card moved to "${stage.name}"`, {
        pipelineId: card.pipelineId, cardId, fromStageId, toStageId,
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "crm.card.moved",
        { cardId, pipelineId: card.pipelineId, fromStageId, toStageId },
      );
    }
    return { card: moved, fromStageId, toStageId };
  }

  async updateCard(cardId: string, patch: UpdateCardPatch, actor: UserId): Promise<JourneyCard | null> {
    const card = await this.getCard(cardId);
    if (!card) return null;
    const next: JourneyCard = {
      ...card,
      valueMinor: patch.valueMinor === undefined ? card.valueMinor : (patch.valueMinor === null ? undefined : patch.valueMinor),
      currency: patch.currency ?? card.currency,
      note: patch.note === undefined ? card.note : (patch.note.trim() || undefined),
      updatedAt: now(),
    };
    await this.storage.set(cardKey(cardId), next);
    await this.log(actor, "card.updated", "Card updated", { pipelineId: card.pipelineId, cardId });
    return next;
  }

  async deleteCard(cardId: string, actor: UserId): Promise<boolean> {
    const card = await this.getCard(cardId);
    if (!card) return false;
    await this.detachCardFromContact(card);
    await this.storage.del(cardKey(cardId));
    const ids = (await this.storage.get<string[]>(cardsByPipelineKey(card.pipelineId))) ?? [];
    await this.storage.set(cardsByPipelineKey(card.pipelineId), ids.filter(x => x !== cardId));
    await this.log(actor, "card.deleted", "Card removed from pipeline", { pipelineId: card.pipelineId, cardId });
    return true;
  }

  /** Remove every card for a contact. Called when the contact itself goes. */
  async deleteCardsForContact(contactId: string, actor: UserId): Promise<number> {
    const cards = await this.listCardsForContact(contactId);
    for (const card of cards) await this.deleteCard(card.id, actor);
    await this.storage.del(cardsByContactKey(contactId));
    return cards.length;
  }

  private async detachCardFromContact(card: JourneyCard): Promise<void> {
    const ids = (await this.storage.get<string[]>(cardsByContactKey(card.contactId))) ?? [];
    await this.storage.set(cardsByContactKey(card.contactId), ids.filter(x => x !== card.id));
  }

  // ─── Board projection ──────────────────────────────────────────────────

  /**
   * Everything one board render needs, joined server-side.
   *
   * `contacts` is passed in rather than fetched, because the caller already
   * holds the ContactService and this file has no business owning a second
   * route to contact rows.
   */
  async buildBoard(pipelineId: string, contacts: Contact[], at: number = now()): Promise<JourneyBoard | null> {
    const pipeline = await this.get(pipelineId);
    if (!pipeline) return null;

    const byId = new Map(contacts.map(contact => [contact.id, contact]));
    const cards = await this.listCards(pipelineId);
    const currencies = new Set<string>();

    const stages: BoardStage[] = [...pipeline.stages]
      .sort((a, b) => a.order - b.order)
      .map(stage => {
        const stageCards: BoardCard[] = cards
          .filter(card => card.stageId === stage.id)
          .sort((a, b) => a.position - b.position)
          .map(card => {
            const contact = byId.get(card.contactId);
            const idleDays = Math.floor((at - card.enteredStageAt) / DAY_MS);
            if (card.valueMinor !== undefined && card.currency) currencies.add(card.currency);
            return {
              ...card,
              contactName: contact?.name,
              // A card whose contact has vanished still draws, labelled. It is
              // recoverable that way; hidden, it is a card nobody can find.
              contactEmail: contact?.email ?? "(contact removed)",
              contactTags: contact?.tags ?? [],
              idle: stage.idleAfterDays !== undefined && idleDays >= stage.idleAfterDays,
              idleDays,
            };
          });
        const valued = stageCards.filter(card => card.valueMinor !== undefined);
        return {
          ...stage,
          cards: stageCards,
          valueMinor: valued.reduce((sum, card) => sum + (card.valueMinor ?? 0), 0),
          valuedCardCount: valued.length,
        };
      });

    return {
      pipeline,
      stages,
      totalCards: cards.length,
      currency: currencies.size === 1 ? [...currencies][0] : undefined,
      mixedCurrency: currencies.size > 1,
    };
  }

  private async log(actor: UserId, action: string, message: string, metadata: Record<string, unknown>): Promise<void> {
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "plugin",
      action: `client-crm.${action}`,
      message,
      metadata,
    });
  }
}
