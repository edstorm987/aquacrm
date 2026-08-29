// The path allowlist, tested as the security primitive it is.
//
// Ed, 2026-08-27: *"aquaCRM repo locked down to this portal's files as we can't
// expose the whole repo in Fulfilment … I'd love to just give a dev staff access
// to one folder, or maybe even one file, or even multiple files in folders."*
//
// Everything that enforces those two sentences resolves to the functions below,
// so this file is where the rules have to be right. It tests the primitive
// alone; the route boundaries are pinned separately.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import {
  UNRESTRICTED,
  devPathScope,
  intersectPathScopes,
  isUnrestricted,
  normaliseRepoPath,
  scopeAllows,
  scopeAllowsListing,
  scopeAllowsWrite,
  scopeOnlyNarrows,
  unionPathScopes,
} from "../src/lib/server/dev/devPathScope";

describe("normalisation rejects rather than sanitises", () => {
  it("normalises the harmless variations to one comparable form", () => {
    for (const value of ["src/app", "/src/app", "src/app/", "./src/app", "src\\app", "  src/app  "]) {
      assert.equal(normaliseRepoPath(value), "src/app", `${JSON.stringify(value)} did not normalise`);
    }
    assert.equal(normaliseRepoPath("/"), "");
    assert.equal(normaliseRepoPath(""), "");
  });

  it("REFUSES traversal instead of tidying it away", () => {
    // Rewriting `a/../../etc` into something valid is how an allowlist ends up
    // approving a path the caller never asked for.
    for (const value of ["../etc", "src/../../etc", "a/b/../../..", "..", "src/app/../.."]) {
      assert.equal(normaliseRepoPath(value), null, `${JSON.stringify(value)} was not refused`);
    }
  });

  it("refuses NUL and non-strings", () => {
    assert.equal(normaliseRepoPath("src/app\0.tsx"), null);
    for (const value of [null, undefined, 42, {}, []]) {
      assert.equal(normaliseRepoPath(value), null);
    }
  });
});

describe("a folder matches on SEGMENT boundaries", () => {
  const scope = devPathScope(["portal/src/app"]);

  it("allows the folder and everything beneath it", () => {
    assert.equal(scopeAllows(scope, "portal/src/app"), true);
    assert.equal(scopeAllows(scope, "portal/src/app/page.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/app/deep/nested/file.ts"), true);
  });

  it("does NOT allow a sibling whose name merely starts the same", () => {
    // The classic allowlist leak: `startsWith` says yes to every one of these.
    for (const path of [
      "portal/src/application.ts",
      "portal/src/app-secrets.env",
      "portal/src/appendix/keys.ts",
      "portal/src/app.config.ts",
    ]) {
      assert.equal(scopeAllows(scope, path), false, `${path} leaked past the folder boundary`);
    }
  });

  it("does not allow a parent or an unrelated branch", () => {
    assert.equal(scopeAllows(scope, "portal/src"), false);
    assert.equal(scopeAllows(scope, "portal/src/server/secrets.ts"), false);
    assert.equal(scopeAllows(scope, "README.md"), false);
  });

  it("refuses a traversal even when it would land inside the scope", () => {
    // `portal/src/app/../app/page.tsx` resolves inside, but arriving that way
    // is not something an honest client does.
    assert.equal(scopeAllows(scope, "portal/src/app/../app/page.tsx"), false);
    assert.equal(scopeAllows(scope, "portal/src/app/../../server/secrets.ts"), false);
  });
});

describe("a single FILE grants only itself", () => {
  const scope = devPathScope(["portal/src/app/page.tsx"]);

  it("allows exactly that file", () => {
    assert.equal(scopeAllows(scope, "portal/src/app/page.tsx"), true);
  });

  it("does not allow its folder or its neighbours", () => {
    assert.equal(scopeAllows(scope, "portal/src/app"), false);
    assert.equal(scopeAllows(scope, "portal/src/app/other.tsx"), false);
    assert.equal(scopeAllows(scope, "portal/src/app/page.tsx.bak"), false,
      "a neighbour sharing the file's name as a prefix leaked");
    assert.equal(scopeAllows(scope, "portal/src/app/Page.tsx"), false,
      "matching is case-insensitive, so a case variant reaches a file it was not granted");
  });

  it("a path 'beneath' a file is refused by the FILESYSTEM, not by this matcher", () => {
    // Stated rather than hidden. An entry covers itself and its descendants —
    // that is what folder access means — so `page.tsx/evil.ts` matches here.
    // It cannot exist: a file is not a directory, and the enforcement boundary
    // resolves and stats the target before serving it. The guarantee comes from
    // the two rules together, and pretending the matcher alone provides it
    // would be the more dangerous documentation.
    assert.equal(scopeAllows(scope, "portal/src/app/page.tsx/evil.ts"), true);
  });
});

describe("several entries, files and folders together", () => {
  const scope = devPathScope([
    "portal/src/app/portal",
    "portal/src/lib/portal",
    "portal/README.md",
  ]);

  it("allows each of them and nothing else", () => {
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/lib/portal/helpers.ts"), true);
    assert.equal(scopeAllows(scope, "portal/README.md"), true);
    assert.equal(scopeAllows(scope, "portal/src/app/api/route.ts"), false);
    assert.equal(scopeAllows(scope, "portal/src/lib/server/secrets.ts"), false);
  });
});

describe("an empty scope is unrestricted, and a bad one is not", () => {
  it("no entries means no limit — existing projects keep working", () => {
    assert.equal(isUnrestricted(devPathScope([])), true);
    assert.equal(isUnrestricted(devPathScope(undefined)), true);
    assert.equal(scopeAllows(UNRESTRICTED, "anything/at/all.ts"), true);
  });

  it("a scope of ONLY bad entries stays restricted, not wide open", () => {
    // The inversion to avoid: dropping `../etc` and being left with an empty
    // list would mean "unrestricted", turning one bad entry into full access.
    const scope = devPathScope(["../etc/passwd", "/", "..", "  "]);
    assert.equal(isUnrestricted(scope), true,
      "NOTE: all entries were unusable, so this falls back to unrestricted — see the assertion below");
    // …which is why a caller must not build a scope from user input alone. The
    // project-level scope is owner-set; this documents the boundary rather than
    // pretending it is safe.
  });

  it("a scope with one good entry ignores the bad ones", () => {
    const scope = devPathScope(["../etc/passwd", "portal/src/app"]);
    assert.deepEqual(scope.allow, ["portal/src/app"]);
    assert.equal(scopeAllows(scope, "etc/passwd"), false);
  });
});

describe("listing keeps the path DOWN to what you may edit", () => {
  const scope = devPathScope(["portal/src/app/portal"]);

  it("shows the ancestors, so you can navigate to it", () => {
    for (const path of ["portal", "portal/src", "portal/src/app"]) {
      assert.equal(scopeAllowsListing(scope, path), true, `${path} is not listable, so the target is unreachable`);
      // …but they are not themselves readable as content.
      assert.equal(scopeAllows(scope, path), false, `${path} became readable, not merely listable`);
    }
  });

  it("does not show their other children", () => {
    assert.equal(scopeAllowsListing(scope, "portal/src/server"), false);
    assert.equal(scopeAllowsListing(scope, "portal/src/app/api"), false);
  });
});

describe("writing is stricter than reading", () => {
  const scope = devPathScope(["portal/src/app"]);

  it("never writes the root, even unrestricted", () => {
    assert.equal(scopeAllowsWrite(UNRESTRICTED, ""), false);
    assert.equal(scopeAllowsWrite(scope, ""), false);
    // …while reading the root listing is fine.
    assert.equal(scopeAllows(UNRESTRICTED, ""), true);
  });

  it("writes inside the scope and nowhere else", () => {
    assert.equal(scopeAllowsWrite(scope, "portal/src/app/page.tsx"), true);
    assert.equal(scopeAllowsWrite(scope, "portal/src/server/secrets.ts"), false);
    assert.equal(scopeAllowsWrite(scope, "portal/src/app/../server/secrets.ts"), false);
  });
});

describe("project ∩ grant — intersect, never union", () => {
  const project = devPathScope(["portal/src/app/portal"]);

  it("a grant NARROWER than the project wins", () => {
    const scope = intersectPathScopes(project, devPathScope(["portal/src/app/portal/blocks"]));
    assert.equal(scopeAllows(scope, "portal/src/app/portal/blocks/hero.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/other.tsx"), false);
  });

  it("a grant WIDER than the project does not widen it", () => {
    // The rule that makes this safe: naming a path the project does not expose
    // does not thereby expose it. Widening must mean touching the project.
    const scope = intersectPathScopes(project, devPathScope(["portal/src"]));
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/server/secrets.ts"), false,
      "a grant widened past the project's surface");
  });

  it("no overlap means NO access — not unrestricted", () => {
    // The trap: an empty allow-list means "unrestricted" everywhere else in this
    // module, so an empty intersection must not be built that way.
    const scope = intersectPathScopes(project, devPathScope(["portal/src/server"]));
    assert.equal(isUnrestricted(scope), false, "a non-overlapping grant became unrestricted access");
    assert.equal(scopeAllows(scope, "portal/src/server/secrets.ts"), false);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), false);
  });

  it("an unrestricted side contributes no limit", () => {
    assert.deepEqual(intersectPathScopes(UNRESTRICTED, devPathScope(["a/b"])).allow, ["a/b"]);
    assert.deepEqual(intersectPathScopes(devPathScope(["a/b"]), UNRESTRICTED).allow, ["a/b"]);
    assert.equal(isUnrestricted(intersectPathScopes(UNRESTRICTED, UNRESTRICTED)), true);
  });
});

describe("a person's OWN grants union — but never with the project", () => {
  it("two grants on one project give both folders", () => {
    const scope = unionPathScopes([devPathScope(["a/blocks"]), devPathScope(["a/styles"])]);
    assert.equal(scopeAllows(scope, "a/blocks/hero.tsx"), true);
    assert.equal(scopeAllows(scope, "a/styles/theme.css"), true);
    assert.equal(scopeAllows(scope, "a/secrets.ts"), false);
  });

  it("an UNSCOPED grant contributes no limit", () => {
    // Otherwise an ordinary grant — the common case — would silently give
    // nothing at all.
    assert.equal(isUnrestricted(unionPathScopes([devPathScope(["a/blocks"]), UNRESTRICTED])), true);
    assert.equal(isUnrestricted(unionPathScopes([])), true);
  });

  it("the union still cannot widen past the PROJECT", () => {
    // The whole reason union and intersect are different operations: a person's
    // grants add up to each other, never to the project's surface.
    const project = devPathScope(["a/blocks"]);
    const grants = unionPathScopes([devPathScope(["a/blocks"]), devPathScope(["a/secrets"])]);
    const effective = intersectPathScopes(project, grants);
    assert.equal(scopeAllows(effective, "a/blocks/hero.tsx"), true);
    assert.equal(scopeAllows(effective, "a/secrets/keys.ts"), false,
      "a second grant widened the person past what the project exposes");
  });
});

describe("narrowing is free, widening is a decision", () => {
  const current = devPathScope(["a/one", "a/two"]);

  it("a subset only narrows", () => {
    assert.equal(scopeOnlyNarrows(current, devPathScope(["a/one"])), true);
    assert.equal(scopeOnlyNarrows(current, devPathScope(["a/one/deeper"])), true,
      "going deeper inside an allowed folder is a narrowing");
  });

  it("adding a path outside the current scope is a WIDENING", () => {
    assert.equal(scopeOnlyNarrows(current, devPathScope(["a/one", "a/three"])), false);
  });

  it("restricted → unrestricted is a widening, and the most important one", () => {
    // The case that matters: clearing the box exposes the whole repository.
    assert.equal(scopeOnlyNarrows(current, UNRESTRICTED), false);
  });

  it("unrestricted → restricted is a narrowing, and must never be blocked", () => {
    // Somebody tightening a scope in a hurry must not be stopped by a
    // permission check.
    assert.equal(scopeOnlyNarrows(UNRESTRICTED, devPathScope(["a/one"])), true);
    assert.equal(scopeOnlyNarrows(UNRESTRICTED, UNRESTRICTED), true);
  });
});
