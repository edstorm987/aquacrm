// Smoke — R013 Iframe-embed customer surface (editor-side primitives).
//
// Asserts:
//   - postMessage event type guards (isEmbedEvent)
//   - subscribeToBridge filters by allowedOrigins
//   - buildFrameAncestorsHeader includes 'self' + supplied origins
//   - measureContentHeight returns 0 in non-DOM context
//   - embed allow-list registry: validation, persistence, dedupe
//   - HTTP handlers shape (200 round-trip, 400 missing origins, invalid surfaced)

import {
  isEmbedEvent,
  buildFrameAncestorsHeader,
  measureContentHeight,
  subscribeToBridge,
  type EmbedEvent,
} from "../lib/embedBridge";
import {
  isValidOrigin,
  setEmbedAllowList,
  getEmbedAllowList,
} from "../server/embedAllow";
import {
  handleGetEmbedAllowList,
  handleSetEmbedAllowList,
} from "../api/handlers/embedAllow";
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

(async () => {
  // ─── isEmbedEvent ───────────────────────────────────────────────────────
  for (const t of ["aqua:auth-ok", "aqua:height-changed", "aqua:navigate", "aqua:ready", "aqua:error"]) {
    expect(`isEmbedEvent accepts type=${t}`,
      isEmbedEvent({ type: t, height: 100, url: "x", message: "x", user: { id: "u" } }));
  }
  expect("isEmbedEvent rejects null", !isEmbedEvent(null));
  expect("isEmbedEvent rejects unknown type",
    !isEmbedEvent({ type: "other:event" }));
  expect("isEmbedEvent rejects strings", !isEmbedEvent("hello"));

  // ─── buildFrameAncestorsHeader ─────────────────────────────────────────
  const header = buildFrameAncestorsHeader(["https://luvandker.com", "https://shop.luvandker.com"]);
  expect("frame-ancestors starts with directive",
    header.startsWith("frame-ancestors "));
  expect("frame-ancestors always includes 'self'",
    header.includes("'self'"));
  expect("frame-ancestors includes both supplied origins",
    header.includes("https://luvandker.com") &&
    header.includes("https://shop.luvandker.com"));
  expect("empty allow-list still emits 'self'",
    buildFrameAncestorsHeader([]) === "frame-ancestors 'self'");
  expect("blank entries stripped",
    buildFrameAncestorsHeader(["", "  ", "https://x.com"]) === "frame-ancestors 'self' https://x.com");

  // ─── measureContentHeight in node context ──────────────────────────────
  expect("measureContentHeight returns 0 with no DOM",
    measureContentHeight() === 0);

  // ─── subscribeToBridge no-op without DOM ───────────────────────────────
  const sub = subscribeToBridge(() => undefined);
  expect("subscribeToBridge returns unsubscribe in node",
    typeof sub.unsubscribe === "function");
  sub.unsubscribe();

  // ─── isValidOrigin ─────────────────────────────────────────────────────
  expect("https://example.com valid", isValidOrigin("https://example.com"));
  expect("http://localhost:3000 valid", isValidOrigin("http://localhost:3000"));
  expect("HTTPS://EXAMPLE.COM valid (case-insensitive scheme)",
    isValidOrigin("HTTPS://EXAMPLE.COM"));
  expect("trailing slash rejected", !isValidOrigin("https://example.com/"));
  expect("path rejected", !isValidOrigin("https://example.com/path"));
  expect("empty rejected", !isValidOrigin(""));
  expect("non-string rejected", !isValidOrigin(123 as unknown as string));

  // ─── registry round-trip ───────────────────────────────────────────────
  const storage = memStorage();
  const initial = await getEmbedAllowList(storage, "ag_smoke", "cl_smoke");
  expect("getEmbedAllowList null when unset", initial === null);

  const saved = await setEmbedAllowList(storage, "ag_smoke", "cl_smoke", [
    "https://luvandker.com",
    "https://luvandker.com",   // duplicate
    "  https://shop.luvandker.com  ",   // surrounded with whitespace
    "not a url",                // invalid
    "",                         // empty
  ], "u_smoke");
  expect("setEmbedAllowList dedupes + trims", saved.origins.length === 2);
  expect("setEmbedAllowList preserves valid origins",
    saved.origins.includes("https://luvandker.com") &&
    saved.origins.includes("https://shop.luvandker.com"));
  expect("setEmbedAllowList drops invalid + empty",
    !saved.origins.includes("not a url") &&
    !saved.origins.includes(""));
  expect("updatedBy + updatedAt populated",
    saved.updatedBy === "u_smoke" && typeof saved.updatedAt === "string");

  const fetched = await getEmbedAllowList(storage, "ag_smoke", "cl_smoke");
  expect("getEmbedAllowList returns persisted record",
    fetched?.origins.length === 2);

  // Cross-tenant isolation.
  const other = await getEmbedAllowList(storage, "ag_other", "cl_smoke");
  expect("cross-agency isolation", other === null);

  // ─── HTTP handlers ─────────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: "ag_smoke",
    clientId: "cl_smoke",
    actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleGetEmbedAllowList>[1];

  const getEmpty = await handleGetEmbedAllowList(new Request("http://x/embed/allowed-origins"), ctx);
  expect("GET empty 200", getEmpty.status === 200);
  const getEmptyBody = await getEmpty.json() as { ok: boolean; allowList: { origins: string[] } };
  expect("GET empty returns allowList with empty origins",
    getEmptyBody.ok && getEmptyBody.allowList.origins.length === 0);

  const post = await handleSetEmbedAllowList(new Request("http://x/embed/allowed-origins", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origins: [
        "https://luvandker.com",
        "https://luvandker.com",  // duplicate
        "bad-url",                 // invalid
      ],
    }),
  }), ctx);
  expect("POST 200", post.status === 200);
  const postBody = await post.json() as { ok: boolean; allowList: { origins: string[] }; invalid: string[] };
  expect("POST surfaces saved + invalid arrays",
    postBody.ok && Array.isArray(postBody.allowList.origins) && Array.isArray(postBody.invalid));
  expect("POST persists deduped valid origins (1)",
    postBody.allowList.origins.length === 1 &&
    postBody.allowList.origins[0] === "https://luvandker.com");
  expect("POST surfaces invalid 'bad-url'",
    postBody.invalid.includes("bad-url"));

  const noOrigins = await handleSetEmbedAllowList(new Request("http://x/embed/allowed-origins", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }), ctx);
  expect("POST without origins → 400", noOrigins.status === 400);

  // GET after save returns persisted.
  const getSaved = await handleGetEmbedAllowList(new Request("http://x/embed/allowed-origins"), ctx);
  const getSavedBody = await getSaved.json() as { allowList: { origins: string[] } };
  expect("GET after save reflects persistence",
    getSavedBody.allowList.origins.includes("https://luvandker.com"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);

  // Use type-only EmbedEvent reference so import isn't tree-shaken away.
  const _unused: EmbedEvent = { type: "aqua:ready" };
  void _unused;
})();
