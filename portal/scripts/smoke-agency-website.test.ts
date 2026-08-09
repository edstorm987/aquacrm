import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Website = typeof import("../src/server/agencyWebsite");

let storage: Storage;
let tenants: Tenants;
let website: Website;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  website = await import("../src/server/agencyWebsite");
  await storage.ensureHydrated();
  await storage.reset();
});

test("Milesymedia website is a first-party project with release and page controls", () => {
  const agency = tenants.createAgency({ name: "Milesymedia", slug: "milesymedia" });
  const project = website.ensureAgencyWebsite(agency.id);
  assert.equal(project.firstParty, true);
  assert.equal(project.status, "gated");
  assert.deepEqual(project.pages.map(page => page.route), ["/", "/client-centre"]);

  const maintenance = website.updateAgencyWebsite(agency.id, { status: "maintenance" }, "owner");
  assert.equal(maintenance.status, "maintenance");
  const updating = website.updateAgencyWebsitePage(
    agency.id,
    "/client-centre",
    { status: "updating", message: "Improving client access." },
    "owner",
  );
  assert.equal(updating?.pages.find(page => page.route === "/client-centre")?.status, "updating");
  assert.equal(website.websitePageIsUpdating(updating, "/client-centre")?.message, "Improving client access.");
});

test("Aqua tag events are accepted and summarised separately from clients", () => {
  const agency = tenants.createAgency({ name: "Aqua Tag", slug: "aqua-tag" });
  const project = website.ensureAgencyWebsite(agency.id);
  const now = Date.now();
  assert.equal(website.recordAgencyWebsiteTelemetry(project.telemetrySiteKey, {
    type: "pageview",
    occurredAt: now,
    path: "/",
    url: "https://milesymedia.co/",
  })?.status, "recorded");
  assert.equal(website.recordAgencyWebsiteTelemetry(project.telemetrySiteKey, {
    type: "performance",
    metric: "load",
    value: 840,
    occurredAt: now,
  })?.status, "recorded");
  const stored = website.ensureAgencyWebsite(agency.id);
  const summary = website.summarizeAgencyWebsite(stored);
  assert.equal(summary.pageviews24h, 1);
  assert.equal(summary.averageLoadMs, 840);
  assert.ok(stored.telemetryLastSeenAt);
});

test("public site, Development and Marketing share the website source of truth", () => {
  const layout = readFileSync("src/app/(website)/layout.tsx", "utf8");
  const collector = readFileSync("src/app/api/telemetry/collect/route.ts", "utf8");
  const development = readFileSync("src/app/portal/agency/development/website/_WebsiteWorkspace.tsx", "utf8");
  const marketing = readFileSync("src/app/portal/agency/marketing/page.tsx", "utf8");
  assert.match(layout, /data-site-key=\{website\.telemetrySiteKey\}/);
  assert.match(collector, /recordAgencyWebsiteTelemetry/);
  assert.match(development, /Website preview/);
  assert.match(development, /Official site/);
  assert.match(development, /Public gate/);
  assert.match(development, /page-status/);
  assert.match(marketing, /Open website control/);
});
