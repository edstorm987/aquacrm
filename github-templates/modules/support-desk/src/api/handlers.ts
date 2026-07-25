import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  HoneypotTriggeredError,
  InvalidStatusTransitionError,
  TicketNotFoundError,
} from "../server/service";
import type {
  CreateTicketInput,
  TicketFilter,
  TicketPriority,
  TicketStatus,
  UpdateTicketPatch,
} from "../lib/domain";
import { HONEYPOT_FIELD, TICKET_PRIORITIES, TICKET_STATUSES, looksLikeBot } from "../lib/domain";

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
  if (!ctx.clientId) throw new Error("support-desk: clientId required (scopePolicy=client)");
  return containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });
}

export async function listHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const priorityRaw = url.searchParams.get("priority");
  const status = statusRaw && (TICKET_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as TicketStatus) : undefined;
  const priority = priorityRaw && (TICKET_PRIORITIES as readonly string[]).includes(priorityRaw) ? (priorityRaw as TicketPriority) : undefined;
  const filter: TicketFilter = {
    status, priority,
    tag: url.searchParams.get("tag") ?? undefined,
    assignedTo: url.searchParams.get("assignedTo") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
    unassigned: url.searchParams.get("unassigned") === "1",
  };
  const items = await build(ctx).tickets.list(filter);
  return json({ ok: true, items });
}

export async function getHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const t = await build(ctx).tickets.get(id);
  if (!t) return notFound("not_found");
  return json({ ok: true, ticket: t });
}

// Storefront create (public). Honeypot-protected. Accepts JSON or
// urlencoded form; bot submissions silently 200 with `ok:true` so
// scrapers can't tell their submission was rejected.
export async function publicCreateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  let values: Record<string, string> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await safeJson<Record<string, string>>(req);
    if (!body) return badRequest("invalid_body");
    values = body;
  } else {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) values[k] = String(v);
  }
  if (looksLikeBot(values)) {
    // Silent 200 — return ok=true with a synthetic id so spam loops
    // don't get a useful signal. Don't actually create.
    return json({ ok: true, ticket: { ref: "T-0000" } });
  }
  const subject = values.subject ?? "";
  const body = values.body ?? values.message ?? "";
  const customerEmail = values.email ?? values.customerEmail ?? "";
  const tagsCsv = values.tags ?? "";
  const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];
  const input: CreateTicketInput = {
    subject, body, customerEmail,
    customerName: values.name ?? values.customerName,
    tags,
  };
  try {
    const t = await build(ctx).tickets.create(input);
    return json({ ok: true, ref: t.ref, id: t.id }, 201);
  } catch (e) {
    if (e instanceof HoneypotTriggeredError) return json({ ok: true, ticket: { ref: "T-0000" } });
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateTicketPatch>(req)) ?? {};
  try {
    const t = await build(ctx).tickets.update(ctx.actor, id, body);
    return json({ ok: true, ticket: t });
  } catch (e) {
    if (e instanceof TicketNotFoundError) return notFound("not_found");
    if (e instanceof InvalidStatusTransitionError) return conflict(`invalid_transition:${e.from}->${e.to}`);
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}

export async function replyHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = await safeJson<{ body?: string; fromKind?: "customer" | "agent" }>(req);
  if (!body || !body.body) return badRequest("invalid_body");
  const fromKind = body.fromKind === "customer" ? "customer" : "agent";
  try {
    const t = await build(ctx).tickets.reply(
      { fromKind, userId: fromKind === "agent" ? ctx.actor : undefined },
      id, body.body,
    );
    return json({ ok: true, ticket: t });
  } catch (e) {
    if (e instanceof TicketNotFoundError) return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "reply_failed");
  }
}

// Diagnostic — exposes the honeypot field name so the storefront
// renderer can wire the correct hidden input.
export async function honeypotHandler(req: Request, _ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  return json({ ok: true, field: HONEYPOT_FIELD });
}
