import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

describe("company connections workspace", () => {
  it("keeps websites and operational integrations together inside Company", () => {
    const company = read("src", "app", "portal", "agency", "company", "_CompanyWorkspace.tsx");
    const connections = read("src", "app", "portal", "agency", "company", "_CompanyConnectionsWorkspace.tsx");
    const page = read("src", "app", "portal", "agency", "company", "page.tsx");
    const assistant = read("src", "app", "portal", "agency", "assistant", "AssistantWorkspace.tsx");
    const integrationPanel = read("src", "app", "portal", "agency", "settings", "IntegrationConnectionsPanel.tsx");

    assert.ok(company.includes('["connections", "Connections", PlugZap]'));
    assert.ok(company.includes('requestedView === "connections"'));
    assert.ok(company.includes('url.searchParams.set("view", "connections")'));
    assert.ok(company.includes("<CompanyConnectionsWorkspace"));
    assert.ok(connections.includes("<IntegrationConnectionsPanel"));
    assert.ok(connections.includes('fetch("/api/portal/settings"'));
    assert.ok(connections.includes('fetch("/api/portal/trading-companies"'));
    assert.ok(connections.includes("Company websites"));
    assert.ok(connections.includes("Technical delivery"));
    assert.ok(page.includes("workspaceWebsite={settings.website}"));
    assert.ok(page.includes("clients={clients.map"));
    assert.ok(page.includes("requestedIntegration"));
    assert.ok(page.includes('requestedView === "companies"'));
    assert.ok(page.includes("!showCompaniesGrid"));
    assert.ok(assistant.includes('href="/portal/agency/company?view=connections&integration=openai"'));
    assert.ok(assistant.includes("Configure OpenAI"));
    assert.ok(integrationPanel.includes("initialProvider"));
    assert.ok(integrationPanel.includes("setModal({ provider: initialProvider, connection: existing })"));
    assert.ok(integrationPanel.includes("integrationSupportsClientScope"));
    assert.ok(integrationPanel.includes("Make active"));
    assert.ok(integrationPanel.includes('action: "activate"'));
  });

  // ── REVERSED 2026-08-29, at Ed's instruction ────────────────────────────
  //
  // This test used to assert that Settings must NOT mount the integrations
  // panel: the tab had been removed and work pointed at Company. Ed asked for
  // it back — *"bring it all into settings rather than taking us out of
  // settings, so I can do it all inside."*
  //
  // What still holds, and is what the rest of this file protects: Company →
  // Connections remains a real surface, and both mount the SAME panel. Many
  // doors onto one editor is fine; two copies of the editor is not.
  it("keeps Company as a full connections surface alongside Settings", () => {
    const settings = read("src", "app", "portal", "agency", "settings", "SettingsTabs.tsx");
    const performance = read("src", "app", "portal", "agency", "performance", "_AquaTagDashboard.tsx");
    const project = read("src", "app", "portal", "agency", "development", "projects", "[projectId]", "_FirstPartyProjectWorkspace.tsx");
    const properties = read("src", "app", "portal", "clients", "[clientId]", "_PropertiesTabClient.tsx");

    // Settings now mounts it too (Ed, 2026-08-29). The old `integrations` id
    // stays retired — it resolves through LEGACY_TAB_ALIASES instead.
    assert.ok(!settings.includes('id: "integrations"'));
    assert.ok(settings.includes("<IntegrationConnectionsPanel"));
    assert.ok(settings.includes('integrations: "connections"'), "the retired id must still resolve");
    assert.ok(performance.includes('/portal/agency/company?view=connections'));
    assert.ok(project.includes('/portal/agency/company?view=connections'));
    assert.ok(properties.includes("Company → Connections"));
  });
});
