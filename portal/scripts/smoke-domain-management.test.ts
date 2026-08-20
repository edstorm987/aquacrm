import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isLocalDevelopmentUrl, normalizeWebsiteUrl } from "../src/lib/public/publicUrl";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("normalizes customer domains without confusing local previews with live sites", () => {
  assert.equal(normalizeWebsiteUrl("client.example.com"), "https://client.example.com");
  assert.equal(normalizeWebsiteUrl("https://client.example.com/work"), "https://client.example.com/work");
  assert.equal(normalizeWebsiteUrl("not a domain"), undefined);
  assert.equal(isLocalDevelopmentUrl("http://localhost:3030"), true);
  assert.equal(isLocalDevelopmentUrl("https://client.example.com"), false);
});

test("client settings can change the official domain and keep a website property in sync", () => {
  const page = read("src/app/portal/clients/[clientId]/settings/page.tsx");
  const editor = read("src/app/portal/clients/[clientId]/settings/_ClientDomainSettings.tsx");
  const route = read("src/app/api/tenants/client-domain/route.ts");

  assert.match(page, /ClientDomainSettings/);
  assert.match(editor, /Official website domain/);
  assert.match(editor, /syncPropertyId/);
  assert.match(route, /client\.website_domain_updated/);
  assert.match(route, /localhost address/);
});

test("official sites are the default and local URLs remain explicit previews", () => {
  const explorer = read("src/app/portal/agency/development/projects/[projectId]/_FirstPartyProjectWorkspace.tsx");
  const agencyWebsite = read("src/server/agencyWebsite.ts");
  const websiteWorkspace = read("src/app/portal/agency/development/website/_WebsiteWorkspace.tsx");
  const propertiesRoute = read("src/app/api/tenants/client-properties/route.ts");

  assert.match(explorer, /useState<EnvironmentMode>\("public"\)/);
  assert.match(explorer, /Local preview/);
  assert.match(agencyWebsite, /productionUrl: "https:\/\/milesymedia\.com"/);
  assert.match(agencyWebsite, /previewUrl: "http:\/\/localhost:3030/);
  assert.doesNotMatch(websiteWorkspace, /const realBuildUrl = "http:\/\/localhost/);
  assert.match(websiteWorkspace, /const realBuildUrl = website\.productionUrl/);
  assert.match(propertiesRoute, /Live URL cannot use localhost/);
});
