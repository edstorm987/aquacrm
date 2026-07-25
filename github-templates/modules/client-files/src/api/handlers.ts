import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { FilePayloadTooLargeError, FileNotFoundError } from "../server/files";
import type { FileCategory, UploadInput } from "../lib/domain";
import { FILE_CATEGORIES } from "../lib/domain";

const AGENCY_ROLES = new Set([
  "agency-owner", "agency-manager", "agency-staff", "freelancer",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const tooLarge = (size: number): Response => json({ ok: false, error: "payload_too_large", sizeBytes: size }, 413);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

function build(ctx: PluginCtx) {
  if (!ctx.clientId) throw new Error("client-files: client-scoped");
  return containerFor({
    agencyId: ctx.agencyId, clientId: ctx.clientId,
    storage: ctx.storage, install: ctx.install,
  });
}

function actorFor(ctx: PluginCtx): { userId: string; isAgency: boolean } {
  const role = (ctx.install?.config?.role as string | undefined) ?? "agency-owner";
  return { userId: ctx.actor, isAgency: AGENCY_ROLES.has(role) };
}

export async function listFilesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const validCat = category && (FILE_CATEGORIES as readonly string[]).includes(category)
    ? (category as FileCategory) : undefined;
  const files = await build(ctx).files.list(actorFor(ctx), {
    category: validCat,
    query: url.searchParams.get("q") ?? undefined,
  });
  return json({ ok: true, files });
}

export async function uploadFileHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<UploadInput>(req);
  if (!body || !body.name || !body.category || !body.mimeType) return badRequest("invalid_body");
  if (!(FILE_CATEGORIES as readonly string[]).includes(body.category)) return badRequest("invalid_category");
  if (body.body === undefined && !body.external) return badRequest("body_or_external_required");
  try {
    const file = await build(ctx).files.upload(ctx.actor, body);
    return json({ ok: true, file }, 201);
  } catch (e) {
    if (e instanceof FilePayloadTooLargeError) return tooLarge(e.sizeBytes);
    return badRequest(e instanceof Error ? e.message : "upload_failed");
  }
}

export async function getFileHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const file = await build(ctx).files.getWithBody(actorFor(ctx), id);
  if (!file) return notFound("not_found");
  return json({ ok: true, file });
}

export async function deleteFileHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).files.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof FileNotFoundError) return notFound("not_found");
    return badRequest("delete_failed");
  }
}

export async function shareLinkHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const action = url.searchParams.get("action") ?? "issue";
  const c = build(ctx);
  try {
    if (action === "revoke") {
      const meta = await c.files.revokeShareLink(ctx.actor, id);
      return json({ ok: true, file: meta });
    }
    const result = await c.files.setShareLink(ctx.actor, id);
    return json({ ok: true, token: result.token, file: result.meta }, 201);
  } catch (e) {
    if (e instanceof FileNotFoundError) return notFound("not_found");
    return badRequest("share_link_failed");
  }
}
