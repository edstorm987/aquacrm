// Per-page <head> tag rendering. Faithful structural port from
// `02/src/components/SiteHead.tsx` (461 lines), trimmed to the meta-tag
// surface. The analytics / script-tag injection portion has been
// EXTRACTED — those belong to a future SEO/analytics plugin's
// `headInjections[]` manifest contribution. See chapter doc.
//
// R045 — adds JSON-LD `<script type="application/ld+json">` emission
// driven by `lib/jsonLdInjection.ts` (`buildPageJsonLd` +
// `buildJsonLdScriptBodies`). Skips emission cleanly when the helper
// returns no objects (zero matchable schemas + no Organization).

import type { EditorPage } from "../../types/editorPage";
import type { Site } from "../../types/site";
import type { BrandKit } from "../../lib/tenancy";
import {
  buildPageJsonLd,
  buildJsonLdScriptBodies,
} from "../../lib/jsonLdInjection";

export interface SiteHeadProps {
  site: Site;
  page: EditorPage;
  defaultLocale?: string;
  defaultDescription?: string;
  // R045 — Organization data sourcing. When omitted, JSON-LD still
  // emits any block-derived schemas (Article / Product / FAQPage /
  // BreadcrumbList) but the Organization entry is dropped.
  agencyName?: string;
  baseUrl?: string;
  brandKit?: BrandKit;
}

export function SiteHead({ site, page, defaultLocale, defaultDescription, agencyName, baseUrl, brandKit }: SiteHeadProps) {
  const title = page.title || site.name;
  const description = page.description || defaultDescription || "";
  const locale = defaultLocale || "en";

  const jsonLd = agencyName
    ? buildPageJsonLd(page, { agencyName, baseUrl, brandKit, site })
    : buildPageJsonLd(page, { agencyName: site.name, baseUrl, brandKit, site });
  const scripts = buildJsonLdScriptBodies(jsonLd);

  return (
    <>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={title} />
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:type" content="website" />
      <meta property="og:locale" content={locale} />
      <meta name="twitter:card" content="summary_large_image" />
      {scripts.map((body, i) => (
        <script
          key={`jsonld-${i}`}
          type="application/ld+json"
          data-aqua-jsonld
          dangerouslySetInnerHTML={{ __html: body }}
        />
      ))}
      {page.headInjection ? (
        <script
          data-page-head-injection
          dangerouslySetInnerHTML={{ __html: page.headInjection }}
        />
      ) : null}
    </>
  );
}
