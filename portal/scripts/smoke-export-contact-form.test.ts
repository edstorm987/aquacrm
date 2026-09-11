// An exported site's contact form must post to the client-owned Edge Function,
// and NOTHING in the bundle may be a raw database write.
//
// The export's own README used to list "Form submissions (contact-form, …)"
// under *things that will not work*, because `renderBlockToHtml` handled twelve
// block types and `contact-form` fell through to `default` (an empty `<div>`).
//
// The first fix wired the form straight to the client's PostgREST table with a
// public anon key. The 2026-09 secure-intake redesign REPLACES that: an exported
// form posts to the client-owned `aqua-form-submit` Edge Function, which enforces
// the field allowlist, CAPTCHA, honeypot, rate limits, PAN rejection and
// idempotency server-side. The bundle carries only PUBLIC values — the function
// URL, the public form id, and the public Turnstile site key — never a table
// endpoint, an anon/service key, or any secret.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The PUBLIC-only export target: an Edge Function URL, a public form id, and a
// public Turnstile site key. No table, no key, no secret can be expressed here.
const TARGET = {
  submitUrl: "https://abc.supabase.co/functions/v1/aqua-form-submit",
  formId: "contact",
  turnstileSiteKey: "0xTURNSTILESITEKEY",
};
const block = {
  id: "b1",
  type: "contact-form",
  props: { heading: "Talk to us", submitLabel: "Send" },
} as never;

test("a connected export posts to the client-owned Edge Function, not a table", async () => {
  const { renderBlockToHtml } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );
  const html = renderBlockToHtml(block, TARGET);

  assert.match(html, /<form /, "the block must render an actual form");
  assert.match(html, /https:\/\/abc\.supabase\.co\/functions\/v1\/aqua-form-submit/, "it must post to the client-owned intake Edge Function");
  assert.match(html, /"contact"/, "the PUBLIC form id must be carried so the function can map it server-side");
  assert.match(html, /name="website"/, "the honeypot must survive the export");
  assert.match(html, /class="cf-turnstile"/, "the CAPTCHA widget must be rendered when a site key is set");
  assert.match(html, /data-sitekey="0xTURNSTILESITEKEY"/, "the PUBLIC Turnstile site key must be present");
  assert.match(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/, "the Turnstile loader must be included");
  assert.match(html, /aria-live="polite"/, "the result must be announced, not only shown");
  assert.doesNotMatch(html, /<button type="submit" disabled/, "a connected form must be submittable");

  // The whole point of the redesign: NO browser-direct database write survives.
  assert.doesNotMatch(html, /\/rest\/v1/, "no raw PostgREST table endpoint may appear");
  assert.doesNotMatch(html, /apikey/i, "no anon/publishable apikey header may appear");
  assert.doesNotMatch(html, /Bearer/i, "no bearer key may be concatenated into the request");
  assert.doesNotMatch(html, /form_submissions/, "no database table name may appear");
});

test("an unconnected export renders an inert form instead of pretending", async () => {
  // The alternative — a Send button with nowhere to send — is the exact failure
  // this thread started from. And it must also carry no endpoint, so an
  // unapproved/inactive site's bundle is inert by construction.
  const { renderBlockToHtml } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );
  const html = renderBlockToHtml(block);

  assert.match(html, /<form /, "the fields still render, so the page looks like what was designed");
  assert.match(html, /not connected yet/, "it must say plainly that it cannot be sent");
  assert.match(html, /<button type="submit" disabled/, "an unconnected form must not be submittable");
  assert.doesNotMatch(html, /\/functions\/v1\//, "no endpoint may appear when there is nothing to post to");
  assert.doesNotMatch(html, /apikey|rest\/v1|cf-turnstile/, "no endpoint, key or CAPTCHA may appear on an inert form");
});

test("the README tells the truth in both cases, and names no table or key", async () => {
  const { buildExportReadme } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );

  const wired = buildExportReadme("site_1", "https://example.test", 3, TARGET);
  assert.match(wired, /Contact forms in this bundle DO work/);
  assert.match(wired, /functions\/v1\/aqua-form-submit/, "it must name the Edge Function the form posts to");
  assert.match(wired, /PUBLIC form id "contact"/, "it must name the public form id, not a table");
  assert.match(wired, /NO\s+database table endpoint/i, "it must state that no table endpoint is in the bundle");
  assert.match(wired, /NO\s+anon\/service key/i, "it must state that no key is in the bundle");
  assert.match(wired, /NO\s+secret of any kind/i, "it must state that no secret is in the bundle");
  // The removed design's reassurances must be gone: there is no public key to
  // explain, and no table to name.
  assert.doesNotMatch(wired, /form_submissions/, "the removed table name must not appear");
  assert.doesNotMatch(wired, /the anon key is in the page source/i, "the removed anon-key story must be gone");
  assert.doesNotMatch(wired, /Form submissions \(contact-form/, "the stale 'will not work' line must be gone when they do");

  const bare = buildExportReadme("site_1", "https://example.test", 3);
  assert.match(bare, /NOT connected/, "an unconnected export must say so");
  assert.doesNotMatch(bare, /DO work/, "and must not claim otherwise");
});

test("the first-party template vocabulary survives an export, or says it did not", async () => {
  const { renderBlockToHtml, collectUnexportableBlockTypes, buildExportReadme } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );

  const hero = renderBlockToHtml({
    id: "h", type: "hero",
    props: { eyebrow: "Welcome", headline: "Build something beautiful", subhead: "A tagline.", ctaLabel: "Shop now", ctaHref: "/shop" },
  } as never);
  assert.match(hero, /Build something beautiful/, "the hero headline must reach the exported page");
  assert.match(hero, /href="\/shop"/, "and its call to action must be a real link");

  const testimonials = renderBlockToHtml({
    id: "t", type: "testimonials",
    props: { title: "Loved by our customers", items: [{ quote: "This is the future.", author: "Felicia", role: "Founder" }] },
  } as never);
  assert.match(testimonials, /This is the future\./, "the quotes are the block — losing them loses everything");
  assert.match(testimonials, /Felicia/);

  const grid = renderBlockToHtml({ id: "g", type: "product-grid", props: { collectionHandle: "all" } } as never);
  assert.match(grid, /data-aqua-export="unsupported"/, "it must be machine-detectable");
  assert.match(grid, /not included in this static export/, "and readable by whoever opens the page");

  assert.deepEqual(
    collectUnexportableBlockTypes([
      { id: "s", type: "section", props: {}, children: [{ id: "g", type: "product-grid", props: {} }] },
      { id: "h", type: "hero", props: {} },
    ] as never),
    ["product-grid"],
    "nested blocks count too, and supported ones must not be reported as dropped",
  );

  const readme = buildExportReadme("site_1", "https://example.test", 1, undefined, ["product-grid"]);
  assert.match(readme, /CANNOT reproduce \(1\)/, "the README must own the shortfall");
  assert.match(readme, /- product-grid/, "and name it, not hedge with 'some blocks'");
  assert.doesNotMatch(
    buildExportReadme("site_1", "https://example.test", 1),
    /CANNOT reproduce/,
    "a fully-supported site must not be told it lost something",
  );
});

test("an exported form does not disagree with the editor about being connected", async () => {
  // The generic `form` block posts natively to `props.action`; a whitespace
  // action is "no destination" in the editor and must be inert in the export too.
  const { renderBlockToHtml } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );

  const blank = renderBlockToHtml({
    id: "f", type: "form",
    props: { action: "   ", submitLabel: "Send", fields: [{ name: "email", label: "Email", type: "email" }] },
  } as never);
  assert.match(blank, /no destination yet/, "a whitespace action is no destination, as it is in the editor");
  assert.match(blank, /<button type="submit" disabled>/, "and it must not be submittable");
  assert.doesNotMatch(blank, /<form action=/, "nor post anywhere, least of all back to the page itself");
});

test("the README names the relative-Submit-URL trap instead of leaving it to be discovered", async () => {
  const { buildExportReadme } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );
  const readme = buildExportReadme("site_1", "https://example.test", 1);
  assert.match(readme, /Submit URL is RELATIVE/, "the trap must be named, not implied");
  assert.match(readme, /\/api\/contact/, "and shown with the exact default that walks into it");
});

test("the export is given only the PUBLIC half of the connection", () => {
  // `findClientSupabaseConnection` returns both secrets. The export path uses a
  // different function whose return TYPE cannot carry a secret, a table, or an
  // anon key — a shape that makes the mistake impossible beats a comment asking
  // people not to make it.
  const src = readFileSync("src/lib/server/clientForms/clientSupabaseExport.ts", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.doesNotMatch(code, /webhookSecret/, "the export target must never read the webhook secret");
  assert.doesNotMatch(code, /readSecret/, "the export target must never read the read secret");
  const shape = code.match(/export interface ClientSupabaseExportTarget \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(shape, "the export target type must exist");
  assert.doesNotMatch(shape, /secret/i, "the export target type must have no secret field");
  assert.doesNotMatch(shape, /\b(anonKey|table)\b/i, "the export target type must have no anon key or table field");
  assert.match(shape, /submitUrl/, "the export target carries the Edge Function URL");

  const handler = readFileSync("src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts", "utf8");
  assert.match(handler, /clientSupabaseExportTarget\(/, "the handler must use the public-only resolver");
  assert.match(handler, /clientSupabaseExportTarget\(\s*scope\.agencyId[^,]*,\s*scope\.clientId[^,]*,\s*q\.siteId/, "the resolver must be bound to the exact agency, client and site being exported");
  assert.doesNotMatch(handler, /findClientSupabaseConnection/, "the handler must not reach for the full connection");
});
