// Issues #28/#31: retired Website Editor browser-only islands must stay out of
// navigation, while old bookmarks continue to reach a canonical shared model.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const navigationClientBuild = require.resolve("next/dist/client/components/navigation.js");
(require as unknown as { cache: Record<string, unknown> }).cache[navigationClientBuild] = {
  id: navigationClientBuild,
  filename: navigationClientBuild,
  path: navigationClientBuild,
  loaded: true,
  children: [],
  paths: [],
  exports: require("next/dist/client/components/navigation.react-server.js"),
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULE = join(ROOT, "src/built-ins/modules/website-editor/src");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

async function redirectTargetOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) throw error;
    return digest.split(";")[2] ?? null;
  }
}

describe("Website Editor local-island retirement", () => {
  it("removes disconnected routes from the plugin manifest and tab strips", async () => {
    const { default: manifest } = await import("../src/built-ins/modules/website-editor/index");
    const retiredPaths = [
      "/portal/clients/[clientId]/sections",
      "/portal/clients/[clientId]/popups",
      "/portal/clients/[clientId]/pages/[pageId]",
    ];

    for (const path of retiredPaths) {
      assert.equal(manifest.pages.some(page => page.path === path), false, `${path} must not mount a local editor`);
      assert.equal(manifest.navItems.some(item => item.href === path), false, `${path} must not appear in navigation`);
    }

    const tabs = read("src/built-ins/modules/website-editor/src/lib/tabSets.ts");
    for (const href of ["../sites", "../sections", "../popups"]) {
      assert.doesNotMatch(tabs, new RegExp(href.replace("..", "\\.\\.")), `${href} must not survive as a tab`);
    }
  });

  it("executes real bookmark redirects to canonical shared surfaces", async () => {
    const clientId = "client /north";
    const encoded = encodeURIComponent(clientId);
    const cases = [
      {
        module: "../src/app/portal/clients/[clientId]/sections/page",
        params: { clientId },
        expected: `/portal/clients/${encoded}/editor`,
      },
      {
        module: "../src/app/portal/clients/[clientId]/popups/page",
        params: { clientId },
        expected: `/portal/clients/${encoded}/editor`,
      },
      {
        module: "../src/app/portal/clients/[clientId]/pages/[pageId]/page",
        params: { clientId, pageId: "local_page_1" },
        expected: `/portal/clients/${encoded}/pages`,
      },
    ] as const;

    for (const entry of cases) {
      const route = await import(entry.module);
      const target = await redirectTargetOf(() => route.default({ params: Promise.resolve(entry.params) }));
      assert.equal(target, entry.expected);
    }
  });

  it("deletes the unconsumed stores and keeps settings on declared API contracts", () => {
    for (const file of [
      "pages/SectionsPage.tsx",
      "pages/PopupsPage.tsx",
      "pages/PageDetailPage.tsx",
      "lib/sections.ts",
      "lib/popup.ts",
      "lib/customise.ts",
      "lib/loginCustomisation.ts",
      "lib/sidebarLayout.ts",
    ]) {
      assert.equal(existsSync(join(MODULE, file)), false, `${file} must stay deleted`);
    }

    const settings = read("src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx");
    assert.doesNotMatch(settings, /localStorage/, "shared website controls must not write browser-only authority");
    assert.match(settings, /fetch\("\/api\/portal\/website-editor\/sites"/);
    assert.match(settings, /\/api\/portal\/website-editor\/export\?siteId=/);
    assert.match(settings, /x-aqua-export-unsupported-blocks/,
      "the UI must surface the export handler's unsupported-block contract");
  });

  it("does not probe an absent AI plugin route", () => {
    const editor = read("src/built-ins/modules/website-editor/src/pages/EditorPage.tsx");
    assert.match(editor, /enabledPluginIds\.includes\("ai-builder"\)/);
    assert.doesNotMatch(editor, /\/api\/portal\/ai-builder\/status/);
  });
});
