// The element engine — P1 (lift the vocabulary) and P2 (additive ABI + one
// prop schema).
//
// What this file is defending, in one sentence each:
//
//  P1  `Block`, `BlockStyles`, `BlockDefinition`, `PropField`, `BlockRenderer`,
//      `blockStyles`, `blockTreeOps` and `blockSchemaMigrations` live in
//      `src/lib/elements` now, and the website-editor plugin re-exports its old
//      paths. The re-export must be the SAME module, not a copy — a copy is the
//      failure this whole phase exists to stop, and it is invisible until two
//      surfaces disagree about a block.
//
//  P2  Three optional additions — `BlockRenderProps.context`, `Block.binding` /
//      `Block.visibility`, `BlockDefinition.surfaces` / `.schema` — and one
//      prop-schema vocabulary instead of two.
//
// Everything here is driven, not grepped. The renderer is exercised by calling
// it and walking the element tree it returns, which works under
// `--conditions react-server` where a DOM render would not. Loading these
// modules at all is itself part of the contract: `src/lib/elements` may never
// reach `server-only`, and `lazyBlock` stays a hand-rolled `React.lazy`
// because `next/dynamic` throws under that condition — if either regressed,
// this file would fail to import.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── the lifted home ────────────────────────────────────────────────────────
import BlockRenderer from "../src/lib/elements/BlockRenderer";
import * as elementsBarrel from "../src/lib/elements";
import * as liftedStyles from "../src/lib/elements/blockStyles";
import * as liftedTreeOps from "../src/lib/elements/blockTreeOps";
import * as liftedMigrations from "../src/lib/elements/blockSchemaMigrations";
import {
  assertDefinitionConsistent,
  buildElementSchema,
  validateElementProps,
} from "../src/lib/elements/schema";
import {
  listElementDefinitions,
  registerElementDefinitions,
} from "../src/lib/elements/registry";
import type { BlockDefinition, BlockRenderProps } from "../src/lib/elements/definition";
import type { Block } from "../src/lib/elements/block";

// ── the plugin's old paths, which must still be the same thing ─────────────
import * as pluginStyles from "../src/built-ins/modules/website-editor/src/components/blockStyles";
import * as pluginTreeOps from "../src/built-ins/modules/website-editor/src/components/canvas/blockTreeOps";
import * as pluginMigrations from "../src/built-ins/modules/website-editor/src/lib/blockSchemaMigrations";
import {
  BLOCK_DESCRIPTORS,
  BLOCK_REGISTRY,
  BLOCK_TYPES,
  RENDERER_REGISTRATIONS,
  getBlockDefinition,
  getBlockRenderer,
  listBlockDefinitions,
} from "../src/built-ins/modules/website-editor/src/components/blockRegistry";

// ── the second prop-schema vocabulary that P2 collapsed ────────────────────
import { appConfigFieldViews, prepareAppConfigIntents } from "../src/lib/server/editing/appConfigAdapter";
import type { EditDocument } from "../src/lib/editing/engine";

// ─── A renderer driver that works without a DOM ────────────────────────────
//
// `BlockRenderer` is a function that returns React elements — plain objects.
// Calling it and walking what comes back drives the real code path (registry
// lookup, `renderChildren`, the a11y and responsive wrappers) without needing
// `react-dom`, which is what lets this run in the same suite as everything
// else. Depth-capped so a malformed tree fails the test instead of hanging it.

type El = { type: unknown; props: Record<string, unknown> };
const isElement = (v: unknown): v is El =>
  !!v && typeof v === "object" && "type" in (v as object) && "props" in (v as object);

function drive(node: unknown, depth = 0): void {
  assert.ok(depth < 60, "renderer recursed further than any real tree");
  if (node == null || typeof node === "string" || typeof node === "number") return;
  if (Array.isArray(node)) {
    for (const child of node) drive(child, depth + 1);
    return;
  }
  if (!isElement(node)) return;
  if (typeof node.type === "function") {
    drive((node.type as (props: unknown) => unknown)(node.props), depth + 1);
    return;
  }
  drive(node.props.children, depth + 1);
}

/**
 * Registers a throwaway element that records the props it was rendered with.
 *
 * `surfaces: ["stage"]` so these never enter the website palette — the shared
 * lookup is process-global and additive by design, and a probe that defaulted
 * to "website" would show up in the count assertions above as three extra
 * blocks. Real portal/stage elements arrive the same way in P3.
 */
function probeElement(type: string, extra: Partial<BlockDefinition> = {}) {
  const seen: BlockRenderProps[] = [];
  const Component = (props: BlockRenderProps) => {
    seen.push(props);
    return props.renderChildren ? props.renderChildren(props.block.children) : null;
  };
  registerElementDefinitions({
    [type]: {
      type, label: type, icon: "?", category: "content", isContainer: true,
      Component, defaultProps: {}, fields: [], surfaces: ["stage"],
      ...extra,
    } as BlockDefinition,
  });
  return seen;
}

// ═══════════════════════════════════════════════════════════════════════════
// P1 — the vocabulary really moved, and moved once
// ═══════════════════════════════════════════════════════════════════════════

describe("P1 — the vocabulary lives in src/lib/elements", () => {
  it("the plugin's old paths re-export the lifted module, they do not copy it", () => {
    // Identity, not shape. Two structurally identical copies of
    // `blockStylesToCss` would pass a deepEqual and still be the bug: the
    // moment one is edited the editor canvas and the published page disagree
    // about what a block looks like. There is already a third mapper
    // (`styleString` in the plugin's staticExport) proving that is not
    // hypothetical.
    assert.equal(pluginStyles.blockStylesToCss, liftedStyles.blockStylesToCss);
    assert.equal(pluginStyles.overridesToCssText, liftedStyles.overridesToCssText);
    assert.equal(pluginStyles.STYLE_FIELD_GROUPS, liftedStyles.STYLE_FIELD_GROUPS);

    for (const name of ["createBlock", "cloneBlock", "findBlock", "moveBlock", "removeBlock", "appendChild", "insertSibling", "duplicateBlock", "updateBlock", "isDescendant", "makeBlockId"] as const) {
      assert.equal(pluginTreeOps[name], liftedTreeOps[name], `blockTreeOps.${name} is a copy, not a re-export`);
    }

    for (const name of ["migrateTree", "treeNeedsMigration", "loadBlockTreeMigrated", "blockVersion"] as const) {
      assert.equal(pluginMigrations[name], liftedMigrations[name], `blockSchemaMigrations.${name} is a copy, not a re-export`);
    }
    assert.equal(pluginMigrations.BLOCK_SCHEMA_VERSION, liftedMigrations.BLOCK_SCHEMA_VERSION);

    // And the barrel exposes the same functions again, so a future portal or
    // stage surface importing `@/lib/elements` gets the identical code the
    // website already runs.
    assert.equal(elementsBarrel.createBlock, liftedTreeOps.createBlock);
    assert.equal(elementsBarrel.blockStylesToCss, liftedStyles.blockStylesToCss);
    assert.equal(elementsBarrel.migrateTree, liftedMigrations.migrateTree);
  });

  it("the plugin's selectors read the shared lookup, and it holds exactly the native library", () => {
    // The counts are stated in terms of the registry literal rather than a
    // number typed into this file, so adding a block moves them together and
    // this stays a "nothing was dropped in the move" check.
    const native = Object.keys(BLOCK_REGISTRY).length;
    assert.equal(listBlockDefinitions().length, native, "the shared lookup lost or gained definitions in the move");
    assert.equal(listElementDefinitions("website").length, native, "a native block stopped being a website block");
    assert.equal(BLOCK_DESCRIPTORS.length, native);
    assert.equal(BLOCK_TYPES.length, native);

    for (const type of Object.keys(BLOCK_REGISTRY)) {
      // Identity again: the lookup must hand back the very object the registry
      // declared, not a rebuilt one — `createBlock` copies `defaultProps` off
      // whatever this returns.
      assert.equal(getBlockDefinition(type), BLOCK_REGISTRY[type], `getBlockDefinition("${type}") returns a different object`);
      assert.equal(getBlockRenderer(type), RENDERER_REGISTRATIONS[type], `getBlockRenderer("${type}") diverged from the registration map`);
    }

    // Cross-plugin renderers ride the same map and must survive the move.
    for (const id of ["product-card", "membership-paywall", "affiliate-signup", "form-render", "crm-contact-form"]) {
      assert.equal(typeof getBlockRenderer(id), "function", `renderer "${id}" is not resolvable through the shared lookup`);
    }
  });

  it("createBlock still reads its defaults through the lifted tree ops", () => {
    // Behaviour, not wiring: this is the click that inserts a block. It reads
    // `defaultProps` and `isContainer` out of the shared lookup that the
    // plugin registry filled on import.
    const grid = liftedTreeOps.createBlock("grid");
    assert.equal(grid.type, "grid");
    assert.equal(grid.props.columns, 3);
    assert.deepEqual(grid.children, [], "a container lost its children array");

    const button = liftedTreeOps.createBlock("button");
    assert.equal(button.props.label, "Click me");
    assert.equal(button.children, undefined, "a leaf gained a children array");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P2 — one prop schema, generated
// ═══════════════════════════════════════════════════════════════════════════

describe("P2 — every element's defaults validate against its own generated schema", () => {
  it("no registry entry declares one default twice, or a default its own schema rejects", () => {
    // THE test of this phase. `defaultProps` is what a newly inserted element
    // actually gets; a field's `default` is what the properties panel shows as
    // its placeholder. When they disagree the operator is shown one string and
    // given another — silently, on the surface that renders live client
    // websites. Six entries disagreed when this was written (`divider`,
    // `heading`, `text`, `hero`, `order-success`, `html`) and fixing that drift
    // was the deliverable, not weakening this check.
    const failures: string[] = [];
    for (const [type, def] of Object.entries(BLOCK_REGISTRY)) {
      for (const problem of assertDefinitionConsistent(def)) {
        failures.push(`${type}.${problem.key} ${problem.message}`);
      }
    }
    assert.deepEqual(failures, [], `element definitions disagree with their own schema:\n  ${failures.join("\n  ")}`);
  });

  it("the schema is generated from `fields`, never declared a second time", () => {
    for (const [type, def] of Object.entries(BLOCK_REGISTRY)) {
      assert.ok(def.schema, `${type} has no schema`);
      assert.deepEqual(
        def.schema,
        buildElementSchema(def),
        `${type}.schema has drifted from what its own fields generate — it was hand-edited`,
      );
      assert.equal(def.schema!.props.length, def.fields.length, `${type} lost a prop between fields and schema`);
    }

    // A `select` becomes a closed value set, which is the thing `PropField`
    // could not say and an edit engine has to know.
    const variant = BLOCK_REGISTRY.button!.schema!.props.find(p => p.key === "variant");
    assert.deepEqual(variant?.enum, ["primary", "secondary", "ghost"]);
    assert.equal(variant?.default, "primary");
  });

  it("the schema actually rejects bad values", () => {
    const schema = buildElementSchema({
      type: "probe", isContainer: false,
      defaultProps: { size: 3, mode: "wide", title: "Hi" },
      fields: [
        { key: "size", label: "Size", type: "number", min: 1, max: 6 },
        { key: "mode", label: "Mode", type: "select", options: [{ value: "wide", label: "Wide" }, { value: "narrow", label: "Narrow" }] },
        { key: "title", label: "Title", type: "text", required: true, maxLength: 4 },
      ],
    });
    assert.deepEqual(validateElementProps(schema, { size: 3, mode: "wide", title: "Hi" }), []);

    const keys = (props: Record<string, unknown>) => validateElementProps(schema, props).map(p => p.key);
    assert.deepEqual(keys({ size: 9, mode: "wide", title: "Hi" }), ["size"], "a number past its max was accepted");
    assert.deepEqual(keys({ size: "3", mode: "wide", title: "Hi" }), ["size"], "a string in a number prop was accepted");
    assert.deepEqual(keys({ size: 3, mode: "tall", title: "Hi" }), ["mode"], "a value outside the select options was accepted");
    assert.deepEqual(keys({ size: 3, mode: "wide", title: "" }), ["title"], "a required prop was allowed to be empty");
    assert.deepEqual(keys({ size: 3, mode: "wide", title: "far too long" }), ["title"], "maxLength was not enforced");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P2 — the context channel. Non-negotiable: without it the portal elements
// that join in P3 become static placeholders.
// ═══════════════════════════════════════════════════════════════════════════

describe("P2 — the render ABI carries live data", () => {
  it("context reaches an element, and keeps reaching it through renderChildren", () => {
    // A website element is `props → JSX`. A portal element is
    // `props + this client's live records → JSX`. A container in between must
    // not swallow the records, which is why `renderChildren` forwards it too —
    // a portal page is a section wrapping a metrics block far more often than
    // it is a bare metrics block.
    const outer = probeElement("probe-outer");
    const inner = probeElement("probe-inner");
    const context = { agencyId: "ag_1", clientId: "cli_1", productId: "prod_1", records: { invoices: 3 } };

    drive(BlockRenderer({
      blocks: [{
        id: "b_outer", type: "probe-outer", props: {},
        children: [{ id: "b_inner", type: "probe-inner", props: {} }],
      }],
      context,
    }));

    assert.equal(outer.length, 1, "the outer element did not render");
    assert.equal(inner.length, 1, "the nested element did not render");
    assert.deepEqual(outer[0]!.context, context);
    assert.deepEqual(inner[0]!.context, context, "renderChildren dropped the data context on the way down");
  });

  it("a website tree renders with no context at all", () => {
    // The reason this could ship without touching any of the 78 components:
    // `context` is optional and absent on the website surface.
    const seen = probeElement("probe-website");
    drive(BlockRenderer({ blocks: [{ id: "b1", type: "probe-website", props: {} }] }));
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.context, undefined);
  });

  it("binding and visibility ride the element, not its props, and survive a clone", () => {
    // They are authored and stored, so they have to survive the tree ops the
    // editor runs on every duplicate. Keeping them off `props` is what stops a
    // `productIds` array being mistaken for a prop a component should render —
    // and what keeps `defaultProps` schema validation about authored copy.
    const source: Block = {
      id: "b_bound", type: "text", props: { text: "Hello" },
      binding: { source: "billing", productIds: ["prod_1"], productMatch: "any" },
      visibility: { rule: "with-products", productIds: ["prod_1"] },
    };
    const copy = liftedTreeOps.cloneBlock(source);
    assert.notEqual(copy.id, source.id);
    assert.deepEqual(copy.binding, source.binding);
    assert.deepEqual(copy.visibility, source.visibility);
    assert.equal(copy.props.productIds, undefined, "binding leaked into props");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P2 — surfaces. One registry, filtered; never a second registry.
// ═══════════════════════════════════════════════════════════════════════════

describe("P2 — surface scoping", () => {
  it("filters one registry instead of needing a second one", () => {
    const nativeCount = Object.keys(BLOCK_REGISTRY).length;

    registerElementDefinitions({
      "probe-approval-panel": {
        type: "probe-approval-panel", label: "Probe decisions", icon: "?", category: "content",
        isContainer: false, Component: () => null, defaultProps: {}, fields: [],
        surfaces: ["portal", "stage"],
      } as BlockDefinition,
    });

    const website = listElementDefinitions("website").map(d => d.type);
    const portal = listElementDefinitions("portal").map(d => d.type);

    assert.ok(!website.includes("probe-approval-panel"), "a portal-only element was offered on a public site");
    assert.ok(portal.includes("probe-approval-panel"));
    assert.ok(!portal.includes("checkout-summary"), "a commerce element was offered in a client portal");

    // The 70 shipped definitions carry no `surfaces` key at all — the default
    // is what keeps them website-only, which is why P2 needed no edit to any
    // of them.
    assert.equal(website.length, nativeCount);
    assert.equal(BLOCK_REGISTRY.hero!.surfaces, undefined);
    assert.deepEqual(elementsBarrel.elementSurfaces(BLOCK_REGISTRY.hero!), ["website"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P2 — one prop-schema vocabulary, not two
// ═══════════════════════════════════════════════════════════════════════════

describe("P2 — the app-config catalogue speaks PropField", () => {
  // A fake document rather than the real adapter's `map()`, because what is
  // under test is the field metadata and its translation to the wire shape —
  // not storage. The route and its client component were deliberately not
  // touched, so their contract is what these assertions pin.
  const document: EditDocument = {
    id: "app-config:probe", label: "probe", revision: "0:0",
    targets: [
      { id: "brand.primaryColor", label: "Primary colour", kind: "direct", value: "#0B6F6D", fingerprint: "fp1" },
      { id: "brand.accentColor", label: "Accent colour", kind: "direct", value: "", fingerprint: "fp2" },
      { id: "workspace.timezone", label: "Timezone", kind: "direct", value: "Europe/London", fingerprint: "fp3" },
    ],
  };

  it("still emits the wire shape the editor page reads", () => {
    const views = appConfigFieldViews(document);
    const byId = Object.fromEntries(views.map(v => [v.id, v]));

    assert.equal(views.length, 3);
    assert.equal(byId["brand.primaryColor"]!.control, "color");
    assert.equal(byId["brand.primaryColor"]!.hint.length > 0, true);
    assert.equal(byId["brand.primaryColor"]!.optional, false, "a required setting reported itself optional");
    assert.equal(byId["brand.primaryColor"]!.value, "#0B6F6D");
    assert.equal(byId["brand.primaryColor"]!.fingerprint, "fp1");
    assert.equal(byId["brand.accentColor"]!.optional, true);
    assert.equal(byId["workspace.timezone"]!.control, "text");
  });

  it("required and optional still mean what they meant before the collapse", () => {
    // `optional: boolean` became `required?: boolean` — the inverse. Getting
    // that backwards would let somebody clear the workspace timezone, which
    // every date in the app is read in.
    const clearRequired = prepareAppConfigIntents(
      [{ targetId: "workspace.timezone", expectedFingerprint: "fp3", value: "   " }],
      document,
    );
    assert.deepEqual(clearRequired.intents, []);
    assert.equal(clearRequired.invalid[0]?.targetId, "workspace.timezone");

    const clearOptional = prepareAppConfigIntents(
      [{ targetId: "brand.accentColor", expectedFingerprint: "fp2", value: "" }],
      document,
    );
    assert.deepEqual(clearOptional.invalid, []);
    // Already empty and the fingerprint still matches, so it is a skip, not an
    // edit — the behaviour that keeps all-or-nothing intact for real conflicts.
    assert.equal(clearOptional.skipped[0]?.targetId, "brand.accentColor");

    // And the validators still run, on the shared `PropField.validate` member.
    const badColour = prepareAppConfigIntents(
      [{ targetId: "brand.primaryColor", expectedFingerprint: "fp1", value: "not-a-colour" }],
      document,
    );
    assert.equal(badColour.invalid[0]?.targetId, "brand.primaryColor");
    assert.deepEqual(badColour.intents, []);
  });
});
