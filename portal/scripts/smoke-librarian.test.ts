// THE LIBRARIAN — its own thing, consuming the file-finding skill.
//
// Ed (dev-editor-finish.md, phase 15): "the librarian also needs its own thing
// like what weve done for the aqua editor ui and the librarian needs to be
// inside dev mode in the editor as well its different from the editor since
// librarian is for files finding".
//
// `smoke-file-finding-skill.test.ts` pins the SKILL. This file pins the
// CONSUMER half phase 15's second act built:
//
//   1. THE BRIEF — `fileFindingWorld` is what the Librarian is briefed from:
//      docs + reference counts and THIS agency's projects with honest repo
//      flavours, network-free, tenant-scoped. (The drawer half of "briefs from
//      the skill, business context GONE" is pinned in smoke-dev-team-shell.)
//   2. THE DOOR — `/api/portal/dev/librarian` wears the layered dev-surface
//      gate (role → Dev Mode → origin), scopes every call to the SESSION's
//      agency, answers a foreign project id exactly like an invented one, and
//      has no GET to widen.
//   3. THE SURFACE — `LibrarianPanel` renders ranked hits WITH their WHY and
//      the `searched` report, wears the editor's clothes (never `--dt-*`), and
//      states plainly that opening files is the editor's job until the
//      DevEditor mount lands.
//   4. THE TAB — "librarian" is declared on the developer ladder and HELD off
//      `INSPECTOR_TABS` until the DevEditor mount pass, because the rail must
//      never offer a tab that has no panel.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
// No test here ever wants the environment's real token ladder to answer.
delete process.env.GITHUB_TOKEN;

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fileFindingWorld, type FileFindingResult } from "../src/lib/server/dev/fileFinding";
import { recordDevProjectMap, saveDevProject } from "../src/engines/editor/server/devProjects";
import * as librarianRoute from "../src/app/api/portal/dev/librarian/route";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import {
  EDITING_MODES,
  INSPECTOR_TABS,
  editingMode,
  inspectorTabsFor,
} from "../src/engines/editor/editing/modes";
import type { DevDocsIndex } from "../src/lib/server/dev/devDocs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const PANEL = "src/components/editing/LibrarianPanel.tsx";
const CLIENT = "src/components/editing/librarianClient.ts";
const ROUTE = "src/app/api/portal/dev/librarian/route.ts";

let seq = 0;

async function founder(name = "Librarian Co") {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name, slug: `librarian-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@librarian.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "librarian-operator-pass",
  });
  return {
    agencyId: agency.id,
    userId: user.id,
    token: issueSession({
      userId: user.id, email: user.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

function mapRepo(
  agencyId: string,
  projectId: string,
  repo: { source: "github" | "workspace"; repository?: string; error?: string },
): void {
  const now = Date.now();
  recordDevProjectMap({
    agencyId,
    id: projectId,
    actorUserId: "user_librarian",
    map: {
      repo: {
        repository: repo.repository ?? "",
        ref: "main",
        fileCount: 0,
        mappableCount: 0,
        directories: [],
        truncated: false,
        mappedAt: now,
        source: repo.source,
        ...(repo.error ? { error: repo.error } : {}),
      },
      lastMappedAt: now,
      lastMappedBy: "user_librarian",
    },
  });
}

function docsIndex(titles: string[]): DevDocsIndex {
  const entries = titles.map((title, i) => ({
    relPath: `docs/${title.toLowerCase().replace(/\s+/g, "-")}.md`,
    title,
    mtimeMs: 1000 + i,
    sizeBytes: 100,
  }));
  return { entries, tree: [], total: entries.length, scannedAtMs: Date.now() };
}

/** A reference dir holding exactly one parseable bucket page. */
async function referenceFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aqua-librarian-ref-"));
  await writeFile(join(dir, "lib.md"), [
    "# Bucket",
    "",
    "### `src/lib/example.ts`",
    "",
    "- `exampleSymbol(input: string)` — an example.",
    "",
  ].join("\n"));
  return dir;
}

type RouteBody = { ok?: boolean; error?: string; result?: FileFindingResult };

async function ask(token: string, body: unknown): Promise<{ status: number; body: RouteBody }> {
  const response = await withDevMode(() => withSession(token, () => librarianRoute.POST(new Request(
    "http://localhost/api/portal/dev/librarian",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ))));
  return { status: response.status, body: await response.json() as RouteBody };
}

before(async () => {
  await ensureHydrated();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("fileFindingWorld — what the Librarian is briefed from", () => {
  it("counts docs + reference and lists ONLY this agency's projects, with honest repo flavours", async () => {
    const home = await founder();
    const other = await founder("Other Co");

    const unmapped = saveDevProject({ agencyId: home.agencyId, name: "Never mapped", actorUserId: home.userId });
    const workspace = saveDevProject({ agencyId: home.agencyId, name: "Blank repository", actorUserId: home.userId });
    mapRepo(home.agencyId, workspace.id, { source: "workspace" });
    const github = saveDevProject({ agencyId: home.agencyId, name: "GitHub backed", repository: "acme/site", actorUserId: home.userId });
    mapRepo(home.agencyId, github.id, { source: "github", repository: "acme/site" });
    const broken = saveDevProject({ agencyId: home.agencyId, name: "Map failed", repository: "acme/broken", actorUserId: home.userId });
    mapRepo(home.agencyId, broken.id, { source: "github", repository: "acme/broken", error: "repo_unreachable" });
    const foreign = saveDevProject({ agencyId: other.agencyId, name: "Foreign", actorUserId: other.userId });

    const referenceDir = await referenceFixture();
    const world = await fileFindingWorld(home.agencyId, {
      scanDocs: () => Promise.resolve(docsIndex(["Doc One", "Doc Two"])),
      referenceDir,
    });

    assert.equal(world.docs.total, 2);
    assert.equal(world.docs.detail, undefined);
    assert.equal(world.reference.pages, 1);
    const flavours = Object.fromEntries(world.projects.map(project => [project.id, project.repo]));
    assert.equal(flavours[unmapped.id], "unmapped");
    assert.equal(flavours[workspace.id], "workspace");
    assert.equal(flavours[github.id], "github");
    assert.equal(flavours[broken.id], "map-error");
    // Tenant-scoped: the other agency's project is simply not in the world.
    assert.equal(world.projects.some(project => project.id === foreign.id), false);
  });

  it("reports a docs-scan failure instead of hiding it", async () => {
    const home = await founder();
    const referenceDir = await referenceFixture();
    const world = await fileFindingWorld(home.agencyId, {
      scanDocs: () => Promise.reject(new Error("disk on fire")),
      referenceDir,
    });
    assert.equal(world.docs.total, 0);
    assert.match(world.docs.detail ?? "", /disk on fire/);
    // The reference half still answers — a broken docs scan degrades, never blanks.
    assert.equal(world.reference.pages, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the Librarian's door — /api/portal/dev/librarian", () => {
  it("refuses without Dev Mode, before reading anything", async () => {
    const home = await founder();
    // withSession but NOT withDevMode: the layered gate's second rung.
    const response = await withSession(home.token, () => librarianRoute.POST(new Request(
      "http://localhost/api/portal/dev/librarian",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "anything" }) },
    )));
    assert.equal(response.status, 403);
    const body = await response.json() as RouteBody;
    assert.match(body.error ?? "", /Dev Mode/);
  });

  it("answers a foreign project id EXACTLY like an invented one", async () => {
    const home = await founder();
    const other = await founder("Other Co");
    const foreign = saveDevProject({ agencyId: other.agencyId, name: "Foreign", actorUserId: other.userId });

    const guessed = await ask(home.token, { query: "anything", projectId: foreign.id });
    const invented = await ask(home.token, { query: "anything", projectId: "proj_does_not_exist" });
    assert.equal(guessed.status, 404);
    assert.equal(invented.status, 404);
    // Same status, same sentence — a guessed id confirms nothing.
    assert.equal(guessed.body.error, invented.body.error);
  });

  it("scopes to the SESSION's agency — an agencyId in the body changes nothing", async () => {
    const home = await founder();
    const other = await founder("Other Co");
    const foreign = saveDevProject({ agencyId: other.agencyId, name: "Foreign", actorUserId: other.userId });

    // The body names the foreign agency outright. The route must never read it.
    const smuggled = await ask(home.token, { query: "anything", projectId: foreign.id, agencyId: other.agencyId });
    assert.equal(smuggled.status, 404);
    const src = read(ROUTE);
    assert.doesNotMatch(src, /body\.agencyId/);
    assert.match(src, /agencyId: session\.agencyId/);
  });

  it("answers a real question from the generated reference, and says what was not searched", async () => {
    const home = await founder();
    // No project → docs + reference only, against the REAL generated docs.
    const { status, body } = await ask(home.token, { query: "findFiles" });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    const result = body.result!;
    assert.ok(result.hits.some(hit => hit.source === "reference" && hit.path === "src/lib/server/dev/fileFinding.ts"),
      "the reference should locate findFiles in the skill itself");
    // Honesty half: no project was given, so no repository was searched — said, not implied.
    assert.equal(result.searched.repo.status, "none");
    assert.ok(result.searched.repo.filesSearched === 0);
  });

  it("passes the skill's typed empty-query refusal through, as a 200", async () => {
    const home = await founder();
    const { status, body } = await ask(home.token, { query: "the of a" });
    assert.equal(status, 200);
    assert.equal(body.result?.reason, "empty-query");
    assert.deepEqual(body.result?.hits, []);
  });

  it("clamps the limit to the skill's cap", async () => {
    const home = await founder();
    const { body } = await ask(home.token, { query: "findFiles", limit: 999 });
    assert.equal(body.result?.limit, 50);
  });

  it("has no GET to widen — queries name unshipped work and stay out of logs", () => {
    assert.equal("GET" in librarianRoute, false);
    const src = read(ROUTE);
    assert.match(src, /POST only\. On purpose\./);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the Librarian panel — wiring pins over source", () => {
  it("is a client panel over the librarian wire, never the assistant API", () => {
    const panel = read(PANEL);
    assert.match(panel, /^"use client";/);
    assert.match(panel, /findViaLibrarian/);
    const client = read(CLIENT);
    assert.match(client, /LIBRARIAN_ENDPOINT = "\/api\/portal\/dev\/librarian"/);
    assert.match(client, /method: "POST"/);
    // The find tool talks to its own door — not the Advisor's, not the editor AI's.
    for (const file of [panel, client]) {
      assert.doesNotMatch(file, /\/api\/assistant/);
      assert.doesNotMatch(file, /\/api\/portal\/dev\/editor-ai/);
    }
  });

  it("renders the WHY and the searched report — never a bare list of paths", () => {
    const panel = read(PANEL);
    assert.match(panel, /hit\.reasons\.map/);
    assert.match(panel, /result\.searched\.repo\.detail/);
    // The cap is confessed on screen, same as in the result.
    assert.match(panel, /result\.capped/);
  });

  it("wears the editor's clothes and hands paths over honestly", () => {
    const panel = read(PANEL);
    // The editor's vocabulary, from the one place it is written down. The
    // `[a-z]` keeps the pin on actual token USE — the header comment naming
    // the rule ("never `--dt-*`") is allowed to say so.
    assert.match(panel, /from "@\/components\/editing\/editorAiSkin"/);
    assert.doesNotMatch(panel, /--dt-[a-z]/);
    // Opening files is the editor's job: an Open control only where the host
    // wired one (`onOpenFile` — the DevEditor mount), a copy control always.
    assert.match(panel, /onOpenFile/);
    assert.match(panel, /navigator\.clipboard\.writeText/);
    assert.match(panel, /Copy path/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the librarian tab — declared on the ladder, held off the rail", () => {
  it("is a developer-depth tab and no other mode's", () => {
    assert.ok(editingMode("developer").tabs.includes("librarian"));
    for (const mode of EDITING_MODES) {
      if (mode.id === "developer") continue;
      assert.equal(mode.tabs.includes("librarian"), false, `${mode.id} must not offer the Librarian`);
    }
  });

  it("rides the rail in Dev mode on every target — the mount landed 2026-08-22", () => {
    // The held-back state this test used to pin is over: "librarian" is in
    // INSPECTOR_TABS, TAB_META carries its row, and DevEditor mounts
    // <LibrarianPanel projectId={...}/>. The tab needs no portal document and
    // no tag — it finds files — so it is offered on EVERY developer target.
    assert.equal((INSPECTOR_TABS as readonly string[]).includes("librarian"), true);
    for (const portalTarget of [true, false]) {
      for (const tagMapped of [true, false]) {
        assert.equal(
          // `surface` added 2026-08-22 (phase 9). The Librarian is a DEPTH
          // tab and the surface must not touch it — "normal" is the universal
          // one, and the Website case is walked by smoke-editor-surface-modes.
          (inspectorTabsFor("developer", { portalTarget, tagMapped, surface: "normal" }) as readonly string[]).includes("librarian"),
          true,
          `developer must offer the Librarian (portalTarget=${portalTarget}, tagMapped=${tagMapped})`,
        );
      }
    }
    // And ONLY Dev: the shallower modes stay focused.
    for (const mode of ["assist", "visual"]) {
      assert.equal(
        (inspectorTabsFor(mode as never, { portalTarget: false, tagMapped: true, surface: "normal" }) as readonly string[]).includes("librarian"),
        false,
        `${mode} must not offer the Librarian`,
      );
    }
  });
});
