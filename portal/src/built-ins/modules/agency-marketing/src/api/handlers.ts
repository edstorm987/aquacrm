// HTTP handlers for the agency-marketing plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CampaignFilter,
  CreateCampaignInput,
  CreateLeadInput,
  CreateTemplateInput,
  Currency,
  LeadFilter,
  TemplateFilter,
  UpdateCampaignPatch,
  UpdateLeadPatch,
  UpdateTemplatePatch,
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

const defaultCurrency = (ctx: PluginCtx): Currency =>
  (ctx.install.config.defaultCurrency as Currency | undefined) ?? "usd";

// ─── Campaigns ───────────────────────────────────────────────────────────

export async function listCampaignsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: CampaignFilter = {
    status: (url.searchParams.get("status") ?? undefined) as CampaignFilter["status"],
    channel: (url.searchParams.get("channel") ?? undefined) as CampaignFilter["channel"],
    query: url.searchParams.get("q") ?? undefined,
  };
  return json({ ok: true, campaigns: await buildContainer(ctx).campaigns.list(filter) });
}

export async function createCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateCampaignInput>(req);
  if (!body || !body.name || !body.channel) {
    return badRequest("name + channel required.");
  }
  try {
    const cmp = await buildContainer(ctx).campaigns.create(body, ctx.actor, defaultCurrency(ctx));
    return json({ ok: true, campaign: cmp }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateCampaignPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const cmp = await buildContainer(ctx).campaigns.update(body.id, body.patch ?? {}, ctx.actor);
    return cmp ? json({ ok: true, campaign: cmp }) : notFound("campaign not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  try {
    const ok = await buildContainer(ctx).campaigns.delete(id, ctx.actor);
    return ok ? json({ ok: true }) : notFound("campaign not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Leads ───────────────────────────────────────────────────────────────

export async function listLeadsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: LeadFilter = {
    status: (url.searchParams.get("status") ?? undefined) as LeadFilter["status"],
    campaignId: url.searchParams.get("campaignId") ?? undefined,
    assignedStaffId: url.searchParams.get("staffId") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
  };
  return json({ ok: true, leads: await buildContainer(ctx).leads.list(filter) });
}

export async function createLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateLeadInput>(req);
  if (!body?.email) return badRequest("email required.");
  try {
    const lead = await buildContainer(ctx).leads.create(body, ctx.actor);
    return json({ ok: true, lead }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateLeadPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const lead = await buildContainer(ctx).leads.update(body.id, body.patch ?? {}, ctx.actor);
    return lead ? json({ ok: true, lead }) : notFound("lead not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function contactLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; note: string }>(req);
  if (!body?.id || !body.note) return badRequest("id + note required.");
  const lead = await buildContainer(ctx).leads.recordContact(body.id, body.note, ctx.actor);
  return lead ? json({ ok: true, lead }) : notFound("lead not found");
}

// ─── Templates ───────────────────────────────────────────────────────────

export async function listTemplatesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: TemplateFilter = {
    category: (url.searchParams.get("category") ?? undefined) as TemplateFilter["category"],
    status: (url.searchParams.get("status") ?? undefined) as TemplateFilter["status"],
  };
  return json({ ok: true, templates: await buildContainer(ctx).templates.list(filter) });
}

export async function createTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateTemplateInput>(req);
  if (!body?.name || !body.subject || !body.bodyHtml || !body.category) {
    return badRequest("name + subject + bodyHtml + category required.");
  }
  try {
    const tpl = await buildContainer(ctx).templates.create(body, ctx.actor);
    return json({ ok: true, template: tpl }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateTemplatePatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const tpl = await buildContainer(ctx).templates.update(body.id, body.patch ?? {}, ctx.actor);
    return tpl ? json({ ok: true, template: tpl }) : notFound("template not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Reports ─────────────────────────────────────────────────────────────

export async function reportCampaignsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from") ?? 0);
  const to = Number(url.searchParams.get("to") ?? Date.now());
  const snapshot = await buildContainer(ctx).reports.campaignSnapshot({ from, to });
  return json({ ok: true, snapshot });
}

export async function reportLeadsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from") ?? 0);
  const to = Number(url.searchParams.get("to") ?? Date.now());
  const funnel = await buildContainer(ctx).reports.leadFunnel({ from, to });
  return json({ ok: true, funnel });
}
