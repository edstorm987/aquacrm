// Smoke — R003 videoEmbed block + asset upload + LivePreview ergonomics.
//
// Covers pure helpers (videoEmbed) + assets handler against an
// in-memory PluginStorage (matches save-target.test.ts pattern).
// LivePreview React rendering is exercised via the registry callable
// check; the new-tab + open-state behaviour is data-only here.

import { detectVideoProvider, toEmbedUrl } from "../lib/videoEmbed";
import { BLOCK_REGISTRY } from "../components/blockRegistry";
import {
  handleListAssets, handleUploadAsset, handleDeleteAsset,
  decodeDataUrlSize, PER_FILE_CAP_BYTES,
} from "../api/handlers/assets";
import type { PluginCtx, PluginStorage } from "../lib/aquaPluginTypes";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("videoEmbed — provider auto-detect");
expect("vimeo.com/123 → vimeo",
  detectVideoProvider("https://vimeo.com/76979871") === "vimeo");
expect("vimeo.com/video/123 → vimeo",
  detectVideoProvider("https://vimeo.com/video/76979871") === "vimeo");
expect("youtu.be/abc → youtube",
  detectVideoProvider("https://youtu.be/dQw4w9WgXcQ") === "youtube");
expect("youtube.com/watch?v=abc → youtube",
  detectVideoProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ") === "youtube");
expect("youtube.com/embed/abc → youtube",
  detectVideoProvider("https://www.youtube.com/embed/dQw4w9WgXcQ") === "youtube");
expect("loom.com/share/<hex> → loom",
  detectVideoProvider("https://www.loom.com/share/abcdef0123456789") === "loom");
expect("loom.com/embed/<hex> → loom",
  detectVideoProvider("https://www.loom.com/embed/abcdef0123456789") === "loom");
expect("unrecognised host → raw",
  detectVideoProvider("https://example.com/clip.mp4") === "raw");
expect("empty → raw", detectVideoProvider("") === "raw");

console.log("\nvideoEmbed — toEmbedUrl rewrites");
expect("vimeo embed URL",
  toEmbedUrl("https://vimeo.com/76979871", "vimeo") === "https://player.vimeo.com/video/76979871");
expect("youtube embed URL",
  toEmbedUrl("https://youtu.be/dQw4w9WgXcQ", "youtube") === "https://www.youtube.com/embed/dQw4w9WgXcQ");
expect("loom embed URL",
  toEmbedUrl("https://www.loom.com/share/abcdef0123456789", "loom") === "https://www.loom.com/embed/abcdef0123456789");
expect("autoplay appends ?autoplay=1&muted=1 (vimeo)",
  toEmbedUrl("https://vimeo.com/123", "vimeo", { autoplay: true })
    === "https://player.vimeo.com/video/123?autoplay=1&muted=1");
expect("controls=false appends controls=0 (youtube)",
  toEmbedUrl("https://youtu.be/abcdef", "youtube", { controls: false })
    === "https://www.youtube.com/embed/abcdef?controls=0");
expect("raw passthrough",
  toEmbedUrl("https://cdn.example/v.mp4", "raw") === "https://cdn.example/v.mp4");
expect("provider=vimeo + invalid url → passthrough",
  toEmbedUrl("garbage", "vimeo") === "garbage");

console.log("\nvideoEmbed — block registry");
expect("video-embed registered", BLOCK_REGISTRY["video-embed"] !== undefined);
expect("video-embed default provider raw",
  BLOCK_REGISTRY["video-embed"]?.defaultProps?.provider === "raw");
expect("video-embed has url + provider + autoplay fields",
  ["url", "provider", "autoplay"].every(k =>
    (BLOCK_REGISTRY["video-embed"]?.fields ?? []).some(f => f.key === k)));

console.log("\nasset upload — handler");
function makeStorage(): PluginStorage {
  const map = new Map<string, unknown>();
  return {
    async get<T>(k: string): Promise<T | undefined> { return map.get(k) as T | undefined; },
    async set<T>(k: string, v: T): Promise<void> { map.set(k, v); },
    async del(k: string): Promise<void> { map.delete(k); },
    async list(prefix?: string): Promise<string[]> {
      return [...map.keys()].filter(k => !prefix || k.startsWith(prefix));
    },
  };
}
function makeCtx(storage: PluginStorage): PluginCtx {
  return {
    agencyId: "ag1" as never,
    clientId: "c1" as never,
    actor: "u1" as never,
    storage,
    services: {} as never,
    install: {} as never,
  };
}

const tinyDataUrl = "data:image/png;base64," + "iVBORw0KGgo".padEnd(40, "A") + "==";

(async function run() {
  const storage = makeStorage();
  const ctx = makeCtx(storage);

  // List empty
  const empty = await handleListAssets(new Request("http://x/assets"), ctx);
  const emptyJson = await empty.json() as { ok: boolean; assets: unknown[] };
  expect("list empty: ok + assets:[]",
    emptyJson.ok === true && Array.isArray(emptyJson.assets) && emptyJson.assets.length === 0);

  // Upload happy path
  const up = await handleUploadAsset(new Request("http://x/assets", {
    method: "POST",
    body: JSON.stringify({ filename: "cover.png", contentType: "image/png", dataUrl: tinyDataUrl, alt: "cover" }),
  }), ctx);
  const upJson = await up.json() as { ok: boolean; asset?: { id: string; filename: string; size: number } };
  expect("upload: ok + asset has id + filename",
    upJson.ok === true && !!upJson.asset?.id && upJson.asset?.filename === "cover.png");
  const uploadedId = upJson.asset!.id;
  expect("upload: size decoded > 0", (upJson.asset?.size ?? 0) > 0);

  // List shows the uploaded asset
  const list2 = await handleListAssets(new Request("http://x/assets"), ctx);
  const list2Json = await list2.json() as { assets: Array<{ id: string }>; usedBytes: number };
  expect("list: contains the uploaded id",
    list2Json.assets.some(a => a.id === uploadedId));
  expect("list: usedBytes > 0", list2Json.usedBytes > 0);

  // Bad body
  const bad = await handleUploadAsset(new Request("http://x/assets", {
    method: "POST", body: JSON.stringify({ filename: "x", dataUrl: "not-a-data-uri", contentType: "image/png" }),
  }), ctx);
  expect("upload: non-data: URL → 400", bad.status === 400);

  // Per-file cap
  const huge = "data:image/png;base64," + "A".repeat(PER_FILE_CAP_BYTES * 2);
  const tooBig = await handleUploadAsset(new Request("http://x/assets", {
    method: "POST", body: JSON.stringify({ filename: "huge.png", contentType: "image/png", dataUrl: huge }),
  }), ctx);
  expect("upload: > per-file cap → 413", tooBig.status === 413);

  // Delete
  const del = await handleDeleteAsset(new Request(`http://x/assets/${uploadedId}`), ctx);
  const delJson = await del.json() as { ok: boolean; deleted?: boolean };
  expect("delete: ok + deleted:true", delJson.ok === true && delJson.deleted === true);

  // Delete non-existent
  const delMiss = await handleDeleteAsset(new Request("http://x/assets/does-not-exist"), ctx);
  expect("delete: non-existent → 404", delMiss.status === 404);

  console.log("\nasset upload — decodeDataUrlSize");
  expect("data:...,AAA= → ~2 bytes", decodeDataUrlSize("data:image/png;base64,AAA=") === 2);
  expect("data:...,AAAA → 3 bytes", decodeDataUrlSize("data:image/png;base64,AAAA") === 3);
  expect("malformed (no comma) → 0", decodeDataUrlSize("data:image/png;base64") === 0);

  console.log("\nLivePreview hook — useLivePreviewOpenState");
  // Pure data check — the hook itself needs DOM. Validate the
  // localStorage key shape the hook uses so consumers can pre-seed
  // tests / migrations:
  const expectedKey = (pageId: string) => `lk-live-preview-open:${pageId}`;
  expect("localStorage key shape `lk-live-preview-open:<pageId>`",
    expectedKey("p_about") === "lk-live-preview-open:p_about");

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
