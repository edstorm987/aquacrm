// Stored-code boundary regression (assume-breach containment, Phase 0-C).
//
// The verification pass VERIFIED: operator customHead/customFoot and HtmlBlock/
// TextBlock markup renders with dangerouslySetInnerHTML into an authenticated,
// same-origin page; the editor iframe combined allow-scripts + allow-same-origin
// (a no-op sandbox); the CSP allowed 'unsafe-inline' and a broad https: script
// source; and validation was regex-based (bypassable). This suite pins the
// enforceable fail-closed controls that shipped now:
//   1. production SAFE MODE holds raw stored markup out of the render, with an
//      explicit non-default break-glass; dev keeps rendering it;
//   2. the editor iframe no longer combines allow-scripts with allow-same-origin;
//   3. the production CSP no longer allows scripts from a broad https: source,
//      and frame-ancestors is narrowed to 'self'.
// Full parser-sanitiser + separate-origin isolation remain PARTIAL (documented).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  mayRenderStoredMarkup,
  storedCodeMode,
  storedMarkupOrNull,
} from "../src/built-ins/modules/website-editor/src/lib/customCodeSafeMode";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("production holds stored markup out of the same-origin render", () => {
  assert.equal(storedCodeMode({ NODE_ENV: "production" } as NodeJS.ProcessEnv), "safe");
  assert.equal(mayRenderStoredMarkup({ NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
  assert.equal(storedMarkupOrNull("<img src=x onerror=alert(1)>", { NODE_ENV: "production" } as NodeJS.ProcessEnv), null);
});

test("development still renders stored markup so the feature can be built", () => {
  assert.equal(mayRenderStoredMarkup({ NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
  assert.equal(storedMarkupOrNull("<b>hi</b>", { NODE_ENV: "development" } as NodeJS.ProcessEnv), "<b>hi</b>");
});

test("the production break-glass is explicit, non-default and loud to set", () => {
  // Default production = safe; only the exact literal flips it.
  assert.equal(mayRenderStoredMarkup({ NODE_ENV: "production", STORED_CODE_UNSAFE_RENDER: "true" } as NodeJS.ProcessEnv), false);
  assert.equal(mayRenderStoredMarkup({ NODE_ENV: "production", STORED_CODE_UNSAFE_RENDER: "1" } as NodeJS.ProcessEnv), false);
  assert.equal(mayRenderStoredMarkup({ NODE_ENV: "production", STORED_CODE_UNSAFE_RENDER: "allow" } as NodeJS.ProcessEnv), true);
});

test("the preview page and both active-content blocks route through safe mode", () => {
  const preview = read("src/app/client-website-preview/[clientId]/[siteId]/[pageId]/page.tsx");
  assert.match(preview, /storedMarkupOrNull\(page\.customHead\)/, "customHead must be gated");
  assert.match(preview, /storedMarkupOrNull\(page\.customFoot\)/, "customFoot must be gated");
  assert.doesNotMatch(preview, /dangerouslySetInnerHTML=\{\{ __html: page\.custom/, "raw customHead/Foot must not be injected directly");

  const htmlBlock = read("src/built-ins/modules/website-editor/src/components/blocks/HtmlBlock.tsx");
  assert.match(htmlBlock, /mayRenderStoredMarkup\(\)/, "HtmlBlock must gate on safe mode");

  const textBlock = read("src/built-ins/modules/website-editor/src/components/blocks/TextBlock.tsx");
  assert.match(textBlock, /mayRenderStoredMarkup\(\)/, "TextBlock must gate raw-HTML rendering on safe mode");
});

test("the editor iframe no longer combines allow-scripts with allow-same-origin", () => {
  const editor = read("src/built-ins/modules/website-editor/src/pages/EditorPage.tsx");
  const sandbox = editor.match(/sandbox="([^"]*allow-forms[^"]*)"/)?.[1] ?? "";
  assert.ok(sandbox.length > 0, "iframe sandbox attribute not found");
  const hasScripts = /\ballow-scripts\b/.test(sandbox);
  const hasSameOrigin = /\ballow-same-origin\b/.test(sandbox);
  assert.ok(!(hasScripts && hasSameOrigin), `sandbox still combines allow-scripts + allow-same-origin: "${sandbox}"`);
  assert.ok(!hasSameOrigin, "same-origin must be dropped from the preview sandbox");
});

test("the production CSP drops the broad https: script source and narrows frame-ancestors", () => {
  const config = read("next.config.ts");
  const prodScript = config.match(/\? "(script-src[^"]*)"/)?.[1] ?? "";
  assert.ok(prodScript.length > 0, "production script-src not found");
  assert.doesNotMatch(prodScript, /https:/, `production script-src still allows a broad https: source: "${prodScript}"`);
  assert.match(prodScript, /'self'/, "script-src must keep 'self'");
  assert.match(config, /frame-ancestors 'self'\$\{DEV_LOOPBACK_FRAME_SOURCES\}`/, "frame-ancestors must be 'self' only (plus dev loopback)");
});
