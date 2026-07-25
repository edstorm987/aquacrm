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
