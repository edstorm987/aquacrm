// rank-my-website smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId } from "../lib/tenancy";
import type {
  ActivityLogPort, EventBusPort, FetchPageResult,
  FunnelCapturePort, HttpFetchPort,
} from "../server/ports";
import { HttpFetchError } from "../server/ports";
import {
  containerWithDeps,
  RmwInputError,
  checkUrlSafety,
  worstBand,
  checkTitle, checkMetaDescription, checkH1, checkImageAlts,
  checkOgTags, checkCanonical, checkHttps, checkHsts,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_milesy_master";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  http: HttpFetchPort;
  funnel: FunnelCapturePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[]; captured: { email: string; toolId: string }[] };
}

function buildWorld(opts: {
  pageResponses?: Map<string, FetchPageResult | HttpFetchError>;
  reachableUrls?: Set<string>;
} = {}): World {
  const pageResponses = opts.pageResponses ?? new Map();
  const reachableUrls = opts.reachableUrls ?? new Set();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const captured: { email: string; toolId: string }[] = [];
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  const http: HttpFetchPort = {
    async fetchPage(url, _opts) {
      const r = pageResponses.get(url);
      if (!r) throw new HttpFetchError("network", "no_mock_response_for_" + url);
      if (r instanceof HttpFetchError) throw r;
      return r;
    },
    async reachable(url, _opts) {
      return reachableUrls.has(url);
    },
  };
  let userSeq = 1;
  const funnel: FunnelCapturePort = {
    captureToolCompletion(input) {
      captured.push({ email: input.email, toolId: input.toolId });
      return { leadUserId: `user_lead_${userSeq++}`, created: true, session: "tok" };
    },
  };
  return { http, funnel, activity, events: eventBus, inspect: { activityLog, events, captured } };
}

function container(world: World, withFunnel = true) {
  return containerWithDeps({
    agencyId: AGENCY,
    activity: world.activity, events: world.events,
    http: world.http,
    ...(withFunnel ? { funnel: world.funnel } : {}),
  });
}

// HTML fixtures.
const GOOD_HTML = `
<!doctype html>
<html><head>
  <title>Acme Co — Modern Skincare for Sensitive Skin Types</title>
  <meta name="description" content="Acme makes a fragrance-free moisturiser specifically designed for sensitive skin. Free shipping in the UK. Subscribe and save 10%." />
  <link rel="canonical" href="https://acme.example/" />
  <meta property="og:title" content="Acme" />
  <meta property="og:description" content="d" />
  <meta property="og:image" content="https://acme.example/og.png" />
  <meta property="og:url" content="https://acme.example/" />
</head><body>
  <h1>Acme Co</h1>
  <img src="/a.jpg" alt="bottle" />
  <img src="/b.jpg" alt="ingredients" />
</body></html>`;

const BAD_HTML = `
<!doctype html><html><head>
  <title>Hi</title>
</head><body>
  <h1>One</h1><h1>Two</h1>
  <img src="/a.jpg" />
  <img src="/b.jpg" alt="" />
  <img src="/c.jpg" />
  <img src="/d.jpg" />
</body></html>`;

describe("@aqua/plugin-rank-my-website smoke", () => {
  // ── URL safety ─────────────────────────────────────────────

  test("1. checkUrlSafety rejects malformed / non-http / loopback / private IPv4 / link-local / localhost", () => {
    assert.equal(checkUrlSafety("not a url").ok, false);
    assert.equal(checkUrlSafety("ftp://x.com").ok, false);
    assert.equal(checkUrlSafety("http://localhost").ok, false);
    assert.equal(checkUrlSafety("http://127.0.0.1").ok, false);
    assert.equal(checkUrlSafety("http://192.168.0.1").ok, false);
    assert.equal(checkUrlSafety("http://10.1.2.3").ok, false);
    assert.equal(checkUrlSafety("http://172.16.5.5").ok, false);
    assert.equal(checkUrlSafety("http://169.254.1.2").ok, false);
    assert.equal(checkUrlSafety("https://acme.example/").ok, true);
  });

  // ── Pure checks ────────────────────────────────────────────

  test("2. checkTitle bands by length (sweet 50-60 → A; very short → F)", () => {
    assert.equal(checkTitle(GOOD_HTML).band, "A");
    assert.equal(checkTitle("<title>Short title</title>").band, "D");
    assert.equal(checkTitle("<html></html>").band, "F");
  });

  test("3. checkMetaDescription bands by length (sweet 120-160 → A; absent → F)", () => {
    assert.equal(checkMetaDescription(GOOD_HTML).band, "A");
    assert.equal(checkMetaDescription("<html></html>").band, "F");
  });

  test("4. checkH1 — 1 → A, 0 → F, 2 → C, 3+ → D", () => {
    assert.equal(checkH1(GOOD_HTML).band, "A");
    assert.equal(checkH1("<html></html>").band, "F");
    assert.equal(checkH1(BAD_HTML).band, "C");
    assert.equal(checkH1("<h1>1</h1><h1>2</h1><h1>3</h1>").band, "D");
  });

  test("5. checkImageAlts — full coverage A; mixed missing F (2/4 alt'd → 50% → D, 3/4 missing → F)", () => {
    assert.equal(checkImageAlts(GOOD_HTML).band, "A");
    // BAD_HTML has 4 imgs: only b has alt="" (still counts as having an alt attr present); others a/c/d missing
    // missing = 3 (a, c, d), coverage 1/4 = 0.25 → F
    const r = checkImageAlts(BAD_HTML);
    assert.equal(r.band, "F");
    assert.match(r.finding, /3 of 4/);
  });

  test("6. checkOgTags — all four → A, missing 2 → C, missing 4 → F", () => {
    assert.equal(checkOgTags(GOOD_HTML).band, "A");
    const partial = `<meta property="og:title" content="x" /><meta property="og:image" content="y" />`;
    assert.equal(checkOgTags(partial).band, "C");
    assert.equal(checkOgTags("").band, "F");
  });

  test("7. checkCanonical — present A, absent D", () => {
    assert.equal(checkCanonical(GOOD_HTML).band, "A");
    assert.equal(checkCanonical("<html></html>").band, "D");
  });

  test("8. checkHttps + checkHsts respect response context", () => {
    assert.equal(checkHttps({ isHttps: true, hsts: null, robotsTxtOk: false, sitemapXmlOk: false }).band, "A");
    assert.equal(checkHttps({ isHttps: false, hsts: null, robotsTxtOk: false, sitemapXmlOk: false }).band, "F");
    assert.equal(checkHsts({ isHttps: true, hsts: "max-age=63072000", robotsTxtOk: false, sitemapXmlOk: false }).band, "A");
    assert.equal(checkHsts({ isHttps: true, hsts: null, robotsTxtOk: false, sitemapXmlOk: false }).band, "C");
    assert.equal(checkHsts({ isHttps: false, hsts: null, robotsTxtOk: false, sitemapXmlOk: false }).band, "F");
  });

  test("9. worstBand returns the worst, not an average (A site with one F → F)", () => {
    assert.equal(worstBand([
      { id: "title", label: "x", band: "A", finding: "" },
      { id: "h1", label: "x", band: "F", finding: "" },
      { id: "https", label: "x", band: "A", finding: "" },
    ]), "F");
  });

  // ── Service: runDiagnostic ───────────────────────────────

  test("10. runDiagnostic happy path produces 10 checks + overall band; emits diagnostic.run", async () => {
    setClock(() => T0);
    const w = buildWorld({
      pageResponses: new Map<string, FetchPageResult>([
        ["https://acme.example/", {
          finalUrl: "https://acme.example/",
          status: 200,
          body: GOOD_HTML,
          headers: { "strict-transport-security": "max-age=63072000" },
        }],
      ]),
      reachableUrls: new Set([
        "https://acme.example/robots.txt",
        "https://acme.example/sitemap.xml",
      ]),
    });
    const c = container(w);
    const r = await c.rmw.runDiagnostic({ url: "https://acme.example/" });
    assert.equal(r.checks.length, 10);
    assert.equal(r.overallBand, "A");
    assert.equal(r.fetchError, undefined);
    assert.ok(w.inspect.events.some(e => e.name === "rank-my-website.diagnostic.run"));
    resetClock();
  });

  test("11. runDiagnostic on bad page → overallBand reflects worst (F due to no canonical/desc)", async () => {
    setClock(() => T0);
    const w = buildWorld({
      pageResponses: new Map<string, FetchPageResult>([
        ["http://acme.example/", {
          finalUrl: "http://acme.example/",
          status: 200,
          body: BAD_HTML,
          headers: {},
        }],
      ]),
    });
    const c = container(w);
    const r = await c.rmw.runDiagnostic({ url: "http://acme.example/" });
    assert.equal(r.overallBand, "F");
    const httpsCheck = r.checks.find(x => x.id === "https");
    assert.equal(httpsCheck?.band, "F");
    resetClock();
  });

  test("12. runDiagnostic rejects unsafe URLs with RmwInputError (private IP / loopback / non-http)", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await assert.rejects(
      () => c.rmw.runDiagnostic({ url: "http://127.0.0.1/" }),
      (err: unknown) => err instanceof RmwInputError,
    );
    await assert.rejects(
      () => c.rmw.runDiagnostic({ url: "ftp://example.com/" }),
      (err: unknown) => err instanceof RmwInputError,
    );
    resetClock();
  });

  test("13. runDiagnostic on fetch timeout → ships report w/ overallBand:F + fetchError.kind:timeout (no fabrication)", async () => {
    setClock(() => T0);
    const w = buildWorld({
      pageResponses: new Map([
        ["https://acme.example/", new HttpFetchError("timeout", "5s exceeded")],
      ]),
    });
    const c = container(w);
    const r = await c.rmw.runDiagnostic({ url: "https://acme.example/" });
    assert.equal(r.overallBand, "F");
    assert.equal(r.checks.length, 0);
    assert.equal(r.fetchError?.kind, "timeout");
    assert.ok(w.inspect.events.some(e => e.name === "rank-my-website.diagnostic.failed"));
    resetClock();
  });

  // ── Capture handoff ──────────────────────────────────────

  test("14. capture hands off to public-funnel and emits handed-off event", async () => {
    setClock(() => T0);
    const w = buildWorld({
      pageResponses: new Map<string, FetchPageResult>([
        ["https://acme.example/", { finalUrl: "https://acme.example/", status: 200, body: GOOD_HTML, headers: {} }],
      ]),
    });
    const c = container(w);
    const report = await c.rmw.runDiagnostic({ url: "https://acme.example/" });
    const handoff = await c.rmw.capture({ email: "ed@example.com", url: "https://acme.example/", report });
    assert.ok("leadUserId" in handoff && handoff.leadUserId.startsWith("user_lead_"));
    assert.equal(w.inspect.captured[0]?.email, "ed@example.com");
    assert.equal(w.inspect.captured[0]?.toolId, "rank-my-website");
    assert.ok(w.inspect.events.some(e => e.name === "rank-my-website.capture.handed-off"));
    resetClock();
  });

  test("15. capture without funnel port returns guidance string (no silent drop)", async () => {
    setClock(() => T0);
    const w = buildWorld({
      pageResponses: new Map<string, FetchPageResult>([
        ["https://acme.example/", { finalUrl: "https://acme.example/", status: 200, body: GOOD_HTML, headers: {} }],
      ]),
    });
    const c = container(w, false);  // no funnel port
    const report = await c.rmw.runDiagnostic({ url: "https://acme.example/" });
    const handoff = await c.rmw.capture({ email: "ed@example.com", url: "https://acme.example/", report });
    assert.ok("handedOff" in handoff && handoff.handedOff === false);
    assert.equal((handoff as { reason: string }).reason, "public_funnel_plugin_not_installed");
    resetClock();
  });

  test("16. activity entries use category 'rank-my-website' with rank-my-website.* prefix", async () => {
    setClock(() => T0);
    const w = buildWorld({
      pageResponses: new Map<string, FetchPageResult>([
        ["https://acme.example/", { finalUrl: "https://acme.example/", status: 200, body: GOOD_HTML, headers: {} }],
      ]),
    });
    const c = container(w);
    await c.rmw.runDiagnostic({ url: "https://acme.example/" });
    const cats = new Set(w.inspect.activityLog.map(e => e.category));
    assert.deepEqual([...cats], ["rank-my-website"]);
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.some(a => a.startsWith("rank-my-website.")));
    resetClock();
  });
});

resetClock();
