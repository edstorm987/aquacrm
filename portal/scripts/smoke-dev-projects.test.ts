// DEV EDITOR ENGINE — projects.
//
// A dev project binds {repository, ref, type} to the CONNECTIONS that make it
// reachable: which GitHub connection's token reads it, which Vercel connection
// deploys it, which Aqua Tag install its site reports as. What this pins:
//
//  1. Projects are agency-scoped — one agency can never list, read, or bind
//     another agency's projects or connections.
//  2. A project resolves ITS OWN bound GitHub connection's token, not whichever
//     workspace connection happens to be newest — the whole point of binding.
//  3. Without a binding it falls back workspace connection → environment, the
//     same ladder the ad-hoc files route already walks.
//  4. The site-editor files route and CodeWorkspace actually honour a selected
//     project (route reads `project`, UI offers the selector).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it, test } from "node:test";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Connections = typeof import("../src/lib/server/integrations/integrationConnections");
type DevProjects = typeof import("../src/lib/server/dev/devProjects");

let storage: Storage;
let tenants: Tenants;
let connections: Connections;
let devProjects: DevProjects;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "dev-projects-smoke-vault-key-longer-than-thirty-two-characters";
  // The fallback ladder ends at the environment; the tests control every rung.
  delete process.env.GITHUB_TOKEN;
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  connections = await import("../src/lib/server/integrations/integrationConnections");
  devProjects = await import("../src/lib/server/dev/devProjects");
  await storage.ensureHydrated();
  await storage.reset();
});

test("projects are created, listed, updated, and deleted within one agency", () => {
  const agency = tenants.createAgency({ name: "Projects Home", slug: "projects-home" });
  const other = tenants.createAgency({ name: "Projects Other", slug: "projects-other" });

  const saved = devProjects.saveDevProject({
    agencyId: agency.id,
    name: "Aqua Oasis site",
    type: "website",
    repository: "edstorm987/aquaoasis-web.git",
    ref: "",
    actorUserId: "owner",
  });
  assert.match(saved.id, /^devproj_/);
  assert.equal(saved.repository, "edstorm987/aquaoasis-web", "trailing .git is stripped");
  assert.equal(saved.ref, "main", "blank ref defaults to main");

  // Listed at home, invisible next door — in both directions.
  assert.deepEqual(devProjects.listDevProjects(agency.id).map(project => project.id), [saved.id]);
  assert.deepEqual(devProjects.listDevProjects(other.id), []);
  assert.equal(devProjects.getDevProject(other.id, saved.id), null);

  const updated = devProjects.saveDevProject({
    agencyId: agency.id,
    projectId: saved.id,
    name: "Aqua Oasis website",
    type: "website",
    repository: "edstorm987/aquaoasis-web",
    ref: "develop",
    actorUserId: "manager",
  });
  assert.equal(updated.id, saved.id);
  assert.equal(updated.createdBy, "owner", "updating keeps the creator");
  assert.equal(updated.updatedBy, "manager");
  assert.equal(updated.ref, "develop");

  devProjects.deleteDevProject({ agencyId: agency.id, projectId: saved.id, actorUserId: "owner" });
  assert.deepEqual(devProjects.listDevProjects(agency.id), []);
});

test("invalid repositories, types, and foreign or wrong-provider connections are refused", () => {
  const agency = tenants.createAgency({ name: "Projects Strict", slug: "projects-strict" });
  const other = tenants.createAgency({ name: "Projects Foreign", slug: "projects-foreign" });

  // "owner/.." would survive validation and then URL-normalize into a
  // DIFFERENT GitHub API endpoint than the code believes it is calling.
  for (const repository of ["", "no-slash", "owner/", "/name", "a b/c", "owner/name/extra", "owner/..", "owner/."]) {
    assert.throws(
      () => devProjects.saveDevProject({ agencyId: agency.id, name: "Bad", type: "software", repository, actorUserId: "owner" }),
      /dev_project_repository_invalid/,
      `"${repository}" should be refused`,
    );
  }

  // Enterprise Managed User namespaces carry a mandatory underscore
  // (`handle_shortcode`) and are real GitHub owners — they must save.
  const emu = devProjects.saveDevProject({
    agencyId: agency.id, name: "EMU repo", type: "software",
    repository: "mona_fabrikam/internal-tools", actorUserId: "owner",
  });
  assert.equal(emu.repository, "mona_fabrikam/internal-tools");
  devProjects.deleteDevProject({ agencyId: agency.id, projectId: emu.id, actorUserId: "owner" });

  assert.throws(
    () => devProjects.saveDevProject({
      agencyId: agency.id, name: "Bad", type: "game" as never, repository: "owner/name", actorUserId: "owner",
    }),
    /dev_project_type_invalid/,
  );

  // A connection id from ANOTHER agency's vault must not bind.
  const foreign = connections.saveIntegrationConnection({
    agencyId: other.id,
    provider: "github",
    label: "Foreign GitHub",
    values: { token: "github_pat_foreign" },
    actorUserId: "owner",
  });
  assert.throws(
    () => devProjects.saveDevProject({
      agencyId: agency.id, name: "Leaky", type: "software", repository: "owner/name",
      githubConnectionId: foreign.id, actorUserId: "owner",
    }),
    /dev_project_connection_invalid:github/,
  );

  // A vault connection of the WRONG PROVIDER must not bind to the GitHub slot.
  const stripe = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "stripe",
    label: "Payments",
    values: { secretKey: "sk_test_x", webhookSecret: "whsec_x" },
    actorUserId: "owner",
  });
  assert.throws(
    () => devProjects.saveDevProject({
      agencyId: agency.id, name: "Wrong slot", type: "software", repository: "owner/name",
      githubConnectionId: stripe.id, actorUserId: "owner",
    }),
    /dev_project_connection_invalid:github/,
  );
});

test("a project resolves its own bound connection's token, not the newest workspace one", () => {
  const agency = tenants.createAgency({ name: "Projects Resolve", slug: "projects-resolve" });

  const bound = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "github",
    label: "Client repo bot",
    values: { token: "github_pat_bound_to_project" },
    actorUserId: "owner",
  });
  // Saved AFTER the bound one, so it is the newest — the one the workspace-level
  // fallback would pick. The project must not pick it.
  connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "github",
    label: "Workspace default",
    values: { token: "github_pat_workspace_default" },
    actorUserId: "owner",
  });

  const pinned = devProjects.saveDevProject({
    agencyId: agency.id,
    name: "Client build",
    type: "software",
    repository: "clients/build",
    ref: "main",
    githubConnectionId: bound.id,
    actorUserId: "owner",
  });
  const source = devProjects.resolveDevProjectGitHubSource(agency.id, pinned);
  assert.equal(source?.token, "github_pat_bound_to_project");
  assert.equal(source?.repository, "clients/build");
  assert.equal(source?.ref, "main");

  // Without a binding, the workspace ladder applies — the project resolves
  // exactly what resolveIntegrationValues would hand any other caller. (Not
  // pinned to a literal token: the two connections above can share an
  // updatedAt millisecond, which makes "newest" ambiguous in a test.)
  const unbound = devProjects.saveDevProject({
    agencyId: agency.id,
    name: "Unbound",
    type: "website",
    repository: "clients/unbound",
    actorUserId: "owner",
  });
  assert.equal(
    devProjects.resolveDevProjectGitHubSource(agency.id, unbound)?.token,
    connections.resolveIntegrationValues(agency.id, "github").token,
  );
});

test("with no binding, no workspace connection, and no environment token, resolution says so", () => {
  const agency = tenants.createAgency({ name: "Projects Bare", slug: "projects-bare" });
  const project = devProjects.saveDevProject({
    agencyId: agency.id,
    name: "Unreachable",
    type: "software",
    repository: "owner/unreachable",
    actorUserId: "owner",
  });
  assert.equal(devProjects.resolveDevProjectGitHubSource(agency.id, project), null);
});

test("a project's bound Vercel connection wins, with the same ladder and the same founder-only env gate", () => {
  const agency = tenants.createAgency({ name: "Projects Vercel", slug: "projects-vercel" });
  const bound = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "vercel",
    label: "Client deploys",
    values: { token: "vercel_bound_token", teamId: "team_bound" },
    actorUserId: "owner",
  });
  const project = devProjects.saveDevProject({
    agencyId: agency.id,
    name: "Deployable",
    type: "website",
    repository: "owner/deployable",
    vercelConnectionId: bound.id,
    actorUserId: "owner",
  });
  assert.deepEqual(
    devProjects.resolveDevProjectVercelConfig(agency.id, project),
    { token: "vercel_bound_token", teamId: "team_bound" },
  );

  // No binding, no workspace connection, no entitled env values → null, and
  // the env token must not leak to a non-founder agency.
  process.env.VERCEL_TOKEN = "vercel_founder_env_token";
  try {
    const bare = tenants.createAgency({ name: "Projects Vercel Bare", slug: "projects-vercel-bare" });
    const unbound = devProjects.saveDevProject({
      agencyId: bare.id,
      name: "Undeployable",
      type: "website",
      repository: "owner/undeployable",
      actorUserId: "owner",
    });
    assert.equal(devProjects.resolveDevProjectVercelConfig(bare.id, unbound), null);
  } finally {
    delete process.env.VERCEL_TOKEN;
  }
});

test("the environment token is the FOUNDER'S credential — a non-founder agency never resolves it", () => {
  // The gate under test: resolveIntegrationValues only hands out env values
  // when mayUseEnvironmentCredentials(agencyId) passes. The project resolver
  // must not add an ungated env rung of its own — that rung would fire in
  // exactly the case the gate exists to refuse, serving the founder's private
  // repositories to any other tenant.
  process.env.GITHUB_TOKEN = "github_pat_founder_environment_token";
  try {
    const outsider = tenants.createAgency({ name: "Projects Outsider", slug: "projects-outsider" });
    const project = devProjects.saveDevProject({
      agencyId: outsider.id,
      name: "Founder's private repo",
      type: "software",
      repository: "edstorm987/aquacrm",
      actorUserId: "owner",
    });
    assert.equal(
      devProjects.resolveDevProjectGitHubSource(outsider.id, project),
      null,
      "a non-founder agency with no connection of its own must not inherit the env token",
    );
  } finally {
    delete process.env.GITHUB_TOKEN;
  }
});

test("an Aqua Tag site binds only when it belongs to the agency", async () => {
  const agency = tenants.createAgency({ name: "Projects Tag", slug: "projects-tag" });
  const other = tenants.createAgency({ name: "Projects Tag Other", slug: "projects-tag-other" });
  const websiteSources = await import("../src/server/websiteSources");
  const site = websiteSources.addWebsiteSource({
    agencyId: agency.id,
    host: "aquaoasis.example",
    label: "Aqua Oasis",
    createdBy: "owner",
  });

  const project = devProjects.saveDevProject({
    agencyId: agency.id,
    name: "Tagged site",
    type: "website",
    repository: "owner/tagged",
    aquaTagSiteId: site.id,
    actorUserId: "owner",
  });
  assert.equal(project.aquaTagSiteId, site.id);

  assert.throws(
    () => devProjects.saveDevProject({
      agencyId: other.id, name: "Stolen tag", type: "website", repository: "owner/stolen",
      aquaTagSiteId: site.id, actorUserId: "owner",
    }),
    /dev_project_aqua_tag_invalid/,
  );
});

describe("the files route and CodeWorkspace honour the selected project", () => {
  it("the site-editor files route loads the selected project's source", () => {
    const route = readFileSync(join(ROOT, "src", "app", "api", "portal", "site-editor", "files", "route.ts"), "utf8");
    assert.match(route, /searchParams\.get\("project"\)/);
    assert.match(route, /getDevProject\(session\.agencyId,\s*projectId\)/);
    assert.match(route, /resolveDevProjectGitHubSource\(session\.agencyId,\s*project\)/);
    assert.match(route, /That project could not be found\./);
  });

  it("CodeWorkspace lists projects and pins the selection's repository", () => {
    const workspace = readFileSync(join(ROOT, "src", "app", "portal", "agency", "development", "code", "_CodeWorkspace.tsx"), "utf8");
    assert.match(workspace, /\/api\/portal\/dev\/projects/);
    assert.match(workspace, /aria-label="Project"/);
    assert.match(workspace, /\?project=\$\{encodeURIComponent\(project\.id\)\}/);
    assert.match(workspace, /NewProjectForm/);
  });

  it("the selected project carries a type switcher and the Aqua Tag visual-editor door", () => {
    const workspace = readFileSync(join(ROOT, "src", "app", "portal", "agency", "development", "code", "_CodeWorkspace.tsx"), "utf8");
    // The switchers edit the project in place through the same save action.
    assert.match(workspace, /aria-label="Project type"/);
    assert.match(workspace, /aria-label="Aqua Tag site"/);
    assert.match(workspace, /patchProject\(\{ type:/);
    assert.match(workspace, /patchProject\(\{ aquaTagSiteId:/);
    // Software projects get no door; unrouted or unbound tags explain themselves.
    assert.match(workspace, /if \(project\.type === "software"\) return null/);
    assert.match(workspace, /unlock the visual editor/);
    assert.match(workspace, /VisualEditorDoor/);
    // The door itself: website → the launcher's deep link, portal → the studio.
    const door = readFileSync(join(ROOT, "src", "app", "portal", "agency", "development", "code", "visualEditorDoor.ts"), "utf8");
    assert.match(door, /\/portal\/clients\/\$\{encodeURIComponent\(clientId\)\}\/edit-website/);
    assert.match(door, /\/portal\/agency\/portals\/editor\?scope=client&clientId=/);
    // The activate branch reuses the launcher's install flow verbatim.
    assert.match(workspace, /\/api\/portal\/fulfillment\/marketplace\/install/);
    assert.match(workspace, /pluginId: "website-editor"/);
  });

  it("the projects GET serves the Aqua Tag sites a project can bind", () => {
    const route = readFileSync(join(ROOT, "src", "app", "api", "portal", "dev", "projects", "route.ts"), "utf8");
    assert.match(route, /listWebsiteSources\(session\.agencyId\)/);
    assert.match(route, /aquaTagSites/);
    assert.match(route, /destinationClientId/);
  });
});

test("the visual-editor door routes by type through the tag's destination client", async () => {
  // The pure helper module — the door logic itself, importable without JSX.
  const { visualEditorDoor } = await import("../src/app/portal/agency/development/code/visualEditorDoor");
  const ready = { destinationClientId: "client_9", builderReady: true };

  // Website + installed builder → straight through the launcher's deep link.
  assert.deepEqual(
    visualEditorDoor({ type: "website" }, ready),
    { kind: "open", href: "/portal/clients/client_9/edit-website" },
  );
  // Website without the plugin → activate first, NEVER a link that 404s.
  assert.deepEqual(
    visualEditorDoor({ type: "website" }, { destinationClientId: "client_9" }),
    { kind: "activate", clientId: "client_9", href: "/portal/clients/client_9/edit-website" },
  );
  // Portal → the studio, no plugin gate.
  assert.deepEqual(
    visualEditorDoor({ type: "portal" }, ready),
    { kind: "open", href: "/portal/agency/portals/editor?scope=client&clientId=client_9" },
  );
  assert.equal(visualEditorDoor({ type: "software" }, ready), null);
  assert.equal(visualEditorDoor({ type: "website" }, {}), null, "a tag routed nowhere opens nothing");
  assert.equal(visualEditorDoor({ type: "website" }, null), null);
});
