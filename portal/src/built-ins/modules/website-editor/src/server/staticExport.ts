// R033 — Static site export.
//
// `exportSiteToZip` renders every published page in a site to a static
// HTML file and bundles them with brand.css, robots.txt, sitemap.xml,
// per-locale sitemap-<locale>.xml (R046), and a README into a single
// store-only ZIP (Uint8Array). Sitemap + robots use the R036 advanced
// generators (changefreq + priority + per-locale alternates +
// redirect-source / draft / private / noIndex filters).
//
// Honesty caveat: this is a snapshot. Form submissions, member gates,
// commerce blocks, and any other dynamic surface depend on the running
// portal backend and won't function on a third-party static host
// without their own wiring. The bundled README spells this out.
//
// Pure server module — no React. The renderer walks BlockTree[] and
// emits semantic HTML for the common content blocks (heading / text /
// button / image / container / section / spacer / divider). Unknown
// types fall back to a `<div data-block-type="…">` shell so the
// surrounding layout still flows.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId, BrandKit } from "./../lib/tenancy";
import type { Block } from "../types/block";
import type { EditorPage } from "../types/editorPage";
import { listPages } from "./pages";
import {
  buildSitemap as buildAdvancedSitemap,
  buildRobotsTxt as buildAdvancedRobotsTxt,
  selectSitemapPages,
  type SitemapPageInput,
} from "../lib/sitemap";

/**
 * The client's OWN Supabase, baked into the exported site.
 *
 * Ed, 2026-08-27: the client's website writes into the client's database. An
 * exported site is a static bundle dropped on Vercel, so there is no server of
 * ours in the request path — the form posts straight from the visitor's browser
 * to their PostgREST endpoint.
 *
 * **The anon key is in the bundle, and that is correct.** A Supabase anon key
 * is designed to be public; it is the row-level-security policy on the table
 * that decides what it may do, which is why the setup instructions ask for an
 * INSERT-only policy. Nothing secret is exported — and the README says so
 * plainly, because a reader who finds a key in a ZIP and is not told this will
 * reasonably assume the worst.
 */
export interface ExportSupabaseTarget {
  projectUrl: string;
  anonKey: string;
  table: string;
}

export interface ExportSiteInput {
  storage: PluginStorage;
  agencyId: AgencyId;
  clientId: ClientId;
  siteId: string;
  baseUrl: string;
  brandKit?: BrandKit;
  customCss?: string;
  /** Absent when the client has no Supabase connected — forms then say so. */
  supabase?: ExportSupabaseTarget;
}

export interface ExportSiteResult {
  zip: Uint8Array;
  fileCount: number;
  pageCount: number;
}

// ─── HTML render ──────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function styleString(b: Block): string {
  const s = b.styles;
  if (!s) return "";
  const parts: string[] = [];
  const push = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === "") return;
    parts.push(`${k}:${String(v)}`);
  };
  push("padding", s.padding);
  push("margin", s.margin);
  push("background", s.background);
  push("color", s.textColor);
  push("text-align", s.align);
  push("width", s.width);
  push("max-width", s.maxWidth);
  push("min-height", s.minHeight);
  push("border-radius", s.borderRadius);
  push("border", s.border);
  push("box-shadow", s.boxShadow);
  push("font-family", s.fontFamily);
  push("font-size", s.fontSize);
  push("font-weight", s.fontWeight);
  push("line-height", s.lineHeight);
  push("letter-spacing", s.letterSpacing);
  push("display", s.display);
  push("flex-direction", s.flexDirection);
  push("justify-content", s.justifyContent);
  push("align-items", s.alignItems);
  push("gap", s.gap);
  push("grid-template-columns", s.gridTemplateColumns);
  return parts.join(";");
}

export function renderBlockToHtml(block: Block, supabase?: ExportSupabaseTarget): string {
  const style = styleString(block);
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : "";
  const id = block.a11y?.htmlId ? ` id="${escapeAttr(block.a11y.htmlId)}"` : "";
  const aria = block.a11y?.ariaLabel ? ` aria-label="${escapeAttr(block.a11y.ariaLabel)}"` : "";
  const childrenHtml = (block.children ?? []).map(child => renderBlockToHtml(child, supabase)).join("");
  const text = String((block.props as { text?: unknown }).text ?? "");
  const href = String((block.props as { href?: unknown }).href ?? "");
  const src = String((block.props as { src?: unknown }).src ?? "");
  const alt = String((block.props as { alt?: unknown }).alt ?? block.a11y?.alt ?? "");

  switch (block.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number((block.props as { level?: unknown }).level ?? 1)));
      return `<h${level}${id}${styleAttr}${aria}>${escapeHtml(text)}</h${level}>`;
    }
    case "text":
      return `<p${id}${styleAttr}${aria}>${escapeHtml(text)}</p>`;
    case "button":
      return href
        ? `<a${id} href="${escapeAttr(href)}"${styleAttr}${aria}>${escapeHtml(text)}</a>`
        : `<button${id} type="button"${styleAttr}${aria}>${escapeHtml(text)}</button>`;
    case "image":
      return `<img${id} src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${styleAttr} />`;
    case "spacer":
      return `<div${id} aria-hidden="true"${styleAttr}></div>`;
    case "divider":
      return `<hr${id}${styleAttr} />`;
    case "section":
      return `<section${id}${styleAttr}${aria}>${childrenHtml}</section>`;
    case "container":
    case "row":
    case "column":
    case "grid":
      return `<div${id}${styleAttr}${aria} data-block-type="${escapeAttr(block.type)}">${childrenHtml}</div>`;
    case "contact-form":
      // Previously fell through to `default` and emitted an empty div, which is
      // why the README said form submissions do not survive an export: they
      // were not rendered at all, never mind unwired.
      return renderContactFormHtml(block, supabase, id, styleAttr, aria);
    case "html":
      // R020 raw-HTML block — passed through verbatim so operators can
      // embed snippets that wouldn't survive escape.
      return String((block.props as { html?: unknown }).html ?? "");
    default:
      return `<div${id}${styleAttr}${aria} data-block-type="${escapeAttr(block.type)}">${
        text ? escapeHtml(text) : ""
      }${childrenHtml}</div>`;
  }
}


/**
 * A contact form that actually posts somewhere.
 *
 * Writes straight to the client's PostgREST endpoint from the visitor's
 * browser. No JavaScript framework, no build step — this has to run inside a
 * bundle somebody dropped on a static host.
 *
 * Without a Supabase target it renders the fields and says plainly that it is
 * not connected, rather than presenting a Send button that throws the message
 * away. The same decision `FormBlock` makes in the editor.
 */
function renderContactFormHtml(
  block: Block,
  supabase: ExportSupabaseTarget | undefined,
  id: string,
  styleAttr: string,
  aria: string,
): string {
  const props = block.props as Record<string, unknown>;
  const heading = String(props.heading ?? "Get in touch");
  const subheading = String(props.subheading ?? "");
  const submitLabel = String(props.submitLabel ?? "Send message");
  const showPhone = props.showPhone !== false;
  const formId = `aqua-contact-${block.id}`;

  const notConnected = !supabase
    ? `<p role="note" style="margin:0 0 12px;padding:10px 12px;border:1px dashed #c66;border-radius:8px;font-size:13px">This form is not connected yet, so it cannot be sent.</p>`
    : "";

  const phoneField = showPhone
    ? `<label style="display:flex;flex-direction:column;gap:4px"><span>Phone</span><input name="phone" type="tel" /></label>`
    : "";

  // The script is emitted only when there is somewhere to post to.
  const script = supabase
    ? `<script>(function(){
  var f=document.getElementById(${JSON.stringify(formId)});
  if(!f)return;
  var s=f.querySelector("[data-aqua-status]");
  f.addEventListener("submit",function(e){
    e.preventDefault();
    if(f.dataset.sending==="yes")return;
    var d=new FormData(f);
    if(d.get("website"))return;
    f.dataset.sending="yes";
    s.textContent="Sending…";
    var body={};d.forEach(function(v,k){if(k!=="website")body[k]=v;});
    fetch(${JSON.stringify(`${supabase.projectUrl.replace(/\/+$/, "")}/rest/v1/${supabase.table}`)},{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":${JSON.stringify(supabase.anonKey)},"Authorization":"Bearer "+${JSON.stringify(supabase.anonKey)},"Prefer":"return=minimal"},
      body:JSON.stringify(body)
    }).then(function(r){
      f.dataset.sending="";
      if(r.ok){f.reset();s.textContent="Thanks — we have your message.";}
      else{s.textContent="Sorry, that did not send. Please try again.";}
    }).catch(function(){
      f.dataset.sending="";
      s.textContent="Sorry, that did not send. Please try again.";
    });
  });
})();</script>`
    : "";

  return `<section${id}${styleAttr}${aria} data-block-type="contact-form">
  <h2>${escapeHtml(heading)}</h2>
  ${subheading ? `<p>${escapeHtml(subheading)}</p>` : ""}
  ${notConnected}
  <form id="${escapeAttr(formId)}" style="display:flex;flex-direction:column;gap:12px;max-width:480px">
    <label style="display:flex;flex-direction:column;gap:4px"><span>Name</span><input name="name" type="text" required /></label>
    <label style="display:flex;flex-direction:column;gap:4px"><span>Email</span><input name="email" type="email" required /></label>
    ${phoneField}
    <label style="display:flex;flex-direction:column;gap:4px"><span>Message</span><textarea name="message" rows="4" required></textarea></label>
    <input name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />
    <button type="submit"${supabase ? "" : " disabled"}>${escapeHtml(submitLabel)}</button>
    <p data-aqua-status role="status" aria-live="polite" style="margin:0;font-size:13px"></p>
  </form>
</section>${script}`;
}

export function renderPageHtml(page: EditorPage, opts: {
  brandCssHref: string;
  customCssHref?: string;
  siteTitle?: string;
  supabase?: ExportSupabaseTarget;
}): string {
  const blocks = (page.publishedBlocks ?? page.blocks ?? []) as Block[];
  const body = blocks.map(block => renderBlockToHtml(block, opts.supabase)).join("\n");
  const title = page.seo?.metaTitle ?? page.title ?? page.slug;
  const desc = page.seo?.metaDescription ?? page.description ?? "";
  const noIndex = page.seo?.noIndex
    ? `\n  <meta name="robots" content="noindex" />`
    : "";
  const customCssLink = opts.customCssHref
    ? `\n  <link rel="stylesheet" href="${escapeAttr(opts.customCssHref)}" />`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${desc ? `<meta name="description" content="${escapeAttr(desc)}" />` : ""}${noIndex}
  <link rel="stylesheet" href="${escapeAttr(opts.brandCssHref)}" />${customCssLink}
</head>
<body>
${body}
</body>
</html>
`;
}

export function buildBrandCss(brand?: BrandKit): string {
  const primary = brand?.primaryColor ?? "#0ea5e9";
  const accent = brand?.accentColor ?? "#f97316";
  return `:root {
  --brand-primary: ${primary};
  --brand-accent: ${accent};
}
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; line-height: 1.5; }
a { color: var(--brand-primary); }
img { max-width: 100%; height: auto; }
`;
}

export function buildExportReadme(siteId: string, baseUrl: string, pages: number, supabase?: ExportSupabaseTarget): string {
  return `Static site export — ${siteId}
Generated: ${new Date().toISOString()}
Base URL at export time: ${baseUrl}
Pages bundled: ${pages}

This bundle is a SNAPSHOT of the site at the moment you clicked Export.
Drop the contents on any static host (S3, Netlify, GitHub Pages, etc.).

${supabase ? `Contact forms in this bundle DO work.
They post straight from the visitor's browser to this site's own Supabase
table "${supabase.table}". The anon key is in the page source, which is how
Supabase is meant to be used — it is a PUBLIC key, and the row-level-security
policy on that table is what decides what it may do. Keep that policy to INSERT
only, and never put a service-role key anywhere near a static bundle.

` : `Contact forms in this bundle are NOT connected.
They render, and say so, but cannot be sent. Connect this client's Supabase in
AquaCRM and export again to wire them up.

`}Things that WILL NOT work without backend wiring:
- Member-gated content / password-protected pages
- Commerce blocks (product-card, cart-summary, checkout-summary, …)
- Booking widgets and any block that reads live data
- Search, A/B variant resolution, and personalisation

For continuously deployed static sites, use the Aqua portal's deploy
target instead of this manual export.
`;
}

// ─── ZIP (store-only) ─────────────────────────────────────────────────

const CRC32_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; data: Uint8Array }

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);     // local file header sig
    lv.setUint16(4, 20, true);              // version
    lv.setUint16(6, 0, true);               // flags
    lv.setUint16(8, 0, true);               // method: store
    lv.setUint16(10, 0, true);              // mtime
    lv.setUint16(12, 0, true);              // mdate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);              // extra
    lh.set(nameBytes, 30);
    local.push(lh, e.data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);     // central dir sig
    cv.setUint16(4, 20, true);              // version made by
    cv.setUint16(6, 20, true);              // version needed
    cv.setUint16(8, 0, true);               // flags
    cv.setUint16(10, 0, true);              // method
    cv.setUint16(12, 0, true);              // mtime
    cv.setUint16(14, 0, true);              // mdate
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);              // extra
    cv.setUint16(32, 0, true);              // comment
    cv.setUint16(34, 0, true);              // disk
    cv.setUint16(36, 0, true);              // int attrs
    cv.setUint32(38, 0, true);              // ext attrs
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    central.push(ch);

    offset += lh.length + e.data.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const cdOffset = offset;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);                 // disk
  ev.setUint16(6, 0, true);                 // disk start
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);                // comment

  const totalSize = offset + cdSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let p = 0;
  for (const chunk of local) { out.set(chunk, p); p += chunk.length; }
  for (const chunk of central) { out.set(chunk, p); p += chunk.length; }
  out.set(eocd, p);
  return out;
}

// ─── Top-level export ─────────────────────────────────────────────────

function pageFilename(page: EditorPage): string {
  if (page.isHomepage || page.slug === "/" || page.slug === "") return "index.html";
  const slug = page.slug.replace(/^\/+|\/+$/g, "");
  return `${slug}/index.html`;
}

export async function exportSiteToZip(input: ExportSiteInput): Promise<ExportSiteResult> {
  const { storage, agencyId, clientId, siteId, baseUrl, brandKit, customCss } = input;
  const allPages = await listPages(storage, agencyId, clientId, siteId);
  const pages = allPages.filter(
    p => p.status === "published" && !p.portalRole && !p.slug.startsWith("_"),
  );

  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];

  // brand.css (+ optional custom.css)
  entries.push({ name: "assets/brand.css", data: enc.encode(buildBrandCss(brandKit)) });
  const customHref = customCss ? "assets/custom.css" : undefined;
  if (customCss) entries.push({ name: "assets/custom.css", data: enc.encode(customCss) });

  for (const p of pages) {
    const html = renderPageHtml(p, {
      brandCssHref: pageDepth(p) === 0 ? "assets/brand.css" : "../assets/brand.css",
      customCssHref: customHref
        ? (pageDepth(p) === 0 ? customHref : `../${customHref}`)
        : undefined,
      supabase: input.supabase,
    });
    entries.push({ name: pageFilename(p), data: enc.encode(html) });
  }

  // R046 — bundle sitemap + robots from R036 advanced helpers.
  // Filters: drafts (R035), redirect-source slugs (R041), private +
  // noIndex (R025), portal-variants + underscore-prefix (R036).
  const advancedPages: SitemapPageInput[] = pages.map(p => ({
    slug: p.slug.startsWith("/") ? p.slug : `/${p.slug}`,
    status: p.status,
    ...(p.publishedAt ? { publishedAt: p.publishedAt } : {}),
    ...(p.privacy ? { privacy: p.privacy } : {}),
    noIndex: p.seo?.noIndex === true,
    ...(p.isHomepage ? { isHomepage: true } : {}),
    ...(p.portalRole ? { portalRole: p.portalRole } : {}),
    ...((p as { locales?: SitemapPageInput["locales"] }).locales
      ? { locales: (p as { locales?: SitemapPageInput["locales"] }).locales }
      : {}),
  }));
  const redirectSources: string[] = [];
  for (const p of pages) {
    const sources = (p as { redirectSourceSlugs?: string[] }).redirectSourceSlugs;
    if (Array.isArray(sources)) {
      for (const s of sources) {
        if (typeof s === "string" && s.length > 0) redirectSources.push(s);
      }
    }
  }
  const filtered = selectSitemapPages(advancedPages, {
    redirectFromSlugs: redirectSources,
  });
  entries.push({
    name: "sitemap.xml",
    data: enc.encode(buildAdvancedSitemap(filtered, { baseUrl })),
  });
  entries.push({
    name: "robots.txt",
    data: enc.encode(buildAdvancedRobotsTxt({ sitemapUrl: `${baseUrl}/sitemap.xml` })),
  });
  // Per-locale sitemaps when any page carries locales.
  const locales = new Set<string>();
  for (const p of filtered) {
    if (p.locales) {
      for (const k of Object.keys(p.locales.locales)) locales.add(k);
    }
  }
  for (const loc of locales) {
    const localePages = filtered.filter(
      (p) => p.locales && p.locales.locales[loc],
    );
    entries.push({
      name: `sitemap-${loc}.xml`,
      data: enc.encode(buildAdvancedSitemap(localePages, { baseUrl })),
    });
  }
  entries.push({ name: "README.txt", data: enc.encode(buildExportReadme(siteId, baseUrl, pages.length, input.supabase)) });

  const zip = buildZip(entries);
  return { zip, fileCount: entries.length, pageCount: pages.length };
}

function pageDepth(p: EditorPage): number {
  if (p.isHomepage || p.slug === "/" || p.slug === "") return 0;
  // every non-home page lives at `<slug>/index.html`, so depth = 1
  return 1;
}
