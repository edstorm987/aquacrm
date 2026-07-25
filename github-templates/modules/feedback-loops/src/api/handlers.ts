import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  FeedbackNotFoundError,
  InvalidTestimonialTransitionError,
} from "../server/services";
import type {
  ReplyTestimonialInput,
  RequestTestimonialInput,
  RespondPulseInput,
  SendPulseInput,
  TestimonialStatus,
} from "../lib/domain";
import { TESTIMONIAL_STATUSES } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  if (!ctx.clientId) throw new Error("feedback-loops: clientId required");
  return containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });
}

// ── Pulses ───────────────────────────────────────────────────────

export async function listPulsesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const respondedRaw = url.searchParams.get("responded");
  const filter: { responded?: boolean } = {};
  if (respondedRaw === "1") filter.responded = true;
  if (respondedRaw === "0") filter.responded = false;
  const pulses = await build(ctx).pulses.list(filter);
  const summary = await build(ctx).pulses.summary();
  return json({ ok: true, pulses, summary });
}

export async function sendPulseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<SendPulseInput>(req);
  if (!body || !body.respondent) return badRequest("invalid_body");
  try {
    const pulse = await build(ctx).pulses.send(ctx.actor, body);
    return json({ ok: true, pulse }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "send_failed");
  }
}

export async function respondPulseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = await safeJson<RespondPulseInput>(req);
  if (!body || typeof body.score !== "number") return badRequest("invalid_body");
  try {
    const pulse = await build(ctx).pulses.respond(id, body);
    return json({ ok: true, pulse });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "respond_failed");
  }
}

// ── Testimonials ─────────────────────────────────────────────────

export async function listTestimonialsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw && (TESTIMONIAL_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as TestimonialStatus) : undefined;
  const items = await build(ctx).testimonials.list({
    ...(status ? { status } : {}),
    ...(url.searchParams.get("publicOnly") === "1" ? { publicOnly: true } : {}),
  });
  return json({ ok: true, testimonials: items });
}

export async function requestTestimonialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<RequestTestimonialInput>(req);
  if (!body || !body.prompt || !body.respondent) return badRequest("invalid_body");
  try {
    const tr = await build(ctx).testimonials.request(ctx.actor, body);
    return json({ ok: true, testimonial: tr }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "request_failed");
  }
}

export async function replyTestimonialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = await safeJson<ReplyTestimonialInput>(req);
  if (!body || !body.reply) return badRequest("invalid_body");
  try {
    const tr = await build(ctx).testimonials.reply(id, body);
    return json({ ok: true, testimonial: tr });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return notFound("not_found");
    if (e instanceof InvalidTestimonialTransitionError) return badRequest(e.message);
    return badRequest("reply_failed");
  }
}

export async function approveTestimonialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const tr = await build(ctx).testimonials.approve(ctx.actor, id);
    return json({ ok: true, testimonial: tr });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return notFound("not_found");
    if (e instanceof InvalidTestimonialTransitionError) return badRequest(e.message);
    return badRequest("approve_failed");
  }
}

export async function publicTestimonialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const tr = await build(ctx).testimonials.markPublic(ctx.actor, id);
    return json({ ok: true, testimonial: tr });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return notFound("not_found");
    if (e instanceof InvalidTestimonialTransitionError) return badRequest(e.message);
    return badRequest("public_failed");
  }
}

export async function deleteTestimonialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).testimonials.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return notFound("not_found");
    return badRequest("delete_failed");
  }
}
