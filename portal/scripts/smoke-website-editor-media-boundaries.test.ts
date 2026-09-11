import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import {
  MAX_PUBLIC_MEDIA_BYTES,
  PublicMediaDataUrlError,
  parseDataUrl,
} from "../src/lib/server/security/base64DataUrl";
import {
  handleUploadAsset,
  PER_CLIENT_CAP_BYTES,
  PER_FILE_CAP_BYTES,
  type PortalAsset,
} from "../src/built-ins/modules/website-editor/src/api/handlers/assets";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import {
  assertValidPageBlockTree,
  MAX_PAGE_BLOCKS,
  MAX_PAGE_INLINE_MEDIA_BYTES,
  MAX_PAGE_STYLE_BYTES,
  PageBlockValidationError,
} from "../src/built-ins/modules/website-editor/src/server/pageBlockValidation";
import { createPage, getPage } from "../src/built-ins/modules/website-editor/src/server/pages";
import { storageKeys } from "../src/built-ins/modules/website-editor/src/server/storage-keys";
import { renderPageHtml } from "../src/built-ins/modules/website-editor/src/server/staticExport";
import { blockCssScopeId, isSafeBlockId } from "../src/engines/editor/elements/blockIdentity";
import { hoverStylesFor } from "../src/built-ins/modules/website-editor/src/components/blocks/ButtonBlock";
import type { Block } from "../src/engines/editor/elements/block";
import type { EditorPage } from "../src/built-ins/modules/website-editor/src/types/editorPage";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=",
  "base64",
);
const PNG = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

function memStorage(withLock = false): PluginStorage & { values: Map<string, unknown>; locks: string[] } {
  const values = new Map<string, unknown>();
  const locks: string[] = [];
  const storage: PluginStorage & { values: Map<string, unknown>; locks: string[] } = {
    values,
    locks,
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async set(key, value) { values.set(key, value); },
    async del(key) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
  if (withLock) {
    storage.runExclusive = async (key, operation) => {
      locks.push(key);
      return operation();
    };
  }
  return storage;
}

function ctx(storage: PluginStorage): PluginCtx {
  return {
    agencyId: "agency-1" as never,
    clientId: "client-1" as never,
    actor: "trusted-actor" as never,
    storage,
    services: {} as never,
    install: { config: {} } as never,
  };
}

function upload(body: Record<string, unknown>, storage = memStorage(true)): Promise<Response> {
  return handleUploadAsset(new Request("https://portal.test/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), ctx(storage));
}

function block(id: string, props: Record<string, unknown> = {}): Block {
  return { id, type: "text", props };
}

describe("strict base64 data URL boundary", () => {
  test("calculates exact bytes and emits one canonical representation", () => {
    const decoded = parseDataUrl(PNG);
    assert.ok(decoded);
    assert.equal(decoded.bytes.byteLength, PNG_BYTES.byteLength);
    assert.equal(decoded.dataUrl, PNG);
  });

  test("rejects malformed padding and forgiving-decoder spellings", () => {
    for (const malformed of [
      "data:image/png;base64,====",
      "data:image/png;base64,A=AA",
      "data:image/png;base64,AAA==",
      "data:image/png;base64,AB==",
      " data:image/png;base64,AAAA",
      "data:image/png;base64,AA A=",
    ]) {
      assert.equal(parseDataUrl(malformed), null, malformed);
    }
    assert.throws(
      () => parseDataUrl("data:image/png;base64,"),
      (error: unknown) => error instanceof PublicMediaDataUrlError && error.reason === "empty",
    );
  });

  test("enforces the scanner-compatible 1 MiB cap before decode", () => {
    assert.equal(MAX_PUBLIC_MEDIA_BYTES, 1024 * 1024);
    assert.equal(PER_FILE_CAP_BYTES, MAX_PUBLIC_MEDIA_BYTES);
    const overCap = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_PUBLIC_MEDIA_BYTES + 1) / 3) * 4)}`;
    assert.throws(
      () => parseDataUrl(overCap),
      (error: unknown) => error instanceof PublicMediaDataUrlError && error.reason === "too-large",
    );
  });
});

describe("Website Editor asset ingestion", () => {
  test("rejects malformed base64, declared/data MIME mismatch, and HTML polyglot bytes", async () => {
    const malformed = await upload({ filename: "x.png", contentType: "image/png", dataUrl: "data:image/png;base64,====" });
    assert.equal(malformed.status, 400);

    const mismatch = await upload({ filename: "x.png", contentType: "image/jpeg", dataUrl: PNG });
    assert.equal(mismatch.status, 422);

    const html = `data:image/png;base64,${Buffer.from("<!doctype html><script>x</script>").toString("base64")}`;
    const polyglot = await upload({ filename: "x.png", contentType: "image/png", dataUrl: html });
    assert.equal(polyglot.status, 422);
  });

  test("stores canonical exact metadata, trusted actor lineage, and uses the quota lock", async () => {
    const storage = memStorage(true);
    const response = await upload({
      filename: "  cover.png  ",
      contentType: "IMAGE/PNG; charset=utf-8",
      dataUrl: PNG,
      uploadedBy: "forged-actor",
    }, storage);
    assert.equal(response.status, 200);
    const body = await response.json() as { asset: PortalAsset };
    assert.equal(body.asset.filename, "cover.png");
    assert.equal(body.asset.contentType, "image/png");
    assert.equal(body.asset.size, PNG_BYTES.byteLength);
    assert.equal(body.asset.dataUrl, PNG);
    assert.equal(body.asset.uploadedBy, "trusted-actor");
    assert.deepEqual(storage.locks, ["website-editor.assets-quota"]);
  });

  test("legacy negative size metadata cannot create quota credit", async () => {
    const storage = memStorage(true);
    const legacy = { id: "asset_legacy", size: -10 } as PortalAsset;
    storage.values.set("assets/index", [legacy.id]);
    storage.values.set(`assets/by-id/${legacy.id}`, legacy);
    const response = await upload({ filename: "x.png", contentType: "image/png", dataUrl: PNG }, storage);
    assert.equal(response.status, 409);
    assert.equal([...storage.values.keys()].filter(key => key.startsWith("assets/by-id/")).length, 1);
  });

  test("fails closed when the storage foundation cannot serialize quota changes", async () => {
    const storage = memStorage(false);
    const response = await upload({ filename: "x.png", contentType: "image/png", dataUrl: PNG }, storage);
    assert.equal(response.status, 503);
    assert.equal(storage.values.size, 0);
  });

  test("concurrent uploads cannot both spend the same remaining quota", async () => {
    const storage = memStorage(false);
    let tail = Promise.resolve();
    storage.runExclusive = <T>(_key: string, operation: () => Promise<T>): Promise<T> => {
      const result = tail.then(operation);
      tail = result.then(() => undefined, () => undefined);
      return result;
    };
    const legacy: PortalAsset = {
      id: "asset_existing", agencyId: "agency-1", clientId: "client-1",
      filename: "existing.png", contentType: "image/png",
      size: PER_CLIENT_CAP_BYTES - PNG_BYTES.byteLength,
      dataUrl: PNG, uploadedAt: 1,
    };
    storage.values.set("assets/index", [legacy.id]);
    storage.values.set(`assets/by-id/${legacy.id}`, legacy);

    const responses = await Promise.all([
      upload({ filename: "one.png", contentType: "image/png", dataUrl: PNG }, storage),
      upload({ filename: "two.png", contentType: "image/png", dataUrl: PNG }, storage),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 413]);
    const index = storage.values.get("assets/index") as string[];
    assert.equal(index.length, 2, "exactly one new asset is indexed");
  });
});

describe("authoritative page block validation", () => {
  test("rejects unsafe/duplicate CSS identities and unsafe block types", () => {
    assert.throws(() => assertValidPageBlockTree([block('x"]{}body{color:red}')]), PageBlockValidationError);
    assert.throws(() => assertValidPageBlockTree([block("same"), block("same")]), PageBlockValidationError);
    assert.throws(
      () => assertValidPageBlockTree([{ id: "safe", type: "text\r\nx-injected:yes", props: {} }]),
      PageBlockValidationError,
    );
  });

  test("rejects excessive block depth and count with an iterative walk", () => {
    let deep = block("depth_33");
    for (let depth = 32; depth >= 1; depth -= 1) {
      deep = { id: `depth_${depth}`, type: "section", props: {}, children: [deep] };
    }
    assert.throws(
      () => assertValidPageBlockTree([deep]),
      (error: unknown) => error instanceof PageBlockValidationError && error.reason === "depth-limit",
    );
    const many = Array.from({ length: MAX_PAGE_BLOCKS + 1 }, (_, index) => block(`block_${index}`));
    assert.throws(
      () => assertValidPageBlockTree(many),
      (error: unknown) => error instanceof PageBlockValidationError && error.reason === "block-limit",
    );
  });

  test("rejects aggregate inline-media and style exhaustion", () => {
    const full = Buffer.alloc(MAX_PUBLIC_MEDIA_BYTES);
    PNG_BYTES.copy(full, 0);
    const oneMiB = `data:image/png;base64,${full.toString("base64")}`;
    const copies = Math.floor(MAX_PAGE_INLINE_MEDIA_BYTES / MAX_PUBLIC_MEDIA_BYTES) + 1;
    const props = Object.fromEntries(Array.from({ length: copies }, (_, index) => [`src${index}`, oneMiB]));
    assert.throws(
      () => assertValidPageBlockTree([block("media", props)]),
      (error: unknown) => error instanceof PageBlockValidationError && error.reason === "inline-media-limit",
    );
    assert.throws(
      () => assertValidPageBlockTree([{ ...block("style"), styles: { customCss: "x".repeat(MAX_PAGE_STYLE_BYTES + 1) } }]),
      (error: unknown) => error instanceof PageBlockValidationError && error.reason === "style-limit",
    );
  });

  test("create, legacy read, and static render all fail closed at the same validator", async () => {
    const storage = memStorage();
    await assert.rejects(
      () => createPage(storage, {
        agencyId: "agency-1" as never,
        clientId: "client-1" as never,
        siteId: "site-1",
        title: "Unsafe",
        blocks: [block('bad"]{}')],
      }),
      PageBlockValidationError,
    );
    assert.equal(storage.values.size, 0, "invalid create must not persist page or index");

    const badPage = {
      id: "page-1", agencyId: "agency-1", clientId: "client-1", siteId: "site-1",
      title: "Legacy", slug: "legacy", status: "published", createdAt: 1, updatedAt: 1,
      blocks: [block('bad"]{}')],
    } as EditorPage;
    storage.values.set(storageKeys.page("agency-1" as never, "client-1" as never, "site-1", "page-1"), badPage);
    await assert.rejects(
      () => getPage(storage, "agency-1" as never, "client-1" as never, "site-1", "page-1"),
      PageBlockValidationError,
    );
    assert.throws(() => renderPageHtml(badPage, { brandCssHref: "brand.css" }), PageBlockValidationError);
  });
});

describe("CSS identity containment", () => {
  test("safe IDs produce scopes and hostile IDs produce no CSS", () => {
    const hostile = 'x"]{}@keyframes owned{from{opacity:0}}/*';
    assert.equal(isSafeBlockId("b_safe-1"), true);
    assert.equal(blockCssScopeId("nav", "b_safe-1"), "nav-b_safe-1");
    assert.equal(isSafeBlockId(hostile), false);
    assert.equal(blockCssScopeId("nav", hostile), null);
    assert.equal(hoverStylesFor(hostile, "wiggle"), null);

  });

  test("every block-ID CSS renderer is wired to the same identity contract", () => {
    const checks = [
      ["src/engines/editor/elements/BlockRenderer.tsx", /isSafeBlockId\(block\.id\)/],
      ["src/built-ins/modules/website-editor/src/components/blocks/ButtonBlock.tsx", /isSafeBlockId\(id\)/],
      ["src/built-ins/modules/website-editor/src/components/blocks/FooterBlock.tsx", /blockCssScopeId\("footer", block\.id\)/],
      ["src/built-ins/modules/website-editor/src/components/blocks/MarqueeBlock.tsx", /blockCssScopeId\("marquee", block\.id\)/],
      ["src/built-ins/modules/website-editor/src/components/blocks/NavbarBlock.tsx", /blockCssScopeId\("nav", block\.id\)/],
    ] as const;
    for (const [path, pattern] of checks) assert.match(readFileSync(path, "utf8"), pattern, path);
  });
});
