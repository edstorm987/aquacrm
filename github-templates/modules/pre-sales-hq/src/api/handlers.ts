import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  InvalidProposalTransitionError,
  PreSalesNotFoundError,
} from "../server/services";
import type {
  CreateDiscoveryCallInput,
  CreateNurtureTouchInput,
  CreateProposalInput,
  ProposalStatus,
  UpdateDiscoveryCallPatch,
} from "../lib/domain";
import { PROPOSAL_STATUSES } from "../lib/domain";

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
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

// ─── Calls ────────────────────────────────────────────────────────

export async function listCallsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const calls = await build(ctx).calls.list({
    leadId: url.searchParams.get("leadId") ?? undefined,
  });
  return json({ ok: true, calls });
}

export async function scheduleCallHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateDiscoveryCallInput>(req);
  if (!body || !body.leadId || !body.scheduledAt) return badRequest("invalid_body");
  try {
    const call = await build(ctx).calls.schedule(ctx.actor, body);
    return json({ ok: true, call }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "schedule_failed");
  }
}

export async function updateCallHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateDiscoveryCallPatch>(req)) ?? {};
  try {
    const call = await build(ctx).calls.update(ctx.actor, id, body);
    return json({ ok: true, call });
  } catch (e) {
    if (e instanceof PreSalesNotFoundError) return notFound("not_found");
    return badRequest("update_failed");
  }
}

// ─── Proposals ────────────────────────────────────────────────────

export async function listProposalsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw && (PROPOSAL_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ProposalStatus) : undefined;
  const proposals = await build(ctx).proposals.list({
    leadId: url.searchParams.get("leadId") ?? undefined,
    status,
  });
  return json({ ok: true, proposals });
}

export async function createProposalHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateProposalInput>(req);
  if (!body || !body.leadId || body.amountCents === undefined) return badRequest("invalid_body");
  try {
    const p = await build(ctx).proposals.create(ctx.actor, body);
    return json({ ok: true, proposal: p }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function transitionProposalHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const status = url.searchParams.get("status") as ProposalStatus | null;
  if (!id || !status) return badRequest("id_status_required");
  const body = (await safeJson<{ notes?: string }>(req)) ?? {};
  try {
    const p = await build(ctx).proposals.transition(ctx.actor, id, status, body.notes);
    return json({ ok: true, proposal: p });
  } catch (e) {
    if (e instanceof PreSalesNotFoundError) return notFound("not_found");
    if (e instanceof InvalidProposalTransitionError) return badRequest(e.message);
    return badRequest("transition_failed");
  }
}

// ─── Nurture ──────────────────────────────────────────────────────

export async function listNurtureHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const touches = await build(ctx).nurture.list({
    leadId: url.searchParams.get("leadId") ?? undefined,
  });
  return json({ ok: true, touches });
}

export async function recordNurtureHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateNurtureTouchInput>(req);
  if (!body || !body.leadId || !body.type) return badRequest("invalid_body");
  try {
    const tp = await build(ctx).nurture.record(ctx.actor, body);
    return json({ ok: true, touch: tp }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "record_failed");
  }
}

export async function overdueNurtureHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("leadIds") ?? "";
  const leadIds = idsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const overdue = await build(ctx).nurture.overdue(leadIds);
  return json({ ok: true, overdue });
}
