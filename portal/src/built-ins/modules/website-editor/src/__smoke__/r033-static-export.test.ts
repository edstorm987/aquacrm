// Smoke — R033 Static site export.
//
// @smoke-conditions react-server
//
// The directive above is read by `scripts/run-website-editor-smoke.mjs`. This
// file reaches `handleExportSite`, which resolves the client's Supabase target
// through a portal module guarded by `server-only` — without the react-server
// resolution that package throws on import and the whole file dies before its
// first assertion. Most sibling smokes need the opposite (they render client
// components), which is why it is per-file rather than global.
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
import { PAGE_TEMPLATES } from "../components/pageTemplates";
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
  // The README no longer carries the old "Form submissions (contact-form, …)"
  // line — forms ARE rendered now, honestly, and this assertion had been
  // pinning a string the rewritten README stopped emitting.
  expect("README says unconnected forms are not connected", readme.includes("NOT connected"));
  expect("README warns commerce won't work", readme.includes("Commerce"));
  expect("README lists nothing dropped for a fully-supported site",
    !readme.includes("CANNOT reproduce"));

  const brandEntry = findEntry(result.zip, "assets/brand.css")!;
  const css = decode(result.zip, brandEntry.offset, brandEntry.size);
  expect("brand.css uses primaryColor", css.includes("#0ea5e9"));
  expect("brand.css uses accentColor", css.includes("#f97316"));

  // ─── First-party template parity ───────────────────────────────────────
  //
  // The acceptance line is "compare a representative published page with its
  // exported HTML". The representative page is the one the product itself
  // offers: the Homepage starter template. Before this contract existed its
  // hero, testimonials and CTA exported as EMPTY `<div data-block-type>`
  // shells — the renderer only knew how to read `props.text`, and these blocks
  // carry `headline` / `items` — with nothing on the page or in the README
  // saying anything had been lost.
  const homepageTemplate = PAGE_TEMPLATES.find(t => t.id === "homepage")!;
  expect("first-party Homepage template exists", homepageTemplate !== undefined);

  const tplStorage = memStorage();
  const tplSiteId = "site_template";
  const tplHome = await createPage(tplStorage, {
    agencyId: a, clientId: c, siteId: tplSiteId, slug: "/", title: "Home",
    isHomepage: true, blocks: homepageTemplate.build(),
  } as never);
  await publishPage(tplStorage, a, c, tplSiteId, tplHome.id);

  const tplResult = await exportSiteToZip({
    storage: tplStorage, agencyId: a, clientId: c, siteId: tplSiteId,
    baseUrl: "https://example.com",
  });
  const tplEntry = findEntry(tplResult.zip, "index.html")!;
  const tplHtml = decode(tplResult.zip, tplEntry.offset, tplEntry.size);

  expect("hero eyebrow survives export", tplHtml.includes("Welcome"));
  expect("hero headline survives export", tplHtml.includes("Build something beautiful"));
  expect("hero subhead survives export", tplHtml.includes("value proposition"));
  expect("hero CTA becomes a real link",
    tplHtml.includes('href="/shop"') && tplHtml.includes("Shop now"));
  expect("section heading survives export", tplHtml.includes("Featured products"));
  expect("testimonials title survives export", tplHtml.includes("Loved by our customers"));
  expect("testimonial quote survives export",
    tplHtml.includes("This is the future of skincare."));
  expect("second testimonial quote survives export",
    tplHtml.includes("Shipped my whole site in a day."));
  expect("testimonial attribution survives export", tplHtml.includes("Felicia"));
  expect("cta headline survives export", tplHtml.includes("Ready to start?"));
  expect("cta link survives export",
    tplHtml.includes('href="/account"') && tplHtml.includes("Get started"));
  // Parity includes heading level: HeroBlock renders h1, CtaBlock renders h2.
  // Exporting both as h1 gives the client's page two h1s the live page has not.
  expect("hero headline is the page's h1", tplHtml.includes("<h1>Build something beautiful</h1>"));
  expect("cta headline is an h2, as CtaBlock renders it",
    tplHtml.includes("<h2>Ready to start?</h2>"));
  expect("the exported page has exactly one h1", (tplHtml.match(/<h1[ >]/g) ?? []).length === 1);
  expect("no block exports as an empty shell",
    !/data-block-type="(hero|cta|testimonials)"[^>]*><\/(div|section)>/.test(tplHtml));

  // The block a static bundle genuinely cannot reproduce must be REJECTED
  // VISIBLY — a note naming it — rather than leaving a silent gap.
  expect("product-grid is marked unsupported in the HTML",
    tplHtml.includes('data-block-type="product-grid" data-aqua-export="unsupported"'));
  expect("product-grid rejection is visible to a reader",
    tplHtml.includes("needs the live site") && tplHtml.includes("not included in this static export"));
  expect("export reports the block types it could not reproduce",
    tplResult.unexportableBlockTypes.includes("product-grid"));
  expect("export does not report supported blocks as dropped",
    !tplResult.unexportableBlockTypes.includes("hero") &&
    !tplResult.unexportableBlockTypes.includes("testimonials"));

  const tplReadmeEntry = findEntry(tplResult.zip, "README.txt")!;
  const tplReadme = decode(tplResult.zip, tplReadmeEntry.offset, tplReadmeEntry.size);
  expect("README warns that blocks were dropped", tplReadme.includes("CANNOT reproduce"));
  expect("README names the dropped block type", tplReadme.includes("- product-grid"));

  // The Contact template deliberately ships `action: ""` (issue #29). The
  // exported form must say so and refuse to submit, not present a Send button
  // that throws the visitor's message away.
  const contactTemplate = PAGE_TEMPLATES.find(t => t.id === "contact")!;
  const contactHtml = contactTemplate.build().map(b => renderBlockToHtml(b)).join("\n");
  expect("template form renders its fields",
    contactHtml.includes('name="message"') && contactHtml.includes('name="email"'));
  expect("template form with no destination says so",
    contactHtml.includes("no destination yet"));
  expect("template form with no destination cannot be submitted",
    /<button type="submit" disabled>/.test(contactHtml));

  const wiredForm: Block = {
    id: "f1", type: "form",
    props: {
      title: "Send us a message", action: "https://forms.example/submit", submitLabel: "Send",
      fields: [{ name: "email", label: "Email", type: "email", required: true }],
    },
  };
  const wiredHtml = renderBlockToHtml(wiredForm);
  expect("a form with a destination posts to it",
    wiredHtml.includes('action="https://forms.example/submit"') && wiredHtml.includes('method="post"'));
  expect("a form with a destination is submittable",
    !/<button type="submit" disabled>/.test(wiredHtml));

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
  expect("handler reports zero unsupported blocks for a fully-supported site",
    good.headers.get("x-aqua-export-unsupported-blocks") === "0");

  // A caller reading only the status code would call the template export a
  // success. The headers make the shortfall impossible to miss.
  const tplCtx: PluginCtx = {
    storage: tplStorage, agencyId: a, clientId: c,
  } as unknown as PluginCtx;
  const tplRes = await handleExportSite(
    new Request(`http://x/export?siteId=${tplSiteId}`), tplCtx,
  );
  expect("handler counts unsupported blocks",
    tplRes.headers.get("x-aqua-export-unsupported-blocks") === "1");
  expect("handler names the unsupported block types",
    (tplRes.headers.get("x-aqua-export-unsupported-block-types") ?? "").includes("product-grid"));

  // `Block.type` is an open string and page trees are stored unvalidated, so a
  // stored type can carry a CR/LF. Putting that straight into a response header
  // makes `new Response()` throw, and a working export would 500 for the sake of
  // a diagnostic header. The download must survive its own reporting.
  const hostileStorage = memStorage();
  const hostileSiteId = "site_hostile";
  const hostile = await createPage(hostileStorage, {
    agencyId: a, clientId: c, siteId: hostileSiteId, slug: "/", title: "Home",
    isHomepage: true,
    blocks: [{ id: "x1", type: "evil\r\nx-injected: yes", props: {} } as Block],
  } as never);
  await publishPage(hostileStorage, a, c, hostileSiteId, hostile.id);
  const hostileRes = await handleExportSite(
    new Request(`http://x/export?siteId=${hostileSiteId}`),
    { storage: hostileStorage, agencyId: a, clientId: c } as unknown as PluginCtx,
  );
  expect("a block type containing CRLF does not 500 the export", hostileRes.status === 200);
  expect("and does not inject a header", hostileRes.headers.get("x-injected") === null);
  expect("the count still reports the block was dropped",
    hostileRes.headers.get("x-aqua-export-unsupported-blocks") === "1");

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
