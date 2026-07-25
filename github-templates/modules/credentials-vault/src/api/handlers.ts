import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { VaultAccessError, VaultRateLimitError } from "../server/vault";
import type {
  CreateCredentialInput,
  CredentialFilter,
  CredentialType,
  UpdateCredentialPatch,
} from "../lib/domain";
import { CREDENTIAL_TYPES } from "../lib/domain";

const ADMIN_ROLES = new Set(["agency-owner", "agency-manager"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const forbidden = (m: string): Response => json({ ok: false, error: m }, 403);
const tooMany = (m: string, retryAfterMs: number): Response =>
  new Response(JSON.stringify({ ok: false, error: m, retryAfterMs }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(Math.ceil(retryAfterMs / 1000)),
    },
  });
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

function build(ctx: PluginCtx) {
  // Per-request admin resolution from the actor's role on `ctx`. The
  // runtime currently passes the Role into ctx via ctx.install /
  // session bridging; for v1 we accept the install.config.role hint or
  // default to admin (agency layout already gates on agency roles).
  const role = (ctx.install?.config?.role as string | undefined) ?? "agency-owner";
  const isAdminFn = (_actor: string): boolean => ADMIN_ROLES.has(role);
  return containerFor({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId,
    storage: ctx.storage,
    install: ctx.install,
    isAdmin: isAdminFn,
  });
}

function parseType(v: string | null): CredentialType | undefined {
  if (!v) return undefined;
  return (CREDENTIAL_TYPES as readonly string[]).includes(v) ? (v as CredentialType) : undefined;
}

export async function listCredentialsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const filter: CredentialFilter = {
    type: parseType(url.searchParams.get("type")),
    query: url.searchParams.get("q") ?? undefined,
    includeArchived: url.searchParams.get("archived") === "1",
  };
  const cidParam = url.searchParams.get("clientId");
  if (cidParam === "_agency") filter.clientId = null;
  else if (cidParam) filter.clientId = cidParam;
  const items = await build(ctx).vault.list(ctx.actor, filter);
  return json({ ok: true, credentials: items });
}

export async function getCredentialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const item = await build(ctx).vault.get(ctx.actor, id);
    if (!item) return notFound("not_found");
    return json({ ok: true, credential: item });
  } catch (e) {
    if (e instanceof VaultAccessError) return forbidden("forbidden");
    throw e;
  }
}

export async function createCredentialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateCredentialInput>(req);
  if (!body || !body.label || !body.type) return badRequest("invalid_body");
  if (!(CREDENTIAL_TYPES as readonly string[]).includes(body.type)) return badRequest("invalid_type");
  const item = await build(ctx).vault.create(ctx.actor, body);
  return json({ ok: true, credential: item }, 201);
}

export async function updateCredentialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateCredentialPatch>(req)) ?? {};
  try {
    const item = await build(ctx).vault.update(ctx.actor, id, body);
    return json({ ok: true, credential: item });
  } catch (e) {
    if (e instanceof VaultAccessError) return forbidden("forbidden");
    if (e instanceof Error && e.message === "vault: not found") return notFound("not_found");
    throw e;
  }
}

export async function archiveCredentialHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).vault.archive(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof VaultAccessError) return forbidden("forbidden");
    if (e instanceof Error && e.message === "vault: not found") return notFound("not_found");
    throw e;
  }
}

export async function viewPasswordHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const result = await build(ctx).vault.viewPassword(ctx.actor, id);
    return json({ ok: true, password: result.password });
  } catch (e) {
    if (e instanceof VaultRateLimitError) return tooMany("rate_limited", e.retryAfterMs);
    if (e instanceof VaultAccessError) return forbidden("forbidden");
    if (e instanceof Error && e.message === "vault: not found") return notFound("not_found");
    if (e instanceof Error && e.message === "vault: no secret stored") return badRequest("no_secret");
    throw e;
  }
}
