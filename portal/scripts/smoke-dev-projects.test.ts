// Dev Editor Engine — project entity guard.
//
// A DevProject is the binding that unifies the engine: repo + ref + the GitHub
// / Vercel CONNECTION IDS + the Aqua Tag + the project kind. The security-
// critical contract is that a project stores connection IDS only, and that a
// connection belonging to ANOTHER agency can never be bound (which would let a
// project resolve another tenant's token).

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

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

type DevProjects = typeof import("../src/engines/editor/server/devProjects");
type Storage = typeof import("../src/server/storage");

let devProjects: DevProjects;
let storage: Storage;

const AGENCY = "agency_test_devproj";
const OTHER_AGENCY = "agency_other_devproj";
const ACTOR = "user_test";

before(async () => {
  process.env.PORTAL_STORAGE_BACKEND = "memory";
  storage = await import("../src/server/storage");
  devProjects = await import("../src/engines/editor/server/devProjects");
  await storage.ensureHydrated();
});

describe("dev projects — the engine's project binding", () => {
  it("creates a project with a repo, ref and kind", () => {
    const project = devProjects.saveDevProject({
      agencyId: AGENCY, name: "AquaCRM", kind: "software", repository: "edstorm987/aquacrm", actorUserId: ACTOR,
    });
    assert.equal(project.name, "AquaCRM");
    assert.equal(project.kind, "software");
    assert.equal(project.repository, "edstorm987/aquacrm");
    assert.equal(project.ref, "main", "ref defaults to main");
    assert.ok(project.id.startsWith("devproj_"));
  });

  it("normalises a pasted GitHub URL down to owner/repository", () => {
    const project = devProjects.saveDevProject({
      agencyId: AGENCY, name: "Pasted", repository: "https://github.com/edstorm987/aquacrm.git", actorUserId: ACTOR,
    });
    assert.equal(project.repository, "edstorm987/aquacrm");
  });

  it("keeps a blank repository blank (reads the local working tree)", () => {
    const project = devProjects.saveDevProject({ agencyId: AGENCY, name: "Local", repository: "", actorUserId: ACTOR });
    assert.equal(project.repository, "");
  });

  it("supports MANY projects per agency and scopes the list by agency", () => {
    devProjects.saveDevProject({ agencyId: OTHER_AGENCY, name: "Someone else", actorUserId: ACTOR });
    const mine = devProjects.listDevProjects(AGENCY);
    assert.ok(mine.length >= 3, "the agency sees its own projects");
    assert.ok(!mine.some(p => p.name === "Someone else"), "another agency's project never appears");
  });

  it("rejects a connection id that does not exist / is not this agency's", () => {
    assert.throws(
      () => devProjects.saveDevProject({
        agencyId: AGENCY, name: "Stolen", githubConnectionId: "conn_does_not_exist", actorUserId: ACTOR,
      }),
      /integration_not_found/,
      "a project must never bind an unknown or cross-tenant connection",
    );
  });

  it("never stores a raw token on the project record", () => {
    const project = devProjects.saveDevProject({ agencyId: AGENCY, name: "Credential check", actorUserId: ACTOR });
    // Assert on the SHAPE, not on a substring of the JSON — a project's own
    // name could legitimately contain a word like "secret".
    const keys = Object.keys(project);
    for (const forbidden of ["token", "secret", "encryptedSecrets", "config", "password", "apiKey"]) {
      assert.ok(!keys.includes(forbidden), `a project must not carry a ${forbidden} field`);
    }
    // Only ever ids that POINT at the vault.
    assert.ok(keys.includes("githubConnectionId") && keys.includes("vercelConnectionId"), "it binds connections by id");
  });

  it("returns no token when nothing is bound (callers fall back)", () => {
    const project = devProjects.saveDevProject({ agencyId: AGENCY, name: "Unbound", actorUserId: ACTOR });
    assert.equal(devProjects.devProjectGitHubToken(AGENCY, project), null);
  });

  it("unlocks the visual editor only when an Aqua Tag is mapped to a non-software project", () => {
    const site = devProjects.saveDevProject({ agencyId: AGENCY, name: "Site", kind: "website", aquaTagId: "tag_1", actorUserId: ACTOR });
    const siteNoTag = devProjects.saveDevProject({ agencyId: AGENCY, name: "Site 2", kind: "website", actorUserId: ACTOR });
    const software = devProjects.saveDevProject({ agencyId: AGENCY, name: "App", kind: "software", aquaTagId: "tag_2", actorUserId: ACTOR });
    assert.equal(devProjects.devProjectVisualEditorUnlocked(site), true, "tag + website unlocks the visual editor");
    assert.equal(devProjects.devProjectVisualEditorUnlocked(siteNoTag), false, "no tag, no visual editor");
    assert.equal(devProjects.devProjectVisualEditorUnlocked(software), false, "software is code-only");
  });

  it("updates in place rather than duplicating, and preserves createdAt", () => {
    const created = devProjects.saveDevProject({ agencyId: AGENCY, name: "Renamed", ref: "dev", actorUserId: ACTOR, now: 1000 });
    const updated = devProjects.saveDevProject({ agencyId: AGENCY, id: created.id, name: "Renamed twice", actorUserId: ACTOR, now: 2000 });
    assert.equal(updated.id, created.id);
    assert.equal(updated.name, "Renamed twice");
    assert.equal(updated.createdAt, 1000, "createdAt is preserved");
    assert.equal(updated.updatedAt, 2000);
  });

  it("scopes client projects (what Dev Mode injection reads)", () => {
    const project = devProjects.saveDevProject({ agencyId: AGENCY, name: "Client site", kind: "website", clientId: "cli_123", actorUserId: ACTOR });
    const forClient = devProjects.listDevProjectsForClient(AGENCY, "cli_123");
    assert.deepEqual(forClient.map(p => p.id), [project.id]);
    assert.equal(devProjects.listDevProjectsForClient(AGENCY, "cli_nope").length, 0);
  });

  it("deletes a project, and only its own agency's", () => {
    const project = devProjects.saveDevProject({ agencyId: AGENCY, name: "Temporary", actorUserId: ACTOR });
    assert.equal(devProjects.deleteDevProject(OTHER_AGENCY, project.id, ACTOR), null, "another agency cannot delete it");
    assert.ok(devProjects.deleteDevProject(AGENCY, project.id, ACTOR));
    assert.equal(devProjects.getDevProject(AGENCY, project.id), null);
  });
});
