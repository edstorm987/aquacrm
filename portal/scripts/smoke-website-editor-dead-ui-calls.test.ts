// Website-editor UI calls that reach no route. Issues #28 and #31.
//
// ── What this is, and what it is NOT ─────────────────────────────────────
//
// It is a RATCHET, not a clean bill of health. Sixteen distinct endpoints
// (thirty-one when this was written; two were repointed on 2026-08-30 and the
// thirteen-call browser-local Sites island was retired on 2026-09-01)
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
//   * **AI Builder** — issue #28. The image modals call routes that only exist
//     when the AI Builder plugin is installed. As of 2026-08-30 the controls
//     that open them are gated on the same status probe that already hid the
//     top bar's ✨ Generate, so an absent plugin no longer offers them; the
//     fetches stay in the components, which is why they stay listed here.

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
  "/api/portal/ecommerce/products/*/variants",
  "/api/portal/forms/public/form/*",
  "/api/portal/forms/public/submit/*",
  "/api/portal/forms/submit",
  "/api/portal/newsletter/subscribe",
  "/api/portal/reservations",
  "/api/portal/reservations/resources",
  "/api/portal/reservations/services",
  "/api/portal/reservations/staff",
  "/api/portal/themes/*",
  // `/api/portal/website-editor/promote/*` LEFT this list on 2026-08-30.
  // `lib/promote.ts` invented a `/promote/<siteId>` path; the module declares
  // `/promote` and `handlePromote` reads siteId from the body. The siteId now
  // travels in the body. `/api/portal/promote/*` — the Sites page's own,
  // separate legacy call — is still above and still dead.
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

test("promote posts siteId in the body, at the path the module declares", () => {
  // `lib/promote.ts` POSTed to `/api/portal/website-editor/promote/<siteId>`.
  // The module declares `/promote` (no path segment), and `handlePromote`
  // reads `siteId` from the JSON body and 400s without it. So the publish
  // modal's third step 404'd on a path that has never existed, and reported it
  // to the operator as a promote failure rather than a missing route.
  const promote = readFileSync(path.join(WEBSITE_EDITOR, "lib/promote.ts"), "utf8");
  const code = promote.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.doesNotMatch(
    code, /promote\/\$\{/,
    "promote must not put siteId in the path — the module declares no /promote/:siteId",
  );
  assert.match(code, /fetch\("\/api\/portal\/website-editor\/promote"/, "it must call the declared path");
  assert.match(code, /JSON\.stringify\(\{\s*\n?\s*siteId,/, "and send siteId in the body, where the handler reads it");

  const routes = readFileSync(path.join(WEBSITE_EDITOR, "api/routes.ts"), "utf8");
  assert.match(routes, /path:\s*["'`]\/promote["'`]/, "the promote route must still be declared at /promote");
  const handler = readFileSync(path.join(WEBSITE_EDITOR, "api/handlers/promote.ts"), "utf8");
  assert.match(handler, /body\?\.siteId/, "and the handler must still take siteId from the body");
});

test("the publish modal publishes through the registered content handlers", () => {
  // Step 1 of the publish chain POSTed `/api/portal/content/<siteId>/publish`
  // and the diff preload GET `/api/portal/content/<siteId>?admin=1` — legacy
  // top-level paths from the pre-plugin app. Neither is declared by any module
  // and neither exists under `src/app`, so publishing 404'd on its first step
  // and the preload's `catch` turned the 404 into "No unpublished changes",
  // which is exactly what a clean tree looks like.
  const src = readFileSync(path.join(WEBSITE_EDITOR, "pages/EditorPage.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.doesNotMatch(
    code, /\/api\/portal\/content\//,
    "the editor must not call the legacy top-level content paths",
  );
  assert.match(
    code, /from "\.\.\/lib\/content"/,
    "it must go through lib/content.ts, the module's client for the registered /content handlers",
  );

  // The mask that made the dead call survivable: a failed read rendered as an
  // empty diff. A read that could not be made must be SAID.
  assert.match(code, /unreadable/, "an unreadable half of the diff must be tracked");
  assert.match(
    code, /Could not read \{preview\.unreadable/,
    "and named to the operator, rather than shown as nothing to publish",
  );

  // Naming the blind spot is only half of it. A failed read leaves
  // `changedContentKeys` empty, so the empty-diff branch is the one that
  // renders — and if it still prints "No unpublished changes" the operator has
  // been told the tree is clean by the very code path that could not look.
  // The clean-tree line must be reachable ONLY from a diff that was read.
  const emptyBranch =
    /changedContentKeys\.length === 0 && preview\.changedPages\.length === 0 \?([\s\S]*?)\n\s*\) : \(/.exec(code);
  assert.ok(emptyBranch, "the idle screen must still branch on an empty diff");
  assert.match(
    emptyBranch[1], /preview\.unreadable\.length > 0 \? null :/,
    "\"No unpublished changes\" must be suppressed when a half of the diff could not be read",
  );

  // And the empty-diff line must not promise a commit either: promote is still
  // the stub, so "re-shipping refreshes the committed snapshot files" would be
  // the same delivery claim the success screen was fixed for.
  assert.doesNotMatch(
    emptyBranch[1], /committed|commit|repository/i,
    "the empty-diff line must not claim anything reaches the repository",
  );
});

test("a publish that raised no pull request does not say it did", () => {
  // `api/handlers/promote.ts` is still the Round-1 stub: it answers
  // `{ ok: true, pending: true }` and opens nothing. The modal keyed its
  // success screen on `out.ok` and headed it "Pull request opened" — a claim of
  // delivery that did not happen, sending the operator to look for a PR that
  // does not exist. The content and page publishes DID happen, so the honest
  // answer separates the two.
  const handler = readFileSync(path.join(WEBSITE_EDITOR, "api/handlers/promote.ts"), "utf8");
  assert.match(handler, /pending:\s*true/, "the stub still answers pending — this test's premise");

  const src = readFileSync(path.join(WEBSITE_EDITOR, "pages/EditorPage.tsx"), "utf8");
  const jsx = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(
    jsx, /result\.prUrl \? "Pull request opened" : "Published here — no pull request raised"/,
    "the success heading must depend on a PR URL actually coming back",
  );
  assert.match(jsx, /nothing has reached your repository/, "and say plainly that the repository was not touched");
  assert.doesNotMatch(jsx, /Ship \{site\.name\} to GitHub/, "the modal must not promise a ship it cannot perform");
});

test("the image AI controls are gated on the same probe as the top bar", () => {
  // `EditorPropertiesSidebar` showed "Generate variations" and "Edit with mask"
  // for every image, and those modals POST to `/api/portal/ai-builder/image/*`
  // — routes that exist only when the AI Builder plugin is installed. The
  // editor already probes `/api/portal/ai-builder/status` and hides the top
  // bar's ✨ Generate on the answer; the sidebar ignored it, so with the plugin
  // absent the operator got a modal that spun and then failed.
  const sidebar = readFileSync(path.join(WEBSITE_EDITOR, "components/editor/EditorPropertiesSidebar.tsx"), "utf8");
  const code = sidebar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(code, /aiAvailable = false/, "the prop must default to false — unknown is not available");
  assert.match(
    code, /selected\.type === "image-src" && draft && aiAvailable/,
    "the AI tools row must be gated on the probe",
  );
  for (const mode of ["variations", "inpaint"]) {
    assert.match(
      code, new RegExp(`aiMode === "${mode}"[^\\n]*&& aiAvailable`),
      `the ${mode} modal must not open without the probe`,
    );
  }

  const editor = readFileSync(path.join(WEBSITE_EDITOR, "pages/EditorPage.tsx"), "utf8");
  assert.match(editor, /aiAvailable=\{aiAvailable\}/, "and the page must pass the probe's answer down");
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
