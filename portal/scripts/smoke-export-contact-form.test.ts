// An exported site's contact form must actually post somewhere.
//
// The export's own README used to list "Form submissions (contact-form, …)"
// under *things that will not work*. The reason turned out to be blunter than
// "unwired": `renderBlockToHtml` handled twelve block types and `contact-form`
// fell through to `default`, which emits an empty `<div>`. The form was not
// broken; it was **not rendered at all**.
//
// Ed's architecture supplies the missing half — the client's own Supabase — so
// the exported page can post straight from the visitor's browser to their
// PostgREST endpoint with no server of ours in the path.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const TARGET = { projectUrl: "https://abc.supabase.co", anonKey: "ANON-TEST-KEY", table: "form_submissions" };
const block = {
  id: "b1",
  type: "contact-form",
  props: { heading: "Talk to us", submitLabel: "Send" },
} as never;

test("a connected export renders a form that posts to the client's own table", async () => {
  const { renderBlockToHtml } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );
  const html = renderBlockToHtml(block, TARGET);

  assert.match(html, /<form /, "the block must render an actual form");
  assert.match(html, /https:\/\/abc\.supabase\.co\/rest\/v1\/form_submissions/, "it must post to their PostgREST table");
  assert.match(html, /ANON-TEST-KEY/, "the anon key must be present — it is public by design and the RLS policy is the control");
  assert.match(html, /name="website"/, "the honeypot must survive the export");
  assert.match(html, /aria-live="polite"/, "the result must be announced, not only shown");
  assert.doesNotMatch(html, /<button type="submit" disabled/, "a connected form must be submittable");
});

test("an unconnected export says so instead of pretending", async () => {
  // The alternative — rendering a Send button with nowhere to send — is the
  // exact failure this whole thread started from: a published contact form
  // that tells the visitor "Couldn't send. Please email us directly." on a page
  // carrying no email address.
  const { renderBlockToHtml } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );
  const html = renderBlockToHtml(block);

  assert.match(html, /<form /, "the fields still render, so the page looks like what was designed");
  assert.match(html, /not connected yet/, "it must say plainly that it cannot be sent");
  assert.match(html, /<button type="submit" disabled/, "an unconnected form must not be submittable");
  assert.doesNotMatch(html, /apikey|rest\/v1/, "no endpoint or key may appear when there is nothing to post to");
});

test("the README tells the truth in both cases", async () => {
  const { buildExportReadme } = await import(
    "../src/built-ins/modules/website-editor/src/server/staticExport.ts"
  );

  const wired = buildExportReadme("site_1", "https://example.test", 3, TARGET);
  assert.match(wired, /Contact forms in this bundle DO work/);
  assert.match(wired, /form_submissions/, "it must name the table so somebody can check the RLS policy");
  // Somebody who finds a key in a ZIP and is not told why will assume the worst.
  assert.match(wired, /PUBLIC key/, "it must explain why a key in the bundle is not a leak");
  assert.match(wired, /never put a service-role key/, "and warn against the one that would be");
  assert.doesNotMatch(wired, /Form submissions \(contact-form/, "the stale 'will not work' line must be gone when they do");

  const bare = buildExportReadme("site_1", "https://example.test", 3);
  assert.match(bare, /NOT connected/, "an unconnected export must say so");
  assert.doesNotMatch(bare, /DO work/, "and must not claim otherwise");
});

test("the export is given only the PUBLIC half of the connection", () => {
  // `findClientSupabaseConnection` returns the webhook secret too. The export
  // path uses a different function that CANNOT return it — a shape that makes
  // the mistake impossible beats a comment asking people not to make it.
  const src = readFileSync("src/lib/server/clientForms/clientSupabaseExport.ts", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.doesNotMatch(code, /webhookSecret/, "the export target must never read the webhook secret");
  const shape = code.match(/export interface ClientSupabaseExportTarget \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(shape, "the export target type must exist");
  assert.doesNotMatch(shape, /secret/i, "the export target type must have no secret field");

  const handler = readFileSync("src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts", "utf8");
  assert.match(handler, /clientSupabaseExportTarget\(/, "the handler must use the public-only resolver");
  assert.doesNotMatch(handler, /findClientSupabaseConnection/, "the handler must not reach for the full connection");
});
