// Smoke — Public media promotion on publish (public-bucket Phase 2).
// Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server'
// npx tsx --test scripts/*.test.ts
//
// § Auto-public on publish — when a website-editor page is published, inline
// data: media is pushed to the aquacrm-public bucket and the published blocks
// are rewritten to the CDN URLs. Draft stays inline (nothing public by
// default). Fully hermetic: a fake promoter / fake port / in-memory storage —
// no global process.env / globalThis.fetch mutation (that races the shared-
// process suite). See docs/development/plans/public-bucket.md (Phase 2).

import { strict as assert } from "node:assert";
import { describe, it, test } from "node:test";
import { readFileSync } from "node:fs";

import { promoteBlockTreeMedia } from "../src/built-ins/modules/website-editor/src/server/publicMediaPromotion";
import { parseDataUrl, publicMediaKey } from "../src/built-ins/runtime/foundation-adapters/publicMediaAdapter";
import { publishPage } from "../src/built-ins/modules/website-editor/src/server/pages";
import { renderPageHtml } from "../src/built-ins/modules/website-editor/src/server/staticExport";
import { storageKeys } from "../src/built-ins/modules/website-editor/src/server/storage-keys";
import type { PluginStorage, PublicMediaPort } from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import type { Block } from "../src/built-ins/modules/website-editor/src/types/block";

// 1×1 transparent PNG data URL — a real, decodable fixture.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";

function fakePromoter() {
  const calls: string[] = [];
  const promote = async (dataUrl: string): Promise<string> => {
    calls.push(dataUrl);
    return `https://cdn.test/${calls.length}.png`;
  };
  return { promote, calls };
}

// --- 1. The walker ---------------------------------------------------------
test("promotes data: image srcs and leaves http/relative/text untouched", async () => {
  const { promote, calls } = fakePromoter();
  const blocks: Block[] = [
    { id: "1", type: "image", props: { src: PNG, alt: "hi" } },
    { id: "2", type: "image", props: { src: "https://example.com/x.png" } },
    { id: "3", type: "text", props: { text: "not a url" } },
  ];
  const { blocks: out, promoted } = await promoteBlockTreeMedia(blocks, promote);
  assert.equal(promoted, 1);
  assert.equal(calls.length, 1);
  assert.match(String(out[0]!.props.src), /^https:\/\/cdn\.test\//);
  assert.equal(out[0]!.props.alt, "hi");                          // sibling props kept
  assert.equal(out[1]!.props.src, "https://example.com/x.png");  // http untouched
  assert.equal(out[2]!.props.text, "not a url");
});

test("dedups identical data URLs + recurses children and variant props", async () => {
  const { promote, calls } = fakePromoter();
  const blocks: Block[] = [
    { id: "1", type: "section", props: {}, children: [
      { id: "1a", type: "image", props: { src: PNG } },
      { id: "1b", type: "image", props: { src: PNG } }, // same bytes → one upload
    ] },
    { id: "2", type: "image", props: { src: "x" }, variantsByGroup: {
      g: [{ id: "v", name: "V", props: { src: PNG } }],
    } },
  ];
  const { blocks: out, promoted } = await promoteBlockTreeMedia(blocks, promote);
  assert.equal(promoted, 1);
  assert.equal(calls.length, 1);
  const c0 = out[0]!.children![0]!.props.src;
  const c1 = out[0]!.children![1]!.props.src;
  assert.equal(c0, c1);
  assert.match(String(c0), /cdn\.test/);
  assert.match(String(out[1]!.variantsByGroup!.g![0]!.props!.src), /cdn\.test/);
});

test("fail-open: a promotion error keeps the inline data URL (publish never blocks)", async () => {
  const blocks: Block[] = [{ id: "1", type: "image", props: { src: PNG } }];
  const { blocks: out, promoted } = await promoteBlockTreeMedia(blocks, async () => {
    throw new Error("storage down");
  });
  assert.equal(promoted, 0);
  assert.equal(out[0]!.props.src, PNG);
});

// --- 2. Adapter pure helpers ----------------------------------------------
describe("§ parseDataUrl + publicMediaKey", () => {
  it("parses a base64 data URL into contentType + bytes", () => {
    const d = parseDataUrl(PNG);
    assert.ok(d);
    assert.equal(d!.contentType, "image/png");
    assert.ok(d!.bytes.length > 0);
  });

  it("returns null for a non-data URL", () => {
    assert.equal(parseDataUrl("https://example.com/x.png"), null);
  });

  it("content-addresses the key (same bytes → same key), mime ext, agency/client/site namespacing", () => {
    const d = parseDataUrl(PNG)!;
    const k1 = publicMediaKey({ agencyId: "a1", clientId: "c1", siteId: "s1", contentType: d.contentType, bytes: d.bytes });
    const k2 = publicMediaKey({ agencyId: "a1", clientId: "c1", siteId: "s1", contentType: d.contentType, bytes: d.bytes });
    assert.equal(k1, k2);
    assert.match(k1, /^website-media\/a1\/c1\/s1\/[0-9a-f]{32}\.png$/);
    const k3 = publicMediaKey({ agencyId: "a2", contentType: d.contentType, bytes: d.bytes });
    assert.match(k3, /^website-media\/a2\/_\/_\/[0-9a-f]{32}\.png$/);
  });
});

// --- 3. publishPage integration (in-memory storage + fake port) -----------
function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string): Promise<T | undefined> => m.get(k) as T | undefined,
    set: async (k: string, v: unknown): Promise<void> => { m.set(k, v); },
    del: async (k: string): Promise<void> => { m.delete(k); },
    list: async (prefix?: string): Promise<string[]> =>
      [...m.keys()].filter(k => !prefix || k.startsWith(prefix)),
  };
}

const seededPage = () => ({
  id: "p1", siteId: "s1", slug: "/", title: "Home", status: "draft" as const,
  blocks: [{ id: "b1", type: "image", props: { src: PNG } }] as Block[],
  createdAt: 1, updatedAt: 1,
});

test("publishPage promotes media when the publicMedia port is wired", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  const port: PublicMediaPort = {
    store: async () => ({ publicUrl: "https://cdn.test/logo.png", storageKey: "k" }),
  };
  const page = await publishPage(storage, "a1", "c1", "s1", "p1", { publicMedia: port });
  assert.ok(page);
  assert.equal(page!.status, "published");
  assert.equal((page!.blocks[0] as Block).props.src, "https://cdn.test/logo.png");
});

test("publishPage leaves media inline when no port is wired (backward compat)", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  const page = await publishPage(storage, "a1", "c1", "s1", "p1");
  assert.ok(page);
  assert.equal(page!.status, "published");
  assert.equal((page!.blocks[0] as Block).props.src, PNG);
});

// --- 3b. End-to-end (the plan's "Done when") ------------------------------
test("end-to-end: a published page RENDERS the public CDN URL, not the inline data URL", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  const cdnUrl = "https://cdn.aquacrm.test/website-media/a1/c1/s1/abc123.png";
  const port: PublicMediaPort = {
    store: async () => ({ publicUrl: cdnUrl, storageKey: "website-media/a1/c1/s1/abc123.png" }),
  };
  const page = await publishPage(storage, "a1", "c1", "s1", "p1", { publicMedia: port });
  assert.ok(page);
  const html = renderPageHtml(page!, { brandCssHref: "assets/brand.css" });
  // The published render serves the durable CDN URL …
  assert.ok(html.includes(`src="${cdnUrl}"`), "rendered <img> uses the public CDN URL");
  // … and the giant inline data URL is gone from the published HTML.
  assert.doesNotMatch(html, /data:image\//);
});

// --- 4. Foundation wiring contract (source-shape, no heavy imports) --------
describe("§ foundation wiring", () => {
  it("registers publicMedia in FOUNDATION_SERVICES + the PluginServices contract + adapter bridge", () => {
    const idx = readFileSync("src/built-ins/runtime/foundation-adapters/index.ts", "utf8");
    assert.match(idx, /publicMedia: publicMediaAdapter/);
    const types = readFileSync("src/built-ins/runtime/_types.ts", "utf8");
    assert.match(types, /publicMedia\?: PublicMediaPort/);
    const adapter = readFileSync("src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts", "utf8");
    assert.match(adapter, /storePublicUpload/);
  });
});
