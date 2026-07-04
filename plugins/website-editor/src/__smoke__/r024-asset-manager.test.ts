// Smoke — R024 Image library + asset manager.

// @ts-expect-error — react-dom/server has no shipped d.ts in plugin scope.
import * as ReactDomServer from "react-dom/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderToStaticMarkup = (ReactDomServer as { renderToStaticMarkup: (node: any) => string }).renderToStaticMarkup;
import React from "react";
import { deriveAutoTags, mergeTags } from "../lib/assetTags";
import {
  handleListAssets,
  handleUploadAsset,
  handleBulkTagAssets,
  handleDeleteAsset,
} from "../api/handlers/assets";
import AssetPickerModal from "../components/editor/AssetPickerModal";
import type { PluginStorage } from "../lib/aquaPluginTypes";

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// 1×1 PNG data URL (valid base64).
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=";

(async () => {
  // ─── A: deriveAutoTags ─────────────────────────────────────────────────
  const t1 = deriveAutoTags({ filename: "logo-v2.png", mimeType: "image/png" });
  expect("logo-v2.png + image/png → image + logo + png",
    t1.includes("image") && t1.includes("logo") && t1.includes("png"));

  const t2 = deriveAutoTags({ filename: "hero-banner.jpg", mimeType: "image/jpeg" });
  expect("hero-banner.jpg → image + hero + jpg",
    t2.includes("image") && t2.includes("hero") && t2.includes("jpg"));

  const t3 = deriveAutoTags({ filename: "founder-portrait.svg", mimeType: "image/svg+xml" });
  expect("founder-portrait.svg → image + team + svg",
    t3.includes("image") && t3.includes("team") && t3.includes("svg"));

  const t4 = deriveAutoTags({ filename: "intro.mp4", mimeType: "video/mp4" });
  expect("intro.mp4 → video + mp4",
    t4.includes("video") && t4.includes("mp4"));

  const t5 = deriveAutoTags({ filename: "brief.pdf", mimeType: "application/pdf" });
  expect("brief.pdf → doc + pdf",
    t5.includes("doc") && t5.includes("pdf"));

  // No keyword match.
  const t6 = deriveAutoTags({ filename: "neutral.webp", mimeType: "image/webp" });
  expect("neutral.webp + image/webp → image + webp (no keyword)",
    t6.includes("image") && t6.includes("webp") && !t6.includes("logo"));

  // Extension regex strict — long random ext skipped.
  const t7 = deriveAutoTags({ filename: "weird.x.toolong", mimeType: "image/png" });
  expect("ext > 5 chars skipped", !t7.includes("toolong") && t7.includes("image"));

  // ─── B: mergeTags ──────────────────────────────────────────────────────
  expect("operator tags win order",
    JSON.stringify(mergeTags(["image", "png"], ["brand", "image"])) ===
    JSON.stringify(["brand", "image", "png"]));
  expect("dedupe + lowercase",
    JSON.stringify(mergeTags(["image", "image"], ["IMAGE"])) === JSON.stringify(["image"]));
  expect("empty operator",
    JSON.stringify(mergeTags(["image"], undefined)) === JSON.stringify(["image"]));

  // ─── C: HTTP — upload + list + filter + bulk-tag + delete ──────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: "ag_smoke", clientId: "cl_smoke", actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleListAssets>[1];

  // Upload — derives tags.
  const up1 = await handleUploadAsset(new Request("http://x/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: "hero-cover.png", contentType: "image/png", dataUrl: PNG, alt: "hero",
    }),
  }), ctx);
  expect("upload returns 200", up1.status === 200);
  const up1Body = await up1.json() as { ok: boolean; asset: { id: string; tags: string[] } };
  expect("upload auto-tags include image + hero + png",
    up1Body.asset.tags.includes("image") &&
    up1Body.asset.tags.includes("hero") &&
    up1Body.asset.tags.includes("png"));

  // Upload with operator tags (merge order: operator first).
  const up2 = await handleUploadAsset(new Request("http://x/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: "logo-felicia.svg", contentType: "image/svg+xml", dataUrl: PNG,
      tags: ["brand"],
    }),
  }), ctx);
  const up2Body = await up2.json() as { asset: { id: string; tags: string[] } };
  expect("upload with operator tags merges (brand first, then image+logo+svg)",
    up2Body.asset.tags[0] === "brand" &&
    up2Body.asset.tags.includes("image") &&
    up2Body.asset.tags.includes("logo") &&
    up2Body.asset.tags.includes("svg"));

  // GET list — tagCounts aggregate.
  const lst = await handleListAssets(new Request("http://x/assets"), ctx);
  expect("list 200", lst.status === 200);
  const lstBody = await lst.json() as { assets: { id: string }[]; tagCounts: Record<string, number>; usedBytes: number };
  expect("list returns 2 assets", lstBody.assets.length === 2);
  expect("tagCounts.image is 2", lstBody.tagCounts.image === 2);
  expect("tagCounts.hero is 1", lstBody.tagCounts.hero === 1);
  expect("tagCounts.brand is 1", lstBody.tagCounts.brand === 1);
  expect("usedBytes > 0", lstBody.usedBytes > 0);

  // GET filter by tag.
  const lstHero = await handleListAssets(new Request("http://x/assets?tag=hero"), ctx);
  const lstHeroBody = await lstHero.json() as { assets: { id: string }[] };
  expect("?tag=hero narrows to 1 asset",
    lstHeroBody.assets.length === 1 && lstHeroBody.assets[0]!.id === up1Body.asset.id);

  // GET search by filename.
  const lstFelicia = await handleListAssets(new Request("http://x/assets?q=felicia"), ctx);
  const lstFeliciaBody = await lstFelicia.json() as { assets: { id: string }[] };
  expect("?q=felicia matches by filename substring",
    lstFeliciaBody.assets.length === 1 && lstFeliciaBody.assets[0]!.id === up2Body.asset.id);

  // BULK TAG — add new tag to both.
  const bulkAdd = await handleBulkTagAssets(new Request("http://x/assets/bulk-tag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: [up1Body.asset.id, up2Body.asset.id], add: ["promo"] }),
  }), ctx);
  expect("bulk-tag add 200", bulkAdd.status === 200);
  const bulkBody = await bulkAdd.json() as { updated: { id: string; tags: string[] }[]; notFound: string[] };
  expect("bulk-tag updates 2", bulkBody.updated.length === 2);
  expect("bulk-tag adds 'promo' to both",
    bulkBody.updated.every(a => a.tags.includes("promo")));

  // BULK TAG — remove + add combined.
  const bulkBoth = await handleBulkTagAssets(new Request("http://x/assets/bulk-tag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ids: [up1Body.asset.id], add: ["featured"], remove: ["promo"],
    }),
  }), ctx);
  expect("bulk-tag combined 200", bulkBoth.status === 200);
  const bulkBothBody = await bulkBoth.json() as { updated: { tags: string[] }[] };
  expect("bulk-tag remove drops 'promo' + add applies 'featured'",
    !bulkBothBody.updated[0]!.tags.includes("promo") &&
    bulkBothBody.updated[0]!.tags.includes("featured"));

  // BULK TAG — unknown id surfaces in notFound.
  const bulkMiss = await handleBulkTagAssets(new Request("http://x/assets/bulk-tag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: ["asset_nope"], add: ["x"] }),
  }), ctx);
  const bulkMissBody = await bulkMiss.json() as { updated: unknown[]; notFound: string[] };
  expect("bulk-tag unknown id → notFound",
    bulkMissBody.notFound.includes("asset_nope") && bulkMissBody.updated.length === 0);

  // BULK TAG — 400 paths.
  const bulkBadIds = await handleBulkTagAssets(new Request("http://x/assets/bulk-tag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ add: ["x"] }),
  }), ctx);
  expect("bulk-tag without ids → 400", bulkBadIds.status === 400);

  const bulkNoOp = await handleBulkTagAssets(new Request("http://x/assets/bulk-tag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: [up1Body.asset.id] }),
  }), ctx);
  expect("bulk-tag without add+remove → 400", bulkNoOp.status === 400);

  // ─── D: AssetPickerModal SSR ───────────────────────────────────────────
  const closed = renderToStaticMarkup(React.createElement(AssetPickerModal, {
    open: false, onClose: () => undefined, onPick: () => undefined,
  } as never));
  expect("AssetPickerModal open=false renders empty", closed === "");

  const opened = renderToStaticMarkup(React.createElement(AssetPickerModal, {
    open: true, onClose: () => undefined, onPick: () => undefined,
  } as never));
  expect("AssetPickerModal open renders dialog",
    opened.includes('aria-label="Asset library"'));
  expect("AssetPickerModal renders search + Upload + Tag chips",
    opened.includes('placeholder="Search by name, tag, alt…"') &&
    opened.includes(">+ Upload new<") &&
    opened.includes(">All</button>"));
  expect("AssetPickerModal uses --brand-bg-elevated",
    opened.includes("var(--brand-bg-elevated"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
