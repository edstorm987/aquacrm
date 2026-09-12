// ABUSE-003 — actual mounted Website Editor visitor writes require exact
// managed-challenge action/host/form proof, and Aqua Tag form capture requires
// a short-lived signed admission instead of trusting its browser-public key.
// Local/in-process only: every Turnstile response and persistence surface is a
// fixture; this suite never calls a provider or a live database.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "abuse-003-local-admission-secret";
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
// Consent-audit persistence is intercepted by the fixture fetch below. Force a
// non-live target so this behavioral suite can never inherit real credentials.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abuse-003.invalid";
process.env.SUPABASE_SECRET_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "abuse-003-local-only-service-key";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { POST as issueAdmission } from "../src/app/api/public/aqua-tag-admission/route";
import { POST as collectTelemetry } from "../src/app/api/telemetry/collect/route";
import {
  aquaTagCaptureDigest,
  issueAquaTagFormAdmission,
  resolveAquaTagAdmissionScope,
  verifyAquaTagFormAdmission,
  type AquaTagFormFacts,
} from "../src/lib/server/security/aquaTagFormAdmission";
import { ensureClientTelemetry } from "../src/lib/server/clients/clientTelemetryService";
import { ensureAgencyWebsite } from "../src/server/agencyWebsite";
import { getState, mutate } from "../src/server/storage";
import { createAgency, createClient, updateClient } from "../src/server/tenants";
import {
  addWebsiteSource,
  ensureAgencyMasterSiteKey,
  resolveAgencyByMasterSiteKey,
  updateWebsiteSourceRouting,
} from "../src/server/websiteSources";
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
const capturedConsentRows: Array<Record<string, unknown>> = [];

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
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url.startsWith("https://abuse-003.invalid/rest/v1/website_consent_events")) {
      const raw = typeof init?.body === "string" ? init.body : await new Request(input, init).text();
      const parsed = JSON.parse(raw) as Record<string, unknown> | Array<Record<string, unknown>>;
      capturedConsentRows.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      return new Response(null, { status: 201 });
    }
    const params = new URLSearchParams(String(init?.body ?? ""));
    const token = params.get("response") ?? "";
    const action = token.startsWith("tag-wrong-action")
      ? "website-contact"
      : token.startsWith("tag-") || token.startsWith("tag@")
        ? "aqua-tag-form-capture"
        : token.startsWith("wrong-action")
      ? "website-newsletter"
      : token.startsWith("newsletter") ? "website-newsletter" : "website-contact";
    const hostname = token.startsWith("wrong-host") || token.startsWith("tag-wrong-host")
      ? "attacker.example"
      : token.startsWith("tag@") ? token.slice(4)
        : token.startsWith("tag-") ? "milesymedia.com" : "portal.example.test";
    return new Response(JSON.stringify({
      success: !token.startsWith("invalid"),
      action,
      hostname,
      challenge_ts: new Date().toISOString(),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

beforeEach(() => {
  __resetBotChallengeForTest();
  capturedConsentRows.length = 0;
});
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
    challengeHostname: "site.example.test",
    keyClass: "agency-master" as const,
    siteId: "site_scope_id",
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
    assert.equal(verifyAquaTagFormAdmission({ token: issued.token, scope: { ...scope, challengeHostname: "www.site.example.test" }, facts, now: 1_001_000 }).ok, false);
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
      captchaToken: "tag-valid-admission",
      fields: [
        { key: "email", value: "visitor@example.test" },
        // A hostile caller can bypass the browser tag and try to copy proof
        // into captured answers. The issuer must discard it server-side.
        { key: "cf-turnstile-response", value: "tag-valid-admission" },
      ],
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
    assert.equal((await post("https://milesymedia.com", { ...base, captchaToken: undefined })).status, 403,
      "a spoofed allowed Origin without managed proof became a signing oracle");
    assert.equal((await post("https://milesymedia.com", { ...base, captchaToken: "tag-wrong-action" })).status, 403);
    assert.equal((await post("https://milesymedia.com", { ...base, captchaToken: "tag-wrong-host" })).status, 403);
    __resetBotChallengeForTest();
    const accepted = await post("https://milesymedia.com", base);
    assert.equal(accepted.status, 201);
    const body = await accepted.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["admission", "expiresAt", "ok", "submissionId"]);
    assert.equal(body.submissionId, base.submissionId);
    const publicScope = resolveAquaTagAdmissionScope(base.siteKey, "https://milesymedia.com");
    assert.ok(publicScope);
    assert.equal(verifyAquaTagFormAdmission({
      token: body.admission,
      scope: publicScope,
      facts: {
        submissionId: base.submissionId,
        formName: base.formName,
        pageUrl: base.pageUrl,
        pagePath: base.pagePath,
        propertyId: base.propertyId,
        fields: [{ key: "email", value: "visitor@example.test" }],
      },
    }).ok, true, "challenge proof leaked into the admission's captured-field digest");
  });

  it("keeps www routing canonical while binding proof to the exact request hostname", async () => {
    const base = {
      siteKey: "aqua_public_milesymedia_v1",
      propertyId: "milesymedia",
      submissionId: "aqua_sub_wwwadmission000001",
      pageUrl: "https://www.milesymedia.com/contact",
      pagePath: "/contact",
      formName: "Website enquiry",
      fields: [{ key: "email", value: "visitor@example.test" }],
    };
    const post = (origin: string, captchaToken: string, pageUrl = base.pageUrl) => issueAdmission(new NextRequest(
      "http://localhost/api/public/aqua-tag-admission",
      {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": `198.51.100.${captchaToken.length}` },
        body: JSON.stringify({ ...base, pageUrl, captchaToken }),
      },
    ));
    const wwwScope = resolveAquaTagAdmissionScope(base.siteKey, "https://www.milesymedia.com");
    const apexScope = resolveAquaTagAdmissionScope(base.siteKey, "https://milesymedia.com");
    assert.equal(wwwScope?.host, "milesymedia.com");
    assert.equal(wwwScope?.challengeHostname, "www.milesymedia.com");
    assert.equal(apexScope?.host, "milesymedia.com");
    assert.equal(apexScope?.challengeHostname, "milesymedia.com");

    assert.equal((await post("https://www.milesymedia.com", "tag@milesymedia.com")).status, 403,
      "an apex proof must not satisfy a www request");
    __resetBotChallengeForTest();
    assert.equal((await post("https://www.milesymedia.com", "tag@www.milesymedia.com")).status, 201);
    __resetBotChallengeForTest();
    assert.equal((await post("https://milesymedia.com", "tag@www.milesymedia.com", "https://milesymedia.com/contact")).status, 403,
      "a www proof must not satisfy an apex request");
    __resetBotChallengeForTest();
    assert.equal((await post("https://www.milesymedia.com", "tag@www.milesymedia.com", "https://milesymedia.com/contact")).status, 403,
      "the signed page hostname must equal the exact request hostname");
  });

  it("routes every emitted key class through one exact tenant/site/registered-host mapping", async () => {
    const publicScope = resolveAquaTagAdmissionScope("aqua_public_milesymedia_v1", "https://milesymedia.com");
    assert.equal(publicScope?.keyClass, "public");
    assert.equal(resolveAquaTagAdmissionScope("aqua_public_milesymedia_v1", "https://attacker.example"), null);

    const agency = createAgency({ name: "ABUSE 003 registry", slug: `abuse-003-registry-${Date.now()}` });
    const client = createClient(agency.id, { name: "Registry client", websiteUrl: "https://client-registry.example" });
    const clientKey = ensureClientTelemetry(agency.id, client.id)?.siteKey;
    assert.ok(clientKey);
    const source = addWebsiteSource({
      agencyId: agency.id,
      host: "master-registry.example",
      destinationClientId: client.id,
      createdBy: "owner",
    });
    const masterKey = ensureAgencyMasterSiteKey(agency.id);
    const masterScope = resolveAquaTagAdmissionScope(masterKey, "https://master-registry.example");
    assert.deepEqual(
      { keyClass: masterScope?.keyClass, siteId: masterScope?.siteId, clientId: masterScope?.clientId },
      { keyClass: "agency-master", siteId: source.id, clientId: client.id },
    );
    assert.equal(resolveAquaTagAdmissionScope(masterKey, "https://client-registry.example"), null,
      "a master key was accepted on an unregistered host");

    const clientScope = resolveAquaTagAdmissionScope(clientKey!, "https://client-registry.example");
    assert.equal(clientScope?.keyClass, "client-telemetry");
    assert.equal(clientScope?.agencyId, agency.id);
    assert.equal(clientScope?.clientId, client.id);
    assert.equal(resolveAquaTagAdmissionScope(clientKey!, "https://attacker.example"), null);

    const website = ensureAgencyWebsite(agency.id);
    const websiteScope = resolveAquaTagAdmissionScope(website.telemetrySiteKey, website.productionUrl);
    assert.equal(websiteScope?.keyClass, "agency-website");
    assert.equal(websiteScope?.agencyId, agency.id);
    assert.equal(resolveAquaTagAdmissionScope(website.telemetrySiteKey, "https://attacker.example"), null);

    const issueFor = async (siteKey: string, rawOrigin: string, sequence: number) => {
      const origin = new URL(rawOrigin).origin;
      const hostname = new URL(origin).hostname;
      const response = await issueAdmission(new NextRequest("http://localhost/api/public/aqua-tag-admission", {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": `198.51.100.${70 + sequence}` },
        body: JSON.stringify({
          siteKey,
          submissionId: `aqua_sub_keyclass0000000${sequence}`,
          pageUrl: `${origin}/contact`,
          pagePath: "/contact",
          formName: "Contact",
          captchaToken: `tag@${hostname}`,
          fields: [{ key: "email", value: "visitor@example.test" }],
        }),
      }));
      assert.equal(response.status, 201, `${siteKey} did not mint an exact host-bound admission`);
    };
    await issueFor(masterKey, "https://master-registry.example", 1);
    await issueFor(clientKey!, "https://client-registry.example", 2);
    await issueFor(website.telemetrySiteKey, website.productionUrl, 3);
  });

  it("refuses a shared master key when two agencies register the same exact host", async () => {
    const sharedKey = `aqua_shared_master_${Date.now()}`;
    const sharedHost = "shared-master.example";
    const agencyA = createAgency({ name: "Master collision A", slug: `master-collision-a-${Date.now()}` });
    const agencyB = createAgency({ name: "Master collision B", slug: `master-collision-b-${Date.now()}` });
    for (const agency of [agencyA, agencyB]) {
      addWebsiteSource({ agencyId: agency.id, host: sharedHost, createdBy: "owner" });
    }
    mutate(state => {
      state.agencyMasterTagKeys ??= {};
      state.agencyMasterTagKeys[agencyA.id] = sharedKey;
      state.agencyMasterTagKeys[agencyB.id] = sharedKey;
    });

    assert.equal(resolveAgencyByMasterSiteKey(sharedKey), undefined,
      "the compatibility resolver must not pick the first corrupt owner");
    assert.equal(resolveAquaTagAdmissionScope(sharedKey, `https://${sharedHost}`), null,
      "admission must count both exact key/host owners and fail closed");

    const response = await issueAdmission(new NextRequest("http://localhost/api/public/aqua-tag-admission", {
      method: "POST",
      headers: {
        origin: `https://${sharedHost}`,
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.184",
      },
      body: JSON.stringify({
        siteKey: sharedKey,
        submissionId: "aqua_sub_mastercollision0001",
        pageUrl: `https://${sharedHost}/contact`,
        pagePath: "/contact",
        formName: "Shared host form",
        fields: [{ key: "email", value: "visitor@example.test" }],
        captchaToken: `tag@${sharedHost}`,
      }),
    }));
    assert.equal(response.status, 403, "a duplicate master-key owner received a signed admission");
  });

  it("host-validates non-hardcoded telemetry without adding CAPTCHA to beacons", async () => {
    const agency = createAgency({ name: "ABUSE 003 telemetry", slug: `abuse-003-telemetry-${Date.now()}` });
    const client = createClient(agency.id, { name: "Telemetry client", websiteUrl: "https://telemetry-client.example" });
    const clientKey = ensureClientTelemetry(agency.id, client.id)?.siteKey;
    assert.ok(clientKey);
    const body = {
      siteKey: clientKey,
      type: "pageview",
      category: "analytics",
      consentNecessary: true,
      consentAnalytics: true,
      occurredAt: Date.now(),
      path: "/",
    };
    const post = (origin: string) => collectTelemetry(new NextRequest("http://localhost/api/telemetry/collect", {
      method: "POST",
      headers: { origin, "content-type": "application/json", "x-forwarded-for": "203.0.113.80" },
      body: JSON.stringify(body),
    }));
    assert.equal((await post("https://attacker.example")).status, 403);
    assert.equal((await post("https://telemetry-client.example")).status, 202);
    assert.equal(Object.hasOwn(body, "captchaToken"), false, "telemetry was coupled to a human challenge");
  });

  it("records agency master-tag telemetry against the exact registered source and fails closed on collision", async () => {
    const host = "master-telemetry.example";
    const agency = createAgency({ name: "Master telemetry agency", slug: `master-telemetry-${Date.now()}` });
    const source = addWebsiteSource({ agencyId: agency.id, host, createdBy: "owner" });
    const siteKey = ensureAgencyMasterSiteKey(agency.id);
    ensureAgencyWebsite(agency.id);
    const body = {
      siteKey,
      type: "pageview",
      category: "analytics",
      consentNecessary: true,
      consentAnalytics: true,
      occurredAt: Date.now(),
      path: "/master-source",
    };
    const post = (origin: string, ip: string, payload = body) => collectTelemetry(new NextRequest(
      "http://localhost/api/telemetry/collect",
      {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(payload),
      },
    ));

    assert.equal((await post(`https://${host}`, "203.0.113.210")).status, 202);
    const recorded = getState().agencyWebsites[agency.id]?.telemetryEvents ?? [];
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]?.propertyId, source.id, "the registered source was not preserved as the property fallback");
    assert.equal(recorded[0]?.path, "/master-source");
    assert.equal((await post("https://attacker.example", "203.0.113.211")).status, 403);
    assert.equal(getState().agencyWebsites[agency.id]?.telemetryEvents.length, 1);

    const collidingAgency = createAgency({ name: "Master telemetry collision", slug: `master-telemetry-collision-${Date.now()}` });
    addWebsiteSource({ agencyId: collidingAgency.id, host, createdBy: "owner" });
    mutate(state => {
      state.agencyMasterTagKeys ??= {};
      state.agencyMasterTagKeys[collidingAgency.id] = siteKey;
    });
    assert.equal(
      (await post(`https://${host}`, "203.0.113.212", { ...body, occurredAt: body.occurredAt + 1 })).status,
      403,
      "two exact master-key/host owners must fail closed",
    );
    assert.equal(getState().agencyWebsites[agency.id]?.telemetryEvents.length, 1);
    assert.equal(getState().agencyWebsites[collidingAgency.id]?.telemetryEvents.length ?? 0, 0);
  });

  it("writes a duplicate browser key only to the exact host-resolved tenant and fails closed on ambiguity", async () => {
    const sharedKey = `aqua_duplicate_${Date.now()}`;
    const agencyA = createAgency({ name: "Telemetry tenant A", slug: `telemetry-a-${Date.now()}` });
    const agencyB = createAgency({ name: "Telemetry tenant B", slug: `telemetry-b-${Date.now()}` });
    const clientA = createClient(agencyA.id, { name: "Tenant A client", websiteUrl: "https://tenant-a.example" });
    const clientB = createClient(agencyB.id, { name: "Tenant B client", websiteUrl: "https://tenant-b.example" });
    updateClient(agencyA.id, clientA.id, { metadata: { telemetrySiteKey: sharedKey, telemetryEvents: [] } });
    updateClient(agencyB.id, clientB.id, { metadata: { telemetrySiteKey: sharedKey, telemetryEvents: [] } });
    const body = {
      siteKey: sharedKey,
      type: "pageview",
      category: "analytics",
      consentNecessary: true,
      consentAnalytics: true,
      occurredAt: Date.now(),
      path: "/exact-owner",
    };
    const post = (origin: string, payload = body) => collectTelemetry(new NextRequest("http://localhost/api/telemetry/collect", {
      method: "POST",
      headers: { origin, "content-type": "application/json", "x-forwarded-for": "203.0.113.181" },
      body: JSON.stringify(payload),
    }));

    assert.equal((await post("https://tenant-b.example")).status, 202);
    assert.equal((getState().clients[clientA.id]?.metadata?.telemetryEvents as unknown[] | undefined)?.length ?? 0, 0);
    assert.equal((getState().clients[clientB.id]?.metadata?.telemetryEvents as unknown[] | undefined)?.length ?? 0, 1);

    updateClient(agencyA.id, clientA.id, { websiteUrl: "https://tenant-b.example" });
    assert.equal((await post("https://tenant-b.example", { ...body, occurredAt: body.occurredAt + 1 })).status, 403,
      "two owners for one exact key/host must fail closed");
    assert.equal((getState().clients[clientB.id]?.metadata?.telemetryEvents as unknown[] | undefined)?.length ?? 0, 1);
  });

  it("persists immutable consent lineage through key rotation, rerouting and later collision", async () => {
    const origin = "https://consent-lineage.example";
    const agency = createAgency({ name: "Consent lineage agency", slug: `consent-lineage-${Date.now()}` });
    const firstClient = createClient(agency.id, { name: "First consent owner", websiteUrl: "https://first-owner.example" });
    const secondClient = createClient(agency.id, { name: "Second consent owner", websiteUrl: "https://second-owner.example" });
    const siteKey = ensureClientTelemetry(agency.id, firstClient.id)?.siteKey;
    assert.ok(siteKey);
    const source = addWebsiteSource({
      agencyId: agency.id,
      host: origin,
      destinationClientId: firstClient.id,
      createdBy: "owner",
    });
    const consent = (anonymousId: string, occurredAt: number) => ({
      siteKey,
      propertyId: "lineage-property",
      anonymousId,
      type: "consent",
      category: "necessary",
      consentNecessary: true,
      consentPreferences: false,
      consentAnalytics: false,
      consentMarketing: false,
      consentVersion: 3,
      occurredAt,
    });
    const post = (body: Record<string, unknown>, ip: string) => collectTelemetry(new NextRequest(
      "http://localhost/api/telemetry/collect",
      {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      },
    ));

    assert.equal((await post(consent("anon-first-visitor", 1_750_000_000_000), "203.0.113.190")).status, 202);
    assert.equal(capturedConsentRows.length, 1);
    const firstMetadata = structuredClone(capturedConsentRows[0]!.metadata) as Record<string, unknown>;
    assert.deepEqual(firstMetadata, {
      origin,
      resolvedScope: {
        agencyId: agency.id,
        clientId: firstClient.id,
        siteId: source.id,
        siteKey,
        host: "consent-lineage.example",
        keyClass: "client-telemetry",
      },
    });
    assert.doesNotMatch(JSON.stringify(firstMetadata), /anon-first-visitor|email|captcha/i,
      "lineage metadata leaked visitor or challenge material");

    updateClient(agency.id, firstClient.id, { metadata: { telemetrySiteKey: `aqua_rotated_${Date.now()}` } });
    updateClient(agency.id, secondClient.id, { metadata: { telemetrySiteKey: siteKey, telemetryEvents: [] } });
    assert.equal(updateWebsiteSourceRouting({
      agencyId: agency.id,
      id: source.id,
      destinationClientId: secondClient.id,
    })?.destinationClientId, secondClient.id);
    assert.equal((await post(consent("anon-second-visitor", 1_750_000_000_100), "203.0.113.191")).status, 202);
    assert.equal(capturedConsentRows.length, 2);
    assert.deepEqual(capturedConsentRows[0]!.metadata, firstMetadata,
      "later key/routing state rewrote the first consent attribution");
    assert.equal(
      (capturedConsentRows[1]!.metadata as { resolvedScope?: { clientId?: string } }).resolvedScope?.clientId,
      secondClient.id,
    );

    const otherAgency = createAgency({ name: "Consent collision agency", slug: `consent-collision-${Date.now()}` });
    const collidingClient = createClient(otherAgency.id, { name: "Colliding consent owner", websiteUrl: origin });
    updateClient(otherAgency.id, collidingClient.id, { metadata: { telemetrySiteKey: siteKey, telemetryEvents: [] } });
    assert.equal((await post(consent("anon-collision", 1_750_000_000_200), "203.0.113.192")).status, 403);
    assert.equal(capturedConsentRows.length, 2, "an ambiguous key/host collision wrote an unattributable consent row");
    assert.deepEqual(capturedConsentRows[0]!.metadata, firstMetadata);
  });
});
