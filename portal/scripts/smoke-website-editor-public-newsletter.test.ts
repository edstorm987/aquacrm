// The website editor's public newsletter facade. Issues #28, #29, #184, #185
// (advanced, not closed).
//
// `newsletter-signup` used to POST `{ email }` to `/api/portal/newsletter/subscribe`,
// a path no module has ever declared, and was therefore labelled dead. It now
// posts one strict, consent-bearing DTO to `visitor/newsletter`, the same
// shape and boundary as the contact facade: exact published block, registered
// origin, hashed rate limits, replay receipts, and one canonical subscriber per
// address and site. These tests are the contract; the component tests at the
// end are the seam between what the page shows and what the server binds.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withRequestScope } from "./dev-console-request-scope";

import {
  handleListVisitorNewsletterSubscriptions,
  handleVisitorNewsletter,
  type VisitorNewsletterSubscriber,
} from "../src/built-ins/modules/website-editor/src/api/handlers/visitor";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import {
  createPage,
  publishPage,
  updatePage,
} from "../src/built-ins/modules/website-editor/src/server/pages";
import { createSite, updateSite } from "../src/built-ins/modules/website-editor/src/server/sites";
import { parseVisitorNewsletterReceipt } from "../src/built-ins/modules/website-editor/src/lib/visitorNewsletterReceipt";
import {
  DEFAULT_VISITOR_NEWSLETTER_CONSENT,
  VISITOR_NEWSLETTER_CONSENT_PURPOSE,
  normaliseVisitorNewsletterConsentStatement,
  visitorNewsletterConsentDigest,
} from "../src/built-ins/modules/website-editor/src/lib/visitorNewsletterConsent";
import { normaliseVisitorNewsletterEmail } from "../src/built-ins/modules/website-editor/src/lib/visitorNewsletterEmail";

const AGENCY = "agency_public_newsletter";
const CLIENT = "client_public_newsletter";
const ORIGIN = "https://portal.example.test";
const CONSENT_STATEMENT = "I agree to receive this newsletter by email.";
const CONSENT_VERSION = 2;
// Pinned, and proved equal to the helper's answer below.
const CONSENT_STATEMENT_DIGEST =
  "sha256:74572326886c990a223592840fa4b57c8617336ec567793f4049dce50a93345a";
const OPERATION_PREFIX = "visitor-newsletter-operation:v1:";
const SUBSCRIBER_PREFIX = "visitor-newsletter-subscriber:v1:";
const RATE_KEY = "website-editor:visitor-rate-limit:v1";
const MODULE = new URL("../src/built-ins/modules/website-editor/src/", import.meta.url);

function source(relative: string): string {
  return readFileSync(new URL(relative, MODULE), "utf8");
}

function memoryStorage(exclusive = true): PluginStorage {
  const data = new Map<string, unknown>();
  // A real mutex, not a pass-through. The concurrency proofs below would
  // prove nothing if two operations could interleave inside the boundary.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    ...(exclusive ? {
      runExclusive<T>(_key: string, operation: () => Promise<T>): Promise<T> {
        const run = chain.then(operation);
        chain = run.then(() => undefined, () => undefined);
        return run;
      },
    } : {}),
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

interface FixtureOptions {
  published?: boolean;
  blockType?: string;
  privacy?: "password" | "members-only";
}

async function fixture(ctx = context(), options: FixtureOptions = {}) {
  const site = await createSite(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    name: "Newsletter site",
    slug: "newsletter-site",
  });
  const page = await createPage(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    siteId: site.id,
    title: "Home",
    slug: "home",
    blocks: [{
      id: "newsletter_block",
      type: options.blockType ?? "newsletter-signup",
      props: {
        consentLabel: CONSENT_STATEMENT,
        consentVersion: CONSENT_VERSION,
      },
    }],
  });
  if (options.privacy) {
    await updatePage(ctx.storage, ctx.agencyId, ctx.clientId!, site.id, page.id, {
      privacy: options.privacy,
      ...(options.privacy === "password" ? { passwordHash: "sha256:test" } : {}),
    });
  }
  if (options.published !== false) await publishPage(ctx.storage, ctx.agencyId, ctx.clientId!, site.id, page.id);
  return { ctx, site, page };
}

function newsletterBody(
  siteId: string,
  pageId: string,
  operationId = "newsletter_operation_0001",
  email = "visitor@example.test",
) {
  return {
    version: 1,
    operationId,
    siteId,
    pageId,
    blockId: "newsletter_block",
    email,
    consent: {
      agreed: true,
      purpose: VISITOR_NEWSLETTER_CONSENT_PURPOSE,
      version: CONSENT_VERSION,
      statementDigest: CONSENT_STATEMENT_DIGEST,
    },
    honeypot: "",
  };
}

async function post(ctx: PluginCtx, body: unknown, origin: string | null = ORIGIN, ip = "198.51.100.30") {
  return handleVisitorNewsletter(new Request(`${ORIGIN}/api/portal/website-editor/visitor/newsletter`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin, referer: `${origin}/home?utm=discarded` } : {}),
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), ctx);
}

async function listSubscriptions(ctx: PluginCtx, query = "limit=10") {
  const response = await handleListVisitorNewsletterSubscriptions(new Request(
    `${ORIGIN}/api/portal/website-editor/forms/newsletter-subscriptions?${query}`,
  ), { ...ctx, actor: "operator_user" });
  assert.equal(response.status, 200);
  return (await response.json() as { subscriptions: VisitorNewsletterSubscriber[] }).subscriptions;
}

async function countKeys(storage: PluginStorage, prefix: string): Promise<number> {
  return (await storage.list(prefix)).length;
}

async function dumpStorage(storage: PluginStorage): Promise<string> {
  const keys = await storage.list("");
  const rows = await Promise.all(keys.map(async key => [key, await storage.get(key)]));
  return JSON.stringify(rows);
}

// ─── Manifest and ratchets ───────────────────────────────────────────────

test("route manifest exposes the newsletter facade as public and keeps the operator read private", () => {
  const routes = source("api/routes.ts");
  assert.match(routes, /path:\s*["']visitor\/newsletter["'][^}]*methods:\s*\["POST"\][^}]*public:\s*true/s);
  const operator = routes.match(/\{\s*path:\s*["']\/forms\/newsletter-subscriptions["'][^}]*\}/s)?.[0] ?? "";
  assert.ok(operator, "the operator newsletter read is not registered");
  assert.match(operator, /methods:\s*\["GET"\]/);
  assert.doesNotMatch(operator, /public:\s*true/, "the operator newsletter read became public");
  // The facade is the website editor's own. No separate newsletter module.
  assert.doesNotMatch(routes, /\/api\/portal\/newsletter\//);
});

test("only the newsletter block leaves the backend-gap and dead-call ratchets", async () => {
  const { blockBackendGap, blocksWithoutVisitorBackend } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );
  assert.equal(blockBackendGap("newsletter-signup"), undefined);
  assert.deepEqual(blocksWithoutVisitorBackend(), ["booking-widget", "donation-button", "form-embed", "theme-selector"]);

  const ratchet = readFileSync(new URL("./smoke-website-editor-dead-ui-calls.test.ts", import.meta.url), "utf8");
  const known = ratchet.split("const KNOWN_DEAD = [")[1]?.split("].sort();")[0] ?? "";
  const code = known.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(code.length > 50, "could not read KNOWN_DEAD");
  assert.doesNotMatch(code, /"\/api\/portal\/newsletter\/subscribe"/, "the retired newsletter call is still listed as dead");
  for (const kept of [
    "/api/portal/forms/public/form/*",
    "/api/portal/forms/public/submit/*",
    "/api/portal/reservations",
    "/api/portal/themes/*",
    "/api/portal/ai-builder/image",
  ]) {
    assert.ok(code.includes(`"${kept}"`), `${kept} left the dead-call ratchet without a route being built`);
  }

  const block = source("components/blocks/NewsletterSignupBlock.tsx");
  assert.doesNotMatch(block, /\/api\/portal\/newsletter\/subscribe/, "the block still calls the route that never existed");
});

// ─── Helpers the component and server share ──────────────────────────────

test("newsletter addresses have one canonical form and reject anything that is not one address", () => {
  assert.equal(normaliseVisitorNewsletterEmail("  Visitor@Example.TEST "), "visitor@example.test");
  assert.equal(normaliseVisitorNewsletterEmail("first.last+tag@sub.example.co.uk"), "first.last+tag@sub.example.co.uk");
  assert.equal(normaliseVisitorNewsletterEmail("ＶＩＳＩＴＯＲ@example.test"), "visitor@example.test", "compatibility forms fold to ASCII");
  for (const bad of [
    "", "   ", "visitor", "visitor@", "@example.test", "visitor@example", "visitor@@example.test",
    "two words@example.test", "visitor@-bad.test", "visitor@bad-.test", "visitor@example..test",
    ".visitor@example.test", "visitor.@example.test", "visitor@example.1", "visitor@example.t",
    `${"a".repeat(65)}@example.test`, `visitor@${"a".repeat(64)}.test`, `${"a".repeat(60)}@${"b".repeat(190)}.test`,
    "visitor@example.test ", "visitor\t@example.test", "<visitor@example.test>",
    42, null, undefined, {}, ["visitor@example.test"],
  ]) {
    assert.equal(normaliseVisitorNewsletterEmail(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
});

test("newsletter consent wording has one browser/server canonical digest", async () => {
  assert.equal(
    normaliseVisitorNewsletterConsentStatement(`  I agree to receive this\nnewsletter by email.  `),
    CONSENT_STATEMENT,
  );
  assert.equal(normaliseVisitorNewsletterConsentStatement(""), DEFAULT_VISITOR_NEWSLETTER_CONSENT);
  assert.equal(normaliseVisitorNewsletterConsentStatement(undefined), DEFAULT_VISITOR_NEWSLETTER_CONSENT);
  assert.match(CONSENT_STATEMENT_DIGEST, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await visitorNewsletterConsentDigest(`  I agree to receive this\nnewsletter by email.  `), CONSENT_STATEMENT_DIGEST);
  assert.notEqual(await visitorNewsletterConsentDigest(DEFAULT_VISITOR_NEWSLETTER_CONSENT), CONSENT_STATEMENT_DIGEST);
  // The default wording promises nothing the module cannot do.
  assert.doesNotMatch(DEFAULT_VISITOR_NEWSLETTER_CONSENT, /unsubscribe|confirm|inbox/i);
  assert.equal(VISITOR_NEWSLETTER_CONSENT_PURPOSE, "newsletter-subscription");
});

test("newsletter UI accepts only a parsed success receipt, not an arbitrary 2xx response", () => {
  assert.deepEqual(
    parseVisitorNewsletterReceipt({ ok: true, receiptId: "newsletter_receipt_1" }),
    { ok: true, receiptId: "newsletter_receipt_1" },
  );
  for (const value of [null, {}, { ok: true }, { ok: false, receiptId: "x" }, { ok: true, receiptId: "" }, "ok"]) {
    assert.equal(parseVisitorNewsletterReceipt(value), null);
  }
});

// ─── The DTO ─────────────────────────────────────────────────────────────

test("newsletter facade refuses unknown keys, malformed operations and every non-canonical address", async () => {
  const ready = await fixture();
  const base = newsletterBody(ready.site.id, ready.page.id);
  const refused: Array<[string, unknown]> = [
    ["extra top-level key", { ...base, operatorRole: "agency-owner" }],
    ["the contact facade's trap key", { ...base, website: "" }],
    ["extra consent key", { ...base, consent: { ...base.consent, note: "x" } }],
    ["unknown version", { ...base, version: 2 }],
    ["missing version", (() => { const { version: _v, ...rest } = base; return rest; })()],
    ["short operation id", { ...base, operationId: "short" }],
    ["operation id with spaces", { ...base, operationId: "newsletter operation 1" }],
    ["missing consent", (() => { const { consent: _c, ...rest } = base; return rest; })()],
    ["consent not agreed", { ...base, consent: { ...base.consent, agreed: false } }],
    ["consent agreed as a string", { ...base, consent: { ...base.consent, agreed: "true" } }],
    ["contact purpose", { ...base, consent: { ...base.consent, purpose: "contact-request" } }],
    ["consent version zero", { ...base, consent: { ...base.consent, version: 0 } }],
    ["consent digest not sha256", { ...base, consent: { ...base.consent, statementDigest: "md5:abc" } }],
    ["numeric trap field", { ...base, honeypot: 0 }],
    ["object trap field", { ...base, honeypot: {} }],
    ["missing email", { ...base, email: undefined }],
    ["email not a string", { ...base, email: ["visitor@example.test"] }],
    ["email without a domain", { ...base, email: "visitor@" }],
    ["email with a space", { ...base, email: "vis itor@example.test" }],
    ["array body", [base]],
    ["string body", "\"visitor@example.test\""],
    ["not JSON", "{not json"],
  ];
  for (const [label, body] of refused) {
    const response = await post(ready.ctx, body);
    assert.equal(response.status, 400, `${label} was not refused`);
    assert.equal(response.headers.get("cache-control") ?? "no-store", "no-store");
  }
  assert.equal(await countKeys(ready.ctx.storage, OPERATION_PREFIX), 0);
  assert.equal(await countKeys(ready.ctx.storage, SUBSCRIBER_PREFIX), 0);
  assert.equal(await ready.ctx.storage.get(RATE_KEY), undefined, "a refused DTO must not spend a rate-limit token");

  // The trap key may be absent entirely; the DTO is otherwise unchanged.
  const { honeypot: _h, ...withoutTrap } = base;
  assert.equal((await post(ready.ctx, withoutTrap)).status, 201);
});

// ─── Binding to published tenant content ─────────────────────────────────

test("newsletter facade binds to the exact tenant, live site, published page and published block", async () => {
  const draft = await fixture(context(), { published: false });
  assert.equal((await post(draft.ctx, newsletterBody(draft.site.id, draft.page.id))).status, 404);
  assert.equal(await countKeys(draft.ctx.storage, SUBSCRIBER_PREFIX), 0);

  const wrongBlockType = await fixture(context(), { blockType: "contact-form" });
  assert.equal(
    (await post(wrongBlockType.ctx, newsletterBody(wrongBlockType.site.id, wrongBlockType.page.id))).status,
    404,
    "a contact block accepted a newsletter sign-up",
  );

  const passworded = await fixture(context(), { privacy: "password" });
  assert.equal((await post(passworded.ctx, newsletterBody(passworded.site.id, passworded.page.id))).status, 404);
  const members = await fixture(context(), { privacy: "members-only" });
  assert.equal((await post(members.ctx, newsletterBody(members.site.id, members.page.id))).status, 404);

  const ready = await fixture();
  const base = newsletterBody(ready.site.id, ready.page.id);
  assert.equal((await post(ready.ctx, { ...base, blockId: "missing" })).status, 404);
  assert.equal((await post(ready.ctx, { ...base, pageId: "missing" })).status, 404);
  assert.equal((await post(ready.ctx, { ...base, siteId: "missing" })).status, 404);

  const otherTenant = context(memoryStorage(), "agency_other", "client_other");
  assert.equal((await post(otherTenant, base)).status, 404, "another install could resolve the first tenant's page");
  const sharedStorageOtherTenant = context(ready.ctx.storage, "agency_other", "client_other");
  assert.equal((await post(sharedStorageOtherTenant, base)).status, 404, "tenant keys are not part of the site lookup");

  await updateSite(ready.ctx.storage, AGENCY, CLIENT, ready.site.id, { status: "draft" });
  assert.equal((await post(ready.ctx, base)).status, 404, "an inactive site still accepted sign-ups");
  await updateSite(ready.ctx.storage, AGENCY, CLIENT, ready.site.id, { status: "live" });
  assert.equal((await post(ready.ctx, base)).status, 201);
  assert.equal(await countKeys(ready.ctx.storage, SUBSCRIBER_PREFIX), 1);
});

test("a block that exists only in the draft is never a live write surface, and a published block survives a draft edit", async () => {
  const ctx = context();
  const site = await createSite(ctx.storage, { agencyId: AGENCY, clientId: CLIENT, name: "Draft site", slug: "draft-site" });

  // Published without the block; the editor then adds it to the working tree.
  const addedLater = await createPage(ctx.storage, {
    agencyId: AGENCY, clientId: CLIENT, siteId: site.id, title: "Added later", slug: "added-later",
    blocks: [{ id: "heading", type: "heading", props: { text: "Live copy" } }],
  });
  await publishPage(ctx.storage, AGENCY, CLIENT, site.id, addedLater.id);
  await updatePage(ctx.storage, AGENCY, CLIENT, site.id, addedLater.id, {
    blocks: [
      { id: "heading", type: "heading", props: { text: "Live copy" } },
      { id: "newsletter_block", type: "newsletter-signup", props: { consentLabel: CONSENT_STATEMENT, consentVersion: CONSENT_VERSION } },
    ],
  });
  assert.equal(
    (await post(ctx, newsletterBody(site.id, addedLater.id, "newsletter_draft_0001"))).status,
    404,
    "a block present only in the unpublished draft accepted a sign-up",
  );
  assert.equal(await countKeys(ctx.storage, SUBSCRIBER_PREFIX), 0);

  // Published with the block; the editor then removes it from the working tree.
  const removedLater = await createPage(ctx.storage, {
    agencyId: AGENCY, clientId: CLIENT, siteId: site.id, title: "Removed later", slug: "removed-later",
    blocks: [{ id: "newsletter_block", type: "newsletter-signup", props: { consentLabel: CONSENT_STATEMENT, consentVersion: CONSENT_VERSION } }],
  });
  await publishPage(ctx.storage, AGENCY, CLIENT, site.id, removedLater.id);
  await updatePage(ctx.storage, AGENCY, CLIENT, site.id, removedLater.id, { blocks: [] });
  assert.equal(
    (await post(ctx, newsletterBody(site.id, removedLater.id, "newsletter_draft_0002"))).status,
    201,
    "the published snapshot, not the draft, decides what a visitor can reach",
  );

  // The published wording decides too: a draft edit to the consent sentence
  // does not change what a visitor must have agreed to.
  await updatePage(ctx.storage, AGENCY, CLIENT, site.id, removedLater.id, {
    blocks: [{ id: "newsletter_block", type: "newsletter-signup", props: { consentLabel: "Draft-only wording.", consentVersion: 9 } }],
  });
  assert.equal((await post(ctx, newsletterBody(site.id, removedLater.id, "newsletter_draft_0003"))).status, 201);
  assert.equal((await post(ctx, {
    ...newsletterBody(site.id, removedLater.id, "newsletter_draft_0004"),
    consent: { ...newsletterBody(site.id, removedLater.id).consent, version: 9, statementDigest: await visitorNewsletterConsentDigest("Draft-only wording.") },
  })).status, 400);
});

// ─── Origin and consent ──────────────────────────────────────────────────

test("newsletter facade enforces the registered origin and the exact published consent", async () => {
  const ready = await fixture();
  const base = newsletterBody(ready.site.id, ready.page.id);

  assert.equal((await post(ready.ctx, base, "https://attacker.example.test")).status, 403);
  assert.equal((await post(ready.ctx, base, null)).status, 403, "a request with no Origin header was trusted");
  assert.equal((await post(ready.ctx, base, "not a url")).status, 403);
  await updateSite(ready.ctx.storage, AGENCY, CLIENT, ready.site.id, { customDomain: "news.example.test" });
  assert.equal((await post(ready.ctx, { ...base, operationId: "newsletter_origin_0001" }, "https://news.example.test")).status, 201, "a registered custom domain was refused");
  assert.equal((await post(ready.ctx, { ...base, operationId: "newsletter_origin_0002" }, "https://sub.news.example.test")).status, 403, "a sub-domain of the registered domain was trusted");

  const staleVersion = await post(ready.ctx, { ...base, operationId: "newsletter_consent_0001", consent: { ...base.consent, version: CONSENT_VERSION + 1 } });
  assert.equal(staleVersion.status, 400);
  assert.deepEqual(await staleVersion.json(), {
    ok: false,
    error: "The consent wording changed. Please review it and submit again.",
  });
  const staleWording = await post(ready.ctx, {
    ...base,
    operationId: "newsletter_consent_0002",
    consent: { ...base.consent, statementDigest: await visitorNewsletterConsentDigest("I agree to different wording.") },
  });
  assert.equal(staleWording.status, 400);
  assert.deepEqual(await staleWording.json(), {
    ok: false,
    error: "The consent wording changed. Please review it and submit again.",
  });
  assert.equal(await countKeys(ready.ctx.storage, OPERATION_PREFIX), 1, "a refused consent left an operation behind");
  assert.equal(await countKeys(ready.ctx.storage, SUBSCRIBER_PREFIX), 1, "a refused consent left a subscriber behind");
});

// ─── Persistence and redaction ───────────────────────────────────────────

test("newsletter facade stores one canonical subscriber, keeps the address only there, and answers an allowlisted receipt", async () => {
  const ready = await fixture();
  const response = await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reply = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(reply).sort(), ["ok", "receiptId"]);
  assert.equal(reply.ok, true);
  assert.match(String(reply.receiptId), /^newsletter_[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(JSON.stringify(reply), /example\.test|agency_|client_|consent|subscriber|statement/i);

  const subscriberKeys = await ready.ctx.storage.list(SUBSCRIBER_PREFIX);
  assert.equal(subscriberKeys.length, 1);
  assert.match(subscriberKeys[0]!, new RegExp(`^${SUBSCRIBER_PREFIX}[a-f0-9]{64}$`), "the subscriber key spells out the address");
  const subscriber = await ready.ctx.storage.get<VisitorNewsletterSubscriber>(subscriberKeys[0]!);
  assert.ok(subscriber);
  assert.match(subscriber.id, /^subscriber_[A-Za-z0-9_-]+$/);
  assert.equal(subscriber.agencyId, AGENCY);
  assert.equal(subscriber.clientId, CLIENT);
  assert.equal(subscriber.siteId, ready.site.id);
  assert.equal(subscriber.pageId, ready.page.id);
  assert.equal(subscriber.blockId, "newsletter_block");
  assert.equal(subscriber.email, "visitor@example.test");
  assert.equal(subscriber.consent.agreed, true);
  assert.equal(subscriber.consent.purpose, "newsletter-subscription");
  assert.equal(subscriber.consent.version, CONSENT_VERSION);
  assert.equal(subscriber.consent.statementDigest, CONSENT_STATEMENT_DIGEST);
  assert.equal(subscriber.consent.statement, CONSENT_STATEMENT, "the exact wording must be retained for audit");
  assert.ok(subscriber.consent.capturedAt > 0);
  assert.deepEqual(subscriber.previousConsents, []);
  assert.equal(subscriber.sourcePath, "/home", "referer query leaked into the subscriber record");
  assert.equal(subscriber.subscriptionCount, 1);
  assert.equal(subscriber.createdAt, subscriber.lastSubscribedAt);
  assert.equal((subscriber as unknown as Record<string, unknown>).actor, undefined);

  const operationKeys = await ready.ctx.storage.list(OPERATION_PREFIX);
  assert.equal(operationKeys.length, 1);
  const operation = await ready.ctx.storage.get<Record<string, unknown>>(operationKeys[0]!);
  assert.deepEqual(Object.keys(operation ?? {}).sort(), ["fingerprint", "receiptId", "subscriberId"]);
  assert.match(String(operation?.fingerprint), /^[a-f0-9]{64}$/);
  assert.equal(operation?.receiptId, reply.receiptId);
  assert.equal(operation?.subscriberId, subscriber.id);
  assert.doesNotMatch(JSON.stringify(operation), /@/, "the replay record carries the address in plaintext");

  const everything = await dumpStorage(ready.ctx.storage);
  assert.equal((everything.match(/visitor@example\.test/g) ?? []).length, 1, "the address must have exactly one stored copy");
  assert.doesNotMatch(JSON.stringify(await ready.ctx.storage.get(RATE_KEY)), /198\.51\.100\.30|@/);

  const rows = await listSubscriptions(ready.ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, subscriber.id);
  assert.equal(rows[0]?.email, "visitor@example.test");
  assert.equal(rows[0]?.consent.statement, CONSENT_STATEMENT);
});

test("exact replay returns the same receipt; a changed replay of the same operation conflicts", async () => {
  const ready = await fixture();
  const body = newsletterBody(ready.site.id, ready.page.id);
  const first = await post(ready.ctx, body);
  assert.equal(first.status, 201);
  const firstReply = await first.json() as { receiptId: string };

  const replay = await post(ready.ctx, body);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, receiptId: firstReply.receiptId });
  assert.equal(await countKeys(ready.ctx.storage, OPERATION_PREFIX), 1);
  const subscriberKey = (await ready.ctx.storage.list(SUBSCRIBER_PREFIX))[0]!;
  assert.equal((await ready.ctx.storage.get<VisitorNewsletterSubscriber>(subscriberKey))?.subscriptionCount, 1, "a replay counted as a second sign-up");

  for (const changed of [
    { ...body, email: "someone-else@example.test" },
    { ...body, blockId: "another_block" },
    { ...body, consent: { ...body.consent, version: CONSENT_VERSION + 1 } },
  ]) {
    const conflict = await post(ready.ctx, changed);
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { ok: false, error: "This sign-up reference was already used." });
  }
  assert.equal(await countKeys(ready.ctx.storage, OPERATION_PREFIX), 1);
  assert.equal(await countKeys(ready.ctx.storage, SUBSCRIBER_PREFIX), 1);
});

test("repeat and concurrent sign-ups for one address leave one canonical subscriber and reveal nothing", async () => {
  const ready = await fixture();
  const first = await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id, "newsletter_repeat_0001", "visitor@example.test"));
  const second = await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id, "newsletter_repeat_0002", "  Visitor@EXAMPLE.test "));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201, "a repeat address must answer exactly like a first-time address");
  const firstReply = await first.json() as { receiptId: string };
  const secondReply = await second.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(secondReply).sort(), ["ok", "receiptId"]);
  assert.notEqual(secondReply.receiptId, firstReply.receiptId);
  assert.equal(await countKeys(ready.ctx.storage, SUBSCRIBER_PREFIX), 1);
  assert.equal(await countKeys(ready.ctx.storage, OPERATION_PREFIX), 2);
  const canonical = await ready.ctx.storage.get<VisitorNewsletterSubscriber>((await ready.ctx.storage.list(SUBSCRIBER_PREFIX))[0]!);
  assert.equal(canonical?.subscriptionCount, 2);
  assert.equal(canonical?.email, "visitor@example.test");
  assert.deepEqual(canonical?.previousConsents, [], "identical wording is not a new consent");

  const variants = ["Racer@example.test", "racer@EXAMPLE.TEST", " racer@example.test", "RACER@example.test", "racer@example.test"];
  const responses = await Promise.all(variants.map((email, index) => post(
    ready.ctx,
    newsletterBody(ready.site.id, ready.page.id, `newsletter_race_${String(index).padStart(4, "0")}`, email),
    ORIGIN,
    `203.0.113.${10 + index}`,
  )));
  assert.deepEqual(responses.map(response => response.status), [201, 201, 201, 201, 201]);
  const receipts = await Promise.all(responses.map(async response => (await response.json() as { receiptId: string }).receiptId));
  assert.equal(new Set(receipts).size, 5, "every operation gets its own receipt");
  assert.equal(await countKeys(ready.ctx.storage, SUBSCRIBER_PREFIX), 2, "concurrent sign-ups created more than one subscriber for one address");
  const operations = await Promise.all((await ready.ctx.storage.list(OPERATION_PREFIX))
    .filter(key => key.includes("newsletter_race_"))
    .map(key => ready.ctx.storage.get<{ subscriberId: string }>(key)));
  assert.equal(new Set(operations.map(operation => operation?.subscriberId)).size, 1, "operations point at more than one subscriber");
  const rows = await listSubscriptions(ready.ctx);
  const racer = rows.find(row => row.email === "racer@example.test");
  assert.equal(racer?.subscriptionCount, 5);
  assert.equal(racer?.id, operations[0]?.subscriberId);
});

test("re-subscribing under new published wording keeps the earlier consent for audit", async () => {
  const ready = await fixture();
  assert.equal((await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id, "newsletter_wording_0001"))).status, 201);

  const newWording = "I agree to a weekly newsletter by email.";
  await updatePage(ready.ctx.storage, AGENCY, CLIENT, ready.site.id, ready.page.id, {
    blocks: [{ id: "newsletter_block", type: "newsletter-signup", props: { consentLabel: newWording, consentVersion: CONSENT_VERSION + 1 } }],
  });
  await publishPage(ready.ctx.storage, AGENCY, CLIENT, ready.site.id, ready.page.id);

  // The old wording is no longer what the page shows.
  assert.equal((await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id, "newsletter_wording_0002"))).status, 400);
  const body = newsletterBody(ready.site.id, ready.page.id, "newsletter_wording_0003");
  const response = await post(ready.ctx, {
    ...body,
    consent: { ...body.consent, version: CONSENT_VERSION + 1, statementDigest: await visitorNewsletterConsentDigest(newWording) },
  });
  assert.equal(response.status, 201);

  const rows = await listSubscriptions(ready.ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.consent.statement, newWording);
  assert.equal(rows[0]?.consent.version, CONSENT_VERSION + 1);
  assert.equal(rows[0]?.previousConsents.length, 1);
  assert.equal(rows[0]?.previousConsents[0]?.statement, CONSENT_STATEMENT);
  assert.equal(rows[0]?.previousConsents[0]?.version, CONSENT_VERSION);
  assert.equal(rows[0]?.subscriptionCount, 2);
});

// ─── Abuse controls ──────────────────────────────────────────────────────

test("hashed rate limits throttle one caller and never store the address or IP", async () => {
  const ready = await fixture();
  for (let index = 0; index < 6; index += 1) {
    const response = await post(
      ready.ctx,
      newsletterBody(ready.site.id, ready.page.id, `newsletter_limit_${String(index).padStart(4, "0")}`, `limit-${index}@example.test`),
      ORIGIN,
      "203.0.113.99",
    );
    assert.equal(response.status, 201);
  }
  const limited = await post(
    ready.ctx,
    newsletterBody(ready.site.id, ready.page.id, "newsletter_limit_9999", "limit-9999@example.test"),
    ORIGIN,
    "203.0.113.99",
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("cache-control"), "no-store");
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.deepEqual(await limited.json(), { ok: false, error: "Too many sign-ups have been made. Please try again later." });
  assert.equal(await countKeys(ready.ctx.storage, SUBSCRIBER_PREFIX), 6, "a throttled sign-up was stored");
  assert.equal(await countKeys(ready.ctx.storage, OPERATION_PREFIX), 6, "a throttled sign-up left a receipt");

  // Another caller is not throttled by the first one's bucket.
  assert.equal((await post(
    ready.ctx,
    newsletterBody(ready.site.id, ready.page.id, "newsletter_limit_other", "other@example.test"),
    ORIGIN,
    "203.0.113.100",
  )).status, 201);

  const buckets = await ready.ctx.storage.get<Record<string, unknown>>(RATE_KEY);
  assert.doesNotMatch(JSON.stringify(buckets), /203\.0\.113\.|@/, "the durable rate-limit ledger retained a plaintext identity");
  assert.deepEqual(
    [...new Set(Object.keys(buckets ?? {}).map(key => key.split(":")[0]))].sort(),
    ["newsletter-install", "newsletter-ip"],
    "the facade needs both caller and install-wide durable ceilings",
  );
  assert.ok(
    Object.keys(buckets ?? {}).every(key => /^(?:newsletter-ip|newsletter-install):[a-f0-9]{64}$/.test(key)),
    "rate-limit buckets must use one-way identity digests",
  );
});

test("honeypot submissions are accepted harmlessly and persist nothing", async () => {
  const ready = await fixture();
  const before = await ready.ctx.storage.list("");
  const response = await post(ready.ctx, {
    ...newsletterBody(ready.site.id, ready.page.id),
    honeypot: "https://spam.example.test",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, receiptId: "accepted" });
  assert.deepEqual(await ready.ctx.storage.list(""), before, "a trapped submission wrote something");
  assert.equal(await ready.ctx.storage.get(RATE_KEY), undefined);
});

test("storage without an exclusive boundary, or with a failing write, answers a generic retryable 503", async () => {
  const unlocked = await fixture(context(memoryStorage(false)));
  const errors = mock.method(console, "error", () => undefined);
  try {
    const refused = await post(unlocked.ctx, newsletterBody(unlocked.site.id, unlocked.page.id));
    assert.equal(refused.status, 503);
    assert.deepEqual(await refused.json(), { ok: false, error: "This service is temporarily unavailable. Please try again." });
    assert.equal(await countKeys(unlocked.ctx.storage, SUBSCRIBER_PREFIX), 0);
    assert.equal(await countKeys(unlocked.ctx.storage, OPERATION_PREFIX), 0);
    assert.equal(errors.mock.callCount(), 1);
    assert.match(String(errors.mock.calls[0]?.arguments[0]), /^\[website-editor-public\] newsletter subscription failed:/);
    assert.match(String(errors.mock.calls[0]?.arguments[1]), /exclusive_storage/);

    const inner = memoryStorage();
    const failing: PluginStorage = {
      ...inner,
      async set<T>(key: string, value: T) {
        if (key.startsWith(SUBSCRIBER_PREFIX)) throw new Error("disk full");
        return inner.set(key, value);
      },
    };
    const broken = await fixture(context(failing));
    const failed = await post(broken.ctx, newsletterBody(broken.site.id, broken.page.id));
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    assert.deepEqual(await failed.json(), { ok: false, error: "This service is temporarily unavailable. Please try again." });
    assert.equal(await countKeys(broken.ctx.storage, OPERATION_PREFIX), 0, "a receipt was issued for a subscriber that was never stored");
    assert.equal(errors.mock.callCount(), 2);
    assert.match(String(errors.mock.calls[1]?.arguments[1]), /disk full/);
  } finally {
    errors.mock.restore();
  }
});

// ─── Operator read ───────────────────────────────────────────────────────

test("operator newsletter read is tenant-scoped, bounded and newest-first", async () => {
  const ready = await fixture();
  const other = await createSite(ready.ctx.storage, { agencyId: AGENCY, clientId: CLIENT, name: "Other site", slug: "other-site" });
  await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id, "newsletter_order_0001", "first@example.test"));
  await new Promise(resolve => setTimeout(resolve, 5));
  await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id, "newsletter_order_0002", "second@example.test"));
  await new Promise(resolve => setTimeout(resolve, 5));
  // A repeat sign-up moves the subscriber to the top: it is the newest activity.
  await post(ready.ctx, newsletterBody(ready.site.id, ready.page.id, "newsletter_order_0003", "first@example.test"));

  const rows = await listSubscriptions(ready.ctx);
  assert.deepEqual(rows.map(row => row.email), ["first@example.test", "second@example.test"]);
  assert.deepEqual((await listSubscriptions(ready.ctx, "limit=1")).map(row => row.email), ["first@example.test"]);
  assert.equal((await listSubscriptions(ready.ctx, "limit=999")).length, 2);
  assert.equal((await listSubscriptions(ready.ctx, "limit=abc")).length, 2);
  assert.equal((await listSubscriptions(ready.ctx, `siteId=${ready.site.id}`)).length, 2);
  assert.equal((await listSubscriptions(ready.ctx, `siteId=${other.id}`)).length, 0);

  const foreign = context(ready.ctx.storage, "agency_other", "client_other");
  assert.deepEqual(await listSubscriptions(foreign), [], "another tenant read this tenant's subscribers");
  const noClient = await handleListVisitorNewsletterSubscriptions(
    new Request(`${ORIGIN}/api/portal/website-editor/forms/newsletter-subscriptions`),
    { ...ready.ctx, clientId: undefined },
  );
  assert.equal(noClient.status, 400, "an agency-scoped read must not list client subscribers");
});

// ─── The mounted dispatcher ──────────────────────────────────────────────

test("mounted dispatcher requires an exact enabled install, keeps the operator read private and serialises concurrent sign-ups", async () => {
  process.env.PORTAL_BACKEND ??= "memory";
  const [{ NextRequest }, route, storageModule, runtimeStorage, installs, tenants] = await Promise.all([
    import("next/server"),
    import("../src/app/api/portal/[module]/[...rest]/route"),
    import("../src/lib/server/pluginStorage"),
    import("../src/server/storage"),
    import("../src/server/pluginInstalls"),
    import("../src/server/tenants"),
  ]);
  const agency = tenants.createAgency({ name: "Newsletter Dispatcher", slug: `newsletter-dispatcher-${Date.now()}` });
  const client = tenants.createClient(agency.id, { name: "Newsletter Site", slug: `newsletter-site-${Date.now()}` });
  const install = installs.upsertInstall({
    pluginId: "website-editor",
    scope: { agencyId: agency.id, clientId: client.id },
    enabled: true,
    config: {},
    features: {},
  });
  const storage = storageModule.makePluginStorage(install.id);
  const site = await createSite(storage, { agencyId: agency.id, clientId: client.id, name: "Mounted site", slug: "mounted-site" });
  const page = await createPage(storage, {
    agencyId: agency.id,
    clientId: client.id,
    siteId: site.id,
    title: "Mounted home",
    slug: "home",
    blocks: [{
      id: "newsletter_block",
      type: "newsletter-signup",
      props: { consentLabel: CONSENT_STATEMENT, consentVersion: CONSENT_VERSION },
    }],
  });
  await publishPage(storage, agency.id, client.id, site.id, page.id);
  await runtimeStorage.flushPendingWrites();

  const dispatch = async (method: "GET" | "POST", rest: string[], query: Record<string, string>, body?: unknown) => {
    const search = new URLSearchParams(query).toString();
    const request = new NextRequest(`http://localhost/api/portal/website-editor/${rest.join("/")}${search ? `?${search}` : ""}`, {
      method,
      headers: { "content-type": "application/json", origin: "http://localhost", "x-forwarded-for": "198.51.100.88" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return withRequestScope({}, () => route[method](request, {
      params: Promise.resolve({ module: "website-editor", rest }),
    }));
  };
  const scope = { agencyId: agency.id, clientId: client.id };

  const body = newsletterBody(site.id, page.id, "mounted_newsletter_0001");
  assert.equal((await dispatch("POST", ["visitor", "newsletter"], {}, body)).status, 401, "no tenant named, no install to resolve");
  assert.equal((await dispatch("POST", ["visitor", "newsletter"], { agencyId: agency.id }, body)).status, 401, "a client-scoped install needs clientId too");
  assert.equal((await dispatch("GET", ["forms", "newsletter-subscriptions"], scope)).status, 401, "the operator read answered an anonymous caller");
  const accepted = await dispatch("POST", ["visitor", "newsletter"], scope, body);
  assert.equal(accepted.status, 201);
  assert.deepEqual(Object.keys(await accepted.json() as object).sort(), ["ok", "receiptId"]);

  const responses = await Promise.all([0, 1, 2, 3].map(index => dispatch(
    "POST",
    ["visitor", "newsletter"],
    scope,
    newsletterBody(site.id, page.id, `mounted_race_${index}`, index % 2 ? "Racer@Example.test" : "racer@example.test"),
  )));
  assert.deepEqual(responses.map(response => response.status), [201, 201, 201, 201]);
  const receipts = await Promise.all(responses.map(async response => (await response.json() as { receiptId: string }).receiptId));
  assert.equal(new Set(receipts).size, 4);
  assert.equal(await countKeys(storage, SUBSCRIBER_PREFIX), 2, "the real durable lock let concurrent sign-ups create duplicate subscribers");

  installs.upsertInstall({ pluginId: "website-editor", scope, enabled: false, config: {}, features: {} });
  const disabled = await dispatch("POST", ["visitor", "newsletter"], scope, newsletterBody(site.id, page.id, "mounted_disabled_0001"));
  assert.ok(disabled.status === 401 || disabled.status === 404, `a disabled install still answered: HTTP ${disabled.status}`);
});

// ─── The component ───────────────────────────────────────────────────────

test("newsletter block activates only on a published mount, shows its consent, and clears only on a parsed receipt", () => {
  const block = source("components/blocks/NewsletterSignupBlock.tsx");
  const code = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Exact ElementContext scope: every id from the published mount, and the
  // published flag, and never the editor.
  assert.match(code, /context\?\.agencyId\s*&&\s*context\.clientId\s*&&\s*context\.siteId\s*&&\s*context\.pageId\s*&&\s*context\.publishedWebsite\s*===\s*true\s*&&\s*!editorMode/s);
  assert.match(code, /new URLSearchParams\(\{\s*agencyId:\s*context\.agencyId,\s*clientId:\s*context\.clientId,?\s*\}\)/s);
  assert.match(code, /fetch\(`\/api\/portal\/website-editor\/visitor\/newsletter\?\$\{params\.toString\(\)\}`/);
  assert.match(code, /siteId:\s*context\.siteId,\s*pageId:\s*context\.pageId,\s*blockId:\s*block\.id,/s);
  assert.match(code, /disabled=\{busy \|\| !connected\}/);
  assert.match(code, /"Available when published"/);

  // Visible consent bound to the exact published wording and version.
  assert.match(code, /normaliseVisitorNewsletterConsentStatement\(block\.props\.consentLabel\)/);
  assert.match(code, /visitorNewsletterConsentDigest\(consentLabel\)/);
  assert.match(code, /purpose:\s*VISITOR_NEWSLETTER_CONSENT_PURPOSE/);
  assert.match(code, /version:\s*consentVersion/);
  assert.match(code, /statementDigest:\s*consentStatementDigest/);
  assert.match(code, /<input[^>]*type="checkbox"[^>]*name="newsletterConsent"[^>]*required/s);
  assert.match(code, /<span>\{consentLabel\}<\/span>/);
  assert.match(code, /honeypot:\s*String\(fd\.get\("website"\)\s*\?\?\s*""\)/);

  // Accessible busy, success and error states.
  assert.match(code, /aria-busy=\{busy\}/);
  assert.match(code, /\{error && <p role="alert"/);
  assert.match(code, /<p role="status"/);
  assert.match(code, /aria-describedby=\{error \? errorId : undefined\}/);
  assert.match(code, /aria-label="Your email address"/);

  // Retention: the address and the operation id survive a refusal, and the
  // form is cleared in exactly one place — after a parsed success receipt.
  assert.match(code, /const receipt = res\.ok \? parseVisitorNewsletterReceipt\(reply\) : null/);
  const successBranch = code.split("if (receipt) {")[1]?.split("} else")[0] ?? "";
  assert.ok(successBranch.length > 0, "the success branch is missing");
  assert.match(successBranch, /setEmail\(""\)/);
  assert.match(successBranch, /operationId\.current = null/);
  assert.equal((code.match(/setEmail\(""\)/g) ?? []).length, 1, "the address is cleared somewhere other than on success");
  assert.equal((code.match(/operationId\.current = null/g) ?? []).length, 1, "the operation id is released somewhere other than on success");
  assert.match(code, /operationId\.current \?\?=/, "a retry must replay the same operation id");
  assert.doesNotMatch(code, /form\.reset\(\)/);

  // Nothing is sent by email and no provider is connected; the copy may not say otherwise.
  assert.doesNotMatch(code, /check your inbox|confirmation email|we['’]ll (?:e-?mail|send)|email you|Email plugin|campaign/i);
});

test("newsletter-signup registry entry declares consent wording and version defaults", () => {
  const registry = source("components/blockRegistry.ts");
  const entry = registry.split('"newsletter-signup": {')[1]?.split("\n  },")[0] ?? "";
  assert.ok(entry.length > 0, "the newsletter-signup registry entry is missing");
  assert.match(entry, new RegExp(`consentLabel:\\s*"${DEFAULT_VISITOR_NEWSLETTER_CONSENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(entry, /consentVersion:\s*1,/);
  assert.match(entry, /\{ key: "consentLabel", label: "Consent wording", type: "textarea" \}/);
  assert.match(entry, /\{ key: "consentVersion", label: "Consent version", type: "number", default: 1 \}/);
});
