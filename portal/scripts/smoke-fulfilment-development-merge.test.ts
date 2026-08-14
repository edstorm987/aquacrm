import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { destinationForOperationalAlert, type OperationalAlert } from "../src/lib/operationalAttention";

const root = process.cwd();

async function source(path: string) {
  return readFile(`${root}/${path}`, "utf8");
}

test("Fulfilment is the single sidebar destination for delivery and development", async () => {
  const sidebar = await source("src/lib/chrome/sidebarLayout.ts");
  assert.match(sidebar, /id: "fulfilment"/);
  assert.doesNotMatch(sidebar, /items\.push\(\{ id: "development"/);

  const workspace = await source("src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx");
  assert.match(workspace, /id: "technical", label: "Technical delivery"/);
  assert.match(workspace, /view === "technical"/);
});

test("technical delivery navigation stays inside Fulfilment", async () => {
  const nav = await source("src/app/portal/agency/development/_DevelopmentNav.tsx");
  assert.match(nav, /\/portal\/agency\/fulfilment\?view=technical/);
  assert.match(nav, /\/portal\/agency\/fulfilment\/technical\/performance/);
  assert.doesNotMatch(nav, /href: "\/portal\/agency\/development/);

  const search = await source("src/app/api/portal/search/route.ts");
  assert.doesNotMatch(search, /href: "\/portal\/agency\/development/);
});

test("development and outage alerts roll up to Fulfilment attention", () => {
  const base: OperationalAlert = {
    id: "test",
    severity: "warning",
    category: "development",
    title: "Technical issue",
    detail: "Evidence",
    href: "/portal/agency/development/website",
    occurredAt: Date.now(),
  };

  assert.equal(destinationForOperationalAlert(base), "fulfilment");
  assert.equal(destinationForOperationalAlert({ ...base, category: "outage", href: "/somewhere" }), "fulfilment");
  assert.equal(destinationForOperationalAlert({ ...base, href: "/portal/clients/client_1?tab=systems" }), "fulfilment");
});
