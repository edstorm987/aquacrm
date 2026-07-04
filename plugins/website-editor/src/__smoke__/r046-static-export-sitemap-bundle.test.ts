// Smoke — R046 static export sitemap bundle (R036 advanced).

import type { PluginStorage } from "../lib/aquaPluginTypes";
import { exportSiteToZip } from "../server/staticExport";
import { createSite } from "../server/sites";
import { createPage, updatePage, publishPage } from "../server/pages";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

const AGENCY = "ag_t3";
const CLIENT = "cl_t3";
const BASE = "https://example.com";

// ZIP local-file-headers carry the file name in plain ASCII; we can
// scan for known names without parsing the full archive. Each entry
// starts with the local-file signature `PK\x03\x04`.
function zipNames(zip: Uint8Array): string[] {
  const out: string[] = [];
  const td = new TextDecoder("utf-8");
  for (let i = 0; i + 30 < zip.length; i++) {
    if (zip[i] === 0x50 && zip[i+1] === 0x4b && zip[i+2] === 0x03 && zip[i+3] === 0x04) {
      const nameLen = zip[i+26]! | (zip[i+27]! << 8);
      const extraLen = zip[i+28]! | (zip[i+29]! << 8);
      const name = td.decode(zip.subarray(i + 30, i + 30 + nameLen));
      out.push(name);
      i += 30 + nameLen + extraLen - 1;
    }
  }
  return out;
}

// Pull the bytes of a named entry. Skips the local-file header,
// reads compressedSize bytes, decompresses (store-only — no compress).
function zipEntry(zip: Uint8Array, name: string): string | null {
  const td = new TextDecoder("utf-8");
  for (let i = 0; i + 30 < zip.length; i++) {
    if (zip[i] === 0x50 && zip[i+1] === 0x4b && zip[i+2] === 0x03 && zip[i+3] === 0x04) {
      const compressedSize = (zip[i+18]! | (zip[i+19]! << 8) | (zip[i+20]! << 16) | (zip[i+21]! << 24)) >>> 0;
      const nameLen = zip[i+26]! | (zip[i+27]! << 8);
      const extraLen = zip[i+28]! | (zip[i+29]! << 8);
      const entryName = td.decode(zip.subarray(i + 30, i + 30 + nameLen));
      if (entryName === name) {
        const dataStart = i + 30 + nameLen + extraLen;
        return td.decode(zip.subarray(dataStart, dataStart + compressedSize));
      }
      i += 30 + nameLen + extraLen + compressedSize - 1;
    }
  }
  return null;
}

async function exportFor(): Promise<{ storage: PluginStorage; siteId: string; zip: Uint8Array }> {
  const storage = memStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY, clientId: CLIENT, name: "S", slug: "s",
  });
  return { storage, siteId: site.id, zip: new Uint8Array() };
}

async function pubPage(storage: PluginStorage, siteId: string, slug: string, patch: Record<string, unknown> = {}) {
  const p = await createPage(storage, {
    agencyId: AGENCY, clientId: CLIENT, siteId, slug, title: slug,
  });
  if (Object.keys(patch).length > 0) {
    await updatePage(storage, AGENCY, CLIENT, siteId, p.id, patch as any);
  }
  await publishPage(storage, AGENCY, CLIENT, siteId, p.id);
  return p;
}

(async () => {
  console.log("§ Static export sitemap bundle");

  // ─── A: bundle has sitemap + robots ──────────────────────────────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/");
    await pubPage(storage, siteId, "/about");
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const names = zipNames(r.zip);
    expect("sitemap.xml present", names.includes("sitemap.xml"));
    expect("robots.txt present", names.includes("robots.txt"));
    expect("README.txt present", names.includes("README.txt"));
  }

  // ─── B: sitemap uses R036 advanced shape ────────────────────────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/about");
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const xml = zipEntry(r.zip, "sitemap.xml") ?? "";
    expect("sitemap declared",
      xml.includes("<?xml") && xml.includes("<urlset"));
    expect("priority element present (R036 advanced shape)",
      xml.includes("<priority>"));
    expect("changefreq element present",
      xml.includes("<changefreq>"));
    expect("/about emitted as full URL",
      xml.includes(`${BASE}/about`));
  }

  // ─── C: drafts excluded ──────────────────────────────────────────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/published");
    // Draft never published
    await createPage(storage, {
      agencyId: AGENCY, clientId: CLIENT, siteId, slug: "/draft", title: "draft",
    });
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const xml = zipEntry(r.zip, "sitemap.xml") ?? "";
    expect("/published in bundled sitemap", xml.includes("/published"));
    expect("/draft NOT in bundled sitemap", !xml.includes("/draft"));
  }

  // ─── D: redirect-source filter ──────────────────────────────────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/about-us", {
      redirectSourceSlugs: ["/about"],
    });
    await pubPage(storage, siteId, "/about");  // sentinel
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const xml = zipEntry(r.zip, "sitemap.xml") ?? "";
    expect("redirect target /about-us in bundle", xml.includes("/about-us"));
    expect("redirect SOURCE /about excluded",
      !/<loc>[^<]*\/about<\/loc>/.test(xml));
  }

  // ─── E: noIndex + privacy filters ───────────────────────────────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/visible");
    await pubPage(storage, siteId, "/hidden", { seo: { noIndex: true } });
    await pubPage(storage, siteId, "/private", { privacy: "password" });
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const xml = zipEntry(r.zip, "sitemap.xml") ?? "";
    expect("/visible in bundle", xml.includes("/visible"));
    expect("/hidden (noIndex) excluded", !xml.includes("/hidden"));
    expect("/private (password) excluded", !xml.includes("/private"));
  }

  // ─── F: robots advanced shape ────────────────────────────────────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/");
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const txt = zipEntry(r.zip, "robots.txt") ?? "";
    expect("robots points at /sitemap.xml",
      txt.includes(`Sitemap: ${BASE}/sitemap.xml`));
    expect("robots disallows /admin", /^Disallow:\s*\/admin/m.test(txt));
    expect("robots disallows /api", /^Disallow:\s*\/api/m.test(txt));
  }

  // ─── G: per-locale sitemaps ─────────────────────────────────────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/", {
      locales: { defaultLocale: "en", locales: { en: { slug: "/" }, fr: { slug: "/" } } },
    });
    await pubPage(storage, siteId, "/about", {
      locales: { defaultLocale: "en", locales: { en: { slug: "/about" }, fr: { slug: "/a-propos" } } },
    });
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const names = zipNames(r.zip);
    expect("sitemap-en.xml bundled", names.includes("sitemap-en.xml"));
    expect("sitemap-fr.xml bundled", names.includes("sitemap-fr.xml"));
    const fr = zipEntry(r.zip, "sitemap-fr.xml") ?? "";
    expect("fr sitemap is well-formed urlset",
      fr.includes("<urlset") && fr.includes("</urlset>"));
  }

  // ─── H: no-locale site ships only sitemap.xml + robots.txt ──────────
  {
    const { storage, siteId } = await exportFor();
    await pubPage(storage, siteId, "/only");
    const r = await exportSiteToZip({ storage, agencyId: AGENCY, clientId: CLIENT, siteId, baseUrl: BASE });
    const names = zipNames(r.zip);
    const localeSitemaps = names.filter(n => /^sitemap-[a-z]{2}/.test(n));
    expect("no per-locale sitemaps when site has no locales",
      localeSitemaps.length === 0);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
