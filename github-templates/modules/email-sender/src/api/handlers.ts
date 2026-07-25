// HTTP handlers for the email-sender plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CreateIdentityInput,
  EnqueueInput,
  MessageFilter,
  UpdateIdentityPatch,
  UpdateProviderInput,
} from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const unprocessable = (m: string): Response => json({ ok: false, error: m }, 422);
function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });

// ─── Messages (admin) ────────────────────────────────────────────────────

export async function listMessagesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: MessageFilter = {
    status: (url.searchParams.get("status") ?? undefined) as MessageFilter["status"],
    triggeredByPlugin: url.searchParams.get("triggeredByPlugin") ?? undefined,
  };
  return json({ ok: true, messages: await buildContainer(ctx).emails.list(filter) });
}

export async function getMessageHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const message = await buildContainer(ctx).emails.get(id);
  return message ? json({ ok: true, message }) : notFound("message not found");
}

export async function retryMessageHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const c = buildContainer(ctx);
  const result = await c.delivery.retry(body.id);
  return json(result, result.ok ? 200 : 422);
}

// ─── Identities (admin) ──────────────────────────────────────────────────

export async function listIdentitiesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, identities: await buildContainer(ctx).identities.list() });
}

export async function createIdentityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateIdentityInput>(req);
  if (!body || !body.name || !body.email) return badRequest("name + email required.");
  try {
    const identity = await buildContainer(ctx).identities.create(body, ctx.actor);
    return json({ ok: true, identity }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateIdentityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateIdentityPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  const out = await buildContainer(ctx).identities.update(body.id, body.patch ?? {}, ctx.actor);
  return out ? json({ ok: true, identity: out }) : notFound("identity not found");
}

export async function verifyIdentityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const out = await buildContainer(ctx).identities.verifyDomain(body.id, ctx.actor);
  return out ? json({ ok: true, identity: out }) : notFound("identity not found");
}

// ─── Provider config (admin) ─────────────────────────────────────────────

export async function getProviderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, provider: await buildContainer(ctx).provider.get() });
}

export async function updateProviderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<UpdateProviderInput>(req);
  if (!body) return badRequest("body required.");
  try {
    const out = await buildContainer(ctx).provider.update(body, ctx.actor);
    return json({ ok: true, provider: out });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Test send (admin) ───────────────────────────────────────────────────

export async function testSendHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ to: string }>(req);
  if (!body?.to) return badRequest("to required.");
  const c = buildContainer(ctx);
  try {
    const message = await c.emails.enqueue({
      to: body.to,
      subject: "Aqua portal — test email",
      bodyText: "This is a test email from the Aqua portal email-sender plugin. If you got this, your provider config is working.",
      triggeredByPlugin: "email-sender",
      externalRef: `test:${Date.now()}`,
    }, ctx.actor);
    const result = await c.delivery.deliver(message.id);
    return json({ ...result, messageId: message.id });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Webhook (public, no auth — provider signs) ──────────────────────────

export async function postmarkWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const rawBody = await req.text();
  const url = new URL(req.url);
  // Postmark sends the webhook secret as `?secret=...`.
  const signatureHeader = url.searchParams.get("secret")
    ?? req.headers.get("x-postmark-secret")
    ?? "";
  const result = await buildContainer(ctx).webhook.handle({ rawBody, signatureHeader });
  return json(result, result.ok ? 200 : 400);
}

// ─── Internal enqueue (plugin-to-plugin via foundation routing) ──────────

export async function internalEnqueueHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<EnqueueInput>(req);
  if (!body?.to) return badRequest("to required.");
  try {
    const message = await buildContainer(ctx).emails.enqueue(body, ctx.actor);
    return json({ ok: true, message }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}
