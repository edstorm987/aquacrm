import type { PluginCtx } from "../lib/aquaPluginTypes";
import type { CreateBudgetPotInput, Currency, UpdateBudgetPotPatch } from "../lib/domain";
import { containerFor } from "../server/foundationAdapter";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function safeJson<T>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}

function container(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

export async function listBudgetPotsHandler(request: Request, ctx: PluginCtx): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const includeClosed = new URL(request.url).searchParams.get("closed") === "1";
  return json({ ok: true, pots: await container(ctx).budgets.list(includeClosed) });
}

export async function createBudgetPotHandler(request: Request, ctx: PluginCtx): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<CreateBudgetPotInput>(request);
  if (!body?.name?.trim() || !body.purpose || body.allocatedCents === undefined) {
    return json({ ok: false, error: "name, purpose and allocated amount are required" }, 400);
  }
  try {
    const defaultCurrency = resolveFinanceDefaultCurrency(ctx.agencyId, ctx.install.config.defaultCurrency) as Currency;
    const pot = await container(ctx).budgets.create(ctx.actor, body, defaultCurrency);
    return json({ ok: true, pot }, 201);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Budget pot could not be created." }, 422);
  }
}

export async function updateBudgetPotHandler(request: Request, ctx: PluginCtx): Promise<Response> {
  if (request.method !== "PATCH") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return json({ ok: false, error: "id required" }, 400);
  const patch = await safeJson<UpdateBudgetPotPatch>(request);
  if (!patch) return json({ ok: false, error: "body required" }, 400);
  try {
    const pot = await container(ctx).budgets.update(ctx.actor, id, patch);
    return pot ? json({ ok: true, pot }) : json({ ok: false, error: "Budget pot not found." }, 404);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Budget pot could not be updated." }, 422);
  }
}
