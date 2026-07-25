// Smoke — R002 Aqua Incubator template + 4 Notion-style blocks.
//
// Pure structural tests: validates registry entries, the template tree
// shape (§15e), the bridge button URL, and selectStarterForPhase. The
// React render itself is exercised by the existing blocks smoke; this
// file checks the data contract callers depend on.

import { BLOCK_REGISTRY, getBlockDefinition } from "../components/blockRegistry";
import {
  PAGE_TEMPLATES, getTemplate, AQUA_INCUBATOR_TEMPLATE_IDS, selectStarterForPhase,
} from "../components/pageTemplates";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function findBlock(tree: Block[], type: string): Block | undefined {
  for (const b of tree) {
    if (b.type === type) return b;
    if (b.children) {
      const hit = findBlock(b.children, type);
      if (hit) return hit;
    }
  }
  return undefined;
}

console.log("registry — 4 Notion blocks");
expect("icon registered", BLOCK_REGISTRY.icon !== undefined);
expect("property-strip registered", BLOCK_REGISTRY["property-strip"] !== undefined);
expect("toggle registered + isContainer",
  BLOCK_REGISTRY.toggle !== undefined && BLOCK_REGISTRY.toggle.isContainer === true);
expect("card-grid registered", BLOCK_REGISTRY["card-grid"] !== undefined);
expect("icon has image-mode field",
  (BLOCK_REGISTRY.icon?.fields ?? []).some(f => f.key === "image"));
expect("getBlockDefinition('property-strip') returns def", getBlockDefinition("property-strip") !== undefined);

console.log("\ntemplate — aqua-incubator preset");
const root = getTemplate("aqua-incubator");
expect("aqua-incubator template exists", root !== undefined);
expect("AQUA_INCUBATOR_TEMPLATE_IDS has 5 ids (root + 4 sub-pages)",
  AQUA_INCUBATOR_TEMPLATE_IDS.length === 5,
  `actual: ${AQUA_INCUBATOR_TEMPLATE_IDS.length}`);
expect("includes root + onboarding + portal + resources + discover",
  ["aqua-incubator", "aqua-incubator-onboarding", "aqua-incubator-portal",
   "aqua-incubator-resources", "aqua-incubator-discover"]
    .every(id => AQUA_INCUBATOR_TEMPLATE_IDS.includes(id)));

const rootTree = root!.build();
expect("root tree non-empty", rootTree.length > 0);
expect("root tree has hero (cover)", findBlock(rootTree, "hero") !== undefined);
expect("root tree has icon (image chip)", findBlock(rootTree, "icon") !== undefined);
expect("root tree has property-strip", findBlock(rootTree, "property-strip") !== undefined);
expect("root tree has at least 3 toggle blocks",
  rootTree.filter(b => b.type === "toggle").length >= 3,
  `actual: ${rootTree.filter(b => b.type === "toggle").length}`);
expect("root tree has card-grid in Notion mode (items[])",
  Array.isArray((findBlock(rootTree, "card-grid")?.props as { items?: unknown[] } | undefined)?.items));
const cardGrid = findBlock(rootTree, "card-grid");
const items = (cardGrid?.props as { items?: Array<{ href?: string; label?: string }> } | undefined)?.items ?? [];
expect("card-grid has 4 navigation cards", items.length === 4, `actual: ${items.length}`);
expect("card-grid items all carry href + label",
  items.every(it => typeof it.href === "string" && typeof it.label === "string" && it.label.length > 0));
expect("My Client Portal card hrefs ./client-portal",
  items.some(it => it.label?.includes("Client Portal") && it.href === "./client-portal"));

console.log("\ntemplate — sub-page presets");
expect("onboarding sub-page exists", getTemplate("aqua-incubator-onboarding") !== undefined);
expect("portal sub-page exists", getTemplate("aqua-incubator-portal") !== undefined);
expect("resources sub-page exists", getTemplate("aqua-incubator-resources") !== undefined);
expect("discover sub-page exists", getTemplate("aqua-incubator-discover") !== undefined);

const portalTree = getTemplate("aqua-incubator-portal")!.build();
const bridgeBtn = findBlock(portalTree, "button");
expect("portal sub-page contains a button block", bridgeBtn !== undefined);
const bridgeProps = bridgeBtn?.props as { label?: string; href?: string } | undefined;
expect("bridge button label matches §15f copy",
  bridgeProps?.label === "Click Me To Enter Your Portal!",
  `actual: ${bridgeProps?.label}`);
expect("bridge button href is /portal/customer (same-origin gateway)",
  bridgeProps?.href === "/portal/customer",
  `actual: ${bridgeProps?.href}`);

const onboardingTree = getTemplate("aqua-incubator-onboarding")!.build();
expect("onboarding sub-page has ≥1 toggle (Introduction)",
  onboardingTree.some(b => b.type === "toggle"));
expect("onboarding sub-page has video-embed block",
  findBlock(onboardingTree, "video-embed") !== undefined);

console.log("\ndiscover sub-page — 6-card grid");
const discoverTree = getTemplate("aqua-incubator-discover")!.build();
const discoverGrid = findBlock(discoverTree, "card-grid");
const discoverItems = (discoverGrid?.props as { items?: unknown[] } | undefined)?.items ?? [];
expect("discover card-grid has 6 cards", discoverItems.length === 6, `actual: ${discoverItems.length}`);

console.log("\nselectStarterForPhase");
expect("Epic Intro → aqua-incubator", selectStarterForPhase("Epic Intro") === "aqua-incubator");
expect("unknown phase → null", selectStarterForPhase("Live") === null);
expect("null/empty → null",
  selectStarterForPhase(null) === null && selectStarterForPhase("") === null);

console.log("\nblock prop graceful degrade");
// Property-strip with no rows should still have empty default prop.
expect("property-strip default props has rows[]",
  Array.isArray(BLOCK_REGISTRY["property-strip"]?.defaultProps?.rows));
// Toggle default-open is false.
expect("toggle default defaultOpen is false",
  BLOCK_REGISTRY.toggle?.defaultProps?.defaultOpen === false);
// Card grid still works when items absent (back-compat with cards[]).
expect("card-grid still has cards[] default for back-compat",
  Array.isArray(BLOCK_REGISTRY["card-grid"]?.defaultProps?.cards));
// Icon defaults still glyph (image mode is opt-in).
expect("icon default still glyph mode (back-compat)",
  typeof BLOCK_REGISTRY.icon?.defaultProps?.glyph === "string");

console.log("\nstarter loader — aqua-incubator round-trip");
const { loadStarterTree, listStarterIds } = await import("../server/starterLoader");
const incubatorStarter = await loadStarterTree("aqua-incubator");
expect("loadStarterTree('aqua-incubator') resolves", incubatorStarter !== null);
expect("starter role is account (Q-ASSUMED v1)", incubatorStarter?.role === "account");
expect("starter blocks[] non-empty",
  Array.isArray(incubatorStarter?.blocks) && (incubatorStarter?.blocks.length ?? 0) > 0);
expect("listStarterIds includes aqua-incubator + 4 sub-pages",
  AQUA_INCUBATOR_TEMPLATE_IDS.every(id => listStarterIds().includes(id)));

console.log(`\n${passes} passed · ${failures} failed`);
if (failures > 0) process.exit(1);
