// Native website-editor blocks must not promise a visitor something the
// backend cannot deliver. Issue #29.
//
// ── Why this test re-derives instead of asserting a list ─────────────────
//
// The tempting version reads `BLOCK_BACKEND_GAPS` and checks it is non-empty,
// which passes forever and tells nobody anything. This one rebuilds the truth
// from two independent places — the endpoints each block component actually
// fetches, and the route tables each module actually declares — and compares
// that against the list.
//
// It fails BOTH ways on purpose:
//
//   - A block on the list whose backend now works fails, so the day somebody
//     builds the forms module the test says "delete this entry" instead of
//     leaving "Not connected yet" in front of clients forever.
//   - A block NOT on the list that calls an unreachable endpoint fails, so a
//     new block cannot quietly ship the same defect.
//
// The reachability rule is the dispatcher's, not an approximation of it:
// `src/app/api/portal/[module]/[...rest]/route.ts` calls `requireSession()`
// unless the resolved route declares `public: true`. A visitor to a published
// page has no session, so "reachable by a visitor" means "declared, and
// public".

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

// The repo path contains a space, so __dirname via fileURLToPath — not a
// hand-rolled slice of import.meta.url.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MODULES = path.join(ROOT, "src/built-ins/modules");
const WEBSITE_EDITOR = path.join(MODULES, "website-editor/src");
const BLOCKS_DIR = path.join(WEBSITE_EDITOR, "components/blocks");
const REGISTRY = path.join(WEBSITE_EDITOR, "components/blockRegistry.ts");

interface DeclaredRoute { path: string; public: boolean }

/** Every route each module declares, with the dispatcher's public flag. */
function declaredRoutes(): Map<string, DeclaredRoute[]> {
  const out = new Map<string, DeclaredRoute[]>();
  for (const moduleId of readdirSync(MODULES)) {
    const file = path.join(MODULES, moduleId, "src/api/routes.ts");
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    const rows: DeclaredRoute[] = [];
    for (const match of src.matchAll(/\{\s*path:\s*["'`]([^"'`]+)["'`][^}]*?\}/gs)) {
      rows.push({ path: match[1], public: /public:\s*true/.test(match[0]) });
    }
    out.set(moduleId, rows);
  }
  return out;
}

/**
 * Which native block each component file backs.
 *
 * Only blocks in `BLOCK_REGISTRY` are offered by the palette unconditionally.
 * Plugin-contributed renderers in `RENDERER_REGISTRATIONS` are already gated by
 * whether their plugin is installed, so they are deliberately out of scope —
 * including them would flag membership and affiliate blocks that the plugin
 * system never offers unless the plugin is there.
 */
function nativeBlockTypes(): Map<string, string> {
  const src = readFileSync(REGISTRY, "utf8");
  // Cut the file at RENDERER_REGISTRATIONS so plugin-contributed entries below
  // it are not mistaken for native palette blocks.
  const nativeOnly = src.split("export const RENDERER_REGISTRATIONS")[0];
  const byComponent = new Map<string, string>();
  // Anchor on `Component:` and walk BACK to the nearest `type:` before it.
  // Matching forwards from `type:` instead pulls in `type: "boolean"` and
  // friends out of the `fields: [...]` PropField literals, which is how the
  // first version of this test decided "boolean" was a block.
  for (const match of nativeOnly.matchAll(/Component:\s*([A-Za-z0-9_]+)/g)) {
    const before = nativeOnly.slice(0, match.index ?? 0);
    const types = [...before.matchAll(/\btype:\s*["']([a-z0-9][a-z0-9-]*)["']/g)];
    const nearest = types[types.length - 1]?.[1];
    if (nearest) byComponent.set(match[1], nearest);
  }
  return byComponent;
}

/** The `/api/portal/...` endpoints a block component calls. */
function endpointsFor(componentName: string): string[] {
  const file = path.join(BLOCKS_DIR, `${componentName}.tsx`);
  if (!existsSync(file)) return [];
  const src = readFileSync(file, "utf8");
  const eps = new Set<string>();
  for (const m of src.matchAll(/(?:fetch\(|action=)["`](\/api\/portal\/[^"`?]+)/g)) eps.add(m[1]);
  return [...eps];
}

/** Can an anonymous visitor reach this endpoint? */
function reachableByVisitor(endpoint: string, routes: Map<string, DeclaredRoute[]>): boolean {
  const rest = endpoint.replace("/api/portal/", "");
  const moduleId = rest.split("/")[0];
  const declared = routes.get(moduleId);
  if (!declared) return false;                    // module does not exist
  const sub = rest.slice(moduleId.length + 1).replace(/\$\{[^}]*\}/g, "*").replace(/\/+$/, "");
  const match = declared.find(r => r.path.replace(/:[^/]+/g, "*").replace(/\[[^\]]+\]/g, "*") === sub);
  if (!match) return false;                       // route never declared
  return match.public;                            // declared but session-gated
}

test("every native block that a visitor cannot use is declared as such", async () => {
  const { BLOCK_BACKEND_GAPS } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );
  const routes = declaredRoutes();
  const native = nativeBlockTypes();

  assert.ok(native.size > 40, `expected the native registry to parse, got ${native.size} blocks`);

  const broken: string[] = [];
  for (const [component, type] of native) {
    const eps = endpointsFor(component);
    if (!eps.length) continue;
    const unreachable = eps.filter(ep => !reachableByVisitor(ep, routes));
    if (unreachable.length) broken.push(type);
  }

  const listed = Object.keys(BLOCK_BACKEND_GAPS).sort();
  const found = [...new Set(broken)].sort();

  // Two-sided. Named explicitly so a failure says WHICH block and WHICH way.
  const missing = found.filter(t => !listed.includes(t));
  const stale = listed.filter(t => !found.includes(t));

  assert.deepEqual(
    missing, [],
    `these blocks call an endpoint no visitor can reach but are not declared in BLOCK_BACKEND_GAPS: ${missing.join(", ")}`,
  );
  assert.deepEqual(
    stale, [],
    `these blocks now have a reachable backend — delete their BLOCK_BACKEND_GAPS entry so the editor stops warning about them: ${stale.join(", ")}`,
  );
});

test("the palette refuses to add a block with no visitor backend", () => {
  const sidebar = readFileSync(path.join(WEBSITE_EDITOR, "components/canvas/Sidebar.tsx"), "utf8");
  // Strip comments so this cannot pass by matching its own explanation — a
  // trap this repo has fallen into before.
  const code = sidebar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(code, /blockBackendGap\(/, "Sidebar must consult blockBackendGap");
  // The gapped branch must render something that is NOT the add button: no
  // onClick that adds, and no draggable payload.
  const gapBranch = code.split("blockBackendGap(")[1]?.split("return (")[1]?.split("})}")[0] ?? "";
  assert.doesNotMatch(gapBranch, /onAdd\(/, "a block with no backend must not be addable");
  assert.doesNotMatch(gapBranch, /draggable/, "a block with no backend must not be draggable onto the canvas");
  assert.match(gapBranch, /Not connected yet/, "the palette must say why the block is unavailable");
});

test("contact-form is covered — the block most likely to be published", async () => {
  // Named on its own because it is the one a client will actually reach for,
  // and because its failure is silent: the visitor sees "Couldn't send. Please
  // email us directly." with no email address anywhere on the page.
  const { blockBackendGap } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );
  const gap = blockBackendGap("contact-form");
  assert.ok(gap, "contact-form must be declared as having no visitor backend");
  assert.ok(gap.reason.length > 20, "the reason must be a sentence a person can act on");
});

test("no page template seeds a block that cannot serve a visitor", async () => {
  // The palette gate is not enough on its own. A template builds a page
  // directly, so it walks straight past the palette — and the "Contact" and
  // brand-contact templates were doing exactly that, putting a form that could
  // never deliver on every Contact page anybody created from them.
  const { BLOCK_BACKEND_GAPS } = await import(
    "../src/built-ins/modules/website-editor/src/lib/blockBackends.ts"
  );
  const src = readFileSync(path.join(WEBSITE_EDITOR, "components/pageTemplates.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const seeded = new Set<string>();
  for (const m of code.matchAll(/\bblk\(\s*["']([a-z0-9-]+)["']/g)) seeded.add(m[1]);

  const offending = [...seeded].filter(type => type in BLOCK_BACKEND_GAPS).sort();
  assert.deepEqual(
    offending, [],
    `page templates seed blocks with no visitor backend: ${offending.join(", ")}`,
  );
});

test("no page template points a form at a route that does not exist", () => {
  // `/api/contact` and `/api/checkout` were both seeded as form actions and
  // both answer 404 — verified against a running server before this was
  // written, not assumed from the file tree.
  const src = readFileSync(path.join(WEBSITE_EDITOR, "components/pageTemplates.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const dead: string[] = [];
  for (const m of code.matchAll(/\baction:\s*["'](\/[^"']*)["']/g)) {
    const target = m[1];
    if (!target) continue;                                  // empty is the honest state
    const dir = path.join(ROOT, "src/app", target.replace(/\?.*$/, ""));
    const exists = existsSync(path.join(dir, "route.ts")) || existsSync(path.join(dir, "route.tsx"));
    if (!exists) dead.push(target);
  }
  assert.deepEqual(
    dead, [],
    `page templates post forms to routes that do not exist: ${[...new Set(dead)].join(", ")}`,
  );
});

test("a form with no destination refuses to submit", () => {
  // Blanking the template action alone would have moved the bug rather than
  // fixed it: an empty `action` posts to the CURRENT URL. The block has to
  // decline instead.
  const src = readFileSync(path.join(BLOCKS_DIR, "FormBlock.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(code, /const connected = action\.trim\(\)\.length > 0/, "FormBlock must decide whether it has a destination");
  assert.match(code, /action=\{connected \? action : undefined\}/, "an unconnected form must not post to the current URL");
  assert.match(code, /disabled=\{!connected\}/, "an unconnected form must disable its submit button");
});
