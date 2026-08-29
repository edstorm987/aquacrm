// The path scope where it is ENFORCED, not just where it is computed.
//
// `smoke-dev-path-scope` proves the matcher. This proves the routes actually
// consult it — a perfectly correct allowlist is worth nothing if a boundary
// forgets to ask, and with four boundaries that is the likely failure rather
// than a wrong rule.
//
// Ed, 2026-08-27: *"aquaCRM repo locked down to this portal's files as we can't
// expose the whole repo in Fulfilment."*

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { ensureHydrated, getState } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { saveDevProject } from "../src/engines/editor/server/devProjects";

const FILES_ROUTE = "src/app/api/portal/site-editor/files/route.ts";
const REPO_WRITE_ROUTE = "src/app/api/portal/dev/repo-write/route.ts";
const SOURCE_EDIT_ROUTE = "src/app/api/portal/dev/source-edit/route.ts";
const LIBRARIAN_ROUTE = "src/app/api/portal/dev/librarian/route.ts";
const read = (path: string) => readFileSync(path, "utf8");
/** Comments stripped, so a note ABOUT a guard never reads as one. */
const code = (source: string) => source
  .split("\n")
  .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

describe("the file route consults the scope on BOTH sides", () => {
  const source = code(read(FILES_ROUTE));

  it("guards the single-file read", () => {
    assert.match(source, /if \(requested\) assertPathInScope\(scope, requested, "read"\)/,
      "reading one file no longer checks the project's scope");
  });

  it("guards the WRITE — the half that is easier to forget", () => {
    // The write path resolves its project separately from the read path, so a
    // guard on reads alone leaves a scoped project able to write anywhere.
    //
    // It now checks the RESOLVED scope (project ∩ this person's grants) rather
    // than the project's raw field, so a dev narrowed to one folder cannot write
    // outside it either. The `??` fallback covers the project-less working-tree
    // path, which is owner-only by a separate gate.
    assert.match(
      source,
      /assertPathInScope\(projectAccess\?\.pathScope \?\? devPathScope\(project\?\.allowedPaths\), requested, "write"\)/,
      "saving a file no longer checks the resolved path scope",
    );
  });

  it("filters BOTH tree listings, not only the file read", () => {
    // A guard on the file alone still hands over a complete listing of the
    // repository, which is most of what it is worth taking.
    assert.match(source, /head\.files\.filter\(file => scopeAllowsListing\(scope, file\.path\)\)/,
      "the GitHub tree is no longer filtered");
    assert.match(source, /\.filter\(file => scopeAllowsListing\(scope, typeof file === "string" \? file : file\.path\)\)/,
      "the working-tree listing is no longer filtered");
  });

  it("answers a refusal with 403 and says which path", () => {
    assert.match(source, /error instanceof DevPathScopeError/,
      "a scope refusal falls through to the generic access error, which tells the reader to check their grant");
    assert.match(source, /status: error\.status/);
  });

  it("uses the RESOLVED scope, not the project's raw field", () => {
    // `requireDevProjectAccess` intersects the project's surface with this
    // person's grants and hands back one answer, so the four file boundaries
    // cannot drift into slightly different readings of the same rule.
    assert.match(source, /grantedScope = access\.pathScope;/,
      "the route stopped taking the resolved scope from the access call");
    assert.match(source, /const scope = grantedScope \?\? devPathScope\(project\?\.allowedPaths\);/,
      "the read side is back on the project's raw field, so grant narrowing does not apply to it");
  });
});

describe("the stored scope survives an unrelated save", () => {
  it("omitting allowedPaths leaves it alone — it is not dropped", async () => {
    // `saveDevProject` rebuilds the record field by field with NO spread, so an
    // omitted field is otherwise erased. For this field that would silently
    // unlock the whole repository during an unrelated rename.
    await ensureHydrated();
    const agency = createAgency({ name: "Scope", slug: `scope-${Date.now()}` });
    const created = saveDevProject({
      agencyId: agency.id,
      name: "Portal only",
      allowedPaths: ["portal/src/app/portal", "portal/src/lib/portal"],
      actorUserId: "owner",
    });
    assert.deepEqual(created.allowedPaths, ["portal/src/app/portal", "portal/src/lib/portal"]);

    const renamed = saveDevProject({
      agencyId: agency.id,
      id: created.id,
      name: "Portal only (renamed)",
      actorUserId: "owner",
    });
    assert.deepEqual(renamed.allowedPaths, ["portal/src/app/portal", "portal/src/lib/portal"],
      "a rename dropped the path scope — the project silently exposes the whole repository again");
    assert.equal(getState().devProjects[created.id].allowedPaths?.length, 2);
  });

  it("an explicit empty list clears it, which is how you widen deliberately", async () => {
    await ensureHydrated();
    const agency = createAgency({ name: "Scope2", slug: `scope2-${Date.now()}` });
    const created = saveDevProject({
      agencyId: agency.id, name: "P", allowedPaths: ["portal/src"], actorUserId: "owner",
    });
    const widened = saveDevProject({
      agencyId: agency.id, id: created.id, name: "P", allowedPaths: [], actorUserId: "owner",
    });
    assert.equal(widened.allowedPaths, undefined, "clearing the scope did not unrestrict the project");
  });

  it("stores the NORMALISED form, so no reader has to normalise again", async () => {
    await ensureHydrated();
    const agency = createAgency({ name: "Scope3", slug: `scope3-${Date.now()}` });
    const created = saveDevProject({
      agencyId: agency.id,
      name: "P",
      // Ragged input of the kind a form produces.
      allowedPaths: ["/portal/src/app/", "./portal/src/app", "portal\\src\\lib", "../etc/passwd", "  "],
      actorUserId: "owner",
    });
    assert.deepEqual(created.allowedPaths, ["portal/src/app", "portal/src/lib"],
      "the stored scope is not normalised and de-duplicated, or a traversal entry survived");
  });
});

describe("every OTHER door into the tree takes the same scope", () => {
  // Four boundaries read the repository, and a guard on one is worth little.
  // These are the three that were left open when the file route was done first.

  it("repo-write guards every action that names a path", () => {
    // The files route refuses repo-backed projects by design, so this IS the
    // write path for them: without a guard, a project scoped to its portal
    // files could still COMMIT anywhere in the repository.
    const source = code(read(REPO_WRITE_ROUTE));
    assert.match(source, /if \(requestedPath\) assertPathInScope\(access\.pathScope, requestedPath, "write"\)/,
      "committing to a repository no longer checks the path scope");
    // Placed ONCE before the dispatch, so a new action taking a path is not
    // born unguarded.
    assert.ok(source.indexOf("assertPathInScope") < source.indexOf('body?.action === "save"'),
      "the guard moved inside a branch, so the next path-taking action will miss it");
  });

  it("source-edit guards the publish AND filters the search", () => {
    const source = code(read(SOURCE_EDIT_ROUTE));
    assert.match(source, /assertPathInScope\(access\.pathScope, body\.file\.trim\(\), "write"\)/,
      "publishing a words-edit no longer checks the path scope");
    // The bigger leak of the two: a repository-wide text search returning
    // matched lines WITH their paths. Guarding only the publish would let a
    // scoped person search for a secret's name and read it out of the results.
    assert.match(source, /found\.candidates\.filter\(candidate => scopeAllows\(access\.pathScope, candidate\.file\)\)/,
      "the source search returns matches from files the caller may not open");
    assert.match(source, /skipped: found\.skipped\.filter\(/,
      "the skipped list still carries file paths from outside the scope");
  });

  it("the librarian filters its hits — it answers WITH paths", () => {
    const source = code(read(LIBRARIAN_ROUTE));
    assert.match(source, /hits: result\.hits\.filter\(hit => scopeAllows\(pathScope, hit\.path\)\)/,
      "the librarian will still answer \u201Cwhere is the Stripe key configured?\u201D for a scoped caller");
    assert.match(source, /pathScope = access\.pathScope;/,
      "the librarian stopped taking the resolved scope from the access call");
  });

  it("each one SAYS when its answer is partial", () => {
    // A trimmed result that does not say so reads as "it is not there", which
    // sends the reader looking for a bug instead of asking for access.
    for (const [name, path] of [["source-edit", SOURCE_EDIT_ROUTE], ["librarian", LIBRARIAN_ROUTE], ["files", FILES_ROUTE]] as const) {
      assert.match(code(read(path)), /scoped: /, `${name} trims its answer without saying so`);
    }
  });

  it("a refusal is a 403 that names the path, on every route", () => {
    for (const [name, path] of [["files", FILES_ROUTE], ["repo-write", REPO_WRITE_ROUTE], ["source-edit", SOURCE_EDIT_ROUTE]] as const) {
      assert.match(code(read(path)), /error instanceof DevPathScopeError/,
        `${name} answers a scope refusal with a generic access error`);
    }
  });
});

describe("the project form and its route", () => {
  it("widening the surface needs the same capability as rebinding the repository", () => {
    const source = code(read("src/app/api/portal/dev/projects/route.ts"));
    assert.match(source, /const widensPathScope = body\.allowedPaths !== undefined/,
      "the route no longer distinguishes a widening from a narrowing");
    assert.match(source, /\|\| widensPathScope\) \{[\s\S]{0,120}?"project\.connection\.manage"/,
      "widening the exposed files no longer requires project.connection.manage");
  });

  it("an omitted field carries, an empty array clears — and they stay different", () => {
    const source = code(read("src/app/api/portal/dev/projects/route.ts"));
    assert.match(source, /allowedPaths: Array\.isArray\(body\.allowedPaths\)/,
      "the route no longer distinguishes omitted from cleared, so an unrelated save could unlock the repo");
  });

  it("the editor form offers the control, and says what blank means", () => {
    const form = read("src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx");
    assert.match(form, /Exposed files/, "the project settings panel has no control for the file surface");
    assert.match(form, /This project exposes the ENTIRE repository/,
      "a blank scope no longer tells the owner what it means");
    // One path per line — a comma-separated box would split a path containing
    // a comma in half.
    assert.match(form, /draft\.allowedPaths\.split\("\\n"\)/);
  });
});

// ── The GRANT half of the pair ────────────────────────────────────────────
//
// The project form answers "what may this project ever expose"; this one answers
// "and which part of it does THIS person get". Both must exist on screen or the
// narrowing is API-only, which in practice means nobody uses it.
describe("the grant form and its route", () => {
  it("the route accepts the narrowing, and only as strings", () => {
    const source = code(read("src/app/api/portal/access/grants/route.ts"));
    assert.match(source, /allowedPaths: Array\.isArray\(body\.allowedPaths\)/,
      "the grants route no longer accepts a per-person path narrowing");
    // A non-string entry must be dropped rather than stored — `devPathScope`
    // would drop it later anyway, but a stored `null` in the array is the kind
    // of thing a future reader treats as meaningful.
    assert.match(source, /filter\(\([a-z]+: unknown\): [a-z]+ is string => typeof [a-z]+ === "string"\)/,
      "a non-string entry could reach the stored allowlist");
  });

  it("the access panel offers it, on the only scope where files exist", () => {
    const panel = read("src/components/access/AccessControlPanel.tsx");
    assert.match(panel, /Limit to these files/,
      "the access panel has no control for narrowing a person to particular files");
    // Only a PROJECT scope has files. Offering the box on an agency or client
    // scope would invite somebody to type paths that silently do nothing.
    assert.match(panel, /scope\.kind === "project" \? \(/,
      "the path control is offered on scopes that have no files");
    assert.match(panel, /allowedPaths: scope\.kind === "project"/,
      "the grant submit no longer gates the narrowing on a project scope");
    // Same convention as the project form: one path per line.
    assert.match(panel, /allowedPaths\.split\("\\n"\)/);
  });

  it("blank means the whole project, and the form says so", () => {
    const panel = read("src/components/access/AccessControlPanel.tsx");
    assert.match(panel, /Blank gives them everything the project exposes/,
      "an empty box no longer tells the assigner what it means — the dangerous default to leave unlabelled");
  });
});
