// ABUSE-003 — actual mounted Website Editor visitor writes require exact
// managed-challenge action/host/form proof, and Aqua Tag form capture requires
// a short-lived signed admission instead of trusting its browser-public key.
// Local/in-process only: every Turnstile response and persistence surface is a
// fixture; this suite never calls a provider or a live database.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "abuse-003-local-admission-secret";
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { POST as issueAdmission } from "../src/app/api/public/aqua-tag-admission/route";
import {
  aquaTagCaptureDigest,
  issueAquaTagFormAdmission,
  verifyAquaTagFormAdmission,
  type AquaTagFormFacts,
} from "../src/lib/server/security/aquaTagFormAdmission";
import {
  __resetBotChallengeForTest,
} from "../src/lib/server/security/botChallenge";
import {
  handleVisitorContact,
  handleVisitorNewsletter,
} from "../src/built-ins/modules/website-editor/src/api/handlers/visitor";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import {
  visitorContactConsentDigest,
} from "../src/built-ins/modules/website-editor/src/lib/visitorContactConsent";
import {
  VISITOR_NEWSLETTER_CONSENT_PURPOSE,
  visitorNewsletterConsentDigest,
} from "../src/built-ins/modules/website-editor/src/lib/visitorNewsletterConsent";
import { createPage, publishPage } from "../src/built-ins/modules/website-editor/src/server/pages";
import { createSite } from "../src/built-ins/modules/website-editor/src/server/sites";

const ORIGIN = "https://portal.example.test";
const CONTACT_STATEMENT = "I agree that this site may use these details to respond to my request.";
const NEWSLETTER_STATEMENT = "I agree to receive the newsletter by email.";
let realFetch: typeof fetch;

function memoryStorage(): PluginStorage {
  const data = new Map<string, unknown>();
  let tail: Promise<unknown> = Promise.resolve();
  return {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    runExclusive<T>(_key: string, operation: () => Promise<T>): Promise<T> {
      const run = tail.then(operation);
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}

function context(storage = memoryStorage(), agencyId = "agency_abuse_003", clientId = "client_abuse_003"): PluginCtx {
  return {
    agencyId,
    clientId,
    actor: "anonymous",
    storage,
    services: {} as PluginCtx["services"],
    install: { id: `install_${agencyId}_${clientId}`, pluginId: "website-editor" } as PluginCtx["install"],
  };
}

async function fixture() {
  const ctx = context();
  const site = await createSite(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    name: "ABUSE-003 site",
    slug: "abuse-003-site",
  });
  const page = await createPage(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    siteId: site.id,
    title: "Home",
    blocks: [
      { id: "contact_block", type: "contact-form", props: { consentLabel: CONTACT_STATEMENT, consentVersion: 1 } },
      { id: "newsletter_block", type: "newsletter-signup", props: { consentLabel: NEWSLETTER_STATEMENT, consentVersion: 1 } },
    ],
  });
  await publishPage(ctx.storage, ctx.agencyId, ctx.clientId!, site.id, page.id);
  return { ctx, site, page };
}

async function contactBody(siteId: string, pageId: string, operationId: string, token: string, email = "victim@example.test") {
  return {
    version: 1,
    operationId,
    siteId,
    pageId,
    blockId: "contact_block",
    contact: { name: "Visitor", email, message: "Please call me." },
    consent: {
      agreed: true,
      purpose: "contact-request",
      version: 1,
      statementDigest: await visitorContactConsentDigest(CONTACT_STATEMENT),
    },
    captchaToken: token,
    website: "",
  };
}

async function newsletterBody(siteId: string, pageId: string, operationId: string, token: string) {
  return {
    version: 1,
    operationId,
    siteId,
    pageId,
    blockId: "newsletter_block",
    email: "newsletter-victim@example.test",
    consent: {
      agreed: true,
      purpose: VISITOR_NEWSLETTER_CONSENT_PURPOSE,
      version: 1,
      statementDigest: await visitorNewsletterConsentDigest(NEWSLETTER_STATEMENT),
    },
    captchaToken: token,
    honeypot: "",
  };
}

function request(path: string, body: unknown, ip: string) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      referer: `${ORIGIN}/home`,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const params = new URLSearchParams(String(init?.body ?? ""));
    const token = params.get("response") ?? "";
    const action = token.startsWith("wrong-action")
      ? "website-newsletter"
      : token.startsWith("newsletter") ? "website-newsletter" : "website-contact";
    const hostname = token.startsWith("wrong-host") ? "attacker.example" : "portal.example.test";
    return new Response(JSON.stringify({
      success: !token.startsWith("invalid"),
      action,
      hostname,
      challenge_ts: new Date().toISOString(),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

beforeEach(() => __resetBotChallengeForTest());
after(() => { globalThis.fetch = realFetch; });

describe("Website Editor public visitor challenge boundary", { concurrency: false }, () => {
  it("binds contact proof to the exact action, registered host and published form before any write", async () => {
    const ready = await fixture();
    const wrongAction = await handleVisitorContact(
      request("/api/portal/website-editor/visitor/contact", await contactBody(ready.site.id, ready.page.id, "contact_wrong_action", "wrong-action-1"), "198.51.100.1"),
      ready.ctx,
    );
    assert.equal(wrongAction.status, 403);
    const wrongHost = await handleVisitorContact(
      request("/api/portal/website-editor/visitor/contact", await contactBody(ready.site.id, ready.page.id, "contact_wrong_host", "wrong-host-1"), "198.51.100.2"),
      ready.ctx,
    );
    assert.equal(wrongHost.status, 403);
    const wrongForm = await handleVisitorContact(
      request("/api/portal/website-editor/visitor/contact", {
        ...await contactBody(ready.site.id, ready.page.id, "contact_wrong_form", "contact-valid-form"),
        blockId: "newsletter_block",
      }, "198.51.100.3"),
      ready.ctx,
    );
    assert.equal(wrongForm.status, 404);
    assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 0);

    const accepted = await handleVisitorContact(
      request("/api/portal/website-editor/visitor/contact", await contactBody(ready.site.id, ready.page.id, "contact_valid_0001", "contact-valid-1"), "198.51.100.4"),
      ready.ctx,
    );
    assert.equal(accepted.status, 201);
    assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 1);
  });

  it("does not let failed proof spend a victim digest and never accepts caller-stamped lineage", async () => {
    const ready = await fixture();
    for (let index = 0; index < 3; index += 1) {
      const refused = await handleVisitorContact(
        request("/api/portal/website-editor/visitor/contact", await contactBody(
          ready.site.id,
          ready.page.id,
          `contact_invalid_${index}`,
          `invalid-${index}`,
        ), `198.51.100.${20 + index}`),
        ready.ctx,
      );
      assert.equal(refused.status, 403);
    }
    for (let index = 0; index < 10; index += 1) {
      const accepted = await handleVisitorContact(
        request("/api/portal/website-editor/visitor/contact", await contactBody(
          ready.site.id,
          ready.page.id,
          `contact_address_${String(index).padStart(4, "0")}`,
          `contact-valid-${index}`,
        ), `203.0.113.${20 + index}`),
        ready.ctx,
      );
      assert.equal(accepted.status, 201, `invalid proof spent the victim address budget at ${index}`);
    }
    const limited = await handleVisitorContact(
      request("/api/portal/website-editor/visitor/contact", await contactBody(
        ready.site.id,
        ready.page.id,
        "contact_address_9999",
        "contact-valid-last",
      ), "203.0.113.99"),
      ready.ctx,
    );
    assert.equal(limited.status, 429);
    const forged = await handleVisitorContact(
      request("/api/portal/website-editor/visitor/contact", {
        ...await contactBody(ready.site.id, ready.page.id, "contact_forged_0001", "contact-valid-forged", "other@example.test"),
        agencyId: "agency_attacker",
        clientId: "client_attacker",
      }, "203.0.113.100"),
      ready.ctx,
    );
    assert.equal(forged.status, 400);
  });

  it("uses a distinct newsletter action and keeps the exact tenant/form scope", async () => {
    const ready = await fixture();
    const contactToken = await handleVisitorNewsletter(
      request("/api/portal/website-editor/visitor/newsletter", await newsletterBody(
        ready.site.id,
        ready.page.id,
        "newsletter_wrong_0001",
        "contact-valid-newsletter",
      ), "198.51.100.40"),
      ready.ctx,
    );
    assert.equal(contactToken.status, 403);
    const accepted = await handleVisitorNewsletter(
      request("/api/portal/website-editor/visitor/newsletter", await newsletterBody(
        ready.site.id,
        ready.page.id,
        "newsletter_valid_0001",
        "newsletter-valid-1",
      ), "198.51.100.41"),
      ready.ctx,
    );
    assert.equal(accepted.status, 201);
    const other = context(memoryStorage(), "agency_other", "client_other");
    const crossTenant = await handleVisitorNewsletter(
      request("/api/portal/website-editor/visitor/newsletter", await newsletterBody(
        ready.site.id,
        ready.page.id,
        "newsletter_cross_0001",
        "newsletter-valid-2",
      ), "198.51.100.42"),
      other,
    );
    assert.equal(crossTenant.status, 404);
  });
});

describe("Aqua Tag signed form admission", { concurrency: false }, () => {
  const scope = {
    agencyId: "agency_scope",
    siteKey: "site_scope",
    host: "site.example.test",
    propertyId: "property_scope",
  };
  const facts: AquaTagFormFacts = {
    submissionId: "aqua_sub_0123456789abcdef",
    formName: "Quote form",
    formId: "quote",
    purpose: "quote",
    pageUrl: "https://site.example.test/quote",
    pagePath: "/quote",
    propertyId: "property_scope",
    fields: [{ key: "email", value: "visitor@example.test", type: "email" }],
  };

  it("binds one answer-free token to action, tenant, site, host, form, payload digest and bounded age", () => {
    const issued = issueAquaTagFormAdmission(scope, facts, 1_000_000);
    assert.ok(issued);
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope, facts, now: 1_001_000 }).ok, true);
    const [payload] = issued.token.split(".");
    const wrongActionClaims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    wrongActionClaims.action = "telemetry";
    const wrongActionPayload = Buffer.from(JSON.stringify(wrongActionClaims)).toString("base64url");
    const wrongActionSignature = createHmac(
      "sha256",
      `aqua-tag-form-admission:v1\u0000${process.env.AQUA_TAG_ADMISSION_SECRET ?? process.env.PORTAL_SESSION_SECRET}`,
    ).update(wrongActionPayload).digest("base64url");
    assert.equal(verifyAquaTagFormAdmission({
      token: `${wrongActionPayload}.${wrongActionSignature}`,
      scope,
      facts,
      now: 1_001_000,
    }).ok, false);
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope: { ...scope, agencyId: "agency_other" }, facts, now: 1_001_000 }).ok, false);
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope: { ...scope, host: "other.example.test" }, facts, now: 1_001_000 }).ok, false);
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope: { ...scope, siteKey: "other_site" }, facts, now: 1_001_000 }).ok, false);
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope, facts: { ...facts, formId: "other" }, now: 1_001_000 }).ok, false);
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope, facts: { ...facts, fields: [{ key: "email", value: "victim@example.test" }] }, now: 1_001_000 }).ok, false);
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope, facts, now: issued.expiresAt }).ok, false);
    assert.match(aquaTagCaptureDigest(facts), /^[a-f0-9]{64}$/);
    assert.doesNotMatch(issued.token, /visitor|example\.test|Quote form/);
  });

  it("the real issuer rejects wrong host, page host and caller-supplied lineage", async () => {
    const base = {
      siteKey: "aqua_public_milesymedia_v1",
      propertyId: "milesymedia",
      submissionId: "aqua_sub_admission000000001",
      pageUrl: "https://milesymedia.com/contact",
      pagePath: "/contact",
      formName: "Website enquiry",
      fields: [{ key: "email", value: "visitor@example.test" }],
    };
    const post = (origin: string, body: unknown) => issueAdmission(new NextRequest(
      "http://localhost/api/public/aqua-tag-admission",
      {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.60" },
        body: JSON.stringify(body),
      },
    ));
    assert.equal((await post("https://attacker.example", base)).status, 403);
    assert.equal((await post("https://milesymedia.com", { ...base, pageUrl: "https://attacker.example/contact" })).status, 403);
    assert.equal((await post("https://milesymedia.com", { ...base, agencyId: "agency_attacker" })).status, 400);
    const accepted = await post("https://milesymedia.com", base);
    assert.equal(accepted.status, 201);
    const body = await accepted.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["admission", "expiresAt", "ok", "submissionId"]);
    assert.equal(body.submissionId, base.submissionId);
  });
});
