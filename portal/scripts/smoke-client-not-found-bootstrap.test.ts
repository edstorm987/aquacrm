import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { COLOR_MODE_SCRIPT } from "../src/lib/chrome/colorMode";
import { SIDEBAR_COLLAPSE_HYDRATION_SCRIPT } from "../src/components/chrome/sidebarCollapseState";

const ROOT = process.cwd();
const read = (relPath: string) => readFileSync(join(ROOT, relPath), "utf8");

function runBootstrap(script: string, stored: string | null, throwOnRead = false) {
  const attributes = new Map<string, string>();
  const documentElement = {
    dataset: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
  };
  vm.runInNewContext(script, {
    localStorage: {
      getItem() {
        if (throwOnRead) throw new Error("storage unavailable");
        return stored;
      },
    },
    document: { documentElement },
  });
  return { attributes, dataset: documentElement.dataset };
}

test("root bootstrap uses Next beforeInteractive scripts instead of raw React script elements", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import Script from "next\/script"/);
  assert.match(layout, /id="aqua-color-mode-bootstrap" strategy="beforeInteractive"/);
  assert.match(layout, /id="aqua-sidebar-collapse-bootstrap" strategy="beforeInteractive"/);
  assert.equal((layout.match(/<Script\b/g) ?? []).length, 2, "the two bootstraps should stay independently identified");
  assert.doesNotMatch(layout, /<script(?:\s|>)/, "a raw script reintroduces the client not-found warning");
  assert.doesNotMatch(layout, /dangerouslySetInnerHTML/);
});

test("the supported script path preserves the pre-paint colour-mode contract", () => {
  assert.equal(runBootstrap(COLOR_MODE_SCRIPT, "dark").dataset.colorMode, "dark");
  assert.equal(runBootstrap(COLOR_MODE_SCRIPT, "light").dataset.colorMode, "light");
  assert.equal(runBootstrap(COLOR_MODE_SCRIPT, "unexpected").dataset.colorMode, "light");
  assert.equal(runBootstrap(COLOR_MODE_SCRIPT, null, true).dataset.colorMode, "light");
});

test("the supported script path preserves the pre-paint sidebar contract", () => {
  assert.equal(
    runBootstrap(SIDEBAR_COLLAPSE_HYDRATION_SCRIPT, "1").attributes.get("data-sidebar-collapsed"),
    "true",
  );
  assert.equal(
    runBootstrap(SIDEBAR_COLLAPSE_HYDRATION_SCRIPT, "0").attributes.get("data-sidebar-collapsed"),
    "false",
  );
  assert.equal(
    runBootstrap(SIDEBAR_COLLAPSE_HYDRATION_SCRIPT, null, true).attributes.has("data-sidebar-collapsed"),
    false,
  );
});

test("an absent client aborts before client chrome or preview scripts are constructed", () => {
  const clientLayout = read("src/app/portal/clients/[clientId]/layout.tsx");
  const missingGuard = clientLayout.indexOf("if (!client) notFound();");
  assert.ok(missingGuard > -1, "the client layout lost its honest missing-record boundary");
  for (const marker of ["<ThemeInjector", "<Sidebar", "data-phase-preview", "<Topbar"]) {
    assert.ok(clientLayout.indexOf(marker) > missingGuard, `${marker} is constructed before the missing-client abort`);
  }
});
