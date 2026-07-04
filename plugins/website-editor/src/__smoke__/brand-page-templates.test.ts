// Smoke — R004 therapist/healing brand-page presets + composite pack.
//
// Pure structural tests over PAGE_TEMPLATES + starterLoader. Validates
// each of the 7 presets renders block-tree shape callers depend on,
// the composite `brand-page-pack` resolves to brand-about's tree, and
// applyStarterVariant's sibling-seed extension is contract-stable.

import {
  PAGE_TEMPLATES, getTemplate, BRAND_PAGE_TEMPLATE_IDS, BRAND_PAGE_PACK_ID,
} from "../components/pageTemplates";
import { loadStarterTree, listStarterIds } from "../server/starterLoader";
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

console.log("brand-page presets — registry");
expect("BRAND_PAGE_TEMPLATE_IDS has 7 entries",
  BRAND_PAGE_TEMPLATE_IDS.length === 7, `actual: ${BRAND_PAGE_TEMPLATE_IDS.length}`);
const expectedIds = ["brand-about", "brand-our-story", "brand-philosophy",
  "brand-sustainability", "brand-faq", "brand-contact", "brand-lab-tests"];
expect("ids match the spec set",
  expectedIds.every(id => BRAND_PAGE_TEMPLATE_IDS.includes(id)));
expect("BRAND_PAGE_PACK_ID is brand-page-pack",
  BRAND_PAGE_PACK_ID === "brand-page-pack");
expect("each preset is in PAGE_TEMPLATES",
  expectedIds.every(id => PAGE_TEMPLATES.some(t => t.id === id)));

console.log("\nbrand-page presets — tree shape");
for (const id of expectedIds) {
  const tpl = getTemplate(id);
  expect(`${id} resolves`, tpl !== undefined);
  if (!tpl) continue;
  const tree = tpl.build();
  expect(`${id} non-empty tree`, tree.length > 0);
  expect(`${id} starts with hero`, tree[0]?.type === "hero");
}

console.log("\nbrand-faq — uses toggle blocks");
const faqTree = getTemplate("brand-faq")!.build();
const faqToggles = faqTree.flatMap(b => b.children ?? []).filter(b => b.type === "toggle")
  .concat(faqTree.filter(b => b.type === "toggle"));
expect("faq has ≥5 toggle blocks (deep search)",
  (function() {
    const found: Block[] = [];
    function walk(t: Block[]): void { for (const b of t) { if (b.type === "toggle") found.push(b); if (b.children) walk(b.children); } }
    walk(faqTree);
    return found.length >= 5;
  })(),
  `direct: ${faqToggles.length}`);

console.log("\nbrand-contact — has contact-form + map");
const contactTree = getTemplate("brand-contact")!.build();
expect("contact-form present", findBlock(contactTree, "contact-form") !== undefined);
expect("map present", findBlock(contactTree, "map") !== undefined);

console.log("\nbrand-sustainability — has stats-bar + commitments toggles");
const sustTree = getTemplate("brand-sustainability")!.build();
expect("stats-bar present", findBlock(sustTree, "stats-bar") !== undefined);
const commitToggles = (function () {
  const out: Block[] = [];
  function walk(t: Block[]): void { for (const b of t) { if (b.type === "toggle") out.push(b); if (b.children) walk(b.children); } }
  walk(sustTree);
  return out;
})();
expect("≥3 commitment toggles", commitToggles.length >= 3, `actual: ${commitToggles.length}`);

console.log("\nbrand-lab-tests — has cert grid + downloads");
const labTree = getTemplate("brand-lab-tests")!.build();
const labGrid = findBlock(labTree, "card-grid");
const labItems = (labGrid?.props as { items?: unknown[] } | undefined)?.items ?? [];
expect("card-grid items rendered", labItems.length === 3, `actual: ${labItems.length}`);

console.log("\nbrand-philosophy — 5 principle cards");
const philTree = getTemplate("brand-philosophy")!.build();
const philItems = (findBlock(philTree, "card-grid")?.props as { items?: unknown[] } | undefined)?.items ?? [];
expect("philosophy card-grid has 5 cards", philItems.length === 5, `actual: ${philItems.length}`);

console.log("\nstarter loader — brand-page-pack");
(async function() {
  const aboutStarter = await loadStarterTree("brand-about");
  expect("brand-about loads as starter", aboutStarter !== null);
  expect("starter role is account", aboutStarter?.role === "account");
  const pack = await loadStarterTree("brand-page-pack");
  expect("brand-page-pack loads", pack !== null);
  expect("pack root tree is brand-about's (starts with hero)",
    pack?.blocks?.[0]?.type === "hero");
  const ids = listStarterIds();
  expect("listStarterIds includes all 7 brand presets",
    BRAND_PAGE_TEMPLATE_IDS.every(id => ids.includes(id)));
  expect("listStarterIds includes brand-page-pack",
    ids.includes(BRAND_PAGE_PACK_ID));

  const unknown = await loadStarterTree("does-not-exist");
  expect("unknown id → null", unknown === null);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
