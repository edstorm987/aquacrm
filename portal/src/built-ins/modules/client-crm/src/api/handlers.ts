// HTTP handlers for the client-CRM plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  ContactFilter,
  CreateContactInput,
  CreateSegmentInput,
  ImportContactRow,
  IngestAffiliateAttributionPayload,
  IngestOrderCreatedPayload,
  IngestSubscriptionEventPayload,
  UpdateContactPatch,
  UpdateSegmentPatch,
} from "../lib/domain";
import type {
  CreateAutomationInput,
  CreateCardInput,
  CreatePipelineInput,
  MoveCardInput,
  StageKind,
  StageTone,
  UpdateAutomationPatch,
  UpdateCardPatch,
  UpdatePipelinePatch,
} from "../lib/journey";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const unprocessable = (m: string): Response => json({ ok: false, error: m }, 422);
function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

function buildContainer(ctx: PluginCtx) {
  if (!ctx.clientId) throw new Error("client-crm requires a client scope.");
  return containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });
}

// ─── Contacts ────────────────────────────────────────────────────────────

export async function listContactsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: ContactFilter = {
    segmentId: url.searchParams.get("segmentId") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    status: (url.searchParams.get("status") ?? undefined) as ContactFilter["status"],
    query: url.searchParams.get("q") ?? undefined,
  };
  return json({ ok: true, contacts: await buildContainer(ctx).contacts.list(filter) });
}

export async function createContactHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateContactInput>(req);
  if (!body?.email) return badRequest("email required.");
  try {
    const contact = await buildContainer(ctx).contacts.create(body, ctx.actor);
    return json({ ok: true, contact }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateContactHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateContactPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const contact = await buildContainer(ctx).contacts.update(body.id, body.patch ?? {}, ctx.actor);
    return contact ? json({ ok: true, contact }) : notFound("contact not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteContactHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const ok = await buildContainer(ctx).contacts.delete(id, ctx.actor);
  return ok ? json({ ok: true }) : notFound("contact not found");
}

export async function importContactsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ rows: ImportContactRow[] }>(req);
  if (!body?.rows || !Array.isArray(body.rows)) {
    return badRequest("rows array required.");
  }
  try {
    const result = await buildContainer(ctx).contacts.importBulk(body.rows, ctx.actor);
    return json({ ok: true, result }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function addNoteHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; note: string }>(req);
  if (!body?.id || !body.note) return badRequest("id + note required.");
  try {
    const activity = await buildContainer(ctx).activity.addNote(body.id, body.note, ctx.actor);
    return json({ ok: true, activity }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function listContactActivityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  const limit = Number(url.searchParams.get("limit") ?? 100) || undefined;
  const activity = await buildContainer(ctx).activity.listForContact(id, limit);
  return json({ ok: true, activity });
}

// ─── Segments ────────────────────────────────────────────────────────────

export async function listSegmentsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, segments: await buildContainer(ctx).segments.list() });
}

export async function createSegmentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateSegmentInput>(req);
  if (!body?.name) return badRequest("name required.");
  try {
    const segment = await buildContainer(ctx).segments.create(body, ctx.actor);
    return json({ ok: true, segment }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateSegmentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateSegmentPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const segment = await buildContainer(ctx).segments.update(body.id, body.patch ?? {}, ctx.actor);
    return segment ? json({ ok: true, segment }) : notFound("segment not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteSegmentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  try {
    const ok = await buildContainer(ctx).segments.delete(id, ctx.actor);
    return ok ? json({ ok: true }) : notFound("segment not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function listSegmentMembersHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const members = await buildContainer(ctx).segments.listMembers(id);
  return json({ ok: true, members });
}

// ─── Cross-plugin event ingest ──────────────────────────────────────────

interface IngestBody {
  type: "order.created" | "subscription.started" | "subscription.canceled" | "affiliate.attribution_recorded";
  payload: IngestOrderCreatedPayload | IngestSubscriptionEventPayload | IngestAffiliateAttributionPayload;
}

export async function ingestEventHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<IngestBody>(req);
  if (!body?.type || !body.payload) return badRequest("type + payload required.");
  const c = buildContainer(ctx);
  try {
    let activity = null;
    switch (body.type) {
      case "order.created":
        activity = await c.activity.ingestOrderCreated(body.payload as IngestOrderCreatedPayload, ctx.actor);
        break;
      case "subscription.started":
      case "subscription.canceled": {
        const p = body.payload as IngestSubscriptionEventPayload;
        activity = await c.activity.ingestSubscription({
          ...p,
          status: body.type === "subscription.started" ? "started" : "canceled",
        }, ctx.actor);
        break;
      }
      case "affiliate.attribution_recorded":
        activity = await c.activity.ingestAffiliateAttribution(
          body.payload as IngestAffiliateAttributionPayload,
          ctx.actor,
        );
        break;
      default:
        return badRequest(`unknown event type: ${body.type as string}`);
    }
    return json({ ok: true, activity });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Customer-facing ────────────────────────────────────────────────────

export async function meProfileHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const c = buildContainer(ctx);
  const contact = await c.contacts.getByUser(ctx.actor);
  if (!contact) {
    // Self-bootstrap: try to mergeFromUser so the customer always has a profile.
    const merged = await c.contacts.mergeFromUser(ctx.actor, ctx.actor);
    if (!merged) return notFound("contact not found");
    return json({ ok: true, contact: merged });
  }
  return json({ ok: true, contact });
}

export async function meUpdateProfileHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<UpdateContactPatch>(req);
  if (!body) return badRequest("body required.");
  const c = buildContainer(ctx);
  const contact = await c.contacts.getByUser(ctx.actor);
  if (!contact) return notFound("contact not found");
  // Limit what end-customers can change to a safe subset.
  const allowed: UpdateContactPatch = {
    name: body.name,
    phone: body.phone,
    attributes: body.attributes,
  };
  try {
    const updated = await c.contacts.update(contact.id, allowed, ctx.actor);
    return updated ? json({ ok: true, contact: updated }) : notFound("contact not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY PIPELINES — the client's own kanban, and the rules behind it
// ═══════════════════════════════════════════════════════════════════════════
//
// Added 28 August 2026. Ed: *"give them a kanban board as well so that they
// can create their own journey pipelines and move contacts about and set
// automations"*.
//
// Everything below sits behind the `journey-pipelines` feature flag, which is
// what makes this an add-on rather than a fixture: switch the feature off on
// the install and every route here answers 404 — the same answer as a client
// who never had it, rather than a 403 that admits the feature exists and
// invites a support ticket.

/**
 * Is the add-on switched on for this client?
 *
 * ── The semantics are not a free choice ──────────────────────────────────
 *
 * Two places in the host already answer this question for every plugin, and
 * both read it the same way — an ABSENT key means OFF:
 *
 *   `app/api/portal/[module]/[...rest]/route.ts:111`
 *     `if (route.requiresFeature && !install.features[route.requiresFeature])`
 *   `lib/chrome/sidebarLayout.ts:179`
 *     `if (!install?.features[navItem.requiresFeature]) continue;`
 *
 * The first draft of this helper used `!== false`, so a missing key meant ON.
 * That would have produced the worst possible split: the nav link hidden and
 * the API refusing, while this page happily rendered a board the client was
 * not supposed to have. Matching the host exactly is the point — one answer,
 * three enforcement sites.
 *
 * It also happens to be the right product behaviour. This is a paid add-on,
 * like the editor: a client who installed the CRM before today does not
 * silently acquire it, they are switched on deliberately.
 */
export function journeyEnabled(ctx: { install?: { features?: Record<string, boolean> } }): boolean {
  return Boolean(ctx.install?.features?.["journey-pipelines"]);
}

function requireJourney(ctx: PluginCtx): Response | null {
  return journeyEnabled(ctx) ? null : notFound("journey_pipelines_not_enabled");
}

// ─── Pipelines ───────────────────────────────────────────────────────────

export async function listPipelinesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "GET") ?? requireJourney(ctx);
  if (guard) return guard;
  return json({ ok: true, pipelines: await buildContainer(ctx).pipelines.list() });
}

/**
 * The board, joined server-side.
 *
 * `pipelineId` is optional: with none, the client's default board is drawn.
 * That is what makes "Pipelines" a working nav link rather than a chooser
 * screen standing in front of the thing they wanted.
 */
export async function boardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "GET") ?? requireJourney(ctx);
  if (guard) return guard;
  const container = buildContainer(ctx);
  const requested = new URL(req.url).searchParams.get("pipelineId");
  const pipeline = requested
    ? await container.pipelines.get(requested)
    : await container.pipelines.getDefault();
  if (!pipeline) return notFound("pipeline_not_found");

  // Contacts are read once and handed to the projection — the board needs them
  // for names, and the browser needs the same list to offer "add a contact".
  const contacts = await container.contacts.list();
  const [board, automations] = await Promise.all([
    container.pipelines.buildBoard(pipeline.id, contacts),
    container.automations.list(pipeline.id),
  ]);
  return json({ ok: true, board, automations });
}

export async function createPipelineHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<CreatePipelineInput>(req);
  if (!body?.name) return badRequest("name required.");
  try {
    return json({ ok: true, pipeline: await buildContainer(ctx).pipelines.create(body, ctx.actor) }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updatePipelineHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdatePipelinePatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const pipeline = await buildContainer(ctx).pipelines.update(body.id, body.patch ?? {}, ctx.actor);
    return pipeline ? json({ ok: true, pipeline }) : notFound("pipeline_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deletePipelineHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE") ?? requireJourney(ctx);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const container = buildContainer(ctx);
  // Rules first. A rule outliving its pipeline is unreachable and un-deletable
  // through the UI, because every automation screen is reached through a board.
  await container.automations.deleteForPipeline(id, ctx.actor);
  const deleted = await container.pipelines.delete(id, ctx.actor);
  return deleted ? json({ ok: true }) : notFound("pipeline_not_found");
}

// ─── Stages ──────────────────────────────────────────────────────────────

export async function addStageHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<{ pipelineId: string; name: string; kind?: StageKind; tone?: StageTone; idleAfterDays?: number }>(req);
  if (!body?.pipelineId || !body.name) return badRequest("pipelineId and name required.");
  try {
    const pipeline = await buildContainer(ctx).pipelines.addStage(body.pipelineId, body, ctx.actor);
    return pipeline ? json({ ok: true, pipeline }, 201) : notFound("pipeline_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateStageHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<{
    pipelineId: string; stageId: string;
    patch: { name?: string; kind?: StageKind; tone?: StageTone; idleAfterDays?: number | null };
  }>(req);
  if (!body?.pipelineId || !body.stageId) return badRequest("pipelineId and stageId required.");
  try {
    const pipeline = await buildContainer(ctx).pipelines.updateStage(body.pipelineId, body.stageId, body.patch ?? {}, ctx.actor);
    return pipeline ? json({ ok: true, pipeline }) : notFound("stage_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Remove a column.
 *
 * A stage holding cards refuses with `stage_not_empty:<n>` unless the caller
 * names where they go. The count travels in the error because the UI's next
 * question is always "how many am I about to move?".
 */
export async function deleteStageHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE") ?? requireJourney(ctx);
  if (guard) return guard;
  const url = new URL(req.url);
  const pipelineId = url.searchParams.get("pipelineId");
  const stageId = url.searchParams.get("stageId");
  if (!pipelineId || !stageId) return badRequest("pipelineId and stageId required.");
  const result = await buildContainer(ctx).pipelines.deleteStage(
    pipelineId, stageId, ctx.actor, url.searchParams.get("moveCardsTo") ?? undefined,
  );
  return result.ok ? json({ ok: true, pipeline: result.pipeline }) : unprocessable(result.error);
}

export async function reorderStagesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<{ pipelineId: string; stageIds: string[] }>(req);
  if (!body?.pipelineId || !Array.isArray(body.stageIds)) return badRequest("pipelineId and stageIds required.");
  const pipeline = await buildContainer(ctx).pipelines.reorderStages(body.pipelineId, body.stageIds, ctx.actor);
  return pipeline ? json({ ok: true, pipeline }) : notFound("pipeline_not_found");
}

// ─── Cards ───────────────────────────────────────────────────────────────

export async function createCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<CreateCardInput>(req);
  if (!body?.pipelineId || !body.contactId) return badRequest("pipelineId and contactId required.");
  const container = buildContainer(ctx);
  try {
    const { card, transition } = await container.pipelines.createCard(body, ctx.actor);
    // Landing on the board is itself a transition, so `card-created` and
    // `card-entered-stage` both get their chance here. Running them anywhere
    // else would mean a card added from the Inbox skips its own rules.
    const automations = await container.automations.runForTransition(transition, ctx.actor);
    return json({ ok: true, card, automations }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function moveCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<MoveCardInput>(req);
  if (!body?.cardId || !body.toStageId) return badRequest("cardId and toStageId required.");
  const container = buildContainer(ctx);
  const transition = await container.pipelines.moveCard(body.cardId, body.toStageId, body.toPosition, ctx.actor);
  if (!transition) return notFound("card_not_found");
  const automations = await container.automations.runForTransition(transition, ctx.actor);
  // The board is returned with the move so the browser renders the RESULT of
  // the automations, not the position it optimistically drew. A rule that
  // moves the card on again would otherwise leave the UI a step behind.
  const board = await container.pipelines.buildBoard(transition.card.pipelineId, await container.contacts.list());
  return json({ ok: true, board, automations });
}

export async function updateCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<{ cardId: string; patch: UpdateCardPatch }>(req);
  if (!body?.cardId) return badRequest("cardId required.");
  const card = await buildContainer(ctx).pipelines.updateCard(body.cardId, body.patch ?? {}, ctx.actor);
  return card ? json({ ok: true, card }) : notFound("card_not_found");
}

export async function deleteCardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE") ?? requireJourney(ctx);
  if (guard) return guard;
  const cardId = new URL(req.url).searchParams.get("cardId");
  if (!cardId) return badRequest("cardId required.");
  const deleted = await buildContainer(ctx).pipelines.deleteCard(cardId, ctx.actor);
  return deleted ? json({ ok: true }) : notFound("card_not_found");
}

// ─── Automations ─────────────────────────────────────────────────────────

export async function listAutomationsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "GET") ?? requireJourney(ctx);
  if (guard) return guard;
  const pipelineId = new URL(req.url).searchParams.get("pipelineId") ?? undefined;
  return json({ ok: true, automations: await buildContainer(ctx).automations.list(pipelineId) });
}

export async function createAutomationHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<CreateAutomationInput>(req);
  if (!body?.pipelineId || !body.name || !body.trigger || !Array.isArray(body.actions)) {
    return badRequest("pipelineId, name, trigger and actions required.");
  }
  try {
    return json({ ok: true, automation: await buildContainer(ctx).automations.create(body, ctx.actor) }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateAutomationHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH") ?? requireJourney(ctx);
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateAutomationPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const automation = await buildContainer(ctx).automations.update(body.id, body.patch ?? {}, ctx.actor);
    return automation ? json({ ok: true, automation }) : notFound("automation_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteAutomationHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE") ?? requireJourney(ctx);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const deleted = await buildContainer(ctx).automations.delete(id, ctx.actor);
  return deleted ? json({ ok: true }) : notFound("automation_not_found");
}
