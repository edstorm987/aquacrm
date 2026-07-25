// Smoke — R044 sitemap.xml + robots.txt host routes (R036 advanced).

import {
  handleAdvancedSitemapXml,
  handleAdvancedRobotsTxt,
  handleLocaleSitemapXml,
} from "../api/handlers/sitemapHostRoutes";
import type { PluginStorage } from "../lib/aquaPluginTypes";
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

function makeCtx(): any {
  return {
    agencyId: AGENCY,
    clientId: CLIENT,
    actor: "u_t3",
    storage: memStorage(),
    services: {},
    install: { config: {} },
  };
}

async function seedPublished(
  storage: PluginStorage,
  siteId: string,
  slug: string,
  patch: Record<string, unknown> = {},
) {
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
  console.log("§ Sitemap host route");

  // ─── A: empty (no sites yet) ─────────────────────────────────────────
  {
    const ctx = makeCtx();
    const res = await handleAdvancedSitemapXml(
      new Request("https://example.com/sitemap.xml"), ctx,
    );
    expect("empty: 200 + application/xml",
      res.status === 200 &&
      (res.headers.get("content-type") ?? "").startsWith("application/xml"));
    expect("cache-control includes max-age + s-maxage",
      (res.headers.get("cache-control") ?? "").includes("max-age=300") &&
      (res.headers.get("cache-control") ?? "").includes("s-maxage=600"));
    const xml = await res.text();
    expect("empty body still wraps urlset",
      xml.includes("<urlset") && xml.includes("</urlset>"));
  }

  // ─── B: published-only filter ────────────────────────────────────────
  {
    const ctx = makeCtx();
    const site = await createSite(ctx.storage, {
      agencyId: AGENCY, clientId: CLIENT, name: "S", slug: "s",
    });
    // Draft (created but never published)
    await createPage(ctx.storage, {
      agencyId: AGENCY, clientId: CLIENT, siteId: site.id,
      slug: "/draft", title: "Draft",
    });
    await seedPublished(ctx.storage, site.id, "/pub");
    const res = await handleAdvancedSitemapXml(
      new Request("https://example.com/sitemap.xml"), ctx,
    );
    const xml = await res.text();
    expect("published page in sitemap", xml.includes("/pub"));
    expect("draft page NOT in sitemap", !xml.includes("/draft"));
  }

  // ─── C: redirect-source filter ───────────────────────────────────────
  {
    const ctx = makeCtx();
    const site = await createSite(ctx.storage, {
      agencyId: AGENCY, clientId: CLIENT, name: "S2", slug: "s2",
    });
    await seedPublished(ctx.storage, site.id, "/about-us", {
      redirectSourceSlugs: ["/about"],
    });
    // Sentinel: page that lives at the redirect SOURCE slug should
    // also be excluded from the sitemap.
    await seedPublished(ctx.storage, site.id, "/about");
    const res = await handleAdvancedSitemapXml(
      new Request("https://example.com/sitemap.xml"), ctx,
    );
    const xml = await res.text();
    expect("redirect target /about-us in sitemap",
      xml.includes("/about-us"));
    expect("redirect SOURCE /about excluded from sitemap",
      !/<loc>[^<]*\/about<\/loc>/.test(xml));
  }

  // ─── D: noIndex + privacy filters ────────────────────────────────────
  {
    const ctx = makeCtx();
    const site = await createSite(ctx.storage, {
      agencyId: AGENCY, clientId: CLIENT, name: "S3", slug: "s3",
    });
    await seedPublished(ctx.storage, site.id, "/hidden", {
      seo: { noIndex: true },
    });
    await seedPublished(ctx.storage, site.id, "/private", {
      privacy: "password",
    });
    await seedPublished(ctx.storage, site.id, "/visible");
    const res = await handleAdvancedSitemapXml(
      new Request("https://example.com/sitemap.xml"), ctx,
    );
    const xml = await res.text();
    expect("noIndex page excluded", !xml.includes("/hidden"));
    expect("password-private page excluded", !xml.includes("/private"));
    expect("ordinary published page included", xml.includes("/visible"));
  }

  // ─── E: scope guard ──────────────────────────────────────────────────
  {
    const ctx = makeCtx();
    ctx.clientId = undefined;
    const res = await handleAdvancedSitemapXml(
      new Request("https://example.com/sitemap.xml"), ctx,
    );
    expect("missing clientId → 400 (scope guard)",
      res.status === 400);
  }

  // ─── F: robots.txt happy path ────────────────────────────────────────
  {
    const ctx = makeCtx();
    const res = await handleAdvancedRobotsTxt(
      new Request("https://example.com/robots.txt"), ctx,
    );
    expect("robots: 200 + text/plain",
      res.status === 200 &&
      (res.headers.get("content-type") ?? "").startsWith("text/plain"));
    const txt = await res.text();
    expect("robots points at /sitemap.xml",
      txt.includes("Sitemap: https://example.com/sitemap.xml"));
    expect("robots disallows /admin",
      /^Disallow:\s*\/admin/m.test(txt));
    expect("robots disallows /api",
      /^Disallow:\s*\/api/m.test(txt));
    expect("robots cache-control set",
      (res.headers.get("cache-control") ?? "").includes("max-age=300"));
  }

  // ─── G: locale sitemap path matching ─────────────────────────────────
  {
    const ctx = makeCtx();
    const bad = await handleLocaleSitemapXml(
      new Request("https://example.com/sitemap-XX.xml"), ctx,
    );
    expect("uppercase / malformed locale path → 404",
      bad.status === 404);

    const ok = await handleLocaleSitemapXml(
      new Request("https://example.com/sitemap-en.xml"), ctx,
    );
    expect("locale sitemap: 200 + xml",
      ok.status === 200 &&
      (ok.headers.get("content-type") ?? "").startsWith("application/xml"));
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
