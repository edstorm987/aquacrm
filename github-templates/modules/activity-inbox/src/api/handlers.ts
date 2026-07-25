// HTTP handlers for the Activity Inbox plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import type { ActivityCategory } from "../lib/tenancy";
import { containerFor } from "../server/foundationAdapter";
import type { DateRangePreset, InboxFilter } from "../lib/domain";
import { ALL_CATEGORIES } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

function build(ctx: PluginCtx) {
  return containerFor({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId,
    storage: ctx.storage,
    install: ctx.install,
  });
}

const VALID_CATS = new Set<string>(ALL_CATEGORIES as readonly string[]);
const VALID_RANGES = new Set<string>(["today", "week", "month", "all", "custom"]);

function parseFilter(url: URL): InboxFilter {
  const cats = url.searchParams.getAll("category").filter(c => VALID_CATS.has(c)) as ActivityCategory[];
  const clients = url.searchParams.getAll("clientId").filter(Boolean);
  const rangeRaw = url.searchParams.get("range") ?? undefined;
  const range = (rangeRaw && VALID_RANGES.has(rangeRaw) ? rangeRaw : undefined) as DateRangePreset | undefined;
  const rangeStartRaw = url.searchParams.get("rangeStart");
  const rangeEndRaw = url.searchParams.get("rangeEnd");
  const limitRaw = url.searchParams.get("limit");
  const filter: InboxFilter = {
    categories: cats.length ? cats : undefined,
    clientIds: clients.length ? clients : undefined,
    range,
    rangeStart: rangeStartRaw ? Number(rangeStartRaw) : undefined,
    rangeEnd: rangeEndRaw ? Number(rangeEndRaw) : undefined,
    unreadOnly: url.searchParams.get("unread") === "1",
    query: url.searchParams.get("q") ?? undefined,
    limit: limitRaw ? Number(limitRaw) : undefined,
  };
  return filter;
}

export async function listInboxHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const filter = parseFilter(url);
  const result = await build(ctx).inbox.list(ctx.actor, filter);
  return json({ ok: true, ...result });
}

export async function unreadCountHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const c = build(ctx);
  const url = new URL(req.url);
  const scanRaw = url.searchParams.get("scan");
  const scan = scanRaw ? Math.max(1, Math.min(5_000, Number(scanRaw) || 500)) : undefined;
  const count = await c.inbox.unreadCount(ctx.actor, scan);
  return json({ ok: true, unreadCount: count });
}

export async function markReadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = (await safeJson<{ ts?: number }>(req)) ?? {};
  const ts = typeof body.ts === "number" && body.ts > 0 ? body.ts : undefined;
  const state = await build(ctx).inbox.markAllRead(ctx.actor, ts);
  return json({ ok: true, state });
}

export async function getReadStateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const state = await build(ctx).inbox.getReadState(ctx.actor);
  return json({ ok: true, state });
}

export async function saveFiltersHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<InboxFilter>(req);
  if (!body || typeof body !== "object") return badRequest("invalid_body");
  await build(ctx).inbox.setFilters(ctx.actor, body);
  return json({ ok: true });
}

export async function getFiltersHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const filter = await build(ctx).inbox.getFilters(ctx.actor);
  return json({ ok: true, filter });
}
