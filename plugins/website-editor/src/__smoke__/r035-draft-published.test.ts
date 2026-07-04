// Smoke — R035 Draft / published state separation.

import {
  getDraftTree, getPublishedTree, hasDraftAhead, pageStatus,
  saveToDraftPatch, promoteToPublishedPatch, resolveStorefrontTree,
} from "../lib/draftPublished";
import type { EditorPage } from "../types/editorPage";
import type { Block } from "../types/block";

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import PageStatusChip from "../components/editor/PageStatusChip";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const TREE: Block[] = [{ id: "h", type: "heading", props: { text: "Hi" } }];
const TREE2: Block[] = [{ id: "h", type: "heading", props: { text: "Hi v2" } }];

function basePage(over: Partial<EditorPage> = {}): EditorPage {
  return {
    id: "p1", siteId: "s", agencyId: "a" as never, clientId: "c" as never,
    slug: "/", title: "Home", status: "draft",
    blocks: TREE, createdAt: 0, updatedAt: 0, ...over,
  };
}

(async () => {
  // ─── A: getDraftTree / getPublishedTree ───────────────────────────────
  expect("getDraftTree falls back to blocks when no draftBlocks",
    getDraftTree(basePage()) === TREE);
  expect("getDraftTree prefers draftBlocks when set",
    getDraftTree(basePage({ draftBlocks: TREE2 })) === TREE2);
  expect("getPublishedTree null on draft-only page",
    getPublishedTree(basePage()) === null);
  expect("getPublishedTree returns publishedBlocks when set",
    getPublishedTree(basePage({ publishedBlocks: TREE })) === TREE);
  expect("getPublishedTree falls back to blocks on published-status page",
    getPublishedTree(basePage({ status: "published" })) === TREE);

  // ─── B: pageStatus / hasDraftAhead ────────────────────────────────────
  expect("draft page → status 'draft'", pageStatus(basePage()) === "draft");
  expect("published page (no draft) → 'published'",
    pageStatus(basePage({ status: "published", publishedBlocks: TREE, publishedAt: 1 })) === "published");
  expect("published + draftBlocks differing → 'draft-ahead'",
    pageStatus(basePage({
      status: "published", publishedBlocks: TREE, publishedAt: 1,
      draftBlocks: TREE2,
    })) === "draft-ahead");
  expect("published + draftBlocks identical → 'published'",
    pageStatus(basePage({
      status: "published", publishedBlocks: TREE, publishedAt: 1,
      draftBlocks: TREE,
    })) === "published");
  expect("hasDraftAhead false on never-published",
    !hasDraftAhead(basePage({ draftBlocks: TREE2 })));
  expect("hasDraftAhead true on published+different draft",
    hasDraftAhead(basePage({
      status: "published", publishedBlocks: TREE, publishedAt: 1, draftBlocks: TREE2,
    })));

  // ─── C: saveToDraftPatch ──────────────────────────────────────────────
  const sp = saveToDraftPatch(TREE2, 1234);
  expect("saveToDraftPatch carries draftBlocks", sp.draftBlocks === TREE2);
  expect("saveToDraftPatch carries updatedAt", sp.updatedAt === 1234);

  // ─── D: promoteToPublishedPatch ───────────────────────────────────────
  const pp = promoteToPublishedPatch(
    basePage({ draftBlocks: TREE2 }), "u_smoke", 9999,
  );
  expect("promote sets status published", pp.status === "published");
  expect("promote moves draft → blocks + publishedBlocks",
    pp.blocks === TREE2 && pp.publishedBlocks === TREE2);
  expect("promote clears draftBlocks", pp.draftBlocks === undefined);
  expect("promote sets publishedAt + publishedBy + updatedAt",
    pp.publishedAt === 9999 && pp.publishedBy === "u_smoke" && pp.updatedAt === 9999);

  // ─── E: resolveStorefrontTree ─────────────────────────────────────────
  const liveOnly = basePage({ status: "published", publishedBlocks: TREE, publishedAt: 1 });
  const r1 = resolveStorefrontTree(liveOnly);
  expect("storefront serves published when present",
    r1.source === "published" && r1.tree === TREE && !r1.isFallback);

  const ahead = basePage({
    status: "published", publishedBlocks: TREE, publishedAt: 1, draftBlocks: TREE2,
  });
  const r2 = resolveStorefrontTree(ahead);
  expect("storefront serves published (not draft) when both exist",
    r2.tree === TREE && r2.source === "published");
  const r2p = resolveStorefrontTree(ahead, { preview: true });
  expect("preview=1 forces draft tree",
    r2p.source === "draft-preview" && r2p.tree === TREE2 && !r2p.isFallback);

  const draftOnly = basePage({ draftBlocks: TREE2 });
  const r3 = resolveStorefrontTree(draftOnly);
  expect("draft-only page falls back to draft + flag",
    r3.source === "draft-fallback" && r3.tree === TREE2 && r3.isFallback);

  // ─── F: PageStatusChip render ─────────────────────────────────────────
  const chipDraft = renderToStaticMarkup(React.createElement(PageStatusChip, { page: basePage() }));
  expect("draft chip emits draft testid",
    chipDraft.includes('data-testid="page-status-draft"') && chipDraft.includes("Draft"));
  expect("draft chip uses dashed border",
    /border:[^"]*dashed/.test(chipDraft));

  const chipPub = renderToStaticMarkup(React.createElement(PageStatusChip, {
    page: basePage({ status: "published", publishedBlocks: TREE, publishedAt: 1 }),
  }));
  expect("published chip emits published testid + label",
    chipPub.includes('data-testid="page-status-published"') && chipPub.includes("Published"));

  const chipAhead = renderToStaticMarkup(React.createElement(PageStatusChip, {
    page: basePage({
      status: "published", publishedBlocks: TREE, publishedAt: 1, draftBlocks: TREE2,
    }),
  }));
  expect("draft-ahead chip emits draft-ahead testid + label",
    chipAhead.includes('data-testid="page-status-draft-ahead"') && chipAhead.includes("Draft ahead"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
