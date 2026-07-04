// Smoke — R047 form submission host route + webhook dispatch wiring.

import {
  handleFormSubmit,
  handleListFormWebhookLog,
  readFormWebhookLog,
} from "../api/handlers/formSubmissionHost";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import { createSite } from "../server/sites";
import { createPage, updatePage, publishPage } from "../server/pages";
import { WEBHOOK_TARGET_TYPE, SIGNATURE_HEADER } from "../lib/webhookBlock";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

const AGENCY = "ag_t3";
const CLIENT = "cl_t3";

interface CtxLike {
  agencyId: string;
  clientId?: string;
  actor: string;
  storage: PluginStorage;
  services: Record<string, unknown>;
  install: { config: Record<string, unknown> };
  fetchImpl?: typeof fetch;
}

function makeCtx(): CtxLike {
  return {
    agencyId: AGENCY,
    clientId: CLIENT,
    actor: "u",
    storage: memStorage(),
    services: {},
    install: { config: {} },
  };
}

async function pageWithBlocks(storage: PluginStorage, siteId: string, blocks: any[]) {
  const p = await createPage(storage, {
    agencyId: AGENCY, clientId: CLIENT, siteId, slug: "/contact", title: "C",
  });
  await updatePage(storage, AGENCY, CLIENT, siteId, p.id, { blocks } as any);
  await publishPage(storage, AGENCY, CLIENT, siteId, p.id);
  return p;
}

async function postSubmit(ctx: CtxLike, body: unknown): Promise<Response> {
  return handleFormSubmit(
    new Request("https://example.com/api/portal/website-editor/forms/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx as any,
  );
}

(async () => {
  console.log("§ Form submission");

  // ─── A: scope guard + invalid input ──────────────────────────────────
  {
    const ctx = makeCtx();
    ctx.clientId = undefined;
    const r = await postSubmit(ctx, { pageId: "x", formBlockId: "y", payload: {} });
    expect("missing clientId → 400", r.status === 400);
  }
  {
    const ctx = makeCtx();
    const r = await postSubmit(ctx, { pageId: "p", formBlockId: "f" });
    expect("missing payload → 400", r.status === 400);
  }
  {
    const ctx = makeCtx();
    const r = await postSubmit(ctx, { pageId: "ghost", formBlockId: "f", payload: {} });
    expect("unknown page → 404", r.status === 404);
  }

  // ─── B: internal storage path ────────────────────────────────────────
  {
    const ctx = makeCtx();
    const site = await createSite(ctx.storage, {
      agencyId: AGENCY, clientId: CLIENT, name: "S", slug: "s",
    });
    const page = await pageWithBlocks(ctx.storage, site.id, [
      { id: "form1", type: "form", props: {} },
    ]);
    const r = await postSubmit(ctx, {
      pageId: page.id, formBlockId: "form1", payload: { name: "Ed" },
    });
    expect("internal: 200", r.status === 200);
    const body = await r.json() as any;
    expect("internal: kind=internal + id stamped",
      body.kind === "internal" && typeof body.id === "string");
    const log = await readFormWebhookLog(ctx.storage, AGENCY, CLIENT);
    expect("internal: log entry recorded",
      log.length === 1 && log[0]!.outcome === "internal");
  }

  // ─── C: webhook path with signing ────────────────────────────────────
  {
    const ctx = makeCtx();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as unknown as typeof fetch;
    // Inject fetch by monkey-patching globalThis temporarily — the
    // dispatcher uses globalThis.fetch when no override is supplied.
    const origFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      const site = await createSite(ctx.storage, {
        agencyId: AGENCY, clientId: CLIENT, name: "S2", slug: "s2",
      });
      const page = await pageWithBlocks(ctx.storage, site.id, [
        {
          id: "wh1", type: WEBHOOK_TARGET_TYPE,
          props: {
            url: "https://hooks.example/x",
            signingSecret: "secret",
            label: "Zapier",
          },
        },
        { id: "form1", type: "form", props: {} },
      ]);
      const r = await postSubmit(ctx, {
        pageId: page.id, formBlockId: "form1",
        submitTo: { kind: "webhook", id: "wh1" },
        payload: { email: "test@example.com" },
      });
      expect("webhook: 200", r.status === 200);
      const body = await r.json() as any;
      expect("webhook: kind=webhook + ok=true",
        body.kind === "webhook" && body.ok === true && body.status === 200);
      expect("webhook: outbound URL invoked",
        calls.length === 1 && calls[0]!.url === "https://hooks.example/x");
      const headers = calls[0]!.init.headers as any;
      expect("webhook: HMAC signature header present",
        typeof headers[SIGNATURE_HEADER] === "string" &&
        (headers[SIGNATURE_HEADER] as string).startsWith("sha256="));
      const log = await readFormWebhookLog(ctx.storage, AGENCY, CLIENT);
      expect("webhook: log entry outcome=webhook-ok",
        log.length === 1 && log[0]!.outcome === "webhook-ok" && log[0]!.status === 200);
    } finally { globalThis.fetch = origFetch; }
  }

  // ─── D: missing-target falls back to internal ────────────────────────
  {
    const ctx = makeCtx();
    const site = await createSite(ctx.storage, {
      agencyId: AGENCY, clientId: CLIENT, name: "S3", slug: "s3",
    });
    const page = await pageWithBlocks(ctx.storage, site.id, [
      { id: "form1", type: "form", props: {} },
    ]);
    const r = await postSubmit(ctx, {
      pageId: page.id, formBlockId: "form1",
      submitTo: { kind: "webhook", id: "ghost-target" },
      payload: { hi: "yes" },
    });
    expect("missing-target: 200 (fallback OK)", r.status === 200);
    const body = await r.json() as any;
    expect("missing-target: fallback flag + internal id",
      body.kind === "internal" &&
      body.fallback === true &&
      typeof body.id === "string");
    const log = await readFormWebhookLog(ctx.storage, AGENCY, CLIENT);
    expect("missing-target: log outcome=webhook-missing",
      log.length === 1 && log[0]!.outcome === "webhook-missing");
  }

  // ─── E: webhook 5xx → fallback internal copy persisted ──────────────
  {
    const ctx = makeCtx();
    const fakeFetch = ((): Promise<Response> =>
      Promise.resolve(new Response("err", { status: 503 }))) as unknown as typeof fetch;
    const origFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      const site = await createSite(ctx.storage, {
        agencyId: AGENCY, clientId: CLIENT, name: "S4", slug: "s4",
      });
      const page = await pageWithBlocks(ctx.storage, site.id, [
        { id: "wh1", type: WEBHOOK_TARGET_TYPE,
          props: { url: "https://hooks.example/y" } },
        { id: "form1", type: "form", props: {} },
      ]);
      const r = await postSubmit(ctx, {
        pageId: page.id, formBlockId: "form1",
        submitTo: { kind: "webhook", id: "wh1" },
        payload: { x: 1 },
      });
      expect("webhook 5xx: 200 still returned (operator-side concern)",
        r.status === 200);
      const body = await r.json() as any;
      expect("webhook 5xx: ok=false + status preserved + fallbackInternalId",
        body.kind === "webhook" && body.ok === false &&
        body.status === 503 &&
        typeof body.fallbackInternalId === "string");
      const log = await readFormWebhookLog(ctx.storage, AGENCY, CLIENT);
      expect("webhook 5xx: log outcome=webhook-failed + status=503",
        log.length === 1 && log[0]!.outcome === "webhook-failed" && log[0]!.status === 503);
    } finally { globalThis.fetch = origFetch; }
  }

  // ─── F: log listing endpoint ─────────────────────────────────────────
  {
    const ctx = makeCtx();
    // Pre-populate the log.
    const site = await createSite(ctx.storage, {
      agencyId: AGENCY, clientId: CLIENT, name: "S5", slug: "s5",
    });
    const page = await pageWithBlocks(ctx.storage, site.id, [
      { id: "form1", type: "form", props: {} },
    ]);
    await postSubmit(ctx, { pageId: page.id, formBlockId: "form1", payload: {} });
    await postSubmit(ctx, { pageId: page.id, formBlockId: "form1", payload: {} });
    const r = await handleListFormWebhookLog(
      new Request("https://x/api/portal/website-editor/forms/webhook-log"),
      ctx as any,
    );
    expect("log endpoint 200", r.status === 200);
    const body = await r.json() as any;
    expect("log endpoint returns 2 entries (newest first)",
      body.entries.length === 2);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
