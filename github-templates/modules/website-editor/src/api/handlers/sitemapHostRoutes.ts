// R044 — Host routes for advanced sitemap.xml + robots.txt.
//
// R036 shipped the generators (`lib/sitemap.ts`); this round wires
// them into actual host routes the foundation mounts. R014 handlers
// stay in `seoMeta.ts` for the static-export pipeline (byte-stable
// narrow output); R036 handlers serve runtime crawler traffic with
// per-locale alternates + redirect-source filtering.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { listPages } from "../../server/pages";
import { listSites } from "../../server/sites";
import {
  buildSitemap,
  buildRobotsTxt,
  selectSitemapPages,
  type SitemapPageInput,
} from "../../lib/sitemap";
import { requireClientScope } from "../helpers";

const CACHE_HEADER = "public, max-age=300, s-maxage=600";

function deriveBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// Pull the page rows + project them into the SitemapPageInput shape
// the R036 helpers consume. Also returns the redirect-source slugs
// gathered from each page's `redirectSourceSlugs[]` so
// `selectSitemapPages` can filter them (R041 contract — old slug
// owns the canonical URL on the new page; sitemap should advertise
// only the canonical).
async function collectInputs(
  ctx: PluginCtx,
  agencyId: string,
  clientId: string,
): Promise<{ pages: SitemapPageInput[]; redirectSources: string[] }> {
  const sites = await listSites(ctx.storage, agencyId, clientId);
  const pages: SitemapPageInput[] = [];
  const redirectSources: string[] = [];

  for (const site of sites) {
    const rows = await listPages(ctx.storage, agencyId, clientId, site.id);
    for (const p of rows) {
      const seoNoIndex =
        (p as { seo?: { noIndex?: boolean } }).seo?.noIndex === true;
      const sourcesRaw = (p as { redirectSourceSlugs?: string[] })
        .redirectSourceSlugs;
      if (Array.isArray(sourcesRaw)) {
        for (const s of sourcesRaw) {
          if (typeof s === "string" && s.length > 0) redirectSources.push(s);
        }
      }
      const localesRaw = (p as { locales?: SitemapPageInput["locales"] })
        .locales;
      pages.push({
        slug: p.slug,
        status: p.status,
        ...(p.publishedAt ? { publishedAt: p.publishedAt } : {}),
        ...(p.privacy ? { privacy: p.privacy } : {}),
        noIndex: seoNoIndex,
        ...(p.isHomepage ? { isHomepage: true } : {}),
        ...(p.portalRole ? { portalRole: p.portalRole } : {}),
        ...(localesRaw ? { locales: localesRaw } : {}),
      });
    }
  }
  return { pages, redirectSources };
}

// GET /sitemap.xml — full advanced sitemap (changefreq + priority +
// per-locale `<xhtml:link rel=alternate>` + x-default).
export async function handleAdvancedSitemapXml(
  req: Request,
  ctx: PluginCtx,
): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const { pages, redirectSources } = await collectInputs(
    ctx, scope.agencyId, scope.clientId,
  );
  const filtered = selectSitemapPages(pages, {
    redirectFromSlugs: redirectSources,
  });
  const xml = buildSitemap(filtered, { baseUrl: deriveBaseUrl(req) });
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": CACHE_HEADER,
    },
  });
}

// GET /sitemap-<locale>.xml — locale-scoped sitemap. Filters pages
// to those carrying the requested locale; emits absolute URLs that
// already include the locale prefix.
export async function handleLocaleSitemapXml(
  req: Request,
  ctx: PluginCtx,
): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const url = new URL(req.url);
  const match = /^\/sitemap-([a-z]{2}(?:-[A-Z]{2})?)\.xml$/.exec(url.pathname);
  if (!match) {
    return new Response("not found", { status: 404 });
  }
  const locale = match[1]!;
  const { pages, redirectSources } = await collectInputs(
    ctx, scope.agencyId, scope.clientId,
  );
  const filtered = selectSitemapPages(pages, {
    redirectFromSlugs: redirectSources,
  }).filter((p) => p.locales && (p.locales as unknown as Record<string, unknown>)[locale]);
  const xml = buildSitemap(filtered, { baseUrl: deriveBaseUrl(req) });
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": CACHE_HEADER,
    },
  });
}

// GET /robots.txt — emits structured-options robots with the host's
// own /sitemap.xml as the sitemap pointer and the standard /admin
// /embed /api disallows.
export async function handleAdvancedRobotsTxt(
  req: Request,
  ctx: PluginCtx,
): Promise<Response> {
  // Scope check: same constraint as sitemap (public crawl traffic
  // hits the same per-tenant route in v1).
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const baseUrl = deriveBaseUrl(req);
  const txt = buildRobotsTxt({
    sitemapUrl: `${baseUrl}/sitemap.xml`,
  });
  return new Response(txt, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": CACHE_HEADER,
    },
  });
}
