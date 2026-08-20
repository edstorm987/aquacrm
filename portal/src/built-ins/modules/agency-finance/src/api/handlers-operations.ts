import type { PluginCtx } from "../lib/aquaPluginTypes";
import type {
  CreateCompensationPaymentInput,
  CreateCompensationProfileInput,
  CreateFinanceObligationInput,
  Currency,
  UpdateCompensationPaymentPatch,
  UpdateCompensationProfilePatch,
  UpdateFinanceObligationPatch,
} from "../lib/domain";
import { containerFor } from "../server/foundationAdapter";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function safeJson<T>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}

function operations(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install }).operations;
}

function defaultCurrency(ctx: PluginCtx): Currency {
  return resolveFinanceDefaultCurrency(ctx.agencyId, ctx.install.config.defaultCurrency);
}

export async function obligationsHandler(request: Request, ctx: PluginCtx): Promise<Response> {
  const service = operations(ctx);
  if (request.method === "GET") {
    return json({ ok: true, obligations: await service.listObligations(new URL(request.url).searchParams.get("archived") === "1") });
  }
  if (request.method === "POST") {
    const body = await safeJson<CreateFinanceObligationInput>(request);
    if (!body?.name?.trim() || !body.type) return json({ ok: false, error: "name and type required" }, 400);
    try {
      return json({ ok: true, obligation: await service.createObligation(ctx.actor, body, defaultCurrency(ctx)) }, 201);
    } catch (error) {
      return json({ ok: false, error: message(error, "Obligation could not be created.") }, 422);
    }
  }
  if (request.method === "PATCH") {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    const patch = await safeJson<UpdateFinanceObligationPatch>(request);
    if (!id || !patch) return json({ ok: false, error: "id and body required" }, 400);
    try {
      const obligation = await service.updateObligation(ctx.actor, id, patch);
      return obligation ? json({ ok: true, obligation }) : json({ ok: false, error: "Obligation not found." }, 404);
    } catch (error) {
      return json({ ok: false, error: message(error, "Obligation could not be updated.") }, 422);
    }
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

export async function compensationProfilesHandler(request: Request, ctx: PluginCtx): Promise<Response> {
  const service = operations(ctx);
  if (request.method === "GET") {
    return json({ ok: true, profiles: await service.listCompensationProfiles(new URL(request.url).searchParams.get("archived") === "1") });
  }
  if (request.method === "POST") {
    const body = await safeJson<CreateCompensationProfileInput>(request);
    if (!body?.name?.trim() || !body.payeeType || !body.rateBasis || body.baseRateCents === undefined) {
      return json({ ok: false, error: "name, payee type, rate basis and base rate required" }, 400);
    }
    try {
      return json({ ok: true, profile: await service.createCompensationProfile(ctx.actor, body, defaultCurrency(ctx)) }, 201);
    } catch (error) {
      return json({ ok: false, error: message(error, "Compensation profile could not be created.") }, 422);
    }
  }
  if (request.method === "PATCH") {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    const patch = await safeJson<UpdateCompensationProfilePatch>(request);
    if (!id || !patch) return json({ ok: false, error: "id and body required" }, 400);
    try {
      const profile = await service.updateCompensationProfile(ctx.actor, id, patch);
      return profile ? json({ ok: true, profile }) : json({ ok: false, error: "Compensation profile not found." }, 404);
    } catch (error) {
      return json({ ok: false, error: message(error, "Compensation profile could not be updated.") }, 422);
    }
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

export async function compensationPaymentsHandler(request: Request, ctx: PluginCtx): Promise<Response> {
  const service = operations(ctx);
  if (request.method === "GET") {
    return json({ ok: true, payments: await service.listCompensationPayments(new URL(request.url).searchParams.get("cancelled") === "1") });
  }
  if (request.method === "POST") {
    const body = await safeJson<CreateCompensationPaymentInput>(request);
    if (!body?.profileId || !body.kind || body.grossCents === undefined) return json({ ok: false, error: "profile, kind and amount required" }, 400);
    try {
      return json({ ok: true, payment: await service.createCompensationPayment(ctx.actor, body) }, 201);
    } catch (error) {
      return json({ ok: false, error: message(error, "Payment could not be recorded.") }, 422);
    }
  }
  if (request.method === "PATCH") {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    const patch = await safeJson<UpdateCompensationPaymentPatch>(request);
    if (!id || !patch) return json({ ok: false, error: "id and body required" }, 400);
    try {
      const payment = await service.updateCompensationPayment(ctx.actor, id, patch);
      return payment ? json({ ok: true, payment }) : json({ ok: false, error: "Payment not found." }, 404);
    } catch (error) {
      return json({ ok: false, error: message(error, "Payment could not be updated.") }, 422);
    }
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
