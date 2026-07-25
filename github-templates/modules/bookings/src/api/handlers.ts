import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { BookingConflictError, BookingNotFoundError } from "../server/bookings";
import type {
  BookingStatus,
  CreateBookingInput,
  CreateServiceInput,
  UpdateServicePatch,
} from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const conflict = (m: string): Response => json({ ok: false, error: m }, 409);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

function build(ctx: PluginCtx) {
  if (!ctx.clientId) throw new Error("bookings: client-scoped");
  return containerFor({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId,
    storage: ctx.storage,
    install: ctx.install,
  });
}

export async function listServicesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("inactive") === "1";
  const services = await build(ctx).bookings.listServices(includeInactive);
  return json({ ok: true, services });
}

export async function createServiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateServiceInput>(req);
  if (!body || !body.label || !body.durationMin) return badRequest("invalid_body");
  try {
    const svc = await build(ctx).bookings.createService(ctx.actor, body);
    return json({ ok: true, service: svc }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateServiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateServicePatch>(req)) ?? {};
  try {
    const svc = await build(ctx).bookings.updateService(ctx.actor, id, body);
    return json({ ok: true, service: svc });
  } catch (e) {
    if (e instanceof BookingNotFoundError) return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}

export async function archiveServiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).bookings.archiveService(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof BookingNotFoundError) return notFound("not_found");
    return badRequest("archive_failed");
  }
}

export async function getAvailabilityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const a = await build(ctx).bookings.getAvailability();
  return json({ ok: true, availability: a });
}

export async function setAvailabilityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const body = await safeJson<{ weekdayPattern?: never; exceptions?: string[] }>(req);
  if (!body || typeof body !== "object") return badRequest("invalid_body");
  try {
    const a = await build(ctx).bookings.setAvailability(body as never);
    return json({ ok: true, availability: a });
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "set_failed");
  }
}

export async function slotsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  const startRaw = url.searchParams.get("from");
  const endRaw = url.searchParams.get("to");
  if (!serviceId || !startRaw || !endRaw) return badRequest("serviceId_from_to_required");
  const startAt = Number(startRaw);
  const endAt = Number(endRaw);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return badRequest("invalid_window");
  try {
    const slots = await build(ctx).bookings.generateSlots(serviceId, startAt, endAt);
    return json({ ok: true, slots });
  } catch (e) {
    if (e instanceof BookingNotFoundError) return notFound("service_not_found");
    return badRequest(e instanceof Error ? e.message : "slots_failed");
  }
}

export async function listBookingsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const filter = {
    serviceId: url.searchParams.get("serviceId") ?? undefined,
    status: (url.searchParams.get("status") ?? undefined) as BookingStatus | undefined,
    windowStart: url.searchParams.get("from") ? Number(url.searchParams.get("from")) : undefined,
    windowEnd: url.searchParams.get("to") ? Number(url.searchParams.get("to")) : undefined,
  };
  const bookings = await build(ctx).bookings.listBookings(filter);
  return json({ ok: true, bookings });
}

export async function createBookingHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateBookingInput>(req);
  if (!body || !body.serviceId || !body.startAt || !body.endCustomerEmail || !body.endCustomerName) {
    return badRequest("invalid_body");
  }
  try {
    const result = await build(ctx).bookings.createBooking(body);
    return json({ ok: true, ...result }, result.deduped ? 200 : 201);
  } catch (e) {
    if (e instanceof BookingConflictError) return conflict(e.message);
    if (e instanceof BookingNotFoundError) return notFound(e.message);
    return badRequest(e instanceof Error ? e.message : "booking_failed");
  }
}

export async function transitionBookingHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const status = url.searchParams.get("status") as BookingStatus | null;
  if (!id || !status) return badRequest("id_status_required");
  try {
    const b = await build(ctx).bookings.transition(ctx.actor, id, status);
    return json({ ok: true, booking: b });
  } catch (e) {
    if (e instanceof BookingNotFoundError) return notFound(e.message);
    return badRequest(e instanceof Error ? e.message : "transition_failed");
  }
}
