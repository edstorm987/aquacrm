// HTTP handlers for the portal-export plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { ExportOptions } from "../lib/domain";
import type { ClientId } from "../lib/tenancy";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });

// ─── Presets ─────────────────────────────────────────────────────────────

export async function listPresetsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, presets: buildContainer(ctx).presets.list() });
}

export async function getPresetHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const preset = buildContainer(ctx).presets.get(id);
  return preset ? json({ ok: true, preset }) : notFound("preset not found");
}

// ─── Plan + Export (admin) ───────────────────────────────────────────────

export async function planExportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ clientId: ClientId; options?: ExportOptions }>(req);
  if (!body?.clientId) return badRequest("clientId required.");
  const plan = await buildContainer(ctx).exports.plan(body.clientId, body.options ?? {});
  return plan ? json({ ok: true, plan }) : notFound("client not found");
}

export async function runExportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ clientId: ClientId; options?: ExportOptions }>(req);
  if (!body?.clientId) return badRequest("clientId required.");
  const record = await buildContainer(ctx).exports.export(body.clientId, body.options ?? {}, ctx.actor);
  return json({ ok: record.status === "ok", record }, record.status === "ok" ? 200 : 422);
}

// ─── State preview (admin) ───────────────────────────────────────────────

export async function getStateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return badRequest("clientId required.");
  const state = await buildContainer(ctx).exports.collect(clientId);
  return state ? json({ ok: true, state }) : notFound("client not found");
}

// ─── History (admin) ─────────────────────────────────────────────────────

export async function listHistoryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const clientId = new URL(req.url).searchParams.get("clientId") ?? undefined;
  return json({
    ok: true,
    records: await buildContainer(ctx).exports.listHistory(clientId ? { clientId } : undefined),
  });
}

export async function getHistoryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const record = await buildContainer(ctx).exports.getHistory(id);
  return record ? json({ ok: true, record }) : notFound("export record not found");
}

// ─── Stub: open PR (foundation-pending) ──────────────────────────────────
//
// Real PR-open is a foundation-pending integration (GitHub auth +
// branch create + PR template). v1 returns a Q-ASSUMED payload that
// the UI can display as "open PR manually".

export async function openPrStubHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ recordId: string }>(req);
  if (!body?.recordId) return badRequest("recordId required.");
  const record = await buildContainer(ctx).exports.getHistory(body.recordId);
  if (!record) return notFound("export record not found");
  return json({
    ok: true,
    stub: true,
    message: "PR-open is a foundation-pending integration. Manual flow: create a branch from the materialized changes, open a PR titled '" +
      `Export ${record.clientSlug}`.replace(/[`]/g, "") + "' against main.",
    record,
  });
}
