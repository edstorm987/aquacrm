import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { withRequestScope } from "./dev-console-request-scope";

import {
  handleVisitorBlogPosts,
  handleVisitorContact,
  handleListVisitorContacts,
  type VisitorContactSubmission,
} from "../src/built-ins/modules/website-editor/src/api/handlers/visitor";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import { createBlogPost } from "../src/built-ins/modules/website-editor/src/server/blog";
import { createPage, publishPage } from "../src/built-ins/modules/website-editor/src/server/pages";
import { createSite } from "../src/built-ins/modules/website-editor/src/server/sites";
import { parseVisitorContactReceipt } from "../src/built-ins/modules/website-editor/src/lib/visitorContactReceipt";
import {
  normaliseVisitorContactConsentStatement,
  visitorContactConsentDigest,
} from "../src/built-ins/modules/website-editor/src/lib/visitorContactConsent";

const AGENCY = "agency_public_visitors";
const CLIENT = "client_public_visitors";
const ORIGIN = "https://portal.example.test";
const CONSENT_STATEMENT = "I agree to a reply about this request.";
const CONSENT_STATEMENT_DIGEST =
  "sha256:86673868983e605a924bffa16549fdcc7d0727c33a77ddb0f3f23fdfcff13483";

function memoryStorage(exclusive = true): PluginStorage {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    ...(exclusive ? { async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); } } : {}),
  };
}

function context(storage = memoryStorage(), agencyId = AGENCY, clientId = CLIENT): PluginCtx {
  return {
    agencyId,
    clientId,
    actor: "anonymous",
    storage,
    services: {} as PluginCtx["services"],
    install: { id: `install_${agencyId}_${clientId}`, pluginId: "website-editor" } as PluginCtx["install"],
  };
}

async function fixture(ctx = context(), published = true) {
  const site = await createSite(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    name: "Visitor site",
    slug: "visitor-site",
  });
  const page = await createPage(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    siteId: site.id,
    title: "Contact",
    slug: "contact",
    blocks: [{
      id: "contact_block",
      type: "contact-form",
      props: {
        formName: "Website contact",
        consentLabel: CONSENT_STATEMENT,
        consentVersion: 3,
      },
    }],
  });
  if (published) await publishPage(ctx.storage, ctx.agencyId, ctx.clientId!, site.id, page.id);
  return { ctx, site, page };
}

function contactBody(siteId: string, pageId: string, operationId = "contact_operation_0001") {
  return {
    version: 1,
    operationId,
    siteId,
    pageId,
    blockId: "contact_block",
    contact: {
      name: "Visitor Name",
      email: "visitor@example.test",
      phone: "+44 7700 900123",
      message: "Please call me about the project.",
    },
    consent: {
      agreed: true,
      purpose: "contact-request",
      version: 3,
      statementDigest: CONSENT_STATEMENT_DIGEST,
    },
    website: "",
  };
}

async function post(ctx: PluginCtx, body: unknown, origin = ORIGIN, ip = "198.51.100.20") {
  return handleVisitorContact(new Request(`${ORIGIN}/api/portal/website-editor/visitor/contact`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      referer: `${origin}/contact?private=discarded`,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  }), ctx);
}

test("route manifest exposes visitor facades without widening operator routes", () => {
  const source = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/api/routes.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /path:\s*["']visitor\/contact["'][^}]*public:\s*true/s);
  assert.match(source, /path:\s*["']public\/blog\/posts["'][^}]*public:\s*true/s);
  for (const path of ["/forms/submit", "/forms/webhook-log", "/forms/contact-submissions", "/blog/posts", "/blog/posts/by-slug"]) {
    const row = source.match(new RegExp(`\\{\\s*path:\\s*["']${path.replaceAll("/", "\\/")}["'][^}]*\\}`, "s"))?.[0] ?? "";
    assert.ok(row, `${path} route missing`);
    assert.doesNotMatch(row, /public:\s*true/, `${path} operator route became public`);
  }
});

test("visitor blocks activate only on a published mount, never the editor or draft preview", () => {
  const renderer = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/storefront/PortalPageRenderer.tsx", import.meta.url),
    "utf8",
  );
  const contact = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx", import.meta.url),
    "utf8",
  );
  const blog = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/BlogFeedBlock.tsx", import.meta.url),
    "utf8",
  );

  assert.match(renderer, /publishedWebsite:\s*preview\s*!==\s*true\s*&&\s*page\.status\s*===\s*["']published["']/);
  assert.match(contact, /context\.publishedWebsite\s*===\s*true/);
  assert.match(blog, /context\.publishedWebsite\s*!==\s*true/);
});

test("contact UI accepts only a parsed success receipt, not an arbitrary 2xx response", () => {
  assert.deepEqual(
    parseVisitorContactReceipt({ ok: true, receiptId: "contact_receipt_1" }),
    { ok: true, receiptId: "contact_receipt_1" },
  );
  for (const value of [null, {}, { ok: true }, { ok: false, receiptId: "contact_receipt_1" }, { ok: true, receiptId: "" }]) {
    assert.equal(parseVisitorContactReceipt(value), null);
  }
  const component = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /res\.ok\s*\?\s*parseVisitorContactReceipt\(reply\)\s*:\s*null/);
  assert.match(component, /visitorContactConsentDigest\(consentLabel\)/);
  assert.match(component, /statementDigest:\s*consentStatementDigest/);
});

test("contact consent wording has one browser/server canonical digest", async () => {
  assert.equal(
    normaliseVisitorContactConsentStatement(`  I agree to a reply\nabout this request.  `),
    CONSENT_STATEMENT,
  );
  assert.equal(await visitorContactConsentDigest(CONSENT_STATEMENT), CONSENT_STATEMENT_DIGEST);
  assert.equal(
    await visitorContactConsentDigest(`  I agree to a reply\nabout this request.  `),
    CONSENT_STATEMENT_DIGEST,
  );
});

test("mounted dispatcher requires an exact enabled install and keeps the generic form route private", async () => {
  process.env.PORTAL_BACKEND ??= "memory";
  const [{ NextRequest }, route, storageModule, runtimeStorage, installs, tenants] = await Promise.all([
    import("next/server"),
    import("../src/app/api/portal/[module]/[...rest]/route"),
    import("../src/lib/server/pluginStorage"),
    import("../src/server/storage"),
    import("../src/server/pluginInstalls"),
    import("../src/server/tenants"),
  ]);
  const agency = tenants.createAgency({ name: "Visitor Dispatcher", slug: `visitor-dispatcher-${Date.now()}` });
  const client = tenants.createClient(agency.id, { name: "Visitor Site", slug: `visitor-site-${Date.now()}` });
  const install = installs.upsertInstall({
    pluginId: "website-editor",
    scope: { agencyId: agency.id, clientId: client.id },
    enabled: true,
    config: {},
    features: {},
  });
  const storage = storageModule.makePluginStorage(install.id);
  const site = await createSite(storage, {
    agencyId: agency.id,
    clientId: client.id,
    name: "Mounted site",
    slug: "mounted-site",
  });
  const page = await createPage(storage, {
    agencyId: agency.id,
    clientId: client.id,
    siteId: site.id,
    title: "Mounted contact",
    slug: "contact",
    blocks: [{
      id: "contact_block",
      type: "contact-form",
      props: { consentVersion: 3, consentLabel: CONSENT_STATEMENT },
    }],
  });
  await publishPage(storage, agency.id, client.id, site.id, page.id);
  await runtimeStorage.flushPendingWrites();

  const dispatch = async (rest: string[], query: Record<string, string>, body: unknown) => {
    const search = new URLSearchParams(query).toString();
    const request = new NextRequest(`http://localhost/api/portal/website-editor/${rest.join("/")}${search ? `?${search}` : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost", "x-forwarded-for": "198.51.100.77" },
      body: JSON.stringify(body),
    });
    return withRequestScope({}, () => route.POST(request, {
      params: Promise.resolve({ module: "website-editor", rest }),
    }));
  };

  const body = contactBody(site.id, page.id, "mounted_contact_0001");
  assert.equal((await dispatch(["visitor", "contact"], {}, body)).status, 401);
  assert.equal((await dispatch(["forms", "submit"], { agencyId: agency.id, clientId: client.id }, body)).status, 401);
  assert.equal((await dispatch(
    ["visitor", "contact"],
    { agencyId: agency.id, clientId: client.id },
    body,
  )).status, 201);
});

test("contact facade requires published tenant content, exact DTOs, origin and affirmative consent", async () => {
  const draft = await fixture(context(), false);
  assert.equal((await post(draft.ctx, contactBody(draft.site.id, draft.page.id))).status, 404);

  const ready = await fixture();
  const base = contactBody(ready.site.id, ready.page.id);
  assert.equal((await post(ready.ctx, { ...base, consent: { ...base.consent, agreed: false } })).status, 400);
  assert.equal((await post(ready.ctx, { ...base, consent: { ...base.consent, version: 2 } })).status, 400);
  const withoutDigest = { ...base.consent } as Record<string, unknown>;
  delete withoutDigest.statementDigest;
  assert.equal((await post(ready.ctx, { ...base, consent: withoutDigest })).status, 400);
  const staleWording = await post(ready.ctx, {
    ...base,
    consent: {
      ...base.consent,
      statementDigest: await visitorContactConsentDigest("I agree to different wording."),
    },
  });
  assert.equal(staleWording.status, 400);
  assert.deepEqual(await staleWording.json(), {
    ok: false,
    error: "The consent wording changed. Please review it and submit again.",
  });
  assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 0);
  assert.equal((await post(ready.ctx, { ...base, operatorRole: "agency-owner" })).status, 400);
  assert.equal((await post(ready.ctx, base, "https://attacker.example.test")).status, 403);
  assert.equal((await post(ready.ctx, { ...base, blockId: "missing" })).status, 404);

  const otherTenant = context(memoryStorage(), "agency_other", "client_other");
  assert.equal((await post(otherTenant, base)).status, 404, "another install could resolve the first tenant's page");
});

test("contact facade persists one consent record and returns no operator data", async () => {
  const ready = await fixture();
  const response = await post(ready.ctx, contactBody(ready.site.id, ready.page.id));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reply = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(reply).sort(), ["ok", "receiptId"]);
  assert.equal(reply.ok, true);

  const keys = await ready.ctx.storage.list("visitor-contact-operation:v1:");
  assert.equal(keys.length, 1);
  const operation = await ready.ctx.storage.get<{
    fingerprint?: string;
    receiptId?: string;
    submission?: VisitorContactSubmission;
  }>(keys[0]!);
  const stored = operation?.submission;
  assert.equal(stored?.agencyId, AGENCY);
  assert.equal(stored?.clientId, CLIENT);
  assert.equal(stored?.formName, "Website contact");
  assert.equal(stored?.consent.agreed, true);
  assert.equal(stored?.consent.purpose, "contact-request");
  assert.equal(stored?.consent.version, 3);
  assert.equal(stored?.consent.statementDigest, CONSENT_STATEMENT_DIGEST);
  assert.equal(stored?.consent.statement, CONSENT_STATEMENT);
  assert.equal(stored?.sourcePath, "/contact", "referer query leaked into the contact record");
  assert.equal((stored as unknown as Record<string, unknown>).actor, undefined);

  assert.match(operation?.fingerprint ?? "", /^[a-f0-9]{64}$/);
  assert.equal(operation?.receiptId, reply.receiptId);
  assert.equal(
    (JSON.stringify(operation).match(/visitor@example\.test/g) ?? []).length,
    1,
    "visitor PII must have one canonical stored copy",
  );
  assert.equal((await ready.ctx.storage.list("visitor-contact-submission:v1:")).length, 0);

  const operatorResponse = await handleListVisitorContacts(new Request(
    `${ORIGIN}/api/portal/website-editor/forms/contact-submissions?limit=10`,
  ), { ...ready.ctx, actor: "operator_user" });
  assert.equal(operatorResponse.status, 200);
  const operatorReply = await operatorResponse.json() as { submissions: VisitorContactSubmission[] };
  assert.equal(operatorReply.submissions.length, 1);
  assert.equal(operatorReply.submissions[0]?.id, reply.receiptId);
});

test("contact operation is idempotent and rejects a changed replay", async () => {
  const ready = await fixture();
  const body = contactBody(ready.site.id, ready.page.id);
  const first = await post(ready.ctx, body);
  const firstReply = await first.json() as { receiptId: string };
  const replay = await post(ready.ctx, body);
  const replayReply = await replay.json() as { receiptId: string };
  assert.equal(replay.status, 200);
  assert.equal(replayReply.receiptId, firstReply.receiptId);
  assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 1);

  const conflict = await post(ready.ctx, {
    ...body,
    contact: { ...body.contact, message: "Changed replay" },
  });
  assert.equal(conflict.status, 409);
  assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 1);
});

test("contact security controls fail closed and throttle a shared install", async () => {
  const unlocked = await fixture(context(memoryStorage(false)));
  assert.equal((await post(unlocked.ctx, contactBody(unlocked.site.id, unlocked.page.id))).status, 503);
  assert.equal((await unlocked.ctx.storage.list("visitor-contact-operation:v1:")).length, 0);

  const ready = await fixture();
  for (let index = 0; index < 8; index += 1) {
    const response = await post(
      ready.ctx,
      contactBody(ready.site.id, ready.page.id, `contact_limit_${String(index).padStart(4, "0")}`),
      ORIGIN,
      "203.0.113.88",
    );
    assert.equal(response.status, 201);
  }
  const limited = await post(
    ready.ctx,
    contactBody(ready.site.id, ready.page.id, "contact_limit_9999"),
    ORIGIN,
    "203.0.113.88",
  );
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  const buckets = await ready.ctx.storage.get<Record<string, unknown>>(
    "website-editor:visitor-rate-limit:v1",
  );
  assert.doesNotMatch(
    JSON.stringify(buckets),
    /203\.0\.113\.88/,
    "the durable rate-limit ledger retained a plaintext visitor IP address",
  );
  assert.ok(
    Object.keys(buckets ?? {}).every(key => /^(?:contact-ip|contact-install):[a-f0-9]{64}$/.test(key)),
    "rate-limit buckets must use one-way identity digests",
  );
});

test("public blog feed returns published summaries only through an allowlist DTO", async () => {
  const ready = await fixture();
  await createBlogPost(ready.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: ready.site.id,
    title: "Public story",
    slug: "public-story",
    excerpt: "Visible summary",
    author: "Public Author",
    tags: ["news"],
    status: "published",
    body: [{ id: "secret", type: "html", props: { html: "PRIVATE BODY" } }],
  });
  await createBlogPost(ready.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: ready.site.id,
    title: "Draft story",
    excerpt: "PRIVATE DRAFT",
    status: "draft",
  });

  const response = await handleVisitorBlogPosts(new Request(
    `${ORIGIN}/api/portal/website-editor/public/blog/posts?siteId=${ready.site.id}&limit=99`,
    { headers: { "x-forwarded-for": "192.0.2.42" } },
  ), ready.ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reply = await response.json() as { ok: boolean; posts: Array<Record<string, unknown>> };
  assert.equal(reply.ok, true);
  assert.equal(reply.posts.length, 1);
  assert.deepEqual(Object.keys(reply.posts[0]!).sort(), ["author", "excerpt", "publishedAt", "slug", "tags", "title"]);
  assert.equal(reply.posts[0]!.slug, "public-story");
  assert.equal(reply.posts[0]!.body, undefined);
  assert.equal(reply.posts[0]!.agencyId, undefined);
  assert.doesNotMatch(JSON.stringify(reply), /PRIVATE/);
  const buckets = await ready.ctx.storage.get<Record<string, unknown>>(
    "website-editor:visitor-rate-limit:v1",
  );
  assert.doesNotMatch(JSON.stringify(buckets), /192\.0\.2\.42/);
  assert.deepEqual(
    Object.keys(buckets ?? {}).map(key => key.split(":")[0]).sort(),
    ["blog", "blog-install"],
    "the public feed needs both caller and install-wide durable ceilings",
  );
  assert.ok(
    Object.keys(buckets ?? {}).every(key => /^(?:blog|blog-install):[a-f0-9]{64}$/.test(key)),
    "blog rate-limit buckets must use one-way identity digests",
  );

  const unlocked = await fixture(context(memoryStorage(false)));
  const unavailable = await handleVisitorBlogPosts(new Request(
    `${ORIGIN}/api/portal/website-editor/public/blog/posts?siteId=${unlocked.site.id}`,
  ), unlocked.ctx);
  assert.equal(unavailable.status, 503, "public blog rate control silently lost its durable lock");
});
