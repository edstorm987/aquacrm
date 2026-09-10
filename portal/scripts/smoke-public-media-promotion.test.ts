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

import {
  promoteBlockTreeMedia,
  PublicMediaPromotionTraversalError,
  PublicMediaPortUnavailableError,
  PublicMediaPromotionPolicyError,
} from "../src/built-ins/modules/website-editor/src/server/publicMediaPromotion";
import {
  parseDataUrl,
  publicMediaKey,
  PublicMediaDataUrlError,
  PublicMediaIdentityError,
} from "../src/built-ins/runtime/foundation-adapters/publicMediaAdapter";
import { publishPage } from "../src/built-ins/modules/website-editor/src/server/pages";
import {
  handlePublishPage,
  handleUpdatePage,
} from "../src/built-ins/modules/website-editor/src/api/handlers/pages";
import {
  EditorPageListError,
  EditorPagePublishError,
  readPageListResponse,
  readPagePublishResponse,
} from "../src/built-ins/modules/website-editor/src/lib/editorPages";
import {
  partitionPublishPreviewPages,
  runSitePublishWorkflow,
  sitePublishSuccessMessage,
  SitePublishWorkflowError,
} from "../src/built-ins/modules/website-editor/src/lib/publishWorkflow";
import { renderPageHtml } from "../src/built-ins/modules/website-editor/src/server/staticExport";
import { storageKeys } from "../src/built-ins/modules/website-editor/src/server/storage-keys";
import type { PluginCtx, PluginStorage, PublicMediaPort } from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import type { Block } from "../src/built-ins/modules/website-editor/src/types/block";

// 1×1 transparent PNG data URL — a real, decodable fixture.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
const MIXED_CASE_PNG = PNG.replace("data:image/png;base64,", "DATA:IMAGE/PNG;BASE64,");
const OBFUSCATED_PNG = `\u0000 \tDa\nTa:image/png;base64,${PNG.split(",")[1]}`;

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

test("finds mixed-case schemes and nested media collections used by real blocks", async () => {
  const { promote, calls } = fakePromoter();
  const blocks: Block[] = [
    { id: "gallery", type: "gallery", props: { photos: [{ src: PNG }, { src: PNG }] } },
    { id: "logos", type: "logo-grid", props: { logos: [{ src: PNG }] } },
    { id: "quotes", type: "testimonials", props: { items: [{ avatar: PNG }] } },
    { id: "proof", type: "social-proof-bar", props: { avatars: [PNG] } },
    { id: "mixed", type: "image", props: { src: MIXED_CASE_PNG } },
  ];
  const { blocks: out, promoted } = await promoteBlockTreeMedia(blocks, promote);

  assert.equal(promoted, 2, "identical literal URLs dedup; the mixed-case spelling is a second literal");
  assert.equal(calls.length, 2);
  assert.match(String((out[0]!.props.photos as Array<{ src: string }>)[0]!.src), /^https:\/\/cdn\.test\//);
  assert.match(String((out[1]!.props.logos as Array<{ src: string }>)[0]!.src), /^https:\/\/cdn\.test\//);
  assert.match(String((out[2]!.props.items as Array<{ avatar: string }>)[0]!.avatar), /^https:\/\/cdn\.test\//);
  assert.match(String((out[3]!.props.avatars as string[])[0]), /^https:\/\/cdn\.test\//);
  assert.match(String(out[4]!.props.src), /^https:\/\/cdn\.test\//);
});

test("canonicalises browser-significant leading controls and line breaks before inspection", async () => {
  const { promote, calls } = fakePromoter();
  const blocks: Block[] = [{ id: "obfuscated", type: "image", props: { src: OBFUSCATED_PNG } }];
  const { blocks: out, promoted } = await promoteBlockTreeMedia(blocks, promote);
  assert.equal(promoted, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.startsWith("DaTa:image/png;base64,"), true);
  assert.match(String(out[0]!.props.src), /^https:\/\/cdn\.test\//);
});

test("fails closed on executable or unsupported data URL media", async () => {
  const blocks: Block[] = [
    { id: "html-data", type: "link", props: { href: "\tdata:text/html,<script>alert(1)</script>" } },
  ];
  await assert.rejects(
    () => promoteBlockTreeMedia(blocks, async value => value),
    (error: unknown) => (
      error instanceof PublicMediaPromotionPolicyError
      && error.reason === "unsupported-data-url"
    ),
  );
});

test("cyclic or excessively deep prop graphs fail closed instead of evading inspection", async () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  await assert.rejects(
    () => promoteBlockTreeMedia([{ id: "cycle", type: "image", props: cyclic }], async value => value),
    (error: unknown) => error instanceof PublicMediaPromotionTraversalError && error.reason === "cyclic-props",
  );

  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let index = 0; index < 34; index += 1) {
    const next: Record<string, unknown> = {};
    cursor.next = next;
    cursor = next;
  }
  cursor.src = PNG;
  await assert.rejects(
    () => promoteBlockTreeMedia([{ id: "deep", type: "image", props: deep }], async value => value),
    (error: unknown) => error instanceof PublicMediaPromotionTraversalError && error.reason === "depth-limit",
  );
});

test("a provider failure cannot switch publication to an inline-data fallback", async () => {
  const blocks: Block[] = [{ id: "1", type: "image", props: { src: PNG } }];
  const forgedFallback = Object.assign(new Error("storage down"), { inlineFallbackAllowed: true });
  await assert.rejects(
    () => promoteBlockTreeMedia(blocks, async () => { throw forgedFallback; }),
    (error: unknown) => error === forgedFallback,
  );
});

test("a security-policy or unknown promotion failure stops publication", async () => {
  const blocks: Block[] = [{ id: "1", type: "image", props: { src: PNG } }];
  const securityError = Object.assign(new Error("content rejected"), {
    code: "public_upload_content_not_cleared",
  });
  await assert.rejects(
    () => promoteBlockTreeMedia(blocks, async () => { throw securityError; }),
    (error: unknown) => error === securityError,
  );
});

test("inline data URLs in every renderable style surface fail closed before promotion", async () => {
  const dataCss = `url(${PNG})`;
  const cases: Block[] = [
    { id: "base", type: "section", props: {}, styles: { background: dataCss } },
    {
      id: "responsive",
      type: "section",
      props: {},
      styles: { mobile: { background: dataCss }, tablet: { border: `1px solid transparent` } },
    },
    {
      id: "theme",
      type: "section",
      props: {},
      themeStyles: { dark: { background: dataCss } },
    },
    {
      id: "variant",
      type: "section",
      props: {},
      variantsByGroup: {
        experiment: [{ id: "v1", name: "Variant", styles: { background: dataCss } }],
      },
    },
    {
      id: "obfuscated",
      type: "section",
      props: {},
      styles: { background: String.raw`url(d\61 ta:image/png;base64,AAAA)` },
    },
    {
      id: "comment-obfuscated",
      type: "section",
      props: {},
      styles: { background: "url(d/**/ata:image/png;base64,AAAA)" },
    },
    {
      id: "split-across-responsive-fields",
      type: "section",
      props: {},
      styles: {
        mobile: {
          padding: "0;background-image:url(d/*",
          margin: "*/ata:image/png;base64,AAAA)",
        },
      },
    },
  ];

  for (const block of cases) {
    let calls = 0;
    await assert.rejects(
      () => promoteBlockTreeMedia([block], async () => {
        calls += 1;
        return "https://cdn.test/should-not-run";
      }),
      (error: unknown) => error instanceof PublicMediaPromotionPolicyError
        && error.reason === "inline-data-in-style",
      block.id,
    );
    assert.equal(calls, 0, `${block.id}: style bytes must be refused before provider I/O`);
  }

  const ordinary = { id: "safe", type: "section", props: {}, styles: {
    background: "linear-gradient(#0008, #0008), url(https://cdn.test/a.png)",
    mobile: { padding: "1rem" },
  } } as Block;
  const safeBlocks = [ordinary];
  const result = await promoteBlockTreeMedia(safeBlocks, async () => {
    throw new Error("ordinary remote CSS must not invoke the inline-media promoter");
  });
  assert.equal(result.blocks, safeBlocks);
  assert.equal(result.promoted, 0);
});

// --- 2. Adapter pure helpers ----------------------------------------------
describe("§ parseDataUrl + publicMediaKey", () => {
  it("parses a base64 data URL into contentType + bytes", () => {
    const d = parseDataUrl(PNG);
    assert.ok(d);
    assert.equal(d!.contentType, "image/png");
    assert.ok(d!.bytes.length > 0);
  });

  it("parses URI schemes and media types case-insensitively", () => {
    const d = parseDataUrl(MIXED_CASE_PNG);
    assert.ok(d);
    assert.equal(d!.contentType, "image/png");
    assert.ok(d!.bytes.length > 0);
  });

  it("canonicalises browser-significant URL whitespace and rejects malformed or oversized encodings", () => {
    const d = parseDataUrl(OBFUSCATED_PNG);
    assert.ok(d);
    assert.equal(d!.contentType, "image/png");
    assert.equal(parseDataUrl("data:image/png,not-base64"), null);
    assert.equal(parseDataUrl("data:image/png;base64,!!!!"), null);
    assert.throws(
      () => parseDataUrl("data:image/png;base64,AAAAAAAAAAAAAAAA", 8),
      PublicMediaDataUrlError,
    );
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

  it("rejects every identifier spelling that a URL layer could normalize outside the tenant namespace", () => {
    const d = parseDataUrl(PNG)!;
    const unsafe = [
      "../victim",
      "../../../victim",
      "%2e%2e",
      "%2fadmin",
      "victim\\nested",
      "victim/site",
      "victim?x=1",
      "victim#fragment",
      ".",
      "..",
      "",
      " leading",
      "line\nbreak",
    ];
    for (const value of unsafe) {
      assert.throws(
        () => publicMediaKey({
          agencyId: "agency-safe",
          clientId: "client-safe",
          siteId: value,
          contentType: d.contentType,
          bytes: d.bytes,
        }),
        PublicMediaIdentityError,
        `expected unsafe siteId ${JSON.stringify(value)} to be refused`,
      );
    }
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

test("publishPage fails closed and remains draft when inline media has no inspected storage port", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  await assert.rejects(
    () => publishPage(storage, "a1", "c1", "s1", "p1"),
    PublicMediaPortUnavailableError,
  );
  const stored = await storage.get<ReturnType<typeof seededPage>>(
    storageKeys.page("a1", "c1", "s1", "p1"),
  );
  assert.equal(stored?.status, "draft");
  assert.equal(stored?.blocks[0]?.props.src, PNG);
});

test("publishPage carries authenticated actor lineage to the public-media port", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  let observedActor: string | undefined;
  const port: PublicMediaPort = {
    store: async input => {
      observedActor = input.actor;
      return { publicUrl: "https://cdn.test/logo.png", storageKey: "k" };
    },
  };
  await publishPage(storage, "a1", "c1", "s1", "p1", { publicMedia: port, actor: "user-42" });
  assert.equal(observedActor, "user-42");
});

test("publishPage keeps already-public URLs publishable without invoking public storage", async () => {
  const storage = memStorage();
  const page = seededPage();
  page.blocks[0]!.props.src = "https://cdn.example.test/existing.png";
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), page);
  let storeCalls = 0;
  const port: PublicMediaPort = {
    store: async () => {
      storeCalls += 1;
      throw new Error("already-public media must not be stored again");
    },
  };

  const published = await publishPage(storage, "a1", "c1", "s1", "p1", { publicMedia: port });
  assert.equal(published?.status, "published");
  assert.equal(published?.blocks[0]?.props.src, "https://cdn.example.test/existing.png");
  assert.equal(storeCalls, 0);
});

test("publishPage refuses inline bytes in page CSS before public-media provider I/O", async () => {
  const storage = memStorage();
  const page = {
    ...seededPage(),
    customCss: "main{background-image:url(d/**/ata:image/png;base64,AAAA)}",
  };
  page.blocks[0]!.props.src = "https://cdn.example.test/existing.png";
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), page);
  let storeCalls = 0;
  await assert.rejects(
    () => publishPage(storage, "a1", "c1", "s1", "p1", {
      publicMedia: {
        store: async () => {
          storeCalls += 1;
          throw new Error("must not reach provider");
        },
      },
    }),
    (error: unknown) => error instanceof PublicMediaPromotionPolicyError
      && error.reason === "inline-data-in-style",
  );
  assert.equal(storeCalls, 0);
  const stored = await storage.get<typeof page>(storageKeys.page("a1", "c1", "s1", "p1"));
  assert.equal(stored?.status, "draft");
});

test("publishPage inspects the complete published theme token surface", async () => {
  const storage = memStorage();
  const page = { ...seededPage(), themeId: "theme-1" };
  page.blocks[0]!.props.src = "https://cdn.example.test/existing.png";
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), page);
  await storage.set(storageKeys.theme("a1", "c1", "s1", "theme-1"), {
    id: "theme-1",
    siteId: "s1",
    agencyId: "a1",
    clientId: "c1",
    name: "Theme",
    tokens: {
      primary: "d/*",
      surface: "*/ata:image/png;base64,AAAA",
    },
    createdAt: 1,
    updatedAt: 1,
  });
  let storeCalls = 0;
  await assert.rejects(
    () => publishPage(storage, "a1", "c1", "s1", "p1", {
      publicMedia: {
        store: async () => {
          storeCalls += 1;
          throw new Error("must not reach provider");
        },
      },
    }),
    (error: unknown) => error instanceof PublicMediaPromotionPolicyError
      && error.reason === "inline-data-in-style",
  );
  assert.equal(storeCalls, 0);
  const stored = await storage.get<typeof page>(storageKeys.page("a1", "c1", "s1", "p1"));
  assert.equal(stored?.status, "draft");
});

test("generic page PATCH validates both custom-CSS aliases at the write boundary", async () => {
  for (const field of ["customCss", "customCSS"] as const) {
    const storage = memStorage();
    await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
    const ctx = {
      agencyId: "a1",
      clientId: "c1",
      actor: "editor-1",
      install: { config: {} },
      storage,
      services: {},
    } as unknown as PluginCtx;
    const response = await handleUpdatePage(
      new Request("https://portal.test/api/portal/website-editor/pages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: "s1",
          pageId: "p1",
          patch: { [field]: "body{} </style><div>held</div>" },
        }),
      }),
      ctx,
    );
    assert.equal(response.status, 400, field);
    const body = await response.json() as { error?: string };
    assert.match(body.error ?? "", new RegExp(`patch\\.${field} rejected`));
    const stored = await storage.get<Record<string, unknown>>(
      storageKeys.page("a1", "c1", "s1", "p1"),
    );
    assert.equal(stored?.[field], undefined, `${field}: rejected CSS must not be stored`);
  }
});

test("publishPage remains draft when the media security policy rejects bytes", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  const securityError = Object.assign(new Error("content rejected"), {
    code: "public_upload_content_not_cleared",
  });
  const port: PublicMediaPort = {
    store: async () => { throw securityError; },
  };

  await assert.rejects(
    () => publishPage(storage, "a1", "c1", "s1", "p1", { publicMedia: port }),
    (error: unknown) => error === securityError,
  );
  const stored = await storage.get<ReturnType<typeof seededPage>>(
    storageKeys.page("a1", "c1", "s1", "p1"),
  );
  assert.equal(stored?.status, "draft");
  assert.equal(stored?.blocks[0]?.props.src, PNG);
});

test("publishPage fails closed and remains draft on every provider outage marker", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  const port: PublicMediaPort = {
    store: async () => {
      throw Object.assign(new Error("provider unavailable"), { inlineFallbackAllowed: true });
    },
  };
  await assert.rejects(
    () => publishPage(storage, "a1", "c1", "s1", "p1", { publicMedia: port }),
    /provider unavailable/,
  );
  const stored = await storage.get<ReturnType<typeof seededPage>>(
    storageKeys.page("a1", "c1", "s1", "p1"),
  );
  assert.equal(stored?.status, "draft");
  assert.equal(stored?.blocks[0]?.props.src, PNG);
});

test("publish API maps the atomic lifecycle block to a secret-free 503 contract", async () => {
  const storage = memStorage();
  await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
  const sentinel = "provider-secret-must-not-leak";
  const ctx = {
    agencyId: "a1",
    clientId: "c1",
    actor: "publisher-1",
    install: { config: {} },
    storage,
    services: {
      publicMedia: {
        store: async () => {
          throw Object.assign(new Error(`raw provider failure: ${sentinel}`), {
            code: "public_upload_atomic_lifecycle_required",
          });
        },
      },
    },
  } as unknown as PluginCtx;

  const response = await handlePublishPage(
    new Request("https://portal.test/api/portal/website-editor/pages/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId: "s1", pageId: "p1" }),
    }),
    ctx,
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as { ok?: boolean; code?: string; error?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "public_upload_atomic_lifecycle_required");
  assert.doesNotMatch(body.error ?? "", new RegExp(sentinel));
  const stored = await storage.get<ReturnType<typeof seededPage>>(
    storageKeys.page("a1", "c1", "s1", "p1"),
  );
  assert.equal(stored?.status, "draft");
});

test("publish API maps expected media failures to stable secret-free contracts", async () => {
  const cases = [
    {
      internalCodes: [
        "durable_public_uploads_required",
        "public_media_provider_unavailable",
        "public_upload_provider_failed",
      ],
      status: 503,
      publicCode: "public_media_temporarily_unavailable",
    },
    {
      internalCodes: [
        "content_trust_blocked",
        "public_media_data_url_invalid",
        "public_media_identity_invalid",
        "public_media_promotion_policy_refused",
        "public_media_promotion_traversal_refused",
        "public_upload_content_not_cleared",
        "public_upload_content_type_not_allowed",
        "public_upload_path_escape",
        "public_upload_size_not_allowed",
        "public_upload_tenant_scope_mismatch",
      ],
      status: 422,
      publicCode: "public_media_security_validation_failed",
    },
    {
      internalCodes: ["writes_frozen"],
      status: 503,
      publicCode: "publishing_temporarily_locked",
    },
  ] as const;

  for (const contract of cases) {
    for (const internalCode of contract.internalCodes) {
      const storage = memStorage();
      await storage.set(storageKeys.page("a1", "c1", "s1", "p1"), seededPage());
      const sentinel = `private-${internalCode}-detail`;
      const ctx = {
        agencyId: "a1",
        clientId: "c1",
        actor: "publisher-1",
        install: { config: {} },
        storage,
        services: {
          publicMedia: {
            store: async () => {
              throw Object.assign(new Error(sentinel), { code: internalCode });
            },
          },
        },
      } as unknown as PluginCtx;

      const response = await handlePublishPage(
        new Request("https://portal.test/api/portal/website-editor/pages/publish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId: "s1", pageId: "p1" }),
        }),
        ctx,
      );
      assert.equal(response.status, contract.status, internalCode);
      assert.equal(response.headers.get("cache-control"), "no-store", internalCode);
      const body = await response.json() as { ok?: boolean; code?: string; error?: string };
      assert.equal(body.ok, false, internalCode);
      assert.equal(body.code, contract.publicCode, internalCode);
      assert.doesNotMatch(body.error ?? "", new RegExp(sentinel), internalCode);
      assert.doesNotMatch(JSON.stringify(body), new RegExp(internalCode), internalCode);
      const stored = await storage.get<ReturnType<typeof seededPage>>(
        storageKeys.page("a1", "c1", "s1", "p1"),
      );
      assert.equal(stored?.status, "draft", internalCode);
    }
  }
});

test("publish client throws a typed safe error instead of converting non-2xx to null", async () => {
  const sentinel = "scanner-secret-must-not-leak";
  const response = new Response(JSON.stringify({
    ok: false,
    code: "public_upload_atomic_lifecycle_required",
    error: `untrusted server text: ${sentinel}`,
  }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(
    () => readPagePublishResponse(response),
    (error: unknown) => (
      error instanceof EditorPagePublishError
      && error.code === "public_upload_atomic_lifecycle_required"
      && error.status === 503
      && !error.message.includes(sentinel)
    ),
  );
});

test("publish client presents stable messages for media validation, availability, and lockdown failures", async () => {
  for (const [code, status, expectedMessage] of [
    ["public_media_temporarily_unavailable", 503, "No page changes were published"],
    ["public_media_security_validation_failed", 422, "No page changes were published"],
    ["publishing_temporarily_locked", 503, "The page was not published"],
  ] as const) {
    const sentinel = `untrusted-${code}-server-text`;
    await assert.rejects(
      () => readPagePublishResponse(new Response(JSON.stringify({
        ok: false,
        code,
        error: sentinel,
      }), {
        status,
        headers: { "content-type": "application/json" },
      })),
      (error: unknown) => (
        error instanceof EditorPagePublishError
        && error.code === code
        && error.status === status
        && !error.message.includes(sentinel)
        && error.message.includes(expectedMessage)
      ),
    );
  }
});

test("publish client refuses malformed or false-success 2xx payloads", async () => {
  for (const payload of [
    { ok: false, page: {} },
    { ok: true, page: {} },
    {
      ok: true,
      page: {
        id: "wrong-page",
        siteId: "s1",
        agencyId: "a1",
        clientId: "c1",
        slug: "/",
        title: "Home",
        status: "published",
        blocks: [],
        createdAt: 1,
        updatedAt: 2,
      },
    },
    {
      ok: true,
      page: {
        id: "expected-page",
        siteId: "wrong-site",
        agencyId: "a1",
        clientId: "c1",
        slug: "/",
        title: "Home",
        status: "published",
        blocks: [],
        createdAt: 1,
        updatedAt: 2,
      },
    },
  ]) {
    await assert.rejects(
      () => readPagePublishResponse(new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }), { siteId: "expected-site", pageId: "expected-page" }),
      (error: unknown) => (
        error instanceof EditorPagePublishError
        && error.code === "page_publish_invalid_response"
      ),
    );
  }
});

test("site publish workflow stops before GitHub when the active page fails", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => runSitePublishWorkflow({
      publishContent: async () => { calls.push("content"); },
      publishActivePage: async () => {
        calls.push("active-page");
        throw new Error("public media unavailable");
      },
      promoteToGitHub: async () => {
        calls.push("github-promote");
        return { ok: true };
      },
    }),
    (error: unknown) => (
      error instanceof SitePublishWorkflowError
      && error.stage === "active-page"
      && error.contentPublished
      && !error.activePagePublished
      && /Content drafts were already published in Aqua/.test(error.message)
      && /GitHub promotion was not requested/.test(error.message)
    ),
  );
  assert.deepEqual(calls, ["content", "active-page"]);
});

test("page-list failures remain unreadable instead of becoming a cached empty tree", async () => {
  const secret = "database-password-must-not-escape";
  await assert.rejects(
    () => readPageListResponse(new Response(JSON.stringify({ ok: false, error: secret }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })),
    (error: unknown) => (
      error instanceof EditorPageListError
      && error.code === "page_list_failed"
      && error.status === 503
      && !error.message.includes(secret)
    ),
  );

  for (const payload of [
    { ok: false, pages: [] },
    { ok: true, pages: null },
    { ok: true, pages: [{ id: "shape-only" }] },
  ]) {
    await assert.rejects(
      () => readPageListResponse(new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
      (error: unknown) => (
        error instanceof EditorPageListError
        && error.code === "page_list_invalid_response"
      ),
    );
  }

  const structurallyValidWrongSite = {
    id: "page-1",
    siteId: "another-site",
    agencyId: "agency-1",
    clientId: "client-1",
    slug: "/",
    title: "Home",
    status: "draft",
    blocks: [],
    createdAt: 1,
    updatedAt: 1,
  };
  await assert.rejects(
    () => readPageListResponse(new Response(JSON.stringify({
      ok: true,
      pages: [structurallyValidWrongSite],
    }), { status: 200 }), "expected-site"),
    (error: unknown) => error instanceof EditorPageListError
      && error.code === "page_list_invalid_response",
  );

  const editorSource = readFileSync(new URL(
    "../src/built-ins/modules/website-editor/src/pages/EditorPage.tsx",
    import.meta.url,
  ), "utf8");
  assert.match(editorSource, /catch \{\s*pagesPreviewFailed = true;/,
    "a rejected page-list read must mark the publish preview unreadable");
  assert.match(editorSource, /preview\.unreadable\.length > 0 \? null : \(/,
    "an unreadable preview must suppress the no-unpublished-changes message");

  const pagesSource = readFileSync(new URL(
    "../src/built-ins/modules/website-editor/src/pages/PagesPage.tsx",
    import.meta.url,
  ), "utf8");
  assert.match(pagesSource, /catch \{\s*setLoadError\("The page list could not be read\.[^"]*"\);\s*return false;/,
    "the Pages screen must catch an unreadable list instead of rejecting an effect promise");
  assert.match(pagesSource, /\) : loadError \? \([\s\S]*?Pages are currently unreadable[\s\S]*?\) : pages\.length === 0 \? \(/,
    "an unreadable page list must render before and instead of the empty-list claim");
  assert.match(pagesSource, /title: "Published; list not refreshed"/,
    "a post-success refresh failure must not contradict the successful publish");
  assert.doesNotMatch(
    pagesSource,
    /const updated = await publishPage\([\s\S]{0,300}?await refresh\(siteId\);\s*\} catch/,
    "publishing and post-success refresh must not share one failure notification catch",
  );

  assert.match(editorSource, /const \[pagesSiteId, setPagesSiteId\] = useState<string \| null>\(null\)/,
    "the editor must bind its loaded page list to a specific site");
  assert.match(editorSource, /setPagesSiteId\(null\);\s*setPages\(\[\]\);\s*setTarget\(\{ kind: "page", id: "_home" \}\)/,
    "a site switch must clear the previous site's page authority before loading");
  assert.match(editorSource, /void loadPages\(site\.id\)[\s\S]*?\.catch\(\(\) => \{[\s\S]*?No page from the previous site is being shown/,
    "a rejected site-switch read must be caught and reported as non-authoritative");
  assert.match(editorSource, /sitePagesPending = Boolean\(site && pagesSiteId !== site\.id\)/,
    "the stale render between site selection and its effect must remain behind the loader");
});

test("publish preview labels only the active page as included and defers every other changed page", () => {
  const pages = [
    { id: "home", slug: "/", title: "Home" },
    { id: "about", slug: "/about", title: "About" },
    { id: "contact", slug: "/contact", title: "Contact" },
  ];
  const withActive = partitionPublishPreviewPages(pages, "about");
  assert.equal(withActive.activePage?.id, "about");
  assert.deepEqual(withActive.deferredPages.map(page => page.id), ["home", "contact"]);

  const withoutActive = partitionPublishPreviewPages(pages, null);
  assert.equal(withoutActive.activePage, null);
  assert.deepEqual(withoutActive.deferredPages.map(page => page.id), ["home", "about", "contact"]);
  assert.equal(
    sitePublishSuccessMessage("about"),
    "Content drafts and the active editor page were published inside Aqua. Other changed pages were not included and must be opened and published separately.",
  );
  assert.equal(
    sitePublishSuccessMessage(null),
    "Content drafts were published inside Aqua; no editor page was active, so no page draft was published. Other changed pages were not included and must be opened and published separately.",
  );
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
