import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

import { clientIdFromPortalReferer } from "../src/lib/server/pluginRequestScope";
import {
  cloneBlock,
  createBlock,
  findBlock,
  moveBlock,
} from "../src/built-ins/modules/website-editor/src/components/canvas/blockTreeOps";
// Statically, not `await import()`. The registry reaches `@/engines/editor/elements/*`
// for the shared vocabulary since P1, and a built-in plugin module with a
// runtime `@/` import cannot be loaded through Node's ESM path under tsx —
// the plugin package is `"type": "module"` while `src/lib` transpiles to CJS,
// and the named-export link fails. Every other plugin already has this
// property (`agency-finance/src/api/handlers-budgets.ts` fails the same way on
// `@/lib/server/finance/financeCurrency`), and every other test reaches plugin modules
// this way. The assertions below are unchanged.
import {
  BLOCK_REGISTRY,
  RENDERER_REGISTRATIONS,
  getBlockDefinition,
  getBlockRenderer,
} from "../src/built-ins/modules/website-editor/src/components/blockRegistry";
import type { Block } from "../src/built-ins/modules/website-editor/src/types/block";

test("client plugin APIs inherit the client workspace from a same-origin referer", () => {
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "http://localhost:3032/portal/clients/cli_123/edit-website?page=home",
    ),
    "cli_123",
  );
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "http://localhost:3032/portal/clients/client%20one/pages",
    ),
    "client one",
  );
});

test("client scope is not inherited from another origin or an agency page", () => {
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "https://example.com/portal/clients/cli_bad/edit-website",
    ),
    undefined,
  );
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "http://localhost:3032/portal/agency/development",
    ),
    undefined,
  );
});

test("visual builder clones nested blocks with fresh identities", () => {
  const block: Block = {
    id: "section_old",
    type: "section",
    props: {},
    children: [{ id: "heading_old", type: "heading", props: { text: "Hello" } }],
  };
  const copy = cloneBlock(block);
  assert.notEqual(copy.id, block.id);
  assert.notEqual(copy.children?.[0]?.id, block.children?.[0]?.id);
  assert.equal(copy.children?.[0]?.props.text, "Hello");
});

test("visual builder can move an element inside a container", () => {
  const blocks: Block[] = [
    { id: "heading", type: "heading", props: { text: "Move me" } },
    { id: "section", type: "section", props: {}, children: [] },
  ];
  const moved = moveBlock(blocks, "heading", "section", "inside");
  assert.equal(moved.length, 1);
  assert.equal(findBlock(moved, "heading")?.parent?.id, "section");
});

// ─── Lazy block registry ────────────────────────────────────────────────────
//
// `blockRegistry.ts` used to statically import all 78 block components, so any
// route that touched the registry — even only for its metadata — shipped the
// whole block library. The components are now behind `lazyBlock(() =>
// import(...))`, one webpack chunk each.
//
// That trade buys bundle size at the cost of a new failure mode: a wrong module
// path used to be a compile error at the static import, and would now only
// surface when a user drops that particular block on the canvas. These tests
// close that gap — every registry entry must still resolve to a real component
// module — and pin the parts of the contract the split must not change.

test("every block registry entry is still a synchronously renderable component", () => {
  const types = Object.keys(BLOCK_REGISTRY);
  assert.ok(types.length >= 70, `expected the native library intact, got ${types.length} types`);

  for (const type of types) {
    const def = BLOCK_REGISTRY[type];
    // Lookups stay synchronous: callers render `def.Component` directly, they
    // never await it. Only the module behind it is fetched lazily.
    assert.equal(typeof def.Component, "function", `${type}.Component is not renderable`);
    assert.equal(def.type, type);
    assert.equal(typeof getBlockRenderer(type), "function", `getBlockRenderer("${type}") broke`);
    assert.equal(getBlockDefinition(type), def);
    // Metadata stays static — the palette, the properties panel and
    // createBlock() must never trigger a chunk download.
    assert.equal(typeof def.label, "string");
    assert.ok(def.label.length > 0, `${type} lost its label`);
    assert.ok(Array.isArray(def.fields), `${type} lost its property fields`);
    assert.equal(typeof def.defaultProps, "object");
  }

  // The cross-plugin renderers (ecommerce, memberships, affiliates, forms,
  // client-crm) ride the same map and must survive the split too.
  for (const id of ["product-card", "membership-paywall", "affiliate-signup", "form-render", "crm-contact-form"]) {
    assert.equal(typeof RENDERER_REGISTRATIONS[id], "function", `renderer "${id}" went missing`);
  }
});

test("every lazy block loader points at a module that really exists", () => {
  // `lazyBlock` stamps displayName as `LazyBlock(<ModuleName>)`, which ties each
  // registry entry to one file under `components/blocks/`. Walk that back to the
  // file on disk — a typo'd path fails here instead of on the canvas.
  //
  // Checked on disk rather than by `await import()` on purpose: the suite runs
  // under `--conditions react-server`, where a real ESM load of a block would
  // fail on `useEffect` — these are client modules, and webpack only needs the
  // path to resolve to a module with a default export.
  const BLOCKS_DIR = join(ROOT, "src/built-ins/modules/website-editor/src/components/blocks");
  const moduleOf = (Component: unknown) =>
    /^LazyBlock\((\w+)\)$/.exec((Component as { displayName?: string }).displayName ?? "")?.[1];

  const seen = new Set<string>();
  for (const [id, Component] of Object.entries(RENDERER_REGISTRATIONS)) {
    const moduleName = moduleOf(Component);
    assert.ok(
      moduleName,
      `renderer "${id}" is not a lazyBlock (displayName: "${(Component as { displayName?: string }).displayName ?? ""}")`,
    );
    const file = join(BLOCKS_DIR, `${moduleName}.tsx`);
    assert.ok(existsSync(file), `renderer "${id}" loads blocks/${moduleName}, which does not exist`);
    assert.match(
      readFileSync(file, "utf8"),
      /export default/,
      `blocks/${moduleName} has no default export (renderer "${id}")`,
    );
    seen.add(moduleName!);
  }

  // Every native type resolves to its own module — no two entries collapsed
  // onto the same loader while the imports were being rewritten.
  const nativeNames = Object.keys(BLOCK_REGISTRY).map(type => moduleOf(BLOCK_REGISTRY[type].Component));
  assert.ok(nativeNames.every(Boolean), "a native block type lost its lazy loader");
  assert.equal(new Set(nativeNames).size, nativeNames.length, "two block types share one lazy loader");
  assert.ok(seen.size >= 78, `expected >= 78 distinct block modules, resolved ${seen.size}`);
});

test("creating a block still reads its defaults from static registry metadata", () => {
  // createBlock() runs on the click that inserts a block. It must stay
  // synchronous — it reads defaultProps/defaultChildren, never the component.
  const hero = createBlock("hero");
  assert.equal(hero.type, "hero");
  assert.equal(typeof hero.props, "object");
  const grid = createBlock("grid");
  assert.equal(grid.props.columns, 3);
});
