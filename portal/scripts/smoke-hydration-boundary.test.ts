// Regression: the accessible hydration-ready boundary (UI Wave 9).
//
// The defect it pins: an SSR-painted client-component CTA whose onClick only
// attaches when its (large) owner hydrates looks active while silently
// swallowing an early click — confirmed on a PRODUCTION build with a ~251ms
// dead window at 1× CPU on "New client". The boundary makes the not-ready
// state visible (disabled) and announced (aria-busy) until the handler is
// genuinely live.
//
// Two halves are pinned here:
//   1. The hook's SSR contract — server-rendered markup carries
//      disabled + aria-busy (rendered in a child process WITHOUT the
//      react-server condition, since useSyncExternalStore is a client hook).
//   2. The wiring — both confirmed-affected CTAs actually consume the gate,
//      so it cannot be silently removed.
// The runtime half (the control enables the moment its handler is live and a
// click then opens the modal) is proven by the throttled production-build
// probe recorded in .artefacts/ui-wave9/.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const HOOK = join(ROOT, "src/lib/a11y/useHydrated.ts");

test("SSR renders a useHydrated-gated control disabled + aria-busy", () => {
  const code = `
    import React from "react";
    import { renderToString } from "react-dom/server";
    const _m = await import(process.env.HOOK_PATH);
    const useHydrated = _m.useHydrated ?? _m.default?.useHydrated;
    function Probe() {
      const hydrated = useHydrated();
      return React.createElement(
        "button",
        { type: "button", disabled: !hydrated, "aria-busy": !hydrated || undefined },
        "New client",
      );
    }
    process.stdout.write(renderToString(React.createElement(Probe)));
  `;
  const html = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    { cwd: ROOT, env: { ...process.env, HOOK_PATH: HOOK, NODE_OPTIONS: "" }, encoding: "utf8", timeout: 30_000 },
  ).trim();
  assert.match(html, /<button[^>]*\bdisabled=""/, `SSR must render the gate disabled, got: ${html}`);
  assert.match(html, /aria-busy="true"/, `SSR must announce aria-busy, got: ${html}`);
});

test("both confirmed-affected CTAs consume the boundary", () => {
  for (const [file, label] of [
    ["src/app/portal/agency/_NewClientButton.tsx", "New client trigger"],
    ["src/app/portal/clients/_PeopleHub.tsx", "Add contact"],
  ] as const) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.ok(
      source.includes('from "@/lib/a11y/useHydrated"'),
      `${label} (${file}) must import useHydrated`,
    );
    assert.ok(
      source.includes("disabled={!hydrated}"),
      `${label} (${file}) must gate the control with disabled={!hydrated}`,
    );
    assert.ok(
      source.includes("aria-busy={!hydrated || undefined}"),
      `${label} (${file}) must announce the pending state with aria-busy`,
    );
  }
});
