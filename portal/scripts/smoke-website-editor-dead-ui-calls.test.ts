// Website-editor UI calls that reach no route. Issues #28 and #31.
//
// ── What this is, and what it is NOT ─────────────────────────────────────
//
// It is a RATCHET, not a clean bill of health. Thirty-one distinct endpoints
// are fetched by website-editor pages and blocks and resolve to nothing: no
// `src/app` route, and no path declared by any module's `routes.ts`. They are
// listed below by name. The test fails if a NEW one appears, and it fails if a
// listed one starts working and nobody removed it from the list.
//
// Pretending otherwise would be worse than nothing. The honest position is that
// this debt is real, it is now counted rather than described, and it can no
// longer grow quietly while somebody adds a feature.
//
// ── Why the check has to be module-aware ─────────────────────────────────
//
// `/api/portal/<module>/<rest>` is served by `[module]/[...rest]/route.ts`, not
// by a file at that path, so "does `src/app/api/portal/memberships/plans` exist"
// is the wrong question and answers "no" for routes that work perfectly. The
// right question is whether the module declares the path. A first pass at this
// audit used the file test and reported 53 dead calls; 22 of those were fine.
//
// ── The three groups, because they need different answers ────────────────
//
//   * **Blocks with no backend** — already handled: the palette refuses to add
//     them and `lib/blockBackends.ts` explains why. They appear here too
//     because the fetch is still in the component.
//   * **The Sites admin island** (`/api/portal/content/*`, `domains`, `config`,
//     `embeds`, `promote`, `schema`, `discoveries`, `chatbot`, `heartbeats`,
//     `embed-theme`) — issue #31. Fourteen of the thirty-one. These are the
//     legacy top-level paths the issue describes, and unifying them is a
//     data-model merge, not a rename.
//   * **AI Builder and promote** — issue #28. The modals stay visible after the
//     status probe proves AI Builder is absent, then call routes that were
//     never built.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MODULES = path.join(ROOT, "src/built-ins/modules");
const WEBSITE_EDITOR = path.join(MODULES, "website-editor/src");

/** Known dead calls. Shrinking this list is the goal; growing it is a failure. */
const KNOWN_DEAD = [
  "/api/portal/affiliates/leaderboard",
  "/api/portal/ai-builder/generate/stream",
  "/api/portal/ai-builder/image",
  "/api/portal/ai-builder/image/inpaint",
  "/api/portal/ai-builder/image/variations",
  "/api/portal/ai-builder/status",
  "/api/portal/chatbot/*",
  "/api/portal/config/*",
  "/api/portal/content/*",
  "/api/portal/content/*/*",
  "/api/portal/content/*/preview-token",
  "/api/portal/content/*/publish",
  "/api/portal/content/*/revert",
  "/api/portal/discoveries",
  "/api/portal/domains",
  "/api/portal/ecommerce/products/*/variants",
  "/api/portal/embed-theme/*",
  "/api/portal/embeds/*",
  "/api/portal/forms/public/form/*",
  "/api/portal/forms/public/submit/*",
  "/api/portal/forms/submit",
  "/api/portal/heartbeats",
  "/api/portal/newsletter/subscribe",
  "/api/portal/promote/*",
  "/api/portal/reservations",
  "/api/portal/reservations/resources",
  "/api/portal/reservations/services",
  "/api/portal/reservations/staff",
  "/api/portal/schema/*",
  "/api/portal/themes/*",
  "/api/portal/website-editor/promote/*",
].sort();

function declaredRoutes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const moduleId of readdirSync(MODULES)) {
    const file = path.join(MODULES, moduleId, "src/api/routes.ts");
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    const rows: string[] = [];
    for (const m of src.matchAll(/\{\s*path:\s*["'`]([^"'`]+)["'`]/g)) rows.push(m[1].replace(/^\//, ""));
    out.set(moduleId, rows);
  }
  return out;
}

const appRouteExists = (p: string) =>
  existsSync(path.join(ROOT, "src/app", p, "route.ts")) ||
  existsSync(path.join(ROOT, "src/app", p, "route.tsx"));

function uiFiles(): string[] {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!/__smoke__/.test(p)) walk(p); }
      // `api/` is the server side; this test is about what the UI CALLS.
      else if (/\.tsx?$/.test(entry.name) && !p.includes(`${path.sep}api${path.sep}`)) files.push(p);
    }
  })(WEBSITE_EDITOR);
  return files;
}

function deadCalls(): string[] {
  const declared = declaredRoutes();
  const dead = new Set<string>();
  for (const file of uiFiles()) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/fetch\(\s*[`"']([^`"'?]*\/api\/[^`"'?]*)/g)) {
      const url = m[1].replace(/\$\{[^}]*\}/g, "*").replace(/\/$/, "");
      if (!url.startsWith("/api/")) continue;
      let ok = false;
      if (url.startsWith("/api/portal/")) {
        const rest = url.slice("/api/portal/".length);
        const moduleId = rest.split("/")[0];
        const sub = rest.slice(moduleId.length + 1);
        const rows = declared.get(moduleId);
        ok = !!rows && rows.some(r => r.replace(/:[^/]+/g, "*").replace(/\[[^\]]+\]/g, "*") === sub);
        if (!ok) ok = appRouteExists(url);
      } else {
        ok = appRouteExists(url);
      }
      if (!ok) dead.add(url);
    }
  }
  return [...dead].sort();
}

test("no NEW website-editor UI call points at a route that does not exist", () => {
  const found = deadCalls();
  const added = found.filter(u => !KNOWN_DEAD.includes(u));
  assert.deepEqual(
    added, [],
    `new dead UI call(s) — either build the route or do not ship the control:\n  ${added.join("\n  ")}`,
  );
});

test("a dead call that now works must be removed from the known list", () => {
  const found = deadCalls();
  const fixed = KNOWN_DEAD.filter(u => !found.includes(u));
  assert.deepEqual(
    fixed, [],
    `these now resolve — delete them from KNOWN_DEAD so the ratchet keeps tightening:\n  ${fixed.join("\n  ")}`,
  );
});

test("the site export is reachable — it was the button that proved this class real", () => {
  // `/api/admin/export-code` was never a route in this app, so the Customise
  // page's Export button answered 404 for every client who pressed it, while a
  // complete and tested export handler sat unmounted a few files away. Wiring
  // it is what turned "the UI calls dead routes" from a description into a
  // countable list.
  const routes = readFileSync(path.join(WEBSITE_EDITOR, "api/routes.ts"), "utf8");
  assert.match(routes, /handler:\s*handleExportSite/, "the static export handler must be registered");
  assert.match(routes, /path:\s*["'`]\/export["'`]/, "the export route must be declared at /export");

  const page = readFileSync(path.join(WEBSITE_EDITOR, "pages/CustomisePage.tsx"), "utf8");
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\/api\/admin\/export-code/, "the Export button must not call the route that never existed");
  assert.match(code, /\/api\/portal\/website-editor\/export/, "the Export button must call the mounted handler");
});

test("the Sites screen admits its registry is browser-local", () => {
  // Issue #31. `lib/sitesAdmin.ts` persists to `localStorage` under
  // `lk_sites_v1`, and nothing else in the repository reads that key — the
  // server routes hostnames from `websiteSources`. A domain added on this
  // screen therefore does nothing, and disappears on another machine.
  //
  // The unification is a real piece of work (a sync→async conversion across
  // ~20 functions and 27 call sites). What is NOT acceptable in the meantime is
  // the screen implying otherwise, which it did: its own tooltip said visitors
  // "are routed to the correct site by hostname automatically".
  //
  // This pins the honesty, not the architecture. When the registry moves to the
  // `/sites` API, delete the notice and this test together.
  const src = readFileSync(path.join(WEBSITE_EDITOR, "pages/SitesPage.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const jsx = code.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

  assert.match(jsx, /Saved in this browser only/, "the Sites screen must say its registry is browser-local");
  assert.match(jsx, /not route\s*\{?"?\s*live traffic|will not route/, "it must say adding a domain does not route live traffic");
  assert.doesNotMatch(
    jsx, /routed to the correct site by hostname automatically/,
    "the tooltip must not claim hostname routing works from this registry",
  );
});

test("nothing outside the client store reads the local site registry", () => {
  // The claim the notice rests on. If somebody wires `lk_sites_v1` into a
  // server path later, this fails and the notice needs rewriting rather than
  // quietly becoming wrong.
  const hits: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); }
      else if (/\.tsx?$/.test(entry.name)) {
        // Strip comments first. The Sites page NAMES this key in the comment
        // explaining the notice, and the first version of this test duly
        // flagged that comment as a second reader — a test failing on its own
        // documentation, which is the mirror image of a test that passes by
        // matching it.
        const code = readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (code.includes("lk_sites_v1")) hits.push(path.relative(ROOT, p));
      }
    }
  })(path.join(ROOT, "src"));

  assert.deepEqual(
    hits, ["src/built-ins/modules/website-editor/src/lib/sitesAdmin.ts"],
    `lk_sites_v1 is read somewhere new — the "browser only" notice may no longer be true: ${hits.join(", ")}`,
  );
});
