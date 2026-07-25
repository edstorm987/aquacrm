// Smoke — R039 block schema migration runner.

import {
  BLOCK_SCHEMA_VERSION,
  MIGRATIONS,
  blockVersion,
  treeNeedsMigration,
  migrateTree,
  loadBlockTreeMigrated,
} from "../lib/blockSchemaMigrations";
import type { Block, BlockTreeJSON } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function blk(over: Partial<Block> = {}): Block {
  return { id: over.id ?? "b" + Math.random().toString(36).slice(2,6),
    type: over.type ?? "text", props: over.props ?? {}, ...over };
}

function vmark(b: Block, v: number): Block {
  return { ...b, ...({ _v: v } as Partial<Block>) };
}

(async () => {
  console.log("§ Block schema migration");

  // ─── A: schema version + needs detection ─────────────────────────────
  expect("BLOCK_SCHEMA_VERSION is 3", BLOCK_SCHEMA_VERSION === 3);
  expect("MIGRATIONS chain v1→v2→v3",
    MIGRATIONS.length === 2 &&
    MIGRATIONS[0]!.from === 1 && MIGRATIONS[0]!.to === 2 &&
    MIGRATIONS[1]!.from === 2 && MIGRATIONS[1]!.to === 3);

  expect("empty tree needs no migration",
    treeNeedsMigration([]) === false);

  expect("untyped block defaults to v1 → needs migration",
    treeNeedsMigration([blk()]) === true);

  expect("current-version block needs no migration",
    treeNeedsMigration([vmark(blk(), BLOCK_SCHEMA_VERSION)]) === false);

  expect("blockVersion default is 1",
    blockVersion(blk()) === 1);

  // ─── B: v1 → v2 (id generation) ──────────────────────────────────────
  {
    const noId = { type: "text", props: {} } as unknown as Block;
    const out = migrateTree([noId]);
    const got = out[0]!;
    expect("v1→v2 generates id when missing",
      typeof got.id === "string" && got.id.length > 0 && got.id.startsWith("blk_"));
    expect("v1→v2 stamps _v=current",
      (got as any)._v === BLOCK_SCHEMA_VERSION);
    expect("v1→v2 stamps _migratedFrom",
      (got as any)._migratedFrom === 1);
  }

  // ─── C: v2 → v3 (align prop relocation) ──────────────────────────────
  {
    const at_v2 = vmark(blk({ type: "heading", props: { text: "hi", align: "center" } }), 2);
    const out = migrateTree([at_v2]);
    const got = out[0]!;
    expect("v2→v3 moves align to styles",
      got.styles?.align === "center");
    expect("v2→v3 preserves legacy under _legacyAlign",
      (got.props as any)._legacyAlign === "center");
    expect("v2→v3 drops top-level align prop",
      (got.props as any).align === undefined);
    expect("v2→v3 stamps _migratedFrom=2",
      (got as any)._migratedFrom === 2);
  }

  // ─── D: full chain v1 → v3 ───────────────────────────────────────────
  {
    const legacy = { type: "heading", props: { text: "hi", align: "left" } } as unknown as Block;
    const out = migrateTree([legacy]);
    const got = out[0]!;
    expect("v1→v3 chained: id generated AND align relocated",
      typeof got.id === "string" && got.id.startsWith("blk_") &&
      got.styles?.align === "left" &&
      (got.props as any)._legacyAlign === "left");
    expect("v1→v3 stamps _migratedFrom=1",
      (got as any)._migratedFrom === 1);
  }

  // ─── E: nested blocks all migrated ───────────────────────────────────
  {
    const tree: BlockTreeJSON = [
      blk({ id: "outer", type: "section", children: [
        blk({ id: "mid", type: "row", children: [
          { type: "text", props: { align: "right" } } as unknown as Block,
        ]}),
      ]}),
    ];
    const out = migrateTree(tree);
    const inner = out[0]!.children![0]!.children![0]!;
    expect("nested block migrated through chain",
      typeof inner.id === "string" && inner.id.length > 0 &&
      inner.styles?.align === "right");
    expect("outer block also stamped",
      (out[0] as any)._v === BLOCK_SCHEMA_VERSION);
  }

  // ─── F: idempotence ──────────────────────────────────────────────────
  {
    const current: BlockTreeJSON = [vmark(blk({ id: "x" }), BLOCK_SCHEMA_VERSION)];
    const [out1, did1] = loadBlockTreeMigrated(current);
    expect("loadBlockTreeMigrated no-op on current tree",
      did1 === false && out1 === current);
    const re = migrateTree(out1);
    expect("re-running migrateTree on already-current keeps content",
      re.length === 1 && re[0]!.id === "x");
  }

  // ─── G: loadBlockTreeMigrated drives migration ───────────────────────
  {
    const tree: BlockTreeJSON = [{ type: "text", props: {} } as unknown as Block];
    const [out, did] = loadBlockTreeMigrated(tree);
    expect("loadBlockTreeMigrated reports didMigrate=true",
      did === true);
    expect("loadBlockTreeMigrated returns migrated tree",
      typeof out[0]!.id === "string" && (out[0] as any)._v === BLOCK_SCHEMA_VERSION);
  }

  // ─── H: cycle guard from R028 ────────────────────────────────────────
  {
    // Repeat block id; the walker should not recurse infinitely.
    const shared: Block = blk({ id: "dup", type: "text" });
    const tree: BlockTreeJSON = [shared, shared];
    let didFinish = false;
    try {
      migrateTree(tree);
      didFinish = true;
    } catch { didFinish = false; }
    expect("cycle guard — duplicate block ids do not infinite-loop",
      didFinish);
  }

  // ─── I: no silent data drop ─────────────────────────────────────────
  {
    const at_v2 = vmark(blk({ type: "heading",
      props: { text: "x", align: "center", color: "red" } }), 2);
    const out = migrateTree([at_v2]);
    const props = out[0]!.props as any;
    expect("v2→v3 preserves unrelated props (color)",
      props.color === "red" && props.text === "x");
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
