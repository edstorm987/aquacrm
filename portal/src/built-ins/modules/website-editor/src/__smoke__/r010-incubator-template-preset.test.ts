// Smoke — R010 Incubator template preset.
//
// Asserts (1) the §15e root template + 4 sub-page templates from R002
// are still wired through `AQUA_INCUBATOR_TEMPLATE_IDS` + resolve via
// `loadStarterTree`, (2) the root carries the correct §15e block
// recipe, (3) the new `applyIncubatorClientMetadata` helper resolves
// placeholders from client metadata, and (4) the templateMarketplace
// surfaces all 5 ids under the "Aqua Incubator" tag so the gallery
// route works.

import {
  AQUA_INCUBATOR_TEMPLATE_IDS,
  getTemplate,
} from "../components/pageTemplates";
import { loadStarterTree } from "../server/starterLoader";
import {
  applyIncubatorClientMetadata,
  DEFAULT_INCUBATOR_METADATA,
} from "../server/incubatorTemplate";
import { listBuiltinTemplates } from "../server/templateMarketplace";
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

(async () => {
  // ─── A: 5 ids registered ────────────────────────────────────────────────
  expect("AQUA_INCUBATOR_TEMPLATE_IDS lists root + 4 sub-pages",
    AQUA_INCUBATOR_TEMPLATE_IDS.length === 5);
  for (const id of AQUA_INCUBATOR_TEMPLATE_IDS) {
    const t = getTemplate(id);
    expect(`getTemplate("${id}") returns a definition`, !!t);
  }
  for (const id of AQUA_INCUBATOR_TEMPLATE_IDS) {
    const tree = await loadStarterTree(id);
    expect(`loadStarterTree("${id}") returns a starter tree`, !!tree && Array.isArray(tree.blocks));
  }

  // ─── B: §15e root recipe ────────────────────────────────────────────────
  const rootTree = (await loadStarterTree("aqua-incubator"))!;
  const required = ["hero", "icon", "heading", "property-strip", "toggle", "divider", "card-grid"];
  for (const t of required) {
    expect(`root tree contains a ${t} block`, !!findBlock(rootTree.blocks, t));
  }

  // ─── C: propertyStrip placeholders ──────────────────────────────────────
  const propsBlock = findBlock(rootTree.blocks, "property-strip")!;
  const rows = (propsBlock.props.rows as { key: string; value: string; type: string }[]);
  expect("propertyStrip carries Phase row with {{phase}} placeholder",
    rows.find(r => r.key === "Phase")?.value === "{{phase}}");
  expect("propertyStrip carries Plan row with {{planTier}} placeholder",
    rows.find(r => r.key === "Plan")?.value === "{{planTier}}");
  expect("propertyStrip carries Started row with {{onboardingStartedAt}} placeholder",
    rows.find(r => r.key === "Started")?.value === "{{onboardingStartedAt}}");

  // ─── D: applyIncubatorClientMetadata resolves placeholders ──────────────
  const resolved = applyIncubatorClientMetadata(rootTree.blocks, {
    phase: "Epic Intro",
    planTier: "Expansion Plan",
    onboardingStartedAt: "2026-05-07",
  });
  const resolvedProps = findBlock(resolved, "property-strip")!;
  const rRows = (resolvedProps.props.rows as { key: string; value: string }[]);
  expect("Phase resolved to 'Epic Intro'",
    rRows.find(r => r.key === "Phase")?.value === "Epic Intro");
  expect("Plan resolved to 'Expansion Plan'",
    rRows.find(r => r.key === "Plan")?.value === "Expansion Plan");
  expect("Started resolved to '2026-05-07'",
    rRows.find(r => r.key === "Started")?.value === "2026-05-07");

  // Original tree untouched (function returns deep clone).
  expect("original tree placeholders untouched after substitution",
    rows.find(r => r.key === "Phase")?.value === "{{phase}}");

  // Default metadata resolves placeholders for preview / smoke.
  const defaulted = applyIncubatorClientMetadata(rootTree.blocks, DEFAULT_INCUBATOR_METADATA);
  const dRows = (findBlock(defaulted, "property-strip")!.props.rows as { key: string; value: string }[]);
  expect("DEFAULT_INCUBATOR_METADATA resolves Phase to 'Epic Intro'",
    dRows.find(r => r.key === "Phase")?.value === "Epic Intro");
  expect("DEFAULT_INCUBATOR_METADATA resolves Started to empty string (no date yet)",
    dRows.find(r => r.key === "Started")?.value === "");

  // Missing metadata key resolves to empty string (graceful).
  const partial = applyIncubatorClientMetadata(rootTree.blocks, { phase: "Aqua Diagnostics" });
  const pRows = (findBlock(partial, "property-strip")!.props.rows as { key: string; value: string }[]);
  expect("missing planTier resolves to empty",
    pRows.find(r => r.key === "Plan")?.value === "");

  // Custom keys work via index signature.
  const trivialTree: Block[] = [
    { id: "t1", type: "text", props: { text: "Welcome {{therapistName}}!" } },
  ];
  const customResolved = applyIncubatorClientMetadata(trivialTree, { therapistName: "Felicia" });
  expect("custom-key placeholder resolves",
    (customResolved[0]!.props.text as string) === "Welcome Felicia!");

  // ─── E: templateMarketplace surfaces all 5 ids under "Aqua Incubator" ──
  const builtin = listBuiltinTemplates();
  for (const id of AQUA_INCUBATOR_TEMPLATE_IDS) {
    const entry = builtin.find(t => t.id === id);
    expect(`marketplace surfaces ${id}`, !!entry);
    expect(`marketplace tags ${id} as "Aqua Incubator"`,
      !!entry?.tags.includes("Aqua Incubator"));
  }

  // ─── F: cardGrid hrefs use relative links (chapter §15e: portable) ────
  const cardGrid = findBlock(rootTree.blocks, "card-grid")!;
  const items = cardGrid.props.items as { href: string }[];
  for (const it of items) {
    expect(`cardGrid item href "${it.href}" is relative (./… or no protocol)`,
      it.href.startsWith("./") || (!it.href.startsWith("http") && !it.href.startsWith("/")));
  }

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
