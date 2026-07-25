// R014 — Sitemap.xml + robots.txt + OG-card handlers.
//
// All three return non-JSON content (XML / text / SVG) so they
// bypass the standard `ok()` / `fail()` JSON helpers.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { listPages } from "../../server/pages";
import { listSites } from "../../server/sites";
import { buildSitemapXml, buildRobotsTxt, type SitemapPage } from "../../server/sitemap";
import { buildOgCardSvg } from "../../server/ogImageGenerator";
import { fail, readQuery, requireClientScope } from "../helpers";

function deriveBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function collectSitemapPages(
  storage: PluginCtx["storage"],
  agencyId: string,
  clientId: string,
): Promise<SitemapPage[]> {
  const sites = await listSites(storage, agencyId, clientId);
  const out: SitemapPage[] = [];
  for (const site of sites) {
    const pages = await listPages(storage, agencyId, clientId, site.id);
    for (const p of pages) {
      const seoNoIndex = (p as { seo?: { noIndex?: boolean } }).seo?.noIndex === true;
      out.push({
        slug: p.slug,
        status: p.status,
        ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
        isPortalVariant: Boolean(p.portalRole),
        noIndex: seoNoIndex,
      });
    }
  }
  return out;
}

// GET /sitemap.xml — emits valid XML for every published, non-noIndex,
// non-portal-variant page across the client's sites.
export async function handleSitemapXml(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const pages = await collectSitemapPages(ctx.storage, scope.agencyId, scope.clientId);
  const xml = buildSitemapXml(pages, deriveBaseUrl(req));
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

// GET /robots.txt — emits Allow + per-noIndex Disallow + sitemap pointer.
export async function handleRobotsTxt(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const pages = await collectSitemapPages(ctx.storage, scope.agencyId, scope.clientId);
  const txt = buildRobotsTxt(pages, deriveBaseUrl(req));
  return new Response(txt, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

// GET /og?title=…&brand=…&color=… — emits a 1200×630 SVG OG card.
// Foundation can also pipe through `sharp` for raster PNG (R+1).
export async function handleOgCard(req: Request, ctx: PluginCtx): Promise<Response> {
  // Public-ish endpoint — no per-tenant scope needed; the operator
  // composes the URL with brand colour + title themselves.
  void ctx;
  const q = readQuery(req);
  if (!q.title) return fail("title required", 400);
  const svg = buildOgCardSvg({
    title: q.title,
    ...(q.brand ? { brandName: q.brand } : {}),
    primaryColor: q.color || "#0ea5e9",
    ...(q.textColor ? { textColor: q.textColor } : {}),
  });
  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
