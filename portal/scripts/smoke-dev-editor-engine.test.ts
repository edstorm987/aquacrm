// DEV EDITOR ENGINE — the rename + the "editor is wrong" fix.
//
// Two promises this pins:
//  1. The Dev Team "Editor" route is the REAL code + git engine now, not the
//     app-config redirect. It mounts `CodeWorkspace`, and it is founder + Dev
//     Mode gated like every other dev-team surface.
//  2. Every user-facing "Aqua Engine" label became "Dev Editor Engine". The one
//     editor has one name, and it is the new one.
//
// Both assertions fail against the pre-change tree: the page was a bare
// `redirect(...)` with no `CodeWorkspace`, and the labels all said "Aqua Engine".

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

describe("dev editor engine — the dev-team editor points at the real engine", () => {
  it("mounts CodeWorkspace instead of redirecting to the app-config editor", () => {
    const page = read("src", "app", "portal", "dev-team", "editor", "page.tsx");

    // It imports and renders the existing git-backed engine, wholesale.
    assert.match(page, /import\s*\{\s*CodeWorkspace\s*\}\s*from\s*["']\.\.\/\.\.\/agency\/development\/code\/_CodeWorkspace["']/);
    assert.match(page, /<CodeWorkspace\b/);

    // It is no longer the bare redirect it used to be.
    assert.ok(!/redirect\(["']\/portal\/dev-team\/tools\?view=editor["']\)/.test(page),
      "the editor page still redirects to the app-config editor");

    // It carries the shipyard header under the new name.
    assert.match(page, /title="Dev Editor Engine"/);
    assert.ok(page.includes("PageHeader"), "the page should mount a dev-team PageHeader");
  });

  it("is founder + Dev Mode gated, the same layered gate as the rest of dev-team", () => {
    const page = read("src", "app", "portal", "dev-team", "editor", "page.tsx");
    assert.match(page, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
    assert.match(page, /devDocsAccessible\(session\)/);
    assert.match(page, /notFound\(\)/);
  });
});

describe("dev editor engine — the rename is complete", () => {
  // Every file that carried a user-facing "Aqua Engine" label.
  const RENAMED_FILES: string[][] = [
    ["src", "built-ins", "modules", "agency-finance", "src", "components", "ExpensesList.tsx"],
    ["src", "built-ins", "modules", "website-editor", "index.ts"],
    ["src", "app", "portal", "clients", "[clientId]", "_FulfilmentPortalPreview.tsx"],
    ["src", "app", "portal", "clients", "[clientId]", "page.tsx"],
    ["src", "app", "portal", "agency", "fulfilment", "_AquaTagsWorkspace.tsx"],
    ["src", "app", "portal", "agency", "products", "[productId]", "_ProductRolloutCentre.tsx"],
    ["src", "app", "portal", "agency", "inbox", "_WebsiteSourcesConfig.tsx"],
    ["src", "app", "portal", "agency", "portals", "_PortalsWorkspace.tsx"],
    ["src", "app", "portal", "agency", "portals", "editor", "_ClientPortalStudio.tsx"],
    ["src", "app", "portal", "customer", "_PortalPageComposition.tsx"],
    ["src", "app", "portal", "dev-team", "editor", "_Section.tsx"],
  ];

  it("no user-facing \"Aqua Engine\" label survives in the renamed files", () => {
    const offenders = RENAMED_FILES.filter(parts => read(...parts).includes("Aqua Engine"));
    assert.deepEqual(
      offenders.map(parts => parts.join("/")),
      [],
      "these files still carry the old label",
    );
  });

  it("the website-editor module name is the new one", () => {
    const module = read("src", "built-ins", "modules", "website-editor", "index.ts");
    assert.match(module, /name:\s*["']Dev Editor Engine["']/);
  });

  it("at least one renamed surface now reads \"Dev Editor Engine\"", () => {
    const present = RENAMED_FILES.some(parts => read(...parts).includes("Dev Editor Engine"));
    assert.ok(present, "no renamed file contains the new label");
  });
});
