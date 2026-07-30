import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
type Toolkit = typeof import("../src/server/developmentToolkit");

let storage: Storage;
let tenants: Tenants;
let toolkit: Toolkit;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "smoke-test-vault-key-that-is-not-production";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  toolkit = await import("../src/server/developmentToolkit");
  await storage.ensureHydrated();
  await storage.reset();
});

test("toolkit resources support stages, SOPs, visibility and search-ready metadata", () => {
  const agency = tenants.createAgency({ name: "Development Smoke", slug: "development-smoke" });
  const flow = toolkit.ensureDefaultDevelopmentWorkflow(agency.id, "owner");
  const resource = toolkit.createDevelopmentResource(agency.id, {
    kind: "component",
    title: "Checkout block",
    description: "Reusable conversion component",
    category: "Ecommerce",
    localPath: "github-templates/modules/ecommerce",
    tags: ["checkout", "reusable"],
    framework: "React + Tailwind",
    codeSnippet: "export function CheckoutBlock() { return <section />; }",
    workflowStageIds: [
      toolkit.developmentStageRef(flow.id, "design"),
      toolkit.developmentStageRef(flow.id, "build"),
    ],
    sopIds: ["sop_quality"],
    visibility: "team",
  }, "owner");
  assert.deepEqual(resource.workflowStageIds, [`${flow.id}:design`, `${flow.id}:build`]);
  assert.equal(resource.framework, "React + Tailwind");
  assert.match(resource.codeSnippet ?? "", /CheckoutBlock/);
  assert.deepEqual(resource.sopIds, ["sop_quality"]);
  assert.equal(toolkit.listVisibleDevelopmentResources(agency.id, "staff", "agency-staff").length, 1);

  const privateResource = toolkit.createDevelopmentResource(agency.id, {
    kind: "knowledge",
    title: "Private notes",
    visibility: "private",
  }, "owner");
  assert.equal(toolkit.listVisibleDevelopmentResources(agency.id, "staff", "agency-staff").some(item => item.id === privateResource.id), false);
  assert.equal(toolkit.listVisibleDevelopmentResources(agency.id, "owner", "agency-owner").some(item => item.id === privateResource.id), true);
});

test("shared passwords are encrypted at rest, redacted from list payloads, and role-gated on reveal", () => {
  const agency = tenants.createAgency({ name: "Vault Smoke", slug: "vault-smoke" });
  const resource = toolkit.createDevelopmentResource(agency.id, {
    kind: "credential",
    title: "Canva team",
    credential: {
      loginUrl: "https://www.canva.com/login",
      username: "team@example.com",
      password: "SuperSecretValue!",
      accessRoles: ["agency-owner", "agency-manager"],
      notes: "Use the shared brand workspace.",
    },
  }, "owner");
  assert.ok(resource.credential?.encryptedPassword);
  assert.notEqual(resource.credential?.encryptedPassword, "SuperSecretValue!");
  const publicRecord = toolkit.publicDevelopmentResource(resource);
  assert.equal("encryptedPassword" in (publicRecord.credential ?? {}), false);
  assert.equal(publicRecord.credential?.hasPassword, true);
  assert.equal(toolkit.revealDevelopmentPassword(agency.id, resource.id, "agency-owner"), "SuperSecretValue!");
  assert.throws(() => toolkit.revealDevelopmentPassword(agency.id, resource.id, "agency-staff"), /do not have access/i);
});

test("development workflows are adaptable and retain ordered stages", () => {
  const agency = tenants.createAgency({ name: "Flow Smoke", slug: "flow-smoke" });
  const flow = toolkit.createDevelopmentWorkflow(agency.id, {
    name: "Photography",
    productCategory: "Photography",
    stages: [
      { name: "Brief" },
      { name: "Shoot" },
      { name: "Select" },
      { name: "Deliver" },
    ],
  }, "owner");
  const component = toolkit.createDevelopmentResource(agency.id, {
    kind: "component",
    title: "Photo grid",
    workflowStageIds: [toolkit.developmentStageRef(flow.id, flow.stages[1].id)],
  }, "owner");
  assert.deepEqual(flow.stages.map(stage => stage.name), ["Brief", "Shoot", "Select", "Deliver"]);
  const updated = toolkit.updateDevelopmentWorkflow(agency.id, flow.id, {
    stages: [{ name: "Book" }, { name: "Shoot" }, { name: "Retouch" }, { name: "Deliver" }],
  });
  assert.deepEqual(updated?.stages.map(stage => stage.name), ["Book", "Shoot", "Retouch", "Deliver"]);
  assert.deepEqual(
    toolkit.getDevelopmentResource(agency.id, component.id)?.workflowStageIds,
    [toolkit.developmentStageRef(flow.id, updated!.stages[1].id)],
  );
});

test("workflow insertions and reordering preserve attachments by stage identity", () => {
  const agency = tenants.createAgency({ name: "Flow Identity", slug: "flow-identity" });
  const flow = toolkit.createDevelopmentWorkflow(agency.id, {
    name: "Website",
    stages: [
      { id: "brief", name: "Brief" },
      { id: "design", name: "Design" },
      { id: "build", name: "Build" },
    ],
  }, "owner");
  const resource = toolkit.createDevelopmentResource(agency.id, {
    kind: "component",
    title: "Design system",
    workflowStageIds: [toolkit.developmentStageRef(flow.id, "design")],
  }, "owner");

  const inserted = toolkit.updateDevelopmentWorkflow(agency.id, flow.id, {
    stages: [
      { name: "Qualification" },
      { name: "Brief" },
      { name: "Design" },
      { name: "Build" },
    ],
  });
  assert.equal(inserted?.stages.find(stage => stage.name === "Design")?.id, "design");
  assert.deepEqual(
    toolkit.getDevelopmentResource(agency.id, resource.id)?.workflowStageIds,
    [toolkit.developmentStageRef(flow.id, "design")],
  );

  const reordered = toolkit.updateDevelopmentWorkflow(agency.id, flow.id, {
    stages: [
      { name: "Build" },
      { name: "Design" },
      { name: "Qualification" },
      { name: "Brief" },
    ],
  });
  assert.equal(reordered?.stages[1]?.id, "design");
  assert.deepEqual(
    toolkit.getDevelopmentResource(agency.id, resource.id)?.workflowStageIds,
    [toolkit.developmentStageRef(flow.id, "design")],
  );
});

test("legacy stage names are migrated onto the default workflow without leaking into another flow", () => {
  const agency = tenants.createAgency({ name: "Legacy Flow", slug: "legacy-flow" });
  const flow = toolkit.ensureDefaultDevelopmentWorkflow(agency.id, "owner");
  const resource = toolkit.createDevelopmentResource(agency.id, {
    kind: "template",
    title: "Legacy template",
    workflowStageIds: ["design"],
  }, "owner");
  const secondFlow = toolkit.createDevelopmentWorkflow(agency.id, {
    name: "Brand delivery",
    stages: [{ name: "Design" }, { name: "Deliver" }],
  }, "owner");

  toolkit.ensureDefaultDevelopmentWorkflow(agency.id, "owner");
  const migrated = toolkit.getDevelopmentResource(agency.id, resource.id);
  assert.deepEqual(migrated?.workflowStageIds, [toolkit.developmentStageRef(flow.id, "design")]);
  assert.equal(migrated?.workflowStageIds.includes(toolkit.developmentStageRef(secondFlow.id, "design")), false);
});

test("navigation, APIs, upload and global search expose the complete Development workspace", () => {
  const sidebar = readFileSync("src/lib/chrome/sidebarLayout.ts", "utf8");
  const nav = readFileSync("src/app/portal/agency/development/_DevelopmentNav.tsx", "utf8");
  const api = readFileSync("src/app/api/portal/development/route.ts", "utf8");
  const upload = readFileSync("src/app/api/portal/development/upload/route.ts", "utf8");
  const content = readFileSync("src/app/api/portal/development/content/route.ts", "utf8");
  const loader = readFileSync("src/app/portal/agency/development/_loadDevelopmentData.ts", "utf8");
  const workspace = readFileSync("src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx", "utf8");
  const toolkit = readFileSync("src/server/developmentToolkit.ts", "utf8");
  const search = readFileSync("src/app/api/portal/search/route.ts", "utf8");
  assert.match(sidebar, /href: "\/portal\/agency\/development"/);
  for (const path of ["toolkit", "workflow", "vault"]) assert.match(nav, new RegExp(`development/${path}`));
  assert.match(api, /catalogue:workspace/);
  assert.match(api, /credential:reveal/);
  assert.match(api, /hasSharedLogin/);
  assert.match(upload, /25 \* 1024 \* 1024/);
  assert.match(content, /await get\(resource\.file\.storageKey, \{ access: "private"/);
  assert.doesNotMatch(content, /NextResponse\.redirect\(resource\.file\.storageKey\)/);
  assert.doesNotMatch(loader, /mode === "workflow" \? 500/);
  assert.match(workspace, /resource\.file\?\.contentType\.startsWith\("image\/"\)/);
  assert.match(workspace, /item\.group === mode/);
  assert.doesNotMatch(toolkit, /PORTAL_VAULT_ENCRYPTION_KEY \|\| process\.env\.PORTAL_SESSION_SECRET/);
  assert.match(search, /listVisibleDevelopmentResources/);
});

test("Development control centre covers websites, portals and software", () => {
  const page = readFileSync("src/app/portal/agency/development/page.tsx", "utf8");
  const portfolio = readFileSync("src/app/portal/agency/development/_DevelopmentPortfolio.tsx", "utf8");
  const firstParty = readFileSync("src/lib/firstPartyDevelopmentProjects.ts", "utf8");
  const propertyApi = readFileSync("src/app/api/tenants/client-properties/route.ts", "utf8");
  assert.match(page, /FIRST_PARTY_DEVELOPMENT_PROJECTS/);
  for (const project of ["Milesymedia website", "Milesymedia portal", "Business OS", "Health Check"]) {
    assert.match(firstParty, new RegExp(project));
  }
  for (const view of ["All projects", "Websites", "Portals", "Software", "Lead magnets", "Needs attention"]) {
    assert.match(portfolio, new RegExp(view));
  }
  assert.match(portfolio, /action: "update"/);
  assert.match(portfolio, /Filter project status/);
  assert.match(propertyApi, /"software"/);
  assert.match(propertyApi, /"lead-magnet"/);
});
