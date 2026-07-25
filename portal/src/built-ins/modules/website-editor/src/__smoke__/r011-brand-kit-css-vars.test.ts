// Smoke — R011 Brand-kit CSS variables.
//
// Asserts (1) extendedBrandToCss emits the original 7 vars +
// 9 extended vars, (2) partial brand-kits still produce a
// complete dark-friendly palette via fallbacks, (3) the brand-
// kit/extended HTTP handlers round-trip per-install fields,
// (4) the looksLikeHardcodedBrandColour heuristic flags the
// known offenders.

import {
  extendedBrandToCss,
  extendedBrandToStyleString,
  looksLikeHardcodedBrandColour,
} from "../lib/brandKitCss";
import { handleGetBrandKitExtended, handleSaveBrandKitExtended } from "../api/handlers/brandKit";
import type { BrandKit } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";

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

(async () => {
  // ─── A: extendedBrandToCss base coverage ────────────────────────────────
  const minimal: BrandKit = { primaryColor: "#ff6b35" };
  const { vars: minVars } = extendedBrandToCss(minimal);
  expect("primary var emitted", minVars["--brand-primary"] === "#ff6b35");
  for (const v of [
    "--brand-bg", "--brand-bg-elevated", "--brand-text", "--brand-text-muted",
    "--brand-border", "--brand-radius-sm", "--brand-radius-md", "--brand-radius-lg",
  ]) {
    expect(`extended var emitted with default: ${v}`, !!minVars[v]);
  }

  // ─── B: full brand-kit emits everything ─────────────────────────────────
  const full: BrandKit = {
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#0ea5e9",
    secondaryColor: "#f1f5f9",
    accentColor: "#fbbf24",
    fontHeading: "'Playfair Display', serif",
    fontBody: "'Inter', sans-serif",
    borderRadius: "12px",
    customCSS: "body{background:#000}",
    bg: "#000000",
    bgElevated: "#0F0F0F",
    text: "#f5f3ec",
    textMuted: "rgba(255,255,255,0.55)",
    border: "rgba(255,255,255,0.08)",
    radiusSm: "4px",
    radiusMd: "12px",
    radiusLg: "20px",
    darkMode: true,
  };
  const { vars: fullVars, customCSS } = extendedBrandToCss(full);
  expect("logo var wraps URL in url()",
    fullVars["--brand-logo"] === 'url("https://example.com/logo.png")');
  expect("font heading emitted", fullVars["--brand-font-heading"] === full.fontHeading);
  expect("radius scale picks up custom values",
    fullVars["--brand-radius-sm"] === "4px" &&
    fullVars["--brand-radius-md"] === "12px" &&
    fullVars["--brand-radius-lg"] === "20px");
  expect("dark-mode hint emits as 1", fullVars["--brand-dark-mode"] === "1");
  expect("customCSS pass-through", customCSS === "body{background:#000}");

  // radiusMd falls through to legacy borderRadius when not set.
  const legacy: BrandKit = { primaryColor: "#000", borderRadius: "9px" };
  const { vars: legacyVars } = extendedBrandToCss(legacy);
  expect("radiusMd falls through to legacy borderRadius",
    legacyVars["--brand-radius-md"] === "9px");

  // ─── C: extendedBrandToStyleString shape ────────────────────────────────
  const css = extendedBrandToStyleString(full);
  expect("style string opens with :root scope", css.startsWith(":root {"));
  expect("style string contains all 9 extended vars",
    css.includes("--brand-bg:") && css.includes("--brand-bg-elevated:") &&
    css.includes("--brand-radius-lg:") && css.includes("--brand-dark-mode:"));
  expect("customCSS appended after :root block",
    css.endsWith("body{background:#000}"));
  const scoped = extendedBrandToStyleString(full, ".tenant-scope");
  expect("custom scope honoured", scoped.startsWith(".tenant-scope {"));

  // ─── D: hardcoded brand colour heuristic ────────────────────────────────
  expect("orange-family hex flagged",
    looksLikeHardcodedBrandColour("#ff6b35") &&
    looksLikeHardcodedBrandColour("#ff7300"));
  expect("cyan-500 hardcode flagged",
    looksLikeHardcodedBrandColour("color: #38bdf8"));
  expect("error red NOT flagged (not a brand colour)",
    !looksLikeHardcodedBrandColour("#fca5a5"));

  // ─── E: HTTP round-trip ─────────────────────────────────────────────────
  const storage = memStorage();
  const ctx = {
    agencyId: "ag_smoke",
    clientId: "cl_smoke",
    actor: "u_smoke",
    storage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleGetBrandKitExtended>[1];

  const empty = await handleGetBrandKitExtended(new Request("http://x/brand-kit/extended"), ctx);
  expect("GET empty returns 200 + extended:{}", empty.status === 200);
  const emptyBody = await empty.json() as { ok: boolean; extended: Record<string, unknown> };
  expect("GET empty extended is empty object",
    emptyBody.ok && Object.keys(emptyBody.extended).length === 0);

  const save = await handleSaveBrandKitExtended(new Request("http://x/brand-kit/extended", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bg: "#000000",
      bgElevated: "#0F0F0F",
      darkMode: true,
      // Unknown fields should be ignored (allow-list).
      randomField: "nope",
    }),
  }), ctx);
  expect("POST save returns 200", save.status === 200);
  const saveBody = await save.json() as { ok: boolean; extended: Record<string, unknown> };
  expect("POST persisted bg + bgElevated + darkMode",
    saveBody.extended.bg === "#000000" &&
    saveBody.extended.bgElevated === "#0F0F0F" &&
    saveBody.extended.darkMode === true);
  expect("POST stripped unknown fields",
    !("randomField" in saveBody.extended));

  // GET returns persisted data.
  const persisted = await handleGetBrandKitExtended(new Request("http://x/brand-kit/extended"), ctx);
  const persistedBody = await persisted.json() as { ok: boolean; extended: Record<string, unknown> };
  expect("GET after save surfaces persisted data",
    persistedBody.extended.bg === "#000000");

  // POST with empty value clears that field only.
  const clearOne = await handleSaveBrandKitExtended(new Request("http://x/brand-kit/extended", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bg: "" }),
  }), ctx);
  expect("POST with empty string clears that field",
    clearOne.status === 200);
  const clearBody = await clearOne.json() as { extended: Record<string, unknown> };
  expect("bg cleared but bgElevated + darkMode preserved",
    !("bg" in clearBody.extended) &&
    clearBody.extended.bgElevated === "#0F0F0F" &&
    clearBody.extended.darkMode === true);

  // POST without body → 400.
  const bad = await handleSaveBrandKitExtended(new Request("http://x/brand-kit/extended", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  }), ctx);
  expect("POST malformed body → 400", bad.status === 400);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
