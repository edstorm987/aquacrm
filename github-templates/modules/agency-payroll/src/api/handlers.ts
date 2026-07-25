import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  PayrollClosedError,
  PayrollNotFoundError,
} from "../server/service";
import type {
  CreateContractorInput,
  CreatePayPeriodInput,
  CreatePayslipInput,
  PayslipFilter,
  PayeeKind,
  UpdateContractorPatch,
  UpdatePayslipPatch,
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
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

// --- periods ---
export async function listPeriodsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const items = await build(ctx).periods.list();
  return json({ ok: true, items });
}
export async function openPeriodHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreatePayPeriodInput>(req);
  if (!body || typeof body.year !== "number" || typeof body.month !== "number") {
    return badRequest("invalid_body");
  }
  try {
    const p = await build(ctx).periods.open(ctx.actor, body);
    return json({ ok: true, period: p }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "open_failed");
  }
}
export async function closePeriodHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const p = await build(ctx).periods.close(ctx.actor, id);
    return json({ ok: true, period: p });
  } catch (e) {
    if (e instanceof PayrollNotFoundError) return notFound("not_found");
    return badRequest("close_failed");
  }
}

// --- payslips ---
export async function listPayslipsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind");
  const kind = (kindRaw === "employee" || kindRaw === "contractor") ? (kindRaw as PayeeKind) : undefined;
  const filter: PayslipFilter = {
    periodId: url.searchParams.get("periodId") ?? undefined,
    payeeKind: kind,
    payeeId: url.searchParams.get("payeeId") ?? undefined,
    paidOnly: url.searchParams.get("paid") === "1",
    unpaidOnly: url.searchParams.get("unpaid") === "1",
  };
  const items = await build(ctx).payslips.list(filter);
  return json({ ok: true, items });
}
export async function createPayslipHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreatePayslipInput>(req);
  if (!body || !body.periodId || !body.payeeId || !body.payeeName || !body.payeeKind) {
    return badRequest("invalid_body");
  }
  try {
    const p = await build(ctx).payslips.create(ctx.actor, body);
    return json({ ok: true, payslip: p }, 201);
  } catch (e) {
    if (e instanceof PayrollClosedError) return conflict("period_closed");
    if (e instanceof PayrollNotFoundError) return notFound("period_not_found");
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}
export async function updatePayslipHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdatePayslipPatch>(req)) ?? {};
  try {
    const p = await build(ctx).payslips.update(ctx.actor, id, body);
    return json({ ok: true, payslip: p });
  } catch (e) {
    if (e instanceof PayrollNotFoundError) return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}
export async function markPaidHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const p = await build(ctx).payslips.markPaid(ctx.actor, id);
    return json({ ok: true, payslip: p });
  } catch (e) {
    if (e instanceof PayrollNotFoundError) return notFound("not_found");
    return badRequest("mark_paid_failed");
  }
}
export async function deletePayslipHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).payslips.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof PayrollNotFoundError) return notFound("not_found");
    return badRequest("delete_failed");
  }
}

// --- contractors ---
export async function listContractorsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "1";
  const items = await build(ctx).contractors.list({ includeArchived });
  return json({ ok: true, items });
}
export async function createContractorHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateContractorInput>(req);
  if (!body || !body.name) return badRequest("invalid_body");
  try {
    const c = await build(ctx).contractors.create(ctx.actor, body);
    return json({ ok: true, contractor: c }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}
export async function updateContractorHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateContractorPatch>(req)) ?? {};
  try {
    const c = await build(ctx).contractors.update(ctx.actor, id, body);
    return json({ ok: true, contractor: c });
  } catch (e) {
    if (e instanceof PayrollNotFoundError) return notFound("not_found");
    return badRequest("update_failed");
  }
}

// --- reports ---
export async function totalsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const periodId = url.searchParams.get("periodId");
  if (!periodId) return badRequest("periodId_required");
  const totals = await build(ctx).reports.totalsForPeriod(periodId);
  return json({ ok: true, totals });
}
