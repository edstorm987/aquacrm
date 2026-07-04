import "server-only";
// Pipelines — T1 R034 multi-pipeline kanban domain.
//
// Foundation owns the storage shape + CRUD + default seed + the
// projection from `Client` rows onto fulfilment-pipeline cards.
// T2's kanban plugin (R+1) renders the cards; foundation just exposes
// the multi-pipeline concept so the chrome / nav / hub page can reason
// about it without booting kanban.
//
// Scope discipline (chapter #124 ship plan + #19 architecture):
//   - All reads/writes scoped by agencyId; no cross-tenant helpers.
//   - Slugs unique within an agency (slug clash → numeric suffix).
//   - Pure data layer — no React imports, no server-only side effects
//     beyond `mutate()` writes.
//   - Idempotent seed: re-running `seedDefaultPipelines` is a no-op
//     for kinds already present.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import { listClients, getClient } from "./tenants";
import { emit as emitEvent } from "./eventBus";
import type {
  Pipeline,
  PipelineCard,
  PipelineCardKind,
  PipelineColumn,
  PipelineKind,
  Client,
  ClientStage,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    || `pipeline-${Date.now()}`;
}

function ensureUniqueSlug(agencyId: string, base: string, exceptId?: string): string {
  const taken = new Set(
    Object.values(getState().pipelines)
      .filter(p => p.agencyId === agencyId && p.id !== exceptId)
      .map(p => p.slug),
  );
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ─── Default column packs ─────────────────────────────────────────────────

// Fulfilment columns mirror today's stage enum (Discovery → Live → Churned)
// so the migration runner can map existing clients onto cards 1:1.
export const FULFILMENT_STAGE_TO_COLUMN: Record<string, string> = {
  discovery: "discovery",
  design: "design",
  development: "design",       // collapse pre-Aqua "development" into design
  onboarding: "onboarding",
  live: "live",
  churned: "churned",
  lead: "discovery",
  "aqua-epic-intro": "discovery",
  "aqua-blueprint": "design",
  "aqua-diagnostics": "design",
  "aqua-brand-builder": "onboarding",
  "aqua-traffic": "live",
  "aqua-mastery": "live",
};

function fulfilmentColumns(): PipelineColumn[] {
  return [
    { id: "discovery",  label: "Discovery",  order: 0, color: "#0EA5A4" },
    { id: "design",     label: "Design",     order: 1, color: "#F97316" },
    { id: "onboarding", label: "Onboarding", order: 2, color: "#6366F1" },
    { id: "live",       label: "Live",       order: 3, color: "#10B981" },
    { id: "churned",    label: "Churned",    order: 4, color: "#71717A" },
  ];
}

function leadsColumns(): PipelineColumn[] {
  return [
    { id: "new",        label: "New",        order: 0 },
    { id: "contacted",  label: "Contacted",  order: 1 },
    { id: "qualified",  label: "Qualified",  order: 2 },
    { id: "won",        label: "Won",        order: 3, color: "#10B981" },
    { id: "lost",       label: "Lost",       order: 4, color: "#71717A" },
  ];
}

function salesColumns(): PipelineColumn[] {
  return [
    { id: "discovery",   label: "Discovery",   order: 0 },
    { id: "proposal",    label: "Proposal",    order: 1 },
    { id: "negotiation", label: "Negotiation", order: 2 },
    { id: "won",         label: "Won",         order: 3, color: "#10B981" },
    { id: "lost",        label: "Lost",        order: 4, color: "#71717A" },
  ];
}

interface DefaultPipelineSpec {
  kind: PipelineKind;
  name: string;
  slug: string;
  columns: PipelineColumn[];
  allowedCardKinds: PipelineCardKind[];
  sortOrder: number;
}

const DEFAULT_PIPELINE_SPECS: DefaultPipelineSpec[] = [
  {
    kind: "fulfilment",
    name: "Fulfilment",
    slug: "fulfilment",
    columns: fulfilmentColumns(),
    allowedCardKinds: ["client"],
    sortOrder: 0,
  },
  {
    kind: "leads",
    name: "Leads",
    slug: "leads",
    columns: leadsColumns(),
    allowedCardKinds: ["lead"],
    sortOrder: 1,
  },
  {
    kind: "sales",
    name: "Sales",
    slug: "sales",
    columns: salesColumns(),
    allowedCardKinds: ["deal", "lead"],
    sortOrder: 2,
  },
];

// ─── CRUD ─────────────────────────────────────────────────────────────────

export interface CreatePipelineInput {
  agencyId: string;
  kind: PipelineKind;
  name: string;
  slug?: string;
  columns?: PipelineColumn[];
  allowedCardKinds?: PipelineCardKind[];
  sortOrder?: number;
}

export function createPipeline(input: CreatePipelineInput): Pipeline {
  let saved!: Pipeline;
  mutate(state => {
    const id = makeId("pip");
    const baseSlug = slugify(input.slug ?? input.name);
    const slug = ensureUniqueSlugInState(state.pipelines, input.agencyId, baseSlug);
    const now = Date.now();
    const sortOrder = input.sortOrder ?? Object.values(state.pipelines)
      .filter(p => p.agencyId === input.agencyId).length;
    saved = {
      id,
      agencyId: input.agencyId,
      kind: input.kind,
      name: input.name,
      slug,
      columns: (input.columns ?? []).slice().sort((a, b) => a.order - b.order),
      allowedCardKinds: input.allowedCardKinds ?? ["client"],
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    state.pipelines[id] = saved;
  });
  return saved;
}

function ensureUniqueSlugInState(
  bag: Record<string, Pipeline>,
  agencyId: string,
  base: string,
  exceptId?: string,
): string {
  const taken = new Set(
    Object.values(bag)
      .filter(p => p.agencyId === agencyId && p.id !== exceptId)
      .map(p => p.slug),
  );
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function getPipeline(id: string): Pipeline | null {
  return getState().pipelines[id] ?? null;
}

export function getPipelineBySlug(agencyId: string, slug: string): Pipeline | null {
  for (const p of Object.values(getState().pipelines)) {
    if (p.agencyId === agencyId && p.slug === slug) return p;
  }
  return null;
}

export function listPipelines(agencyId: string): Pipeline[] {
  return Object.values(getState().pipelines)
    .filter(p => p.agencyId === agencyId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export interface UpdatePipelinePatch {
  name?: string;
  slug?: string;
  columns?: PipelineColumn[];
  allowedCardKinds?: PipelineCardKind[];
  sortOrder?: number;
}

export function updatePipeline(
  agencyId: string,
  pipelineId: string,
  patch: UpdatePipelinePatch,
): Pipeline | null {
  let saved: Pipeline | null = null;
  mutate(state => {
    const existing = state.pipelines[pipelineId];
    if (!existing || existing.agencyId !== agencyId) return;
    const slug = patch.slug
      ? ensureUniqueSlugInState(state.pipelines, agencyId, slugify(patch.slug), pipelineId)
      : existing.slug;
    saved = {
      ...existing,
      name: patch.name ?? existing.name,
      slug,
      columns: patch.columns
        ? patch.columns.slice().sort((a, b) => a.order - b.order)
        : existing.columns,
      allowedCardKinds: patch.allowedCardKinds ?? existing.allowedCardKinds,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
      updatedAt: Date.now(),
    };
    state.pipelines[pipelineId] = saved;
  });
  return saved;
}

export function deletePipeline(agencyId: string, pipelineId: string): boolean {
  let removed = false;
  mutate(state => {
    const existing = state.pipelines[pipelineId];
    if (!existing || existing.agencyId !== agencyId) return;
    delete state.pipelines[pipelineId];
    // Cascade card removal so dangling cards don't leak.
    for (const [cid, card] of Object.entries(state.pipelineCards)) {
      if (card.pipelineId === pipelineId) delete state.pipelineCards[cid];
    }
    removed = true;
  });
  return removed;
}

// ─── Default seed (idempotent) ────────────────────────────────────────────

export interface SeedDefaultPipelinesResult {
  created: Pipeline[];
  existing: Pipeline[];
}

export function seedDefaultPipelines(agencyId: string): SeedDefaultPipelinesResult {
  const created: Pipeline[] = [];
  const existing: Pipeline[] = [];
  for (const spec of DEFAULT_PIPELINE_SPECS) {
    const already = listPipelines(agencyId).find(p => p.kind === spec.kind);
    if (already) {
      existing.push(already);
      continue;
    }
    const pipeline = createPipeline({
      agencyId,
      kind: spec.kind,
      name: spec.name,
      slug: spec.slug,
      columns: spec.columns,
      allowedCardKinds: spec.allowedCardKinds,
      sortOrder: spec.sortOrder,
    });
    created.push(pipeline);
  }
  return { created, existing };
}

// ─── Card CRUD (foundation contract; T2 R+1 renders) ──────────────────────

type NewCardInput =
  | { kind: "client"; clientId: string; columnId?: string }
  | { kind: "lead"; lead: import("./types").LeadSnapshot; columnId: string }
  | { kind: "deal"; deal: import("./types").DealSnapshot; columnId: string }
  | { kind: "custom"; payload: Record<string, unknown>; columnId: string };

export function addCard(
  agencyId: string,
  pipelineId: string,
  input: NewCardInput,
): PipelineCard | null {
  let saved: PipelineCard | null = null;
  mutate(state => {
    const pipeline = state.pipelines[pipelineId];
    if (!pipeline || pipeline.agencyId !== agencyId) return;
    if (!pipeline.allowedCardKinds.includes(input.kind)) return;

    let columnId: string;
    if (input.kind === "client") {
      const client = state.clients[input.clientId];
      if (!client || client.agencyId !== agencyId) return;
      columnId = input.columnId
        ?? FULFILMENT_STAGE_TO_COLUMN[client.stage]
        ?? pipeline.columns[0]?.id
        ?? "discovery";
    } else {
      columnId = input.columnId;
    }
    if (!pipeline.columns.find(c => c.id === columnId)) return;

    const id = makeId("pcard");
    const now = Date.now();
    const order = Object.values(state.pipelineCards)
      .filter(c => c.pipelineId === pipelineId && c.columnId === columnId).length;
    const base = { id, pipelineId, columnId, order, createdAt: now, updatedAt: now };
    if (input.kind === "client") {
      saved = { ...base, kind: "client", clientId: input.clientId };
    } else if (input.kind === "lead") {
      saved = { ...base, kind: "lead", lead: input.lead };
    } else if (input.kind === "deal") {
      saved = { ...base, kind: "deal", deal: input.deal };
    } else {
      saved = { ...base, kind: "custom", payload: input.payload };
    }
    state.pipelineCards[id] = saved;
  });
  return saved;
}

// T1 R037 — column-move helper. Updates `columnId` + emits
// `pipelines.card.moved` on the foundation event bus so subscribed
// plugins (e.g. `@aqua/plugin-leads-pipeline`) can react to lead-card
// promotions. Returns the updated card or null when not found / out of
// scope. Idempotent: a no-op move (same column) does not re-emit.
export interface MoveCardResult {
  card: PipelineCard;
  fromColumn: string;
  toColumn: string;
}

export function moveCard(
  agencyId: string,
  cardId: string,
  toColumnId: string,
): MoveCardResult | null {
  const ctx: {
    result: MoveCardResult | null;
    pipelineAgencyId: string | null;
    cardKind: string | null;
    leadIdSnap: string | undefined;
  } = { result: null, pipelineAgencyId: null, cardKind: null, leadIdSnap: undefined };
  mutate(state => {
    const card = state.pipelineCards[cardId];
    if (!card) return;
    const pipeline = state.pipelines[card.pipelineId];
    if (!pipeline || pipeline.agencyId !== agencyId) return;
    if (!pipeline.columns.find(c => c.id === toColumnId)) return;
    ctx.pipelineAgencyId = pipeline.agencyId;
    ctx.cardKind = card.kind;
    if (card.kind === "lead") {
      ctx.leadIdSnap = (card.lead as unknown as { leadId?: string }).leadId;
    }
    if (card.columnId === toColumnId) {
      ctx.result = { card, fromColumn: card.columnId, toColumn: toColumnId };
      return;
    }
    const fromColumnId = card.columnId;
    const order = Object.values(state.pipelineCards)
      .filter(c => c.pipelineId === card.pipelineId && c.columnId === toColumnId).length;
    const updated = { ...card, columnId: toColumnId, order, updatedAt: Date.now() } as PipelineCard;
    state.pipelineCards[cardId] = updated;
    ctx.result = { card: updated, fromColumn: fromColumnId, toColumn: toColumnId };
  });
  const finalResult = ctx.result;
  if (finalResult && ctx.pipelineAgencyId && finalResult.fromColumn !== finalResult.toColumn) {
    const pipeline = getState().pipelines[finalResult.card.pipelineId];
    const fromLabel = pipeline?.columns.find(c => c.id === finalResult.fromColumn)?.label ?? finalResult.fromColumn;
    const toLabel = pipeline?.columns.find(c => c.id === finalResult.toColumn)?.label ?? finalResult.toColumn;
    emitEvent({ agencyId: ctx.pipelineAgencyId }, "pipelines.card.moved" as never, {
      cardKind: ctx.cardKind,
      cardId,
      fromColumn: fromLabel,
      toColumn: toLabel,
      agencyId: ctx.pipelineAgencyId,
      leadId: ctx.leadIdSnap,
    });
  }
  return finalResult;
}

export function listCards(pipelineId: string): PipelineCard[] {
  return Object.values(getState().pipelineCards)
    .filter(c => c.pipelineId === pipelineId)
    .sort((a, b) => a.order - b.order);
}

export function listCardsByAgency(agencyId: string): PipelineCard[] {
  const pipelineIds = new Set(
    Object.values(getState().pipelines)
      .filter(p => p.agencyId === agencyId)
      .map(p => p.id),
  );
  return Object.values(getState().pipelineCards)
    .filter(c => pipelineIds.has(c.pipelineId));
}

// ─── Migration: existing clients → fulfilment-pipeline cards ──────────────
//
// Idempotent: a client already represented as a card on the fulfilment
// pipeline is skipped. Re-running on a fully-migrated agency is a no-op
// and returns `{created: 0, alreadyPresent: N}`. Safe to call inside
// agency bootstrap so brand-new agencies stay consistent.

export interface MigrateClientsResult {
  created: number;
  alreadyPresent: number;
  pipelineId: string | null;
}

export function migrateClientsToFulfilment(agencyId: string): MigrateClientsResult {
  const fulfilment = listPipelines(agencyId).find(p => p.kind === "fulfilment");
  if (!fulfilment) return { created: 0, alreadyPresent: 0, pipelineId: null };

  const clients = listClients(agencyId);
  const existingCards = listCards(fulfilment.id);
  const seenClientIds = new Set(
    existingCards
      .filter(c => c.kind === "client")
      .map(c => (c.kind === "client" ? c.clientId : "")),
  );

  let created = 0;
  let alreadyPresent = 0;
  for (const c of clients) {
    if (seenClientIds.has(c.id)) {
      alreadyPresent++;
      continue;
    }
    const result = addCard(agencyId, fulfilment.id, { kind: "client", clientId: c.id });
    if (result) created++;
  }
  return { created, alreadyPresent, pipelineId: fulfilment.id };
}

// ─── Projection: client rows → fulfilment cards (read-only view) ──────────
//
// When the kanban plugin (T2 R+1) renders the fulfilment pipeline it can
// either consume `listCards()` directly OR call this projection helper
// which derives a virtual card-list from client rows. This is the source-
// of-truth projection used by the hub `/portal/agency` page so the UI
// stays consistent before a migration is run.

export interface ClientCardProjection {
  pipelineId: string;
  columnId: string;
  clientId: string;
  client: Client;
}

export function projectClientsToFulfilmentCards(
  agencyId: string,
): ClientCardProjection[] {
  const fulfilment = listPipelines(agencyId).find(p => p.kind === "fulfilment");
  if (!fulfilment) return [];
  const projections: ClientCardProjection[] = [];
  for (const c of listClients(agencyId)) {
    const columnId = FULFILMENT_STAGE_TO_COLUMN[c.stage] ?? fulfilment.columns[0]?.id ?? "discovery";
    projections.push({ pipelineId: fulfilment.id, columnId, clientId: c.id, client: c });
  }
  return projections;
}

// Re-export for tests / scripts that want the slug helper directly.
export { ensureUniqueSlug };

// Sanity helper: a card kind is allowed on a pipeline.
export function pipelineAllowsKind(pipeline: Pipeline, kind: PipelineCardKind): boolean {
  return pipeline.allowedCardKinds.includes(kind);
}

// Promote a lead card into a client (foundation hook for T2 R+1).
// Creates a Client via tenants.createClient + replaces the lead card
// with a client card on the fulfilment pipeline. Returns null when the
// source card isn't a lead or the agency lacks a fulfilment pipeline.
export interface PromoteLeadResult {
  client: Client;
  newCardId: string;
}

export function promoteLeadCardToClient(
  agencyId: string,
  cardId: string,
): PromoteLeadResult | null {
  const card = getState().pipelineCards[cardId];
  if (!card || card.kind !== "lead") return null;
  const sourcePipeline = getState().pipelines[card.pipelineId];
  if (!sourcePipeline || sourcePipeline.agencyId !== agencyId) return null;
  const fulfilment = listPipelines(agencyId).find(p => p.kind === "fulfilment");
  if (!fulfilment) return null;

  // Delegate client creation to tenants.ts (preserves slug + brand defaults).
  // Lazy require avoids a cycle if tenants.ts ever imports from here.
  const { createClient } = require("./tenants") as typeof import("./tenants");
  const lead = card.lead;
  const newClient = createClient(agencyId, {
    name: lead.name ?? lead.email,
    ownerEmail: lead.email,
    metadata: { source: lead.source, capturedAt: lead.capturedAt, phone: lead.phone },
    stage: "discovery" satisfies ClientStage,
  });

  // Drop the lead card, add the client card.
  let newCardId = "";
  mutate(state => {
    delete state.pipelineCards[cardId];
  });
  const newCard = addCard(agencyId, fulfilment.id, { kind: "client", clientId: newClient.id });
  newCardId = newCard?.id ?? "";

  return { client: newClient, newCardId };
}

// Surface helper used by the hub page — total card count per pipeline.
export function pipelineCardCounts(agencyId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of listPipelines(agencyId)) {
    if (p.kind === "fulfilment") {
      // Fulfilment cards are derived from clients when no migration has
      // run yet; show projected count so the hub never reads zero on a
      // fresh agency with existing clients.
      const cardCount = listCards(p.id).length;
      out[p.id] = cardCount > 0 ? cardCount : listClients(agencyId).length;
    } else {
      out[p.id] = listCards(p.id).length;
    }
  }
  return out;
}

// Friendly re-export for the chrome / hub page.
export { getClient };
