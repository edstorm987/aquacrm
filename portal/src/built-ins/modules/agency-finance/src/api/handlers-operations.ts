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
import { privateObjectLifecycleLockKey } from "@/lib/server/privateObjectLifecycle";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { legalDocumentAcceptsReferences } from "@/server/legalDocuments";

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

/**
 * A legal-document citation is a cross-model write: the Finance row and the
 * legal register must agree about whether the document still exists. The
 * legal purge path already owns this agency lifecycle lane. Keep the final
 * existence check and the complete Finance persistence inside that same lane
 * so neither a normal purge nor an explicit detach can slip between them.
 *
 * `work` must use the raw plugin storage passed by the mounted runtime. It must
 * not take this lifecycle lock again; `withPortalStateTransaction` is not
 * re-entrant, and nesting the same key would deadlock.
 */
async function withLegalDocumentReferenceTransaction<T>(
  ctx: PluginCtx,
  linkedLegalDocumentId: string | null | undefined,
  work: () => Promise<T>,
): Promise<{ accepted: true; value: T } | { accepted: false }> {
  return withPortalStateTransaction(privateObjectLifecycleLockKey(ctx.agencyId), async () => {
    if (linkedLegalDocumentId && !legalDocumentAcceptsReferences(ctx.agencyId, linkedLegalDocumentId)) {
      return { accepted: false };
    }
    return { accepted: true, value: await work() };
  });
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
      const saved = await withLegalDocumentReferenceTransaction(ctx, body.linkedLegalDocumentId, () =>
        service.createObligation(ctx.actor, body, defaultCurrency(ctx)));
      return saved.accepted
        ? json({ ok: true, obligation: saved.value }, 201)
        : json({ ok: false, error: "The linked legal document is unavailable or being deleted." }, 409);
    } catch (error) {
      return json({ ok: false, error: message(error, "Obligation could not be created.") }, 422);
    }
  }
  if (request.method === "PATCH") {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    const patch = await safeJson<UpdateFinanceObligationPatch>(request);
    if (!id || !patch) return json({ ok: false, error: "id and body required" }, 400);
    try {
      // Even when this patch does not mention the citation, updateObligation
      // reads and rewrites the whole row. Holding the lifecycle lane prevents
      // that stale snapshot from re-attaching an id a detach purge just cleared.
      const saved = await withLegalDocumentReferenceTransaction(ctx, patch.linkedLegalDocumentId, () =>
        service.updateObligation(ctx.actor, id, patch));
      if (!saved.accepted) {
        return json({ ok: false, error: "The linked legal document is unavailable or being deleted." }, 409);
      }
      const obligation = saved.value;
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
