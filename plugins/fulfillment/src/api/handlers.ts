// API handlers — pure request/response functions invoked by the manifest's
// `api` routes. Each handler receives a fresh `PluginCtx` that the
// foundation builds per request, carrying scope (agencyId/clientId), the
// install record, the actor user id, plugin storage, and the dependency-
// injected services container.
//
// Convention: every handler returns a `Response` (Web Fetch API) and never
// throws to the caller. Errors become 4xx/5xx JSON responses with a
// shape the clients can reliably parse.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { buildFulfillmentContainer, type FulfillmentContainer } from "../server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function badRequest(message: string): Response {
  return json({ ok: false, error: message }, 400);
}

function notFound(message: string): Response {
  return json({ ok: false, error: message }, 404);
}

function serverError(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  return json({ ok: false, error: message }, 500);
}

function requireMethod(req: Request, expected: string): Response | null {
  if (req.method !== expected) {
    return new Response(JSON.stringify({ ok: false, error: `Use ${expected}` }), {
      status: 405,
      headers: { "content-type": "application/json", allow: expected },
    });
  }
  return null;
}

function container(ctx: PluginCtx): FulfillmentContainer {
  return buildFulfillmentContainer({
    clients: ctx.services.clients,
    pluginInstalls: ctx.services.pluginInstalls,
    pluginRuntime: ctx.services.pluginRuntime,
    registry: ctx.services.registry,
    phases: ctx.services.phases,
    activity: ctx.services.activity,
    events: ctx.services.events,
    variants: ctx.services.variants,
    storage: ctx.storage,
  });
}

async function safeJson<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// ─── Clients ───────────────────────────────────────────────────────────────

export async function listClientsHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const clients = await ctx.services.clients.listClients(ctx.agencyId);
    return json({ ok: true, clients });
  } catch (err) {
    return serverError(err);
  }
}

export interface CreateClientBody {
  name: string;
  slug?: string;
  ownerEmail?: string;
  websiteUrl?: string;
  stage: string;                  // ClientStage
  brand?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function createClientHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateClientBody>(req);
  if (!body || typeof body.name !== "string" || typeof body.stage !== "string") {
    return badRequest("name + stage are required.");
  }
  try {
    const c = container(ctx);
    const result = await c.clientLifecycleService.createWithPhase({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      name: body.name,
      slug: body.slug,
      ownerEmail: body.ownerEmail,
      websiteUrl: body.websiteUrl,
      stage: body.stage as never,
      brand: body.brand as never,
      metadata: body.metadata,
    });
    return json({ ok: true, ...result }, 201);
  } catch (err) {
    return serverError(err);
  }
}

// ─── Phase board / advance ─────────────────────────────────────────────────

export interface AdvancePhaseBody {
  clientId: string;
  fromPhaseId: string;
  toPhaseId: string;
}

export async function advancePhaseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "POST");
  if (guard) return guard;
  const body = await safeJson<AdvancePhaseBody>(req);
  if (
    !body ||
    typeof body.clientId !== "string" ||
    typeof body.fromPhaseId !== "string" ||
    typeof body.toPhaseId !== "string"
  ) {
    return badRequest("clientId + fromPhaseId + toPhaseId required.");
  }
  try {
    const c = container(ctx);
    const fromPhase = await c.phaseService.getPhase(body.fromPhaseId);
    const toPhase = await c.phaseService.getPhase(body.toPhaseId);
    if (!fromPhase || !toPhase) return notFound("Phase not found.");
    if (fromPhase.agencyId !== ctx.agencyId || toPhase.agencyId !== ctx.agencyId) {
      return badRequest("Phase definitions don't belong to this agency.");
    }
    const client = await ctx.services.clients.getClientForAgency(ctx.agencyId, body.clientId);
    if (!client) return notFound("Client not found.");
    const result = await c.transitionService.advancePhase({
      agencyId: ctx.agencyId,
      clientId: body.clientId,
      fromPhase,
      toPhase,
      actor: ctx.actor,
    });
    return json(result, result.ok ? 200 : 422);
  } catch (err) {
    return serverError(err);
  }
}

// ─── Checklist ─────────────────────────────────────────────────────────────

export interface TickItemBody {
  clientId: string;
  phaseId: string;
  itemId: string;
  done: boolean;
  notes?: string;
}

export async function tickItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "POST");
  if (guard) return guard;
  const body = await safeJson<TickItemBody>(req);
  if (
    !body ||
    typeof body.clientId !== "string" ||
    typeof body.phaseId !== "string" ||
    typeof body.itemId !== "string" ||
    typeof body.done !== "boolean"
  ) {
    return badRequest("clientId + phaseId + itemId + done required.");
  }
  try {
    const c = container(ctx);
    const phase = await c.phaseService.getPhase(body.phaseId);
    if (!phase || phase.agencyId !== ctx.agencyId) return notFound("Phase not found.");
    const client = await ctx.services.clients.getClientForAgency(ctx.agencyId, body.clientId);
    if (!client) return notFound("Client not found.");
    const progress = await c.checklistService.tickItem({
      agencyId: ctx.agencyId,
      clientId: body.clientId,
      phase,
      itemId: body.itemId,
      done: body.done,
      actor: ctx.actor,
      notes: body.notes,
    });
    return json({ ok: true, progress });
  } catch (err) {
    return serverError(err);
  }
}

export async function getChecklistHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const phaseId = url.searchParams.get("phaseId");
  if (!clientId || !phaseId) return badRequest("clientId + phaseId required.");
  try {
    const c = container(ctx);
    const phase = await c.phaseService.getPhase(phaseId);
    if (!phase || phase.agencyId !== ctx.agencyId) return notFound("Phase not found.");
    const view = await c.checklistService.viewFor({
      agencyId: ctx.agencyId,
      clientId,
      phase,
    });
    return json({ ok: true, view });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Phases CRUD (settings page) ──────────────────────────────────────────

export async function listPhasesHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const phases = await ctx.services.phases.listPhasesForAgency(ctx.agencyId);
    return json({ ok: true, phases });
  } catch (err) {
    return serverError(err);
  }
}

export interface UpsertPhaseBody {
  id?: string;
  stage: string;
  label: string;
  description?: string;
  order: number;
  pluginPreset: string[];
  portalVariantId?: string;
  checklist: { id?: string; label: string; visibility: "internal" | "client" }[];
}

export async function upsertPhaseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "POST");
  if (guard) return guard;
  const body = await safeJson<UpsertPhaseBody>(req);
  if (
    !body ||
    typeof body.stage !== "string" ||
    typeof body.label !== "string" ||
    typeof body.order !== "number" ||
    !Array.isArray(body.pluginPreset) ||
    !Array.isArray(body.checklist)
  ) {
    return badRequest("stage + label + order + pluginPreset + checklist required.");
  }
  try {
    const c = container(ctx);
    const checklist = body.checklist.map(item =>
      item.id
        ? { id: item.id, label: item.label, visibility: item.visibility }
        : c.phaseService.buildChecklistItem(item.label, item.visibility),
    );
    const phase = await c.phaseService.upsert({
      id: body.id,
      agencyId: ctx.agencyId,
      stage: body.stage as never,
      label: body.label,
      description: body.description,
      order: body.order,
      pluginPreset: body.pluginPreset,
      portalVariantId: body.portalVariantId,
      checklist,
    });
    return json({ ok: true, phase });
  } catch (err) {
    return serverError(err);
  }
}

export async function deletePhaseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "DELETE");
  if (guard) return guard;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  try {
    const c = container(ctx);
    const phase = await c.phaseService.getPhase(id);
    if (!phase || phase.agencyId !== ctx.agencyId) return notFound("Phase not found.");
    const removed = await c.phaseService.deletePhase(id);
    return json({ ok: removed });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Marketplace ───────────────────────────────────────────────────────────

export async function marketplaceListHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return badRequest("clientId required.");
  try {
    const client = await ctx.services.clients.getClientForAgency(ctx.agencyId, clientId);
    if (!client) return notFound("Client not found.");
    const c = container(ctx);
    const result = await c.marketplaceService.listForClient({
      agencyId: ctx.agencyId,
      clientId,
      filter: {
        q: url.searchParams.get("q") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      },
    });
    return json({ ok: true, ...result });
  } catch (err) {
    return serverError(err);
  }
}

export interface MarketplaceMutationBody {
  clientId: string;
  pluginId: string;
  enabled?: boolean;              // for enable/disable
  setupAnswers?: Record<string, string>;
}

export async function marketplaceInstallHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "POST");
  if (guard) return guard;
  const body = await safeJson<MarketplaceMutationBody>(req);
  if (!body || typeof body.clientId !== "string" || typeof body.pluginId !== "string") {
    return badRequest("clientId + pluginId required.");
  }
  try {
    const client = await ctx.services.clients.getClientForAgency(ctx.agencyId, body.clientId);
    if (!client) return notFound("Client not found.");
    const c = container(ctx);
    const result = await c.marketplaceService.installForClient({
      agencyId: ctx.agencyId,
      clientId: body.clientId,
      pluginId: body.pluginId,
      actor: ctx.actor,
      setupAnswers: body.setupAnswers,
    });
    return json(result, result.ok ? 201 : 422);
  } catch (err) {
    return serverError(err);
  }
}

export async function marketplaceSetEnabledHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "POST");
  if (guard) return guard;
  const body = await safeJson<MarketplaceMutationBody>(req);
  if (
    !body ||
    typeof body.clientId !== "string" ||
    typeof body.pluginId !== "string" ||
    typeof body.enabled !== "boolean"
  ) {
    return badRequest("clientId + pluginId + enabled required.");
  }
  try {
    const client = await ctx.services.clients.getClientForAgency(ctx.agencyId, body.clientId);
    if (!client) return notFound("Client not found.");
    const c = container(ctx);
    const result = await c.marketplaceService.setEnabledForClient({
      agencyId: ctx.agencyId,
      clientId: body.clientId,
      pluginId: body.pluginId,
      enabled: body.enabled,
      actor: ctx.actor,
    });
    return json(result, result.ok ? 200 : 422);
  } catch (err) {
    return serverError(err);
  }
}

export async function marketplaceUninstallHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = requireMethod(req, "POST");
  if (guard) return guard;
  const body = await safeJson<MarketplaceMutationBody>(req);
  if (!body || typeof body.clientId !== "string" || typeof body.pluginId !== "string") {
    return badRequest("clientId + pluginId required.");
  }
  try {
    const client = await ctx.services.clients.getClientForAgency(ctx.agencyId, body.clientId);
    if (!client) return notFound("Client not found.");
    const c = container(ctx);
    const result = await c.marketplaceService.uninstallForClient({
      agencyId: ctx.agencyId,
      clientId: body.clientId,
      pluginId: body.pluginId,
      actor: ctx.actor,
    });
    return json(result, result.ok ? 200 : 422);
  } catch (err) {
    return serverError(err);
  }
}

// ─── Activity ──────────────────────────────────────────────────────────────

export async function listActivityHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "50");
  try {
    const entries = await ctx.services.activity.listActivity({
      agencyId: ctx.agencyId,
      clientId,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return json({ ok: true, entries });
  } catch (err) {
    return serverError(err);
  }
}

// ─── Phase preset descriptors (for new-client wizard tooltip) ─────────────

export async function listPhasePresetsHandler(_req: Request, ctx: PluginCtx): Promise<Response> {
  try {
    const c = container(ctx);
    const presets = c.phaseService.describePresets();
    return json({ ok: true, presets });
  } catch (err) {
    return serverError(err);
  }
}
