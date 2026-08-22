// MAP — the one button, and the rule it feeds.
//
//   Ed: "for setup create project create the repo give the editor the repo
//        press a button called map and then it maps everything all good and
//        then when for aqua tag you connect it you have to press map then it
//        creates the aqua tag browser so bloody simple"
//
// Two things are under test here and they are worth naming separately.
//
// 1. THE UNLOCK RULE. `devProjectVisualEditorUnlocked` used to AND in
//    `kind !== "software"`. Every project Ed creates is `software` (it is the
//    default and the setup form has no kind picker), so the browser was gated
//    off everything he builds. The tag alone is now the gate, and the half that
//    must survive — no tag, no browser — is pinned in several directions.
//
// 2. WHAT MAP MAY CONCLUDE. "Tagged" is not a checkbox somebody ticks: a
//    verified tag mints `aquaTagId` from the key the page really carried, and
//    an unverified one must never set it. That is the difference between a gate
//    and a suggestion, so it is asserted from both sides — including the
//    someone-else's-key case, where a tag IS present but is not this agency's.
//
// The repository walk and the tag detector are injected, so nothing here
// touches the network or a real clone. One case deliberately drives the REAL
// filesystem walk against a temp directory, because that walk was moved out of
// the files route in this change and its hiding rules are a credential boundary.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import {
  devProjectMapStatus,
  devProjectVisualEditorUnlocked,
  getDevProject,
  normalizeProjectSiteUrl,
  recordDevProjectMap,
  saveDevProject,
} from "../src/engines/editor/server/devProjects";
import { mapDevProject, mapProjectAquaTag, mapProjectRepository } from "../src/engines/editor/server/mapProject";
import { readWorkspaceFiles } from "../src/engines/editor/server/workspaceFiles";
import { POST, GET } from "../src/app/api/portal/dev/projects/route";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { AquaTagDetection } from "../src/lib/server/integrations/aquaTagDetection";
import type { DevProject, DevProjectMapStatus } from "../src/server/types";

const AGENCY = "agency_map_test";
const OTHER_AGENCY = "agency_map_other";
const ACTOR = "user_map_test";
const MASTER = "aqua_masterkey_MAPTEST";

before(async () => {
  await ensureHydrated();
});

function project(overrides: Partial<Parameters<typeof saveDevProject>[0]> = {}): DevProject {
  return saveDevProject({ agencyId: AGENCY, name: "Mapped", actorUserId: ACTOR, ...overrides });
}

/** A detection result shaped exactly like the real detector's. */
function detection(overrides: Partial<AquaTagDetection> = {}): AquaTagDetection {
  return {
    url: "https://example.test/",
    finalUrl: "https://example.test/",
    reachable: true,
    tagPresent: true,
    keyMatches: true,
    detectedSiteKey: MASTER,
    forms: { total: 1, capturable: 1 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("the address MAP is willing to fetch", () => {
  it("assumes https for a bare domain — what people actually type", () => {
    assert.equal(normalizeProjectSiteUrl("example.com"), "https://example.com/");
  });

  it("keeps an explicit http:// rather than silently upgrading it", () => {
    assert.equal(normalizeProjectSiteUrl("http://localhost:3000/preview"), "http://localhost:3000/preview");
  });

  it("refuses a non-web scheme outright rather than storing it half-accepted", () => {
    // The browser pane will be asked to load whatever this holds, so a
    // `javascript:` address must never survive as far as the record.
    for (const hostile of ["javascript:alert(1)", "data:text/html,<h1>hi", "file:///etc/passwd", "about:blank"]) {
      assert.equal(normalizeProjectSiteUrl(hostile), "", `${hostile} must not be stored`);
    }
  });

  it("refuses an address carrying credentials", () => {
    assert.equal(normalizeProjectSiteUrl("https://user:pass@example.com"), "");
  });

  it("blank stays blank", () => {
    assert.equal(normalizeProjectSiteUrl(undefined), "");
    assert.equal(normalizeProjectSiteUrl("   "), "");
    assert.equal(normalizeProjectSiteUrl("not a url at all"), "");
  });

  it("stores the normalised form on the project, never the raw string", () => {
    const saved = project({ name: "Site url", siteUrl: "  EXAMPLE.com/preview  " });
    assert.equal(saved.siteUrl, "https://example.com/preview");
    assert.equal(project({ name: "Hostile", siteUrl: "javascript:alert(1)" }).siteUrl, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("MAP — the repository half", () => {
  it("maps the local working tree when no repository is named", async () => {
    const repo = await mapProjectRepository(
      { agencyId: AGENCY, project: project({ repository: "" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      {
        now: 1000,
        readWorkspace: async () => [
          { path: "src/app/page.tsx" },
          { path: "src/lib/util.ts" },
          { path: "public/logo.png" },
          { path: "README.md" },
        ],
      },
    );
    assert.equal(repo.source, "workspace");
    assert.equal(repo.fileCount, 4);
    // `mappableCount` is `isMappableFile` — files that render markup, which in
    // this codebase means tsx/jsx/html/md/mdx. So page.tsx AND README.md count;
    // util.ts and logo.png do not. Asserted against the real predicate rather
    // than a guess, because the number is shown to Ed as a headline.
    assert.equal(repo.mappableCount, 2, "page.tsx and README.md render markup; util.ts and logo.png do not");
    assert.deepEqual(repo.directories, ["public", "src"]);
    assert.equal(repo.mappedAt, 1000);
    assert.equal(repo.error, undefined);
  });

  it("maps a named repository from GitHub at its ref, and records the commit", async () => {
    const repo = await mapProjectRepository(
      { agencyId: AGENCY, project: project({ repository: "edstorm987/aquacrm", ref: "dev" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      {
        now: 2000,
        githubToken: "test-token",
        readTree: async source => {
          assert.equal(source.token, "test-token");
          assert.equal(source.repository, "edstorm987/aquacrm");
          assert.equal(source.ref, "dev", "the project's ref is what gets read, not main");
          return { sha: "abc123def456", truncated: false, files: [{ path: "app/index.html" }, { path: "app/main.ts" }] };
        },
      },
    );
    assert.equal(repo.source, "github");
    assert.equal(repo.commitSha, "abc123def456");
    assert.equal(repo.fileCount, 2);
    assert.equal(repo.mappableCount, 1);
    assert.equal(repo.truncated, false);
  });

  it("says so when GitHub truncated the tree — never a silently half-mapped repo", async () => {
    const repo = await mapProjectRepository(
      { agencyId: AGENCY, project: project({ repository: "o/r" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { githubToken: "test-token", readTree: async () => ({ sha: "s", truncated: true, files: [{ path: "a.tsx" }] }) },
    );
    assert.equal(repo.truncated, true, "a missing file must not look like a file that does not exist");
  });

  it("drops a hidden path even if the reader hands one over", async () => {
    // `readRepoTree` filters these already; this proves the rule holds for any
    // supplied list, so a second reader cannot quietly widen what gets mapped.
    const repo = await mapProjectRepository(
      { agencyId: AGENCY, project: project({ repository: "" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      {
        readWorkspace: async () => [
          { path: ".env.local" },
          { path: ".git/config" },
          { path: "node_modules/left-pad/index.js" },
          { path: "src/app/page.tsx" },
        ],
      },
    );
    assert.equal(repo.fileCount, 1, "only the real source file survives");
  });

  it("records a repository failure instead of throwing", async () => {
    const repo = await mapProjectRepository(
      { agencyId: AGENCY, project: project({ repository: "o/r" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { githubToken: "test-token", readTree: async () => { throw new Error("GitHub request failed (404)."); } },
    );
    assert.match(repo.error ?? "", /404/);
    assert.equal(repo.fileCount, 0);
  });

  it("says GitHub is not connected rather than reporting an empty repository", async () => {
    const saved = { GITHUB_TOKEN: process.env.GITHUB_TOKEN };
    delete process.env.GITHUB_TOKEN;
    try {
      const repo = await mapProjectRepository(
        { agencyId: "agency_with_no_connections", project: project({ repository: "o/r" }), masterSiteKey: MASTER, actorUserId: ACTOR },
        { readTree: async () => { throw new Error("must not be reached"); } },
      );
      assert.match(repo.error ?? "", /Connect GitHub/);
    } finally {
      if (saved.GITHUB_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = saved.GITHUB_TOKEN;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("MAP — the Aqua Tag half", () => {
  it("checks nothing when there is no address, and says nothing rather than 'not found'", async () => {
    const tag = await mapProjectAquaTag(
      { agencyId: AGENCY, project: project({ siteUrl: "" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { detect: async () => { throw new Error("must not be reached"); } },
    );
    assert.equal(tag, undefined, "nothing was asked is not the same as we looked and it was absent");
  });

  it("checks the project's address against THIS agency's master key", async () => {
    let seen: { rawUrl: string; masterSiteKey: string } | null = null;
    const tag = await mapProjectAquaTag(
      { agencyId: AGENCY, project: project({ siteUrl: "example.test" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { now: 5000, detect: async input => { seen = input; return detection(); } },
    );
    assert.deepEqual(seen, { rawUrl: "https://example.test/", masterSiteKey: MASTER });
    assert.equal(tag?.tagPresent, true);
    assert.equal(tag?.keyMatches, true);
    assert.equal(tag?.detectedSiteKey, MASTER);
    assert.equal(tag?.checkedAt, 5000);
  });

  it("a tag carrying somebody ELSE's key is present but does not match", async () => {
    const tag = await mapProjectAquaTag(
      { agencyId: AGENCY, project: project({ siteUrl: "example.test" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { detect: async () => detection({ keyMatches: false, detectedSiteKey: "aqua_masterkey_SOMEONE_ELSE" }) },
    );
    assert.equal(tag?.tagPresent, true);
    assert.equal(tag?.keyMatches, false, "another agency's tag is not this agency's tag");
  });

  it("an unreachable site is a recorded result, not a thrown request", async () => {
    const tag = await mapProjectAquaTag(
      { agencyId: AGENCY, project: project({ siteUrl: "example.test" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { detect: async () => detection({ reachable: false, tagPresent: false, keyMatches: false, detectedSiteKey: undefined, error: "The site could not be reached." }) },
    );
    assert.equal(tag?.reachable, false);
    assert.equal(tag?.error, "The site could not be reached.");
  });

  it("a detector that throws is caught and written down", async () => {
    const tag = await mapProjectAquaTag(
      { agencyId: AGENCY, project: project({ siteUrl: "example.test" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { detect: async () => { throw new Error("DNS lookup failed."); } },
    );
    assert.equal(tag?.tagPresent, false);
    assert.equal(tag?.error, "DNS lookup failed.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("MAP — one press, both halves", () => {
  it("a broken repository never takes the tag check down with it", async () => {
    const map = await mapDevProject(
      { agencyId: AGENCY, project: project({ repository: "o/r", siteUrl: "example.test" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      {
        now: 7000,
        githubToken: "test-token",
        readTree: async () => { throw new Error("GitHub is down."); },
        detect: async () => detection(),
      },
    );
    assert.match(map.repo?.error ?? "", /GitHub is down/);
    assert.equal(map.tag?.keyMatches, true, "the tag still verified");
    assert.equal(map.lastMappedAt, 7000);
    assert.equal(map.lastMappedBy, ACTOR);
  });

  it("...and a dead site never takes the repository map down with it", async () => {
    const map = await mapDevProject(
      { agencyId: AGENCY, project: project({ repository: "", siteUrl: "example.test" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      {
        readWorkspace: async () => [{ path: "src/page.tsx" }],
        detect: async () => { throw new Error("gone"); },
      },
    );
    assert.equal(map.repo?.fileCount, 1);
    assert.equal(map.tag?.tagPresent, false);
  });

  it("both halves share ONE timestamp, so the card cannot show two 'last mapped' times", async () => {
    const map = await mapDevProject(
      { agencyId: AGENCY, project: project({ repository: "", siteUrl: "example.test" }), masterSiteKey: MASTER, actorUserId: ACTOR },
      { now: 9000, readWorkspace: async () => [], detect: async () => detection() },
    );
    assert.equal(map.repo?.mappedAt, 9000);
    assert.equal(map.tag?.checkedAt, 9000);
    assert.equal(map.lastMappedAt, 9000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("recording a MAP — what may conclude 'tagged'", () => {
  it("a VERIFIED tag mints the tag id, and that is what turns the browser on", () => {
    const saved = project({ name: "Turns on", siteUrl: "example.test" });
    assert.equal(devProjectVisualEditorUnlocked(saved), false, "before Map: no browser");

    const updated = recordDevProjectMap({
      agencyId: AGENCY,
      id: saved.id,
      actorUserId: ACTOR,
      map: {
        lastMappedAt: 10_000,
        lastMappedBy: ACTOR,
        tag: { url: "https://example.test/", reachable: true, tagPresent: true, keyMatches: true, detectedSiteKey: MASTER, checkedAt: 10_000 },
      },
    });
    assert.equal(updated?.aquaTagId, MASTER, "the id comes from the key the page really carried");
    assert.equal(devProjectVisualEditorUnlocked(updated!), true, "after Map: browser");
    assert.equal(getDevProject(AGENCY, saved.id)?.aquaTagId, MASTER, "and it persisted");
  });

  it("a tag that does NOT answer never sets the id — the gate is not a suggestion", () => {
    const saved = project({ name: "Stays off", siteUrl: "example.test" });
    const updated = recordDevProjectMap({
      agencyId: AGENCY,
      id: saved.id,
      actorUserId: ACTOR,
      map: {
        lastMappedAt: 11_000,
        lastMappedBy: ACTOR,
        tag: { url: "https://example.test/", reachable: true, tagPresent: false, keyMatches: false, checkedAt: 11_000 },
      },
    });
    assert.equal(updated?.aquaTagId, undefined);
    assert.equal(devProjectVisualEditorUnlocked(updated!), false);
  });

  it("a tag carrying another agency's key never sets the id either", () => {
    const saved = project({ name: "Wrong key", siteUrl: "example.test" });
    const updated = recordDevProjectMap({
      agencyId: AGENCY,
      id: saved.id,
      actorUserId: ACTOR,
      map: {
        lastMappedAt: 11_500,
        lastMappedBy: ACTOR,
        tag: { url: "https://example.test/", reachable: true, tagPresent: true, keyMatches: false, detectedSiteKey: "aqua_masterkey_SOMEONE_ELSE", checkedAt: 11_500 },
      },
    });
    assert.equal(updated?.aquaTagId, undefined, "present is not the same as ours");
  });

  // ── THE REVOKE RULE, pinned loudly from every side. ────────────────────────
  //
  // This block used to pin "a failed check never revokes", and that pin was
  // wrong: it let the server hold browserAvailable=true next to
  // tagState="absent", so the card said "Browser available" in green beside
  // "until it answers there is no browser". The rule is now:
  //
  //   absent      (page read fine, snippet not there)   → REVOKE aquaTagId
  //   foreign     (page read fine, different site key)  → REVOKE aquaTagId
  //   unreachable (page could not be read at all)       → KEEP — indeterminate
  //
  // A definitive negative closes the gate; only an indeterminate one preserves
  // it, because a site that is briefly down is not a site that lost its tag.

  it("REVOKES the tag when the page was read and the snippet is gone — a definitive no", () => {
    const saved = project({ name: "Snippet removed", siteUrl: "example.test", aquaTagId: "tag_already_there" });
    const updated = recordDevProjectMap({
      agencyId: AGENCY,
      id: saved.id,
      actorUserId: ACTOR,
      map: {
        lastMappedAt: 11_800,
        lastMappedBy: ACTOR,
        tag: { url: "https://example.test/", reachable: true, tagPresent: false, keyMatches: false, checkedAt: 11_800 },
      },
    });
    assert.equal(updated?.aquaTagId, undefined, "the page answered WITHOUT the tag — keeping the browser on would contradict the card");
    assert.equal(devProjectVisualEditorUnlocked(updated!), false, "no answering tag, no browser");
  });

  it("REVOKES the tag when the page now carries somebody ELSE's key — also a definitive no", () => {
    const saved = project({ name: "Key swapped", siteUrl: "example.test", aquaTagId: "tag_already_there" });
    const updated = recordDevProjectMap({
      agencyId: AGENCY,
      id: saved.id,
      actorUserId: ACTOR,
      map: {
        lastMappedAt: 11_900,
        lastMappedBy: ACTOR,
        tag: { url: "https://example.test/", reachable: true, tagPresent: true, keyMatches: false, detectedSiteKey: "aqua_masterkey_SOMEONE_ELSE", checkedAt: 11_900 },
      },
    });
    assert.equal(updated?.aquaTagId, undefined, "a foreign tag answering there is worse than none — the gate closes");
    assert.equal(devProjectVisualEditorUnlocked(updated!), false);
  });

  it("a site that is briefly down does NOT un-tag a project — unreachable is indeterminate", () => {
    const saved = project({ name: "Flaky", siteUrl: "example.test", aquaTagId: "tag_already_there" });
    const updated = recordDevProjectMap({
      agencyId: AGENCY,
      id: saved.id,
      actorUserId: ACTOR,
      map: {
        lastMappedAt: 12_000,
        lastMappedBy: ACTOR,
        tag: { url: "https://example.test/", reachable: false, tagPresent: false, keyMatches: false, checkedAt: 12_000, error: "timed out" },
      },
    });
    assert.equal(updated?.aquaTagId, "tag_already_there", "nothing was read, so nothing was learned — the page may still carry the tag");
    assert.equal(devProjectVisualEditorUnlocked(updated!), true);
  });

  it("another agency cannot record a map onto this agency's project", () => {
    const saved = project({ name: "Not yours" });
    assert.equal(
      recordDevProjectMap({ agencyId: OTHER_AGENCY, id: saved.id, actorUserId: ACTOR, map: { lastMappedAt: 1, lastMappedBy: ACTOR } }),
      null,
    );
  });

  it("editing a project afterwards keeps the map — a rename is not an un-map", () => {
    const saved = project({ name: "Keeps its map", repository: "o/r" });
    recordDevProjectMap({
      agencyId: AGENCY, id: saved.id, actorUserId: ACTOR,
      map: {
        lastMappedAt: 13_000, lastMappedBy: ACTOR,
        repo: { source: "github", repository: "o/r", ref: "main", fileCount: 42, mappableCount: 7, directories: ["src"], truncated: false, mappedAt: 13_000 },
      },
    });
    const renamed = saveDevProject({ agencyId: AGENCY, id: saved.id, name: "Renamed", actorUserId: ACTOR });
    assert.equal(renamed.map?.repo?.fileCount, 42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the status the screen is told", () => {
  it("an unmapped, untagged project states Ed's rule out loud", () => {
    const status = devProjectMapStatus(project({ name: "Fresh" }));
    assert.equal(status.neverMapped, true);
    assert.equal(status.repoMapped, false);
    assert.equal(status.browserAvailable, false);
    const sentence = status.missing.find(line => line.includes("Aqua Tag"));
    assert.ok(sentence, "the operator is told why there is no browser");
    assert.match(sentence!, /no browser/i);
    assert.match(sentence!, /Dev mode still works/i, "…and that Dev mode does not need one");
  });

  it("browserAvailable is the unlock rule and nothing else", () => {
    for (const kind of ["software", "website", "portal"] as const) {
      for (const aquaTagId of [undefined, "tag_x"]) {
        const p = project({ name: `Cross ${kind} ${aquaTagId}`, kind, aquaTagId });
        assert.equal(
          devProjectMapStatus(p).browserAvailable,
          devProjectVisualEditorUnlocked(p),
          "one definition of the gate, or the screen and the editor will disagree",
        );
      }
    }
  });

  it("a mapped repo with no tag is 'Dev mode works, browser does not'", () => {
    const saved = project({ name: "Repo only", repository: "o/r" });
    const updated = recordDevProjectMap({
      agencyId: AGENCY, id: saved.id, actorUserId: ACTOR,
      map: {
        lastMappedAt: 14_000, lastMappedBy: ACTOR,
        repo: { source: "github", repository: "o/r", ref: "main", fileCount: 900, mappableCount: 30, directories: ["src"], truncated: false, mappedAt: 14_000 },
      },
    })!;
    const status = devProjectMapStatus(updated);
    assert.equal(status.repoMapped, true);
    assert.equal(status.browserAvailable, false);
    assert.equal(status.missing.length, 1, "only the tag is missing");
  });

  it("a repository that failed to read is NOT reported as mapped", () => {
    const saved = project({ name: "Repo broke", repository: "o/r" });
    const updated = recordDevProjectMap({
      agencyId: AGENCY, id: saved.id, actorUserId: ACTOR,
      map: {
        lastMappedAt: 15_000, lastMappedBy: ACTOR,
        repo: { source: "github", repository: "o/r", ref: "main", fileCount: 0, mappableCount: 0, directories: [], truncated: false, mappedAt: 15_000, error: "GitHub request failed (404)." },
      },
    })!;
    assert.equal(devProjectMapStatus(updated).repoMapped, false, "an error is not a map");
  });

  it("tagged but never verified says the tag has not been checked", () => {
    const status = devProjectMapStatus(project({ name: "Typed a tag", aquaTagId: "tag_typed" }));
    assert.equal(status.browserAvailable, true, "the id is the gate; verification is advice");
    assert.equal(status.tagVerified, false);
    assert.ok(status.missing.some(line => /has not been checked/.test(line)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the shared working-tree walk", () => {
  let root = "";

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "aqua-map-walk-"));
    await mkdir(join(root, "src", "app"), { recursive: true });
    await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
    await mkdir(join(root, ".data"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, "src", "app", "page.tsx"), "export default () => null;");
    await writeFile(join(root, "README.md"), "# hi");
    await writeFile(join(root, ".env.local"), "SECRET=1");
    await writeFile(join(root, "node_modules", "left-pad", "index.js"), "module.exports = 1;");
    await writeFile(join(root, ".data", "portal.json"), "{}");
    await writeFile(join(root, ".git", "config"), "[core]");
    await symlink(join(root, "README.md"), join(root, "link.md")).catch(() => undefined);
  });

  after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  it("lists source files and hides credentials, state and vendor trees", async () => {
    // This walk was moved out of `/api/portal/site-editor/files` so MAP could
    // share it. Its hiding rules are a credential boundary, so they are proven
    // here against a real directory rather than assumed to have survived.
    const paths = (await readWorkspaceFiles(root)).map(file => file.path).sort();
    assert.deepEqual(paths, ["README.md", "src/app/page.tsx"]);
  });

  it("never lists a symlink — the editor will not write through one", async () => {
    const paths = (await readWorkspaceFiles(root)).map(file => file.path);
    assert.ok(!paths.includes("link.md"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

interface ProjectsBody {
  ok?: boolean;
  error?: string;
  project?: DevProject;
  projects?: DevProject[];
  status?: DevProjectMapStatus;
  statuses?: Record<string, DevProjectMapStatus>;
}

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Map Co", slug: `map-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@map.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "map-operator-pass",
  });
  return {
    agency,
    user,
    token: issueSession({
      userId: user.id, email: user.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

async function send(token: string, body: unknown): Promise<{ status: number; body: ProjectsBody }> {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev/projects",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ))));
  return { status: response.status, body: await response.json() as ProjectsBody };
}

describe("the MAP endpoint", () => {
  // Every case below names a repository and no address, so the run finishes
  // without a network call: no GitHub token resolves, the repo half records
  // "Connect GitHub", and there is nothing to fetch for the tag half.
  const savedToken = { value: undefined as string | undefined };
  before(() => { savedToken.value = process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKEN; });
  after(() => { if (savedToken.value !== undefined) process.env.GITHUB_TOKEN = savedToken.value; });

  it("maps a project and records the result", async () => {
    const { token } = await founder();
    const created = await send(token, { action: "save", name: "Mapped via API", repository: "o/r" });
    assert.equal(created.body.ok, true);
    const id = created.body.project!.id;

    const mapped = await send(token, { action: "map", id });
    assert.equal(mapped.status, 200);
    assert.equal(mapped.body.ok, true);
    assert.ok(mapped.body.project?.map, "the run is written to the project");
    assert.equal(mapped.body.project?.map?.lastMappedBy, mapped.body.project?.updatedBy);
    assert.match(mapped.body.project?.map?.repo?.error ?? "", /Connect GitHub/);
    assert.equal(mapped.body.status?.browserAvailable, false, "no tag, no browser");
    assert.ok(mapped.body.status?.missing.some(line => /Dev mode still works/.test(line)));
  });

  it("checking a project with no address records no tag result at all", async () => {
    const { token } = await founder();
    const created = await send(token, { action: "save", name: "No address", repository: "o/r" });
    const mapped = await send(token, { action: "map", id: created.body.project!.id });
    assert.equal(mapped.body.project?.map?.tag, undefined);
  });

  it("refuses to map a project that does not exist", async () => {
    const { token } = await founder();
    const result = await send(token, { action: "map", id: "devproj_nope" });
    assert.equal(result.status, 404);
  });

  it("refuses to map ANOTHER agency's project", async () => {
    const mine = await founder();
    const theirs = await founder();
    const created = await send(theirs.token, { action: "save", name: "Theirs", repository: "o/r" });
    const result = await send(mine.token, { action: "map", id: created.body.project!.id });
    assert.equal(result.status, 404, "a cross-tenant id must not resolve, let alone map");
  });

  it("asks which project when none is named", async () => {
    const { token } = await founder();
    const result = await send(token, { action: "map" });
    assert.equal(result.status, 400);
  });

  it("is behind the same gate as the rest of the endpoint — no Dev Mode, no map", async () => {
    const { token } = await founder();
    const created = await send(token, { action: "save", name: "Gated", repository: "o/r" });
    // Same request, WITHOUT withDevMode.
    const response = await withSession(token, () => POST(new Request(
      "http://localhost/api/portal/dev/projects",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "map", id: created.body.project!.id }) },
    )));
    assert.equal(response.status, 403);
  });

  it("hands the list screen a status for every project", async () => {
    const { token } = await founder();
    await send(token, { action: "save", name: "Listed", repository: "o/r" });
    const response = await withDevMode(() => withSession(token, () => GET()));
    const body = await response.json() as ProjectsBody;
    assert.equal(body.ok, true);
    for (const listed of body.projects ?? []) {
      assert.ok(body.statuses?.[listed.id], "every project carries its computed status");
    }
  });

  it("stores a website address through the save action, normalised", async () => {
    const { token } = await founder();
    const created = await send(token, { action: "save", name: "With address", siteUrl: "example.com" });
    assert.equal(created.body.project?.siteUrl, "https://example.com/");
  });
});


describe("a GitHub failure is explained, never relayed", () => {
  // Ed's first real client run: "GitHub request failed (404). Not Found" —
  // when the actual cause was a fine-grained token that had not been granted
  // the repository. GitHub 404s (not 403s) outside a token's grant, so the
  // message must explain that or the operator is stuck.
  it("names the repository, the branch and the grant rule on a 404", async () => {
    const result = await mapProjectRepository(
      { agencyId: "agency_1", project: project({ repository: "acme/site", ref: "main" }) },
      { githubToken: "tok", readTree: async () => { throw new Error("GitHub request failed (404). Not Found"); } },
    );
    assert.match(result.error ?? "", /acme\/site/);
    assert.match(result.error ?? "", /"main"/);
    assert.match(result.error ?? "", /fine-grained tokens answer 404, not 403/);
    assert.match(result.error ?? "", /Contents read\/write/);
  });

  it("tells an expired token from a permissions gap", async () => {
    const expired = await mapProjectRepository(
      { agencyId: "agency_1", project: project({ repository: "acme/site" }) },
      { githubToken: "tok", readTree: async () => { throw new Error("GitHub request failed (401). Bad credentials"); } },
    );
    assert.match(expired.error ?? "", /expired or been revoked/);
    const forbidden = await mapProjectRepository(
      { agencyId: "agency_1", project: project({ repository: "acme/site" }) },
      { githubToken: "tok", readTree: async () => { throw new Error("GitHub request failed (403). Forbidden"); } },
    );
    assert.match(forbidden.error ?? "", /outside its permissions/);
  });
});
