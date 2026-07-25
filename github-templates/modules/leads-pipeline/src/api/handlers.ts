// HTTP handlers for the leads-pipeline plugin.
//
// Mirrors the agency-hr convention: 200 on success with `{ ok: true,
// ...payload }`, 400 on validation, 404 on missing, 422 on business
// rule violation.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  AudienceFilter,
  CreateCampaignInput,
  CreateContactInput,
  CreateLeadInput,
  UpdateCampaignPatch,
  UpdateLeadPatch,
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

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, storage: ctx.storage });

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

// ─── Leads ───────────────────────────────────────────────────────────────

export async function listLeadsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const leads = await buildContainer(ctx).leads.list({
    query: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  });
  return json({ ok: true, leads });
}

export async function createLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<CreateLeadInput>(req);
  if (!body || !body.email || !body.source) {
    return badRequest("email + source required.");
  }
  try {
    const result = await buildContainer(ctx).leads.upsert(body, ctx.actor);
    return json({ ok: true, lead: result.lead, created: result.created }, result.created ? 201 : 200);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  const body = await safeJson<UpdateLeadPatch>(req);
  if (!body) return badRequest("body required.");
  const updated = await buildContainer(ctx).leads.update(id, body, ctx.actor);
  if (!updated) return notFound("lead_not_found");
  return json({ ok: true, lead: updated });
}

export async function archiveLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const ok = await buildContainer(ctx).leads.delete(body.id, ctx.actor);
  if (!ok) return notFound("lead_not_found");
  return json({ ok: true });
}

// ─── CSV import ──────────────────────────────────────────────────────────
//
// Accepts multipart `file` field OR a JSON `{text, filename?}` body.
// Multipart is the documented v1 path; JSON exists so smoke + e2e
// don't need to construct multipart bodies in tests.

export async function importCsvHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const contentType = req.headers.get("content-type") ?? "";
  let text: string | null = null;
  let filename: string | undefined;
  let defaultSource: string | undefined;
  let defaultTags: string[] | undefined;

  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        text = await file.text();
        filename = file.name;
      } else if (typeof file === "string") {
        text = file;
      }
      const ds = form.get("defaultSource");
      if (typeof ds === "string") defaultSource = ds;
      const dt = form.get("defaultTags");
      if (typeof dt === "string") defaultTags = dt.split(",").map(t => t.trim()).filter(Boolean);
    } catch (err) {
      return badRequest(`multipart parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    const body = await safeJson<{ text: string; filename?: string; defaultSource?: string; defaultTags?: string[] }>(req);
    if (!body?.text) return badRequest("text or multipart file required.");
    text = body.text;
    filename = body.filename;
    defaultSource = body.defaultSource;
    defaultTags = body.defaultTags;
  }
  if (!text) return badRequest("empty CSV body.");
  const result = await buildContainer(ctx).leads.importCsv({
    text,
    filename,
    actor: ctx.actor,
    defaultSource,
    defaultTags,
  });
  return json({ ok: true, ...result });
}

// ─── Contacts ────────────────────────────────────────────────────────────

export async function listContactsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const contacts = await buildContainer(ctx).contacts.list({
    query: url.searchParams.get("q") ?? undefined,
    type: (url.searchParams.get("type") ?? undefined) as "lead" | "customer" | "vendor" | undefined,
    tag: url.searchParams.get("tag") ?? undefined,
  });
  return json({ ok: true, contacts });
}

export async function createContactHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<CreateContactInput>(req);
  if (!body || !body.email || !body.type || !body.source) {
    return badRequest("email + type + source required.");
  }
  const result = await buildContainer(ctx).contacts.upsert(body, ctx.actor);
  return json({ ok: true, contact: result.contact, created: result.created }, result.created ? 201 : 200);
}

// ─── Campaigns ───────────────────────────────────────────────────────────

export async function listCampaignsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const campaigns = await buildContainer(ctx).campaigns.list();
  return json({ ok: true, campaigns });
}

export async function createCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<CreateCampaignInput>(req);
  if (!body || !body.name || !body.subject || !body.bodyHtml) {
    return badRequest("name + subject + bodyHtml required.");
  }
  if (!body.audienceFilter) {
    return badRequest("audienceFilter required (at minimum {}).");
  }
  try {
    const c = await buildContainer(ctx).campaigns.create(body, ctx.actor);
    return json({ ok: true, campaign: c }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  const body = await safeJson<UpdateCampaignPatch>(req);
  if (!body) return badRequest("body required.");
  try {
    const c = await buildContainer(ctx).campaigns.update(id, body, ctx.actor);
    if (!c) return notFound("campaign_not_found");
    return json({ ok: true, campaign: c });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function sendCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const c = await buildContainer(ctx).campaigns.send(body.id, ctx.actor);
    return json({ ok: true, campaign: c });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function previewAudienceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<AudienceFilter>(req);
  if (!body) return badRequest("audienceFilter body required.");
  const audience = await buildContainer(ctx).leads.resolveAudience(body);
  return json({ ok: true, count: audience.length, leads: audience });
}
