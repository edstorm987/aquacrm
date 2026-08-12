import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Development opens on an operational dashboard before the project workspace", () => {
  const page = read("src/app/portal/agency/development/page.tsx");
  const dashboard = read("src/app/portal/agency/development/_DevelopmentDashboard.tsx");
  const nav = read("src/app/portal/agency/development/_DevelopmentNav.tsx");
  const portfolio = read("src/app/portal/agency/development/_DevelopmentPortfolio.tsx");

  assert.match(page, /view = requested\.view === "workspace" \? "workspace" : "overview"/);
  assert.match(page, /initialStatus=\{initialStatus\}/);
  assert.match(page, /<DevelopmentDashboard/);
  assert.match(page, /<DevelopmentPortfolio initialProjects=\{projects\} initialStatus=\{initialStatus\} \/>/);
  assert.match(dashboard, /Development dashboard/);
  assert.match(dashboard, /Open development workspace/);
  assert.match(dashboard, /Build pipeline/);
  assert.match(dashboard, /view=workspace&status=\$\{stage\.status\}/);
  assert.match(dashboard, /Attention queue/);
  assert.match(dashboard, /Signals today/);
  assert.match(dashboard, /Development library/);
  assert.match(nav, /label: "Dashboard"/);
  assert.match(nav, /label: "Projects"/);
  assert.match(nav, /label: "Website"/);
  assert.match(portfolio, /Back to dashboard/);
});

test("Development dashboard uses live portfolio, monitoring, workflow, resource and SOP counts", () => {
  const page = read("src/app/portal/agency/development/page.tsx");
  const dashboard = read("src/app/portal/agency/development/_DevelopmentDashboard.tsx");

  assert.match(page, /listVisibleDevelopmentResources/);
  assert.match(page, /listDevelopmentWorkflows/);
  assert.match(page, /listSops/);
  assert.match(dashboard, /project\.errors24h/);
  assert.match(dashboard, /project\.tagStatus/);
  assert.match(dashboard, /project\.views24h/);
  assert.match(dashboard, /project\.lastSignalAt/);
  assert.match(dashboard, /toolkitCount/);
  assert.match(dashboard, /workflowCount/);
});
