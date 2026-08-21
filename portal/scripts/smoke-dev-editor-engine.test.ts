// DEV EDITOR ENGINE — the rename + the "editor is wrong" fix.
//
// Two promises this pins:
//  1. The Dev Team "Editor" route mounts the FULL engine UI — the Portal Studio
//     (live canvas, depth selector, and the Builder/Content/Pages/Brand/Code/
//     Repo/Versions inspectors) — through the shared engine loader, and it is
//     founder + Dev Mode gated like every other dev-team surface.
//     It previously mounted `CodeWorkspace`: a read-only repository tree, which
//     is one inspector's worth of the engine. The repository browser still
//     exists — it is the studio's Repo tab — so this is a superset, not a swap.
//  2. Every user-facing "Aqua Engine" label became "Dev Editor Engine". The one
//     editor has one name, and it is the new one.

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
  it("mounts the full Portal Studio through the shared engine loader", () => {
    const page = read("src", "app", "portal", "dev-team", "editor", "page.tsx");

    // The engine's UI, wholesale — the same studio the portals route mounts.
    assert.match(page, /import\s*\{\s*ClientPortalStudio\s*\}\s*from\s*["']\.\.\/\.\.\/agency\/portals\/editor\/_ClientPortalStudio["']/);
    assert.match(page, /<ClientPortalStudio\b/);
    // …fed by the engine loader, so the two doors cannot drift apart.
    assert.match(page, /loadPortalStudioProps/);
    assert.match(page, /@\/engines\/editor\/server\/portalStudio/);

    // It is no longer the bare redirect it used to be.
    assert.ok(!/redirect\(["']\/portal\/dev-team\/tools\?view=editor["']\)/.test(page),
      "the editor page still redirects to the app-config editor");

    // The way back into Dev Team survives the full-screen studio.
    assert.match(page, /backHref="\/portal\/dev-team"/);
  });

  it("keeps the repository browser reachable — it is the studio's Repo tab", () => {
    const studio = read("src", "app", "portal", "agency", "portals", "editor", "_ClientPortalStudio.tsx");
    // The read-only tree the Dev Team editor used to mount directly still
    // exists inside the engine, so nothing was lost by mounting the studio.
    assert.match(studio, /RepositoryPanel/);
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
