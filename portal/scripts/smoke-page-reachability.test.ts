// Can a person actually GET to the pages we built?
//
// Ed, 2026-08-29: *"a lot of things are everywhere in different places and it's
// kinda hard, and a lot of things don't have UI or are buried."*
//
// ── What this measures, and why it is not "is it in the sidebar" ──────────
//
// A page is reachable if ANY string literal in `src/` points at it — a nav
// entry, a card on a parent screen, a button, a redirect. That is deliberately
// generous: the sidebar holds 55 entries for 76 static portal routes, and most
// of the difference is legitimately reached from a parent surface. Demanding a
// nav row for every page would fail loudly about pages that are perfectly fine.
//
// What is NOT fine is a page nothing anywhere links to. That page can only be
// reached by somebody who already knows its URL — which means the person who
// wrote it, once, and nobody afterwards. Measured 2026-08-29: three, and NONE of them turned out to need linking — two
// compatibility aliases and one row deliberately removed. The list is a
// prompt to go and look, not a list of bugs.
//
// ── The list can shrink, never grow ──────────────────────────────────────
//
// Same shape as `UNCONSUMED` in `smoke-manifest-fields-consumed` and the
// backlog pin in `smoke-read-path-mutations`, both of which have caught real
// defects. The number is a ceiling, not a target: build a page and forget to
// link it and this fails on the day you do it, rather than a year later when
// somebody wonders what the page was for.
//
// This exists because the session that wrote it shipped three unlinked surfaces
// in one day — the department switcher, the My Radar page, and the ecommerce
// settings page — and each was only caught by somebody asking.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function walk(dir: string, test: (entry: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, test, out);
    else if (test(entry)) out.push(full);
  }
  return out;
}

/** Every static portal route. Dynamic segments are reached from their list. */
function staticRoutes(): string[] {
  return walk("src/app/portal", entry => entry === "page.tsx")
    .map(file => file.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/")
    .filter(route => !route.includes("["));
}

/**
 * Every portal path mentioned anywhere in the source — EXCEPT the search index.
 *
 * `lib/chrome/destinations.ts` lists all 76 routes as string literals. Counting
 * it as "linked" made every page look reachable and this whole file pass
 * vacuously the moment the registry landed. Caught on 2026-08-29 by the suite,
 * an hour after both were written.
 *
 * The exclusion is also the honest distinction: being FINDABLE by typing a name
 * into search is a safety net, not a home. A page nothing links to is still a
 * page nobody will come across — search only helps somebody who already
 * suspects it exists.
 */
const NOT_A_ROUTE_IN = ["src/lib/chrome/destinations.ts"];

function linkedPaths(): Set<string> {
  const source = walk("src", entry => /\.tsx?$/.test(entry))
    .filter(file => !NOT_A_ROUTE_IN.some(excluded => file.endsWith(excluded)))
    .map(file => readFileSync(file, "utf8"))
    .join("\n");
  return new Set(
    [...source.matchAll(/["'`](\/portal\/[^"'`\s?#]*)/g)].map(match => match[1].replace(/\/$/, "")),
  );
}

/**
 * Routes that only exist to re-export another route's page.
 *
 * `agency/fulfilment/technical/toolkit/page.tsx` is one line:
 * `export { default } from "../../../development/toolkit/page"`. The alias is
 * linked from the nav; the real page is not. Counting the real one as
 * unreachable listed five working pages as orphans — and this file recommended
 * deleting them, which would have removed the implementations and left five
 * re-exports pointing at nothing.
 *
 * Found on 2026-08-29 by reading the files instead of trusting the list. The
 * lesson is the general one: an alias is a route WITH a page, and a reachability
 * check that stops at the first hop cannot tell it from a dead end.
 */
function aliasTargets(): Set<string> {
  const targets = new Set<string>();
  for (const file of walk("src/app/portal", entry => entry === "page.tsx")) {
    const source = readFileSync(file, "utf8");
    const match = /export \{ default \} from ["']([^"']+)["']/.exec(source);
    if (!match) continue;
    // Resolve the relative import back to a portal route.
    const from = file.replace(/\/page\.tsx$/, "").replace(/^src\/app/, "").split("/");
    for (const segment of match[1].replace(/\/page$/, "").split("/")) {
      if (segment === "..") from.pop();
      else if (segment !== ".") from.push(segment);
    }
    targets.add(from.join("/"));
  }
  return targets;
}

/**
 * Routes whose whole job is to redirect somewhere else.
 *
 * `account/preferences` sends agency roles to Settings and everyone else to
 * their account. Seven Dev Team routes do the same. They exist FOR old
 * bookmarks and external links — a compatibility route in the navigation would
 * be a menu entry that bounces you somewhere else, which is worse than absent.
 *
 * `docs/workspace/hazards-and-duplication.md` already listed these under
 * "Redirect-only (no UI of their own)". This file counted them as orphans until
 * 2026-08-29, when reading that chapter turned an orphan list of ten into two.
 */
function redirectOnly(): Set<string> {
  const out = new Set<string>();
  for (const file of walk("src/app/portal", entry => entry === "page.tsx")) {
    const source = readFileSync(file, "utf8");
    if (!/\bredirect\(/.test(source)) continue;
    // A page that also renders something is a real page that happens to
    // redirect in one branch.
    if (/return\s*\(?\s*</.test(source)) continue;
    out.add(file.replace(/^src\/app/, "").replace(/\/page\.tsx$/, ""));
  }
  return out;
}

function unreachable(): string[] {
  const linked = linkedPaths();
  const aliased = aliasTargets();
  const redirects = redirectOnly();
  return staticRoutes()
    .filter(route => {
      if (linked.has(route)) return false;
      // A compatibility redirect has no business in the navigation.
      if (redirects.has(route)) return false;
      // Reached through an alias that IS linked — a real page with a front door
      // somewhere else, not an orphan.
      if (aliased.has(route)) return false;
      // A page whose CHILDREN are linked is reachable as their parent.
      return ![...linked].some(path => path.startsWith(`${route}/`));
    })
    .sort();
}

/**
 * Pages nothing links to, as of 2026-08-29.
 *
 * Each is reachable only by typing its URL. They are recorded rather than fixed
 * in one sweep because linking a page is a product decision — where does it
 * belong, and does it still deserve to exist — and fifteen of those decisions
 * is not one commit.
 *
 * Shrink this list. Do not add to it.
 */
const KNOWN_UNREACHABLE: readonly string[] = [
  // Singular compatibility aliases of the CANONICAL plural routes, which are
  // plugin pages carrying their own nav items:
  //   /portal/customer/affiliate  → affiliates plugin's /portal/customer/affiliates
  //   /portal/customer/membership → memberships plugin's /portal/customer/memberships
  // They render `CustomerSubroute`, which redirects — so `redirectOnly()` does
  // not spot them, because the redirect happens inside a component rather than
  // in the page body. Same family as `agency/sops` → `agency/sop-library`.
  //
  // Correctly unlinked: putting a singular alias in the nav beside its own
  // canonical plural route is how you get two menu entries for one screen.
  "/portal/customer/affiliate",
  "/portal/customer/membership",

  // DELIBERATELY off the sidebar. Ed removed the row on 2026-08-21 and kept the
  // route so nothing linking to it breaks; `smoke-dev-team-shell` pins that
  // decision with "Team chat should not have a sidebar row".
  //
  // This entry is the useful kind of record: on 2026-08-29 this file called it a
  // "genuine orphan", a row was added back, and the shell test caught it within
  // one suite run. An unreachable page is not automatically a mistake — somebody
  // may have decided it. Check for a test that pins the absence before linking.
  "/portal/dev-team/chat",
];

describe("every page can be reached", () => {
  it("finds a real slice of the app, so a broken walk cannot pass this file", () => {
    // Guards the guard. An empty route list would make everything look linked.
    const routes = staticRoutes();
    assert.ok(routes.length > 50, `expected the portal routes, walked ${routes.length}`);
    assert.ok(linkedPaths().size > 50, "expected to find portal links in the source");
  });

  it("has no page that nothing links to, beyond the recorded backlog", () => {
    const found = unreachable();
    const known = new Set(KNOWN_UNREACHABLE);
    const fresh = found.filter(route => !known.has(route));
    assert.deepEqual(fresh, [],
      "these pages exist and NOTHING links to them — they can only be reached by typing the URL:\n  "
      + `${fresh.join("\n  ")}\n`
      + "Link it from where somebody would look for it, or delete it. "
      + "If it is genuinely reachable another way, add it to KNOWN_UNREACHABLE with the reason.");
  });

  it("the backlog only shrinks", () => {
    const found = new Set(unreachable());
    const fixed = KNOWN_UNREACHABLE.filter(route => !found.has(route));
    assert.deepEqual(fixed, [],
      `these are linked now — delete them from KNOWN_UNREACHABLE so the list keeps shrinking:\n  ${fixed.join("\n  ")}`);
  });

  it("is pinned at a ceiling, not a target", () => {
    assert.ok(KNOWN_UNREACHABLE.length <= 3,
      `the unreachable backlog has grown to ${KNOWN_UNREACHABLE.length}. It may only shrink.`);
  });
});
