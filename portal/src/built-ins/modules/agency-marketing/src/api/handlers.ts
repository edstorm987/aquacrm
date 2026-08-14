// HTTP handlers for the agency-marketing plugin.

import crypto from "node:crypto";
import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CampaignFilter,
  CreateCampaignInput,
  CreateLeadInput,
  CreateTemplateInput,
  Currency,
  LeadFilter,
  MarketingAsset,
  MarketingAssetKind,
  MarketingAssetStatus,
  FunnelWorkspaceConfig,
  FunnelFormat,
  FunnelStepKind,
  CreateMarketingAssetInput,
  UpdateMarketingAssetPatch,
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

const MARKETING_ASSETS_KEY = "milesymedia/channel-assets/v1";
const MARKETING_ASSET_KINDS = new Set<MarketingAssetKind>(["social", "website", "funnel", "google-ads", "reputation"]);
const MARKETING_ASSET_STATUSES = new Set<MarketingAssetStatus>(["draft", "active", "paused", "complete", "archived"]);
const FUNNEL_FORMATS = new Set<FunnelFormat>(["one-page", "multi-step", "multi-page"]);
const FUNNEL_STEP_KINDS = new Set<FunnelStepKind>(["landing", "form", "booking", "checkout", "thank-you", "custom"]);

function cleanMarketingAssetInput(input: CreateMarketingAssetInput): Omit<MarketingAsset, "id" | "agencyId" | "createdAt" | "updatedAt"> | null {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  if (!name || !MARKETING_ASSET_KINDS.has(input.kind)) return null;
  const status = input.status && MARKETING_ASSET_STATUSES.has(input.status) ? input.status : "draft";
  const text = (value: unknown, max = 500) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const cleanFunnel = (value: FunnelWorkspaceConfig | undefined): FunnelWorkspaceConfig | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const format = FUNNEL_FORMATS.has(value.format) ? value.format : "one-page";
    const steps = Array.isArray(value.steps)
      ? value.steps.slice(0, 30).flatMap((step, index) => {
          if (!step || typeof step !== "object") return [];
          const stepName = text(step.name, 100);
          if (!stepName) return [];
          const kind = FUNNEL_STEP_KINDS.has(step.kind) ? step.kind : "custom";
          return [{
            id: text(step.id, 80) ?? "step_" + (index + 1),
            name: stepName,
            path: text(step.path, 240) ?? "/",
            kind,
            headline: text(step.headline, 240),
            ctaLabel: text(step.ctaLabel, 100),
          }];
        })
      : [];
    return {
      format,
      previewUrl: text(value.previewUrl, 500),
      productionUrl: text(value.productionUrl, 500),
      editorUrl: text(value.editorUrl, 500),
      repositoryUrl: text(value.repositoryUrl, 500),
      localPath: text(value.localPath, 500),
      developmentProjectId: text(value.developmentProjectId, 120),
      primaryGoal: text(value.primaryGoal, 300),
      primaryCta: text(value.primaryCta, 100),
      conversionEvent: text(value.conversionEvent, 120),
      telemetrySiteKey: text(value.telemetrySiteKey, 160),
      telemetryPropertyId: text(value.telemetryPropertyId, 160),
      audienceNiche: text(value.audienceNiche, 160),
      bookingDurationMinutes: typeof value.bookingDurationMinutes === "number" && Number.isFinite(value.bookingDurationMinutes)
        ? Math.min(480, Math.max(5, Math.round(value.bookingDurationMinutes)))
        : undefined,
      bookingCalendarUrl: text(value.bookingCalendarUrl, 500),
      bookingMeetingMode: text(value.bookingMeetingMode, 80),
      bookingConfirmation: text(value.bookingConfirmation, 500),
      steps,
    };
  };
  return {
    kind: input.kind,
    companyIds: Array.isArray(input.companyIds)
      ? Array.from(new Set(input.companyIds.filter((value): value is string => typeof value === "string").map(value => value.trim()).filter(Boolean))).slice(0, 30)
      : [],
    name,
    platform: text(input.platform, 80),
    url: text(input.url, 500),
    objective: text(input.objective, 300),
    owner: text(input.owner, 100),
    status,
    budgetCents: count(input.budgetCents),
    spendCents: count(input.spendCents),
    leads: count(input.leads),
    conversions: count(input.conversions),
    rating: typeof input.rating === "number" && Number.isFinite(input.rating)
      ? Math.min(5, Math.max(0, Math.round(input.rating * 10) / 10))
      : undefined,
    reviewCount: count(input.reviewCount),
    unansweredReviews: count(input.unansweredReviews),
    notes: text(input.notes, 2_000),
    funnel: input.kind === "funnel" ? cleanFunnel(input.funnel) : undefined,
  };
}

export async function listMarketingAssetsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const kind = new URL(req.url).searchParams.get("kind") as MarketingAssetKind | null;
  const rows = (await ctx.storage.get<MarketingAsset[]>(MARKETING_ASSETS_KEY)) ?? [];
  return json({
    ok: true,
    assets: rows
      .filter(row => !kind || row.kind === kind)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  });
}

export async function createMarketingAssetHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateMarketingAssetInput>(req);
  if (!body) return badRequest("marketing item required.");
  const input = cleanMarketingAssetInput(body);
  if (!input) return badRequest("name and a valid marketing area are required.");
  const now = Date.now();
  const row: MarketingAsset = {
    ...input,
    id: `mkt_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: ctx.agencyId,
    createdAt: now,
    updatedAt: now,
  };
  const rows = (await ctx.storage.get<MarketingAsset[]>(MARKETING_ASSETS_KEY)) ?? [];
  await ctx.storage.set(MARKETING_ASSETS_KEY, [row, ...rows]);
  return json({ ok: true, asset: row }, 201);
}

export async function updateMarketingAssetHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateMarketingAssetPatch }>(req);
  if (!body?.id || !body.patch) return badRequest("id and patch required.");
  const rows = (await ctx.storage.get<MarketingAsset[]>(MARKETING_ASSETS_KEY)) ?? [];
  const existing = rows.find(row => row.id === body.id && row.agencyId === ctx.agencyId);
  if (!existing) return notFound("marketing item not found");
  const input = cleanMarketingAssetInput({ ...existing, ...body.patch, kind: existing.kind });
  if (!input) return badRequest("name and a valid marketing area are required.");
  const updated: MarketingAsset = { ...existing, ...input, updatedAt: Date.now() };
  await ctx.storage.set(MARKETING_ASSETS_KEY, rows.map(row => row.id === updated.id ? updated : row));
  return json({ ok: true, asset: updated });
}

export async function deleteMarketingAssetHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const rows = (await ctx.storage.get<MarketingAsset[]>(MARKETING_ASSETS_KEY)) ?? [];
  if (!rows.some(row => row.id === id && row.agencyId === ctx.agencyId)) return notFound("marketing item not found");
  await ctx.storage.set(MARKETING_ASSETS_KEY, rows.filter(row => row.id !== id));
  return json({ ok: true });
}

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
