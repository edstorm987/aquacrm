// ai-builder API handlers. Round-7.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { buildContainer } from "../server/generationService";
import { buildImageContainer, CeilingReachedError } from "../server/imageService";
import { nextMonthResetIso } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function methodGuard(req: Request, allowed: string): Response | null {
  if (req.method === allowed) return null;
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return await req.json() as T; }
  catch { return null; }
}

// GET /status — light probe for the editor topbar's ✨ Generate
// button. `ready` is true only when the API key is configured;
// otherwise the button stays hidden so operators don't hit a 500.
export async function statusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const config = (ctx.install.config ?? {}) as { anthropicApiKey?: string };
  return json({ ok: true, ready: Boolean(config.anthropicApiKey) });
}

// POST /generate — body { prompt, contextHints?, modelOverride? }
export async function generateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ prompt: string; contextHints?: string; modelOverride?: string }>(req);
  if (!body?.prompt) return json({ ok: false, error: "prompt required" }, 400);
  const c = buildContainer(ctx);
  const result = await c.generations.generate({
    prompt: body.prompt,
    ...(body.contextHints ? { contextHints: body.contextHints } : {}),
    ...(body.modelOverride ? { modelOverride: body.modelOverride } : {}),
  });
  return json({ ok: true, generation: result });
}

// POST /generate/stream — SSE variant. Forwards each text delta as
// `data: {"type":"delta","text":"…"}` frames; ends with one
// `data: {"type":"complete","generation":<full record>}` frame and
// the standard `data: [DONE]` marker so EventSource-style clients
// terminate cleanly. Uses ReadableStream + TextEncoder.
export async function generateStreamHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ prompt: string; contextHints?: string; modelOverride?: string }>(req);
  if (!body?.prompt) return json({ ok: false, error: "prompt required" }, 400);

  const c = buildContainer(ctx);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const generation = await c.generations.generateStream({
          prompt: body.prompt,
          ...(body.contextHints ? { contextHints: body.contextHints } : {}),
          ...(body.modelOverride ? { modelOverride: body.modelOverride } : {}),
          signal: req.signal,
          onDelta: (chunk) => send({ type: "delta", text: chunk }),
        });
        send({ type: "complete", generation });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

// GET /generations — list recent generations.
export async function listGenerationsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
  const c = buildContainer(ctx);
  const rows = await c.generations.list(limit);
  return json({ ok: true, generations: rows });
}

// GET /generations/get?id=...
export async function getGenerationHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id required" }, 400);
  const c = buildContainer(ctx);
  const record = await c.generations.get(id);
  if (!record) return json({ ok: false, error: "not found" }, 404);
  return json({ ok: true, generation: record });
}

// POST /image — R9. body { prompt, size?, count? } → { ok, images? }.
// Over-ceiling returns { ok: false, error: "ceiling-reached", resetsOn }.
export async function imageHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ prompt: string; size?: string; count?: number }>(req);
  if (!body?.prompt) return json({ ok: false, error: "prompt required" }, 400);
  const c = buildImageContainer(ctx);
  try {
    const images = await c.images.generate({
      prompt: body.prompt,
      ...(body.size ? { size: body.size } : {}),
      ...(body.count ? { count: body.count } : {}),
    });
    return json({ ok: true, images });
  } catch (e) {
    if (e instanceof CeilingReachedError) {
      return json({ ok: false, error: "ceiling-reached", kind: e.kind, resetsOn: e.resetsOn }, 429);
    }
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// POST /image/variations — R005. body { sourceImageUrl, count?, strength? }.
export async function imageVariationsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ sourceImageUrl: string; count?: number; strength?: number }>(req);
  if (!body?.sourceImageUrl) return json({ ok: false, error: "sourceImageUrl required" }, 400);
  const c = buildImageContainer(ctx);
  try {
    const images = await c.images.variations({
      sourceImageUrl: body.sourceImageUrl,
      ...(body.count ? { count: body.count } : {}),
      ...(body.strength != null ? { strength: body.strength } : {}),
    });
    return json({ ok: true, images });
  } catch (e) {
    if (e instanceof CeilingReachedError) {
      return json({ ok: false, error: "ceiling-reached", kind: e.kind, resetsOn: e.resetsOn }, 429);
    }
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// POST /image/inpaint — R005. body { sourceImageUrl, mask, prompt }.
export async function imageInpaintHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ sourceImageUrl: string; mask: string; prompt: string }>(req);
  if (!body?.sourceImageUrl || !body?.mask || !body?.prompt) {
    return json({ ok: false, error: "sourceImageUrl, mask, prompt required" }, 400);
  }
  const c = buildImageContainer(ctx);
  try {
    const image = await c.images.inpaint({
      sourceImageUrl: body.sourceImageUrl,
      mask: body.mask,
      prompt: body.prompt,
    });
    return json({ ok: true, image });
  } catch (e) {
    if (e instanceof CeilingReachedError) {
      return json({ ok: false, error: "ceiling-reached", kind: e.kind, resetsOn: e.resetsOn }, 429);
    }
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// GET /usage — R9. This-month tokens + images + ceilings + reset date.
export async function usageHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const c = buildContainer(ctx);
  const cImg = buildImageContainer(ctx);
  const usage = await c.generations.usageThisMonth();
  const config = (ctx.install.config ?? {}) as { monthlyTokenCeiling?: number; monthlyImageCeiling?: number };
  // Coalesce — same data underneath, but guard against the rare race
  // where a parallel image bump landed between the two reads.
  const usageImg = await cImg.images.usageThisMonth();
  return json({
    ok: true,
    usage: {
      monthKey: usage.monthKey,
      tokens: usage.tokens,
      images: usageImg.images,
      tokenCeiling: config.monthlyTokenCeiling ?? 10_000_000,
      imageCeiling: config.monthlyImageCeiling ?? 200,
      resetsOn: nextMonthResetIso(),
    },
  });
}

// GET /metrics — running cache-hit + cost-cents totals.
export async function metricsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const c = buildContainer(ctx);
  return json({ ok: true, metrics: await c.generations.metrics() });
}

// GET /settings — returns the per-install config (with the API key
// masked) so the Settings page can render its current state.
export async function getSettingsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const config = (ctx.install.config ?? {}) as Record<string, unknown>;
  const apiKey = (config.anthropicApiKey as string | undefined) ?? "";
  const masked = apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : "";
  return json({
    ok: true,
    settings: {
      ...config,
      anthropicApiKey: masked,
      hasApiKey: apiKey.length > 0,
    },
  });
}

// POST /settings — updates the per-install config. Skips the API key
// when the body sends back the masked value (sentinel pattern).
export async function saveSettingsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<Record<string, unknown>>(req);
  if (!body) return json({ ok: false, error: "body required" }, 400);
  // Don't overwrite the API key when the payload sends the masked
  // placeholder back (it means the operator didn't change it).
  const next: Record<string, unknown> = { ...(ctx.install.config ?? {}) };
  for (const [k, v] of Object.entries(body)) {
    if (k === "anthropicApiKey" && typeof v === "string" && v.includes("…")) continue;
    if (k === "hasApiKey") continue;
    next[k] = v;
  }
  // Foundation pluginRuntime port shape isn't fully typed in this
  // plugin's vendored types — cast through unknown for the call. The
  // foundation broker accepts the standard updateInstallConfig payload.
  const runtime = ctx.services.pluginRuntime as unknown as {
    updateInstallConfig?(input: { agencyId: string; clientId?: string; pluginId: string; config: Record<string, unknown> }): Promise<void>;
  };
  if (runtime?.updateInstallConfig) {
    await runtime.updateInstallConfig({
      agencyId: ctx.agencyId,
      ...(ctx.clientId ? { clientId: ctx.clientId } : {}),
      pluginId: "ai-builder",
      config: next,
    });
  } else {
    // Fall back to direct storage write under a settings key if the
    // foundation runtime port isn't injected (rare).
    await ctx.storage.set(`t/${ctx.agencyId}/${ctx.clientId ?? "_agency"}/ai-builder/settings`, next);
  }
  return json({ ok: true });
}
