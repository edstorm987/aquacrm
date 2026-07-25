// Smoke — R029 Custom CSS / head injection.

import {
  validateCustomCode,
  buildCustomCodeHead,
  CUSTOM_CSS_MAX_BYTES,
  CUSTOM_HEAD_MAX_BYTES,
} from "../lib/customCode";
import {
  handleGetCustomCode,
  handleSetCustomCode,
} from "../api/handlers/customCode";
import { createPage } from "../server/pages";
import { getOrCreateDefaultSite } from "../server/sites";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";

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

(async () => {
  expect("CUSTOM_CSS_MAX_BYTES = 8192",
    CUSTOM_CSS_MAX_BYTES === 8 * 1024);
  expect("CUSTOM_HEAD_MAX_BYTES = 4096",
    CUSTOM_HEAD_MAX_BYTES === 4 * 1024);

  // ─── A: validateCustomCode CSS ─────────────────────────────────────────
  const okCss = validateCustomCode(":root { --x: red; }", "css");
  expect("CSS valid passes", okCss.ok && typeof okCss.sizeBytes === "number");

  const tooBigCss = validateCustomCode("a".repeat(CUSTOM_CSS_MAX_BYTES + 1), "css");
  expect("CSS too-large fails", !tooBigCss.ok && tooBigCss.reason === "too-large");

  const scriptCss = validateCustomCode(":root { --x: red; } <script>alert(1)</script>", "css");
  expect("CSS with <script> fails (script-detected)",
    !scriptCss.ok && scriptCss.reason === "script-detected");

  // CSS allows iframe selectors (e.g. iframe { width: 100% })
  const iframeSelectorCss = validateCustomCode("iframe { width: 100%; }", "css");
  expect("CSS with iframe-selector passes (only HTML iframe blocked, not selector)",
    iframeSelectorCss.ok);

  // UTF-8 byte length: a 2-byte rune counts as 2.
  const multibyte = "—".repeat(2000); // em-dash ≈ 3 bytes each → ~6 KiB
  const mbResult = validateCustomCode(multibyte, "css");
  expect("multibyte chars counted in bytes (em-dash × 2000 fits under 8 KiB)",
    mbResult.ok && mbResult.sizeBytes >= 4000);

  // ─── B: validateCustomCode head ────────────────────────────────────────
  const okHead = validateCustomCode('<link rel="preconnect" href="https://fonts.googleapis.com">', "head");
  expect("head <link> valid passes", okHead.ok);

  const tooBigHead = validateCustomCode("a".repeat(CUSTOM_HEAD_MAX_BYTES + 1), "head");
  expect("head too-large fails",
    !tooBigHead.ok && tooBigHead.reason === "too-large");

  const scriptHead = validateCustomCode("<script>x</script>", "head");
  expect("head <script> fails",
    !scriptHead.ok && scriptHead.reason === "script-detected");

  const iframeHead = validateCustomCode('<iframe src="x"></iframe>', "head");
  expect("head <iframe> fails (iframe-detected)",
    !iframeHead.ok && iframeHead.reason === "iframe-detected");

  const jsUriHead = validateCustomCode('<link href="javascript:alert(1)">', "head");
  expect("head javascript: URI fails",
    !jsUriHead.ok && jsUriHead.reason === "javascript-uri");

  // Sneaky variants — different attribute, casing, whitespace.
  expect("head onclick javascript: detected",
    !validateCustomCode('<link onclick="javascript:bad">', "head").ok);
  expect("head case-insensitive script detection",
    !validateCustomCode("<SCRIPT>x</SCRIPT>", "head").ok);

  // ─── C: buildCustomCodeHead ────────────────────────────────────────────
  const headOnlyBrand = buildCustomCodeHead({
    brandCss: ":root { --brand-primary: #f00; }",
  });
  expect("brand-only emits a single <style> with brand vars",
    headOnlyBrand.includes("<style data-aqua=\"custom-code\">") &&
    headOnlyBrand.includes("--brand-primary: #f00"));

  const both = buildCustomCodeHead({
    brandCss: ":root { --brand-primary: #f00; }",
    customCss: ".my-class { color: blue; }",
  });
  expect("brand + custom CSS interleaved (brand first, custom second)",
    both.indexOf("--brand-primary") < both.indexOf(".my-class"));
  expect("brand + custom in single <style> block",
    (both.match(/<style/g) ?? []).length === 1);

  const headFrag = buildCustomCodeHead({
    customHead: '<link rel="preconnect" href="https://x">',
  });
  expect("head fragment emits with comment marker",
    headFrag.includes("<!-- aqua: custom head -->") &&
    headFrag.includes('<link rel="preconnect"'));

  const empty = buildCustomCodeHead({});
  expect("empty input → empty string", empty === "");

  // ─── D: HTTP handlers ─────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const site = await getOrCreateDefaultSite(ctxStorage, a, c, c);
  const page = await createPage(ctxStorage, {
    siteId: site.id, agencyId: a, clientId: c,
    title: "Home", slug: "/home", blocks: [],
  });
  const ctx = {
    agencyId: a, clientId: c, actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleSetCustomCode>[1];

  // GET initial — empty + caps surfaced.
  const get0 = await handleGetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=${page.id}`), ctx,
  );
  expect("GET 200", get0.status === 200);
  const get0Body = await get0.json() as { customCss: string; customHead: string; caps: { css: number; head: number } };
  expect("GET initial empty + caps surfaced",
    get0Body.customCss === "" && get0Body.customHead === "" &&
    get0Body.caps.css === CUSTOM_CSS_MAX_BYTES && get0Body.caps.head === CUSTOM_HEAD_MAX_BYTES);

  // POST CSS only.
  const setCss = await handleSetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customCss: ".my { color: red; }" }),
    }), ctx,
  );
  expect("POST CSS-only 200", setCss.status === 200);
  const setCssBody = await setCss.json() as { customCss: string };
  expect("POST persisted CSS",
    setCssBody.customCss === ".my { color: red; }");

  // POST head only.
  const setHead = await handleSetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customHead: '<link rel="preconnect" href="https://fonts.googleapis.com">' }),
    }), ctx,
  );
  expect("POST head-only 200", setHead.status === 200);
  const setHeadBody = await setHead.json() as { customHead: string };
  expect("POST persisted head + earlier CSS still present",
    setHeadBody.customHead.includes("preconnect"));

  // POST 400 for too-large.
  const tooBig = await handleSetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customCss: "a".repeat(CUSTOM_CSS_MAX_BYTES + 1) }),
    }), ctx,
  );
  expect("POST too-large CSS → 400", tooBig.status === 400);

  // POST 400 for script.
  const script = await handleSetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customCss: "<script>x</script>" }),
    }), ctx,
  );
  expect("POST <script> in CSS → 400", script.status === 400);

  // POST 400 for empty body.
  const emptyBody = await handleSetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }), ctx,
  );
  expect("POST empty body → 400", emptyBody.status === 400);

  // POST iframe in head → 400.
  const iframeBad = await handleSetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customHead: "<iframe></iframe>" }),
    }), ctx,
  );
  expect("POST iframe in head → 400", iframeBad.status === 400);

  // GET / SET 404 missing.
  const get404 = await handleGetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=page_nope`), ctx,
  );
  expect("GET unknown page → 404", get404.status === 404);
  const set404 = await handleSetCustomCode(
    new Request(`http://x/pages/custom-code?siteId=${site.id}&id=page_nope`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customCss: ":root{}" }),
    }), ctx,
  );
  expect("POST unknown page → 404", set404.status === 404);

  // GET / SET missing siteId or id → 400.
  const noSite = await handleGetCustomCode(
    new Request(`http://x/pages/custom-code?id=${page.id}`), ctx,
  );
  expect("GET without siteId → 400", noSite.status === 400);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
