// AI builder smoke. Mock-LLM path (no network):
//   1. Generate with mocked raw response → BlockTree validates + persists.
//   2. Invalid block triggers retry on the fallback model.
//   3. Cache-hit metric increments when usage.cacheReadInputTokens > 0.

import { test } from "node:test";
import assert from "node:assert/strict";

import { GenerationService, type GenerationServiceDeps } from "../server/generationService";
import type { PluginStorage } from "../lib/aquaPluginTypes";

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

function deps(over: Partial<GenerationServiceDeps> = {}): GenerationServiceDeps {
  return {
    agencyId: "ag_smoke" as GenerationServiceDeps["agencyId"],
    actor: "u_smoke" as GenerationServiceDeps["actor"],
    storage: memStorage(),
    config: {
      anthropicApiKey: "sk-fake",
      defaultModel: "claude-haiku-4-5-20251001",
      fallbackModel: "claude-sonnet-4-6",
      cacheSystemPrompt: true,
      maxTokens: 1024,
    },
    ...over,
  };
}

const VALID_TREE = JSON.stringify([
  {
    id: "s1",
    type: "section",
    props: { fullWidth: true },
    children: [
      { id: "h1", type: "heading", props: { text: "Hello", level: 1 } },
      { id: "b1", type: "button", props: { label: "Go", href: "#" } },
    ],
  },
]);

test("generate: mocked raw response → completed + persisted", async () => {
  const d = deps();
  const svc = new GenerationService(d);
  const out = await svc.generate({
    prompt: "a hero with a heading and a button",
    fakeRawResponse: VALID_TREE,
    fakeUsage: { inputTokens: 100, outputTokens: 50 },
  });
  assert.equal(out.status, "completed", `unexpected status ${out.status}: ${out.validationError ?? ""}`);
  assert.ok(Array.isArray(out.blockTree));
  assert.equal(out.blockTree!.length, 1);
  assert.equal(out.blockTree![0]!.type, "section");

  const persisted = await svc.get(out.id);
  assert.ok(persisted, "record persisted");
  assert.equal(persisted!.id, out.id);

  const list = await svc.list();
  assert.equal(list.length, 1);
});

test("generate: invalid block → rejected then retried on fallback model", async () => {
  const d = deps();
  const svc = new GenerationService(d);
  // Patch the service's runOnce indirectly by feeding a bad first response —
  // the service's retry path replays runOnce with the fallback model. The
  // fakeRawResponse on input applies to BOTH attempts (smoke harness limit),
  // so we exercise retry by giving a response that's invalid on attempt 1
  // and passes on attempt 2 via a model-aware mock.
  let attempt = 0;
  const original = (svc as unknown as { runOnce: Function }).runOnce.bind(svc);
  (svc as unknown as { runOnce: Function }).runOnce = async function patched(
    record: { modelId: string; retryCount?: number },
    input: { fakeRawResponse?: string },
    model: string,
    extraHint: string | undefined,
  ) {
    attempt++;
    const fake = attempt === 1 ? `[{"type":"unknown-block-xyz"}]` : VALID_TREE;
    return original(record, { ...input, fakeRawResponse: fake }, model, extraHint);
  };

  const out = await svc.generate({ prompt: "anything" });
  assert.equal(attempt, 2, "retried exactly once on invalid block");
  assert.equal(out.status, "completed");
  assert.equal(out.modelId, "claude-sonnet-4-6", "retry used fallback model");
  assert.equal(out.retryCount, 1);
});

// ─── R8: streaming ──────────────────────────────────────────────────────────

function sseStreamFromAnthropicChunks(chunks: string[]): ReadableStream<Uint8Array> {
  // Mock Anthropic SSE: emit message_start, then a content_block_delta
  // per chunk, then message_delta + message_stop. Produces one or more
  // SSE frames that streamMessage() must parse.
  const enc = new TextEncoder();
  const frames: string[] = [];
  frames.push(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_smoke", model: "claude-haiku-4-5-20251001", usage: { input_tokens: 50, cache_read_input_tokens: 0 } } })}\n\n`);
  for (const c of chunks) {
    frames.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: c } })}\n\n`);
  }
  frames.push(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 30 } })}\n\n`);
  frames.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);

  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f));
      c.close();
    },
  });
}

function mockStreamFetch(chunks: string[]): typeof fetch {
  const responder = async () => new Response(sseStreamFromAnthropicChunks(chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  return responder as unknown as typeof fetch;
}

test("R8 stream: deltas accumulate + final tree validates + persists", async () => {
  const d = deps();
  const svc = new GenerationService(d);
  // Slice the valid tree into 4 chunks to simulate streaming.
  const c1 = VALID_TREE.slice(0, 20);
  const c2 = VALID_TREE.slice(20, 60);
  const c3 = VALID_TREE.slice(60, 110);
  const c4 = VALID_TREE.slice(110);
  const seenDeltas: string[] = [];
  const out = await svc.generateStream({
    prompt: "stream a hero",
    fetchImpl: mockStreamFetch([c1, c2, c3, c4]),
    onDelta: (chunk) => seenDeltas.push(chunk),
  });
  assert.equal(seenDeltas.length, 4, "received 4 delta callbacks");
  assert.equal(seenDeltas.join(""), VALID_TREE, "deltas concatenate to full text");
  assert.equal(out.status, "completed", `unexpected status ${out.status}: ${out.validationError ?? ""}`);
  assert.ok(Array.isArray(out.blockTree));
  assert.equal(out.blockTree![0]!.type, "section");
  const persisted = await svc.get(out.id);
  assert.ok(persisted, "stream record persisted");
});

test("R8 stream handler: SSE response emits delta + complete + DONE frames", async () => {
  // Hit the HTTP handler directly with a mocked Anthropic upstream.
  const { generateStreamHandler } = await import("../api/handlers");
  const installConfig = {
    anthropicApiKey: "sk-fake",
    defaultModel: "claude-haiku-4-5-20251001",
    fallbackModel: "claude-sonnet-4-6",
    cacheSystemPrompt: true,
    maxTokens: 1024,
  };
  const storage = memStorage();
  const ctx = {
    agencyId: "ag_smoke",
    actor: "u_smoke",
    install: { config: installConfig },
    storage,
    services: {} as Record<string, unknown>,
  } as unknown as Parameters<typeof generateStreamHandler>[1];

  // Patch global fetch for the duration of this test.
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockStreamFetch([VALID_TREE.slice(0, 50), VALID_TREE.slice(50)]);
  try {
    const req = new Request("http://x/generate/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "stream me" }),
    });
    const res = await generateStreamHandler(req, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const text = await res.text();
    assert.ok(text.includes(`"type":"delta"`), "emitted at least one delta frame");
    assert.ok(text.includes(`"type":"complete"`), "emitted complete frame");
    assert.ok(text.includes("[DONE]"), "ended with [DONE] sentinel");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ─── R9: image-gen + ceilings ───────────────────────────────────────────────

test("R9 image: stub provider returns picsum URLs + bumps usage", async () => {
  const { ImageService, stubImageProvider } = await import("../server/imageService");
  const d = deps();
  const svc = new ImageService({
    agencyId: d.agencyId,
    actor: d.actor,
    storage: d.storage,
    config: { ...d.config, monthlyImageCeiling: 10 },
  });
  const out = await svc.generate({ prompt: "ocean sunset", size: "1024x768", count: 2, providerOverride: stubImageProvider });
  assert.equal(out.length, 2);
  assert.ok(out[0]!.url.startsWith("https://picsum.photos/seed/"), `unexpected URL ${out[0]!.url}`);
  assert.equal(out[0]!.width, 1024);
  assert.equal(out[0]!.height, 768);
  const u = await svc.usageThisMonth();
  assert.equal(u.images, 2, "image counter bumped by 2");
});

test("R9 image: ceiling-reached throws CeilingReachedError + reset is next month", async () => {
  const { ImageService, CeilingReachedError, stubImageProvider } = await import("../server/imageService");
  const d = deps();
  const svc = new ImageService({
    agencyId: d.agencyId,
    actor: d.actor,
    storage: d.storage,
    config: { ...d.config, monthlyImageCeiling: 2 },
  });
  await svc.generate({ prompt: "x", count: 2, providerOverride: stubImageProvider });
  let caught: unknown = null;
  try {
    await svc.generate({ prompt: "y", count: 1, providerOverride: stubImageProvider });
  } catch (e) { caught = e; }
  assert.ok(caught instanceof CeilingReachedError, "next call throws CeilingReachedError");
  assert.equal((caught as InstanceType<typeof CeilingReachedError>).kind, "images");
  // resetsOn should parse to a future ISO (next month UTC).
  const reset = new Date((caught as InstanceType<typeof CeilingReachedError>).resetsOn);
  assert.ok(reset.getTime() > Date.now(), "resetsOn is in the future");
});

test("R9 ceilings: token ceiling reached → generate returns rejected w/ ceiling-reached error", async () => {
  const d = deps();
  // Pre-seed usage for the current month at the ceiling.
  const { monthKeyForDate } = await import("../lib/domain");
  const monthKey = monthKeyForDate();
  await d.storage.set(`t/${d.agencyId}/_agency/ai-builder/metrics/usage/${monthKey}`, {
    monthKey, tokens: 10_000_000, images: 0,
  });
  const svc = new GenerationService({ ...d, config: { ...d.config, monthlyTokenCeiling: 10_000_000 } });
  const out = await svc.generate({ prompt: "x", fakeRawResponse: VALID_TREE });
  assert.equal(out.status, "rejected", `expected rejected, got ${out.status}`);
  assert.ok(out.validationError?.startsWith("ceiling-reached:"), `unexpected msg ${out.validationError}`);
});

// ─── R005: variations + inpaint ─────────────────────────────────────────────

test("R005 variations: stub returns 4 picsum URLs + bumps usage by 4", async () => {
  const { ImageService, stubImageProvider } = await import("../server/imageService");
  const d = deps();
  const svc = new ImageService({
    agencyId: d.agencyId,
    actor: d.actor,
    storage: d.storage,
    config: { ...d.config, monthlyImageCeiling: 50 },
  });
  const out = await svc.variations({
    sourceImageUrl: "https://example.com/source.jpg",
    providerOverride: stubImageProvider,
  });
  assert.equal(out.length, 4, "default count is 4");
  for (const v of out) {
    assert.ok(v.url.startsWith("https://picsum.photos/seed/"), `unexpected URL ${v.url}`);
  }
  const u = await svc.usageThisMonth();
  assert.equal(u.images, 4, "image counter bumped by 4");
});

test("R005 variations: ceiling-reached throws CeilingReachedError", async () => {
  const { ImageService, CeilingReachedError, stubImageProvider } = await import("../server/imageService");
  const d = deps();
  const svc = new ImageService({
    agencyId: d.agencyId,
    actor: d.actor,
    storage: d.storage,
    config: { ...d.config, monthlyImageCeiling: 3 },
  });
  let caught: unknown = null;
  try {
    await svc.variations({ sourceImageUrl: "https://x/s.jpg", count: 4, providerOverride: stubImageProvider });
  } catch (e) { caught = e; }
  assert.ok(caught instanceof CeilingReachedError, "over-ceiling throws");
  assert.equal((caught as InstanceType<typeof CeilingReachedError>).kind, "images");
});

test("R005 inpaint: stub returns sourceImageUrl unchanged with stub=true + bumps usage by 1", async () => {
  const { ImageService, stubImageProvider } = await import("../server/imageService");
  const d = deps();
  const svc = new ImageService({
    agencyId: d.agencyId,
    actor: d.actor,
    storage: d.storage,
    config: { ...d.config, monthlyImageCeiling: 5 },
  });
  const out = await svc.inpaint({
    sourceImageUrl: "https://example.com/keep-me.jpg",
    mask: "data:image/png;base64,iVBORw0KGgo=",
    prompt: "swap background to ocean",
    providerOverride: stubImageProvider,
  });
  assert.equal(out.url, "https://example.com/keep-me.jpg", "stub returns source unchanged");
  assert.equal(out.stub, true, "stub flag set");
  const u = await svc.usageThisMonth();
  assert.equal(u.images, 1, "image counter bumped by 1");
});

test("R005 inpaint: ceiling-reached throws CeilingReachedError", async () => {
  const { ImageService, CeilingReachedError, stubImageProvider } = await import("../server/imageService");
  const d = deps();
  const { monthKeyForDate } = await import("../lib/domain");
  const monthKey = monthKeyForDate();
  // Pre-seed usage at the ceiling.
  await d.storage.set(`t/${d.agencyId}/_agency/ai-builder/metrics/usage/${monthKey}`, {
    monthKey, tokens: 0, images: 5,
  });
  const svc = new ImageService({
    agencyId: d.agencyId,
    actor: d.actor,
    storage: d.storage,
    config: { ...d.config, monthlyImageCeiling: 5 },
  });
  let caught: unknown = null;
  try {
    await svc.inpaint({ sourceImageUrl: "x", mask: "y", prompt: "z", providerOverride: stubImageProvider });
  } catch (e) { caught = e; }
  assert.ok(caught instanceof CeilingReachedError, "at-ceiling throws");
});

test("R005 handlers: variations + inpaint route shape", async () => {
  const { imageVariationsHandler, imageInpaintHandler } = await import("../api/handlers");
  const installConfig = {
    anthropicApiKey: "sk-fake",
    defaultModel: "claude-haiku-4-5-20251001",
    fallbackModel: "claude-sonnet-4-6",
    cacheSystemPrompt: true,
    maxTokens: 1024,
    monthlyImageCeiling: 50,
  };
  const storage = memStorage();
  const ctx = {
    agencyId: "ag_smoke",
    actor: "u_smoke",
    install: { config: installConfig },
    storage,
    services: {} as Record<string, unknown>,
  } as unknown as Parameters<typeof imageVariationsHandler>[1];

  // Variations
  const vReq = new Request("http://x/image/variations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceImageUrl: "https://example.com/a.jpg", count: 4 }),
  });
  const vRes = await imageVariationsHandler(vReq, ctx);
  assert.equal(vRes.status, 200);
  const vBody = await vRes.json() as { ok: boolean; images: { url: string }[] };
  assert.equal(vBody.ok, true);
  assert.equal(vBody.images.length, 4);

  // Inpaint
  const iReq = new Request("http://x/image/inpaint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceImageUrl: "https://example.com/a.jpg", mask: "data:image/png;base64,AA==", prompt: "ocean" }),
  });
  const iRes = await imageInpaintHandler(iReq, ctx);
  assert.equal(iRes.status, 200);
  const iBody = await iRes.json() as { ok: boolean; image: { url: string; stub?: boolean } };
  assert.equal(iBody.ok, true);
  assert.equal(iBody.image.url, "https://example.com/a.jpg");
  assert.equal(iBody.image.stub, true);

  // Missing args → 400
  const bad = await imageInpaintHandler(new Request("http://x/image/inpaint", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  }), ctx);
  assert.equal(bad.status, 400);
});

test("R005 handlers: ceiling-reached → 429", async () => {
  const { imageVariationsHandler } = await import("../api/handlers");
  const installConfig = { monthlyImageCeiling: 1 };
  const storage = memStorage();
  const ctx = {
    agencyId: "ag_smoke",
    actor: "u_smoke",
    install: { config: installConfig },
    storage,
    services: {} as Record<string, unknown>,
  } as unknown as Parameters<typeof imageVariationsHandler>[1];

  const req = new Request("http://x/image/variations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceImageUrl: "https://example.com/a.jpg", count: 4 }),
  });
  const res = await imageVariationsHandler(req, ctx);
  assert.equal(res.status, 429);
  const body = await res.json() as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, "ceiling-reached");
});

test("metrics: cache-hit counter increments on cacheReadInputTokens > 0", async () => {
  const d = deps();
  const svc = new GenerationService(d);
  await svc.generate({
    prompt: "x",
    fakeRawResponse: VALID_TREE,
    fakeUsage: { inputTokens: 200, outputTokens: 50, cacheReadInputTokens: 1500 },
  });
  let m = await svc.metrics();
  assert.equal(m.cacheHits, 1);

  await svc.generate({
    prompt: "x",
    fakeRawResponse: VALID_TREE,
    fakeUsage: { inputTokens: 50, outputTokens: 25, cacheReadInputTokens: 1500 },
  });
  m = await svc.metrics();
  assert.equal(m.cacheHits, 2, "second cached call increments");

  await svc.generate({
    prompt: "y",
    fakeRawResponse: VALID_TREE,
    fakeUsage: { inputTokens: 200, outputTokens: 50 },
  });
  m = await svc.metrics();
  assert.equal(m.cacheHits, 2, "no-cache call doesn't bump");
});
