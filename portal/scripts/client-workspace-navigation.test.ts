import assert from "node:assert/strict";
import test from "node:test";
import { clientWorkspaceHref, resolveClientWorkspaceTab } from "../src/lib/clients/clientWorkspace";

test("legacy client workspace tabs resolve into canonical lenses", () => {
  assert.equal(resolveClientWorkspaceTab("fulfilment"), "delivery");
  assert.equal(resolveClientWorkspaceTab("kanban"), "delivery");
  assert.equal(resolveClientWorkspaceTab("website"), "systems");
  assert.equal(resolveClientWorkspaceTab("properties"), "systems");
  assert.equal(resolveClientWorkspaceTab("assets"), "files");
  assert.equal(resolveClientWorkspaceTab("portal"), "portal");
  assert.equal(resolveClientWorkspaceTab("unknown"), "overview");
});

test("client workspace hrefs retain contextual subviews", () => {
  assert.equal(clientWorkspaceHref("client one", "overview"), "/portal/clients/client%20one");
  assert.equal(clientWorkspaceHref("client one", "systems", { systemView: "properties" }), "/portal/clients/client%20one?tab=systems&systemView=properties");
});
