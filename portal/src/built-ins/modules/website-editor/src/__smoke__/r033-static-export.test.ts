// Smoke — R033 Static site export.
//
// Asserts:
//   - exportSiteToZip emits a valid store-only ZIP (PK\x03\x04 magic, EOCD)
//   - homepage exports as `index.html` with title + content
//   - non-home pages export as `<slug>/index.html` with brand.css link
//   - draft + portal-variant + underscore-prefixed pages are excluded
//   - sitemap.xml + robots.txt + README.txt + brand.css present
//   - HTML escapes user content (no XSS via heading text or button label)
//   - handler returns 200 + content-type application/zip + headers
//   - handler 400s without siteId

import {
  exportSiteToZip, renderBlockToHtml, renderPageHtml, buildZip,
} from "../server/staticExport";
import { handleExportSite } from "../api/handlers/staticExport";
import { createPage, publishPage, updatePage } from "../server/pages";
import type { PluginStorage, PluginCtx } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId, BrandKit } from "../lib/tenancy";
import type { Block } from "../types/block";

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

const a = "ag_smoke" as AgencyId;
const c = "cl_smoke" as ClientId;
const siteId = "site_smoke";

function decode(buf: Uint8Array, start: number, len: number): string {
  return new TextDecoder().decode(buf.subarray(start, start + len));
}

function findEntry(zip: Uint8Array, name: string): { offset: number; size: number } | null {
  // Walk local file headers.
  let p = 0;
  while (p + 30 <= zip.length) {
    const view = new DataView(zip.buffer, zip.byteOffset + p, 30);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const size = view.getUint32(18, true);
    const nameLen = view.getUint16(26, true);
    const extraLen = view.getUint16(28, true);
    const entryName = decode(zip, p + 30, nameLen);
    if (entryName === name) {
      return { offset: p + 30 + nameLen + extraLen, size };
    }
    p += 30 + nameLen + extraLen + size;
  }
  return null;
}

(async () => {
  // ─── Block renderer escape ─────────────────────────────────────────────
  const evil: Block = {
    id: "b1", type: "heading",
    props: { text: '<script>alert("xss")</script>', level: 1 },
  };
  const html = renderBlockToHtml(evil);
  expect("heading escapes <script>", !html.includes("<script>") && html.includes("&lt;script&gt;"));

  const btn: Block = { id: "b2", type: "button", props: { text: "Buy", href: "/checkout" } };
  expect("button with href → anchor", renderBlockToHtml(btn).startsWith("<a "));

  const img: Block = { id: "b3", type: "image", props: { src: "/x.png", alt: "x" } };
  expect("image renders <img>", /^<img/.test(renderBlockToHtml(img)));

  // ─── Page render ───────────────────────────────────────────────────────
  const page = renderPageHtml({
    id: "p1", siteId, agencyId: a, clientId: c, slug: "/", title: "Home",
    status: "published", isHomepage: true, blocks: [evil, btn], createdAt: 0, updatedAt: 0,
  } as never, { brandCssHref: "assets/brand.css" });
  expect("page has doctype", page.startsWith("<!doctype html>"));
  expect("page links brand.css", page.includes('href="assets/brand.css"'));
  expect("page title injected", page.includes("<title>Home</title>"));

  // ─── ZIP magic ─────────────────────────────────────────────────────────
  const zip = buildZip([{ name: "hello.txt", data: new TextEncoder().encode("hi") }]);
  expect("ZIP starts with PK\\x03\\x04", zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 0x03 && zip[3] === 0x04);
  expect("ZIP ends with EOCD signature",
    zip[zip.length - 22] === 0x50 && zip[zip.length - 21] === 0x4b &&
    zip[zip.length - 20] === 0x05 && zip[zip.length - 19] === 0x06);
  const helloEntry = findEntry(zip, "hello.txt");
  expect("hello.txt locatable", helloEntry !== null);
  if (helloEntry) {
    const body = decode(zip, helloEntry.offset, helloEntry.size);
    expect("hello.txt content == 'hi'", body === "hi");
  }

  // ─── End-to-end exportSiteToZip ────────────────────────────────────────
  const storage = memStorage();
  const home = await createPage(storage, {
    agencyId: a, clientId: c, siteId, slug: "/", title: "Home", isHomepage: true,
    blocks: [{ id: "h1", type: "heading", props: { text: "Welcome", level: 1 } }],
  } as never);
  await publishPage(storage, a, c, siteId, home.id);

  const about = await createPage(storage, {
    agencyId: a, clientId: c, siteId, slug: "/about", title: "About",
    blocks: [{ id: "h2", type: "text", props: { text: "<b>raw & wild</b>" } }],
  } as never);
  await publishPage(storage, a, c, siteId, about.id);

  // Draft page — should be excluded.
  await createPage(storage, {
    agencyId: a, clientId: c, siteId, slug: "/draft-only", title: "Draft", blocks: [],
  } as never);

  // Portal variant — should be excluded.
  const portal = await createPage(storage, {
    agencyId: a, clientId: c, siteId, slug: "/login", title: "Login",
    portalRole: "login", blocks: [],
  } as never);
  await publishPage(storage, a, c, siteId, portal.id);

  // Underscore-prefixed slug — excluded.
  const internal = await createPage(storage, {
    agencyId: a, clientId: c, siteId, slug: "_internal", title: "Internal", blocks: [],
  } as never);
  await publishPage(storage, a, c, siteId, internal.id);

  const brand: BrandKit = { primaryColor: "#0ea5e9", accentColor: "#f97316" };
  const result = await exportSiteToZip({
    storage, agencyId: a, clientId: c, siteId,
    baseUrl: "https://example.com", brandKit: brand,
  });

  expect("page count = 2 (home + about)", result.pageCount === 2);
  expect("file count = 6 (brand + 2 html + sitemap + robots + readme)", result.fileCount === 6);

  expect("zip contains index.html", findEntry(result.zip, "index.html") !== null);
  expect("zip contains about/index.html", findEntry(result.zip, "about/index.html") !== null);
  expect("zip contains assets/brand.css", findEntry(result.zip, "assets/brand.css") !== null);
  expect("zip contains sitemap.xml", findEntry(result.zip, "sitemap.xml") !== null);
  expect("zip contains robots.txt", findEntry(result.zip, "robots.txt") !== null);
  expect("zip contains README.txt", findEntry(result.zip, "README.txt") !== null);
  expect("zip excludes draft-only/index.html", findEntry(result.zip, "draft-only/index.html") === null);
  expect("zip excludes login/index.html (portal)", findEntry(result.zip, "login/index.html") === null);

  const aboutEntry = findEntry(result.zip, "about/index.html")!;
  const aboutHtml = decode(result.zip, aboutEntry.offset, aboutEntry.size);
  expect("non-home page links ../assets/brand.css", aboutHtml.includes('href="../assets/brand.css"'));
  expect("about page escapes raw HTML in text", aboutHtml.includes("&lt;b&gt;raw &amp; wild&lt;/b&gt;"));

  const sitemapEntry = findEntry(result.zip, "sitemap.xml")!;
  const sitemap = decode(result.zip, sitemapEntry.offset, sitemapEntry.size);
  expect("sitemap lists / and /about", sitemap.includes("https://example.com/") && sitemap.includes("https://example.com/about"));
  expect("sitemap excludes /login (portal)", !sitemap.includes("https://example.com/login"));

  const readmeEntry = findEntry(result.zip, "README.txt")!;
  const readme = decode(result.zip, readmeEntry.offset, readmeEntry.size);
  expect("README warns forms won't work", readme.includes("Form submissions"));
  expect("README warns commerce won't work", readme.includes("Commerce"));

  const brandEntry = findEntry(result.zip, "assets/brand.css")!;
  const css = decode(result.zip, brandEntry.offset, brandEntry.size);
  expect("brand.css uses primaryColor", css.includes("#0ea5e9"));
  expect("brand.css uses accentColor", css.includes("#f97316"));

  // ─── Handler ───────────────────────────────────────────────────────────
  const ctx: PluginCtx = {
    storage, agencyId: a, clientId: c,
  } as unknown as PluginCtx;

  const noSite = await handleExportSite(new Request("http://x/export"), ctx);
  expect("handler 400 without siteId", noSite.status === 400);

  const goodReq = new Request(`http://x/export?siteId=${siteId}&baseUrl=https%3A%2F%2Fexample.com`);
  const good = await handleExportSite(goodReq, ctx);
  expect("handler 200", good.status === 200);
  expect("handler content-type application/zip", good.headers.get("content-type") === "application/zip");
  expect("handler exposes page count header", good.headers.get("x-aqua-export-pages") === "2");
  expect("handler sets attachment disposition",
    (good.headers.get("content-disposition") ?? "").startsWith("attachment;"));
  const bytes = new Uint8Array(await good.arrayBuffer());
  expect("handler body is a ZIP", bytes[0] === 0x50 && bytes[1] === 0x4b);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
