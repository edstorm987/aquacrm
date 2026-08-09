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

describe("agency portals workspace", () => {
  it("provides one central library and editor route", () => {
    const page = read("src", "app", "portal", "agency", "portals", "page.tsx");
    const workspace = read("src", "app", "portal", "agency", "portals", "_PortalsWorkspace.tsx");

    assert.ok(page.includes("listClients(agencyId, { includeArchived: true })"));
    assert.ok(page.includes("listInstalledFor"));
    assert.ok(workspace.includes('label="All portals"'));
    assert.ok(workspace.includes('label="Portal editor"'));
    assert.ok(workspace.includes("Search client, email, plan or brand"));
    assert.ok(workspace.includes("PortalEditorPanel"));
  });

  it("uses the real client preview and editing flows", () => {
    const workspace = read("src", "app", "portal", "agency", "portals", "_PortalsWorkspace.tsx");

    assert.ok(workspace.includes("/client-preview/${portal.id}"));
    assert.ok(workspace.includes("/portal/clients/${portal.id}?tab=fulfilment"));
    assert.ok(workspace.includes("/portal/clients/${portal.id}/portals"));
    assert.ok(workspace.includes("Create portal"));
  });

  it("keeps the editor out of Settings to avoid duplicate controls", () => {
    const settings = read("src", "app", "portal", "agency", "settings", "SettingsTabs.tsx");
    const expenses = read("src", "built-ins", "modules", "agency-finance", "src", "components", "ExpensesList.tsx");
    const search = read("src", "app", "api", "portal", "search", "route.ts");

    assert.ok(!settings.includes('id: "portal-editor"'));
    assert.ok(settings.includes('["Portals", "/portal/agency/portals"]'));
    assert.ok(expenses.includes("/portal/agency/portals?view=editor#forms/expenses"));
    assert.ok(search.includes("/portal/agency/portals?view=editor"));
  });
});
