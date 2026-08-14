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
  });

  it("removes the duplicate Settings integration tab and points work to Company", () => {
    const settings = read("src", "app", "portal", "agency", "settings", "SettingsTabs.tsx");
    const performance = read("src", "app", "portal", "agency", "performance", "_AquaTagDashboard.tsx");
    const project = read("src", "app", "portal", "agency", "development", "projects", "[projectId]", "_FirstPartyProjectWorkspace.tsx");
    const properties = read("src", "app", "portal", "clients", "[clientId]", "_PropertiesTabClient.tsx");

    assert.ok(!settings.includes('id: "integrations"'));
    assert.ok(!settings.includes("<IntegrationConnectionsPanel"));
    assert.ok(settings.includes('/portal/agency/company?view=connections'));
    assert.ok(performance.includes('/portal/agency/company?view=connections'));
    assert.ok(project.includes('/portal/agency/company?view=connections'));
    assert.ok(properties.includes("Company → Connections"));
  });
});
