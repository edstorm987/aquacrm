// FIRST: re-execs this file without the suite's `--conditions react-server`,
// which `react-dom/server` refuses to load under. See the note in that file.
import "./client-render-condition";

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import * as ReactDomServer from "react-dom/server";

import { AccessBoundary, WorkspaceElementBoundary } from "../src/components/access/AccessBoundary";
import { AccessRequests, CapabilityComposer } from "../src/components/access/AccessControlPanel";
import { AquaEditorAIThread } from "../src/components/editing/AquaEditorAIThread";
import {
  BASE_CAPABILITIES,
  ELEMENT_CAPABILITIES,
  buildAgencyAccessScopeChoices,
  elementAccessLevel,
  elementCapability,
  narrowCapabilitiesToExactScope,
  setElementAccessLevel,
  visibleAccessRequestsForScopes,
  type AccessRequest,
  type NamedAccessScope,
} from "../src/components/access/accessModel";
import { ACCESS_BASE_CAPABILITIES, ACCESS_ELEMENT_KEYS } from "../src/server/types";

const renderToStaticMarkup = ReactDomServer.renderToStaticMarkup;

function checkedElementLevel(html: string, elementKey: string): string {
  const marker = `data-element-key="${elementKey}"`;
  const markerIndex = html.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing element control for ${elementKey}`);
  const start = html.lastIndexOf('<div role="radiogroup"', markerIndex);
  const end = html.indexOf("</div>", markerIndex);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const checked = [...html.slice(start, end).matchAll(/<input\b[^>]*>/g)]
    .map(match => match[0])
    .find(input => input.includes('checked=""'));
  assert.ok(checked, `missing checked radio for ${elementKey}`);
  return /value="([^"]+)"/.exec(checked)?.[1] ?? "";
}

test("access UI registry stays in parity with the server authority registry", () => {
  assert.deepEqual(BASE_CAPABILITIES.map(item => item.key).sort(), [...ACCESS_BASE_CAPABILITIES].sort());
  assert.deepEqual(ELEMENT_CAPABILITIES.map(item => item.key).sort(), [...ACCESS_ELEMENT_KEYS].sort());
  assert.ok(ELEMENT_CAPABILITIES.every(item => /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(item.key)));
});

test("element levels use semantic capability keys and replace only their own element", () => {
  const initial = ["workspace.view", elementCapability("staff.pay", "view"), elementCapability("staff.chat", "use")];
  const managed = setElementAccessLevel(initial, "staff.pay", "manage");
  assert.equal(elementAccessLevel(managed, "staff.pay"), "manage");
  assert.ok(managed.includes("element.staff.pay.manage"));
  assert.ok(managed.includes("element.staff.chat.use"));
  assert.ok(!managed.includes("element.staff.pay.view"));
  assert.deepEqual(setElementAccessLevel(managed, "staff.pay", "hidden"), ["element.staff.chat.use", "workspace.view"]);
});

test("capability composer exposes accessible four-state element controls", () => {
  const html = renderToStaticMarkup(React.createElement(CapabilityComposer, {
    capabilities: ["element.fulfilment.projects.use"],
    onChange: () => undefined,
    scopeKind: "workspace",
    idPrefix: "test",
  }));
  assert.match(html, /role="radiogroup"/);
  assert.equal(checkedElementLevel(html, "fulfilment.projects"), "use");
  for (const label of ["hidden", "view", "use", "manage"]) assert.ok(html.includes(`>${label}<`));
  assert.ok(html.includes("Stable key: fulfilment.projects"));
});

test("exact Staff and Fulfilment composers expose only their own stable element keys", () => {
  const staffHtml = renderToStaticMarkup(React.createElement(CapabilityComposer, {
    capabilities: [],
    onChange: () => undefined,
    scope: { kind: "workspace", id: "staff" },
    idPrefix: "staff-exact",
  }));
  assert.match(staffHtml, /data-element-key="workspace\.overview"/);
  assert.match(staffHtml, /data-element-key="staff\.people"/);
  assert.doesNotMatch(staffHtml, /data-element-key="fulfilment\./);

  const fulfilmentHtml = renderToStaticMarkup(React.createElement(CapabilityComposer, {
    capabilities: [],
    onChange: () => undefined,
    scope: { kind: "workspace", id: "fulfilment" },
    idPrefix: "fulfilment-exact",
  }));
  assert.match(fulfilmentHtml, /data-element-key="workspace\.overview"/);
  assert.match(fulfilmentHtml, /data-element-key="fulfilment\.services"/);
  assert.doesNotMatch(fulfilmentHtml, /data-element-key="staff\./);

  const genericTemplateHtml = renderToStaticMarkup(React.createElement(CapabilityComposer, {
    capabilities: [],
    onChange: () => undefined,
    scopeKind: "workspace",
    idPrefix: "generic-workspace-template",
  }));
  assert.match(genericTemplateHtml, /data-element-key="staff\.people"/);
  assert.match(genericTemplateHtml, /data-element-key="fulfilment\.services"/);
});

test("switching exact workspaces removes pending capabilities hidden in the next scope", () => {
  const pending = [
    "access.request",
    "workspace.view",
    "element.staff.pay.manage",
    "element.fulfilment.services.use",
    "project.view",
  ];

  assert.deepEqual(
    narrowCapabilitiesToExactScope(pending, { kind: "workspace", id: "staff" }),
    ["access.request", "workspace.view", "element.staff.pay.manage"],
  );
  assert.deepEqual(
    narrowCapabilitiesToExactScope(pending, { kind: "workspace", id: "fulfilment" }),
    ["access.request", "workspace.view", "element.fulfilment.services.use"],
  );
  assert.deepEqual(
    narrowCapabilitiesToExactScope(
      ["access.request", "element.staff.pay.manage"],
      { kind: "workspace", id: "fulfilment" },
    ),
    ["access.request"],
  );
});

test("development preview radio reflects the controlled hidden to use transition", () => {
  const initialCapabilities: string[] = [];
  const initialHtml = renderToStaticMarkup(React.createElement(CapabilityComposer, {
    capabilities: initialCapabilities,
    onChange: () => undefined,
    scopeKind: "project",
    idPrefix: "controlled",
  }));
  assert.equal(checkedElementLevel(initialHtml, "development.preview"), "hidden");

  const updatedCapabilities = setElementAccessLevel(initialCapabilities, "development.preview", "use");
  const updatedHtml = renderToStaticMarkup(React.createElement(CapabilityComposer, {
    capabilities: updatedCapabilities,
    onChange: () => undefined,
    scopeKind: "project",
    idPrefix: "controlled",
  }));
  assert.equal(checkedElementLevel(updatedHtml, "development.preview"), "use");
  assert.match(updatedHtml, /aria-label="Preview: use"/);
});

test("generic development workspace does not advertise inert project capabilities", () => {
  const html = renderToStaticMarkup(React.createElement(CapabilityComposer, {
    capabilities: [],
    onChange: () => undefined,
    scopeKind: "workspace",
    idPrefix: "development-workspace",
  }));
  assert.doesNotMatch(html, /Open project|Manage repository connection|Stable key: development\./);
  assert.match(html, /Manage workspace/);
});

test("owner project review queue stays within disclosed exact scopes", () => {
  const projectOne: NamedAccessScope = { kind: "project", id: "devproj_one", label: "Dev project · Aqua CRM" };
  const projectTwo: NamedAccessScope = { kind: "project", id: "devproj_two", label: "Dev project · Client portal" };
  const choices = [projectOne, projectTwo];
  const requests: AccessRequest[] = [
    { id: "req_one", requesterUserId: "user_one", scope: { kind: "project", id: "devproj_one" }, environment: "live", requestedCapabilities: ["project.view"], reason: "Inspect the Aqua CRM project", status: "pending" },
    { id: "req_two", requesterUserId: "user_two", scope: { kind: "project", id: "devproj_two" }, environment: "live", requestedCapabilities: ["project.preview"], reason: "Open the client preview", status: "pending" },
    { id: "req_foreign", requesterUserId: "user_three", scope: { kind: "project", id: "devproj_foreign" }, environment: "live", requestedCapabilities: ["project.view"], reason: "Should not be disclosed", status: "pending" },
    { id: "req_sandbox", requesterUserId: "user_one", scope: { kind: "project", id: "devproj_one" }, environment: "sandbox", requestedCapabilities: ["project.view"], reason: "Wrong environment", status: "pending" },
  ];

  const ownerQueue = visibleAccessRequestsForScopes(requests, "live", choices, projectOne, true);
  assert.deepEqual(ownerQueue.map(request => request.id), ["req_one", "req_two"]);
  const html = renderToStaticMarkup(React.createElement(AccessRequests, {
    requests: ownerQueue,
    canManage: true,
    people: [],
    scope: projectOne,
    scopeChoices: choices,
    onSelectScope: () => undefined,
    environment: "live",
    mutate: async () => undefined,
  }));
  assert.match(html, /Dev project · Aqua CRM/);
  assert.match(html, /Dev project · Client portal/);
  assert.match(html, /aria-label="Select exact scope: Dev project · Client portal"/);
  assert.doesNotMatch(html, /devproj_foreign|Should not be disclosed/);

  const requesterQueue = visibleAccessRequestsForScopes(requests, "live", choices, projectOne, false);
  assert.deepEqual(requesterQueue.map(request => request.id), ["req_one"]);
});

test("agency Settings exposes tenant project choices only to access owners", () => {
  const input = {
    agencyId: "agency_one",
    clients: [{ id: "client_one", name: "Client one" }],
    devProjects: [{ id: "devproj_one", name: "Aqua CRM" }, { id: "devproj_two", name: "Portal" }],
  };
  const ownerChoices = buildAgencyAccessScopeChoices({ ...input, canManageProjectAccess: true });
  assert.deepEqual(
    ownerChoices.filter(scope => scope.kind === "project"),
    [
      { kind: "project", id: "devproj_one", label: "Dev project · Aqua CRM" },
      { kind: "project", id: "devproj_two", label: "Dev project · Portal" },
    ],
  );
  const staffChoices = buildAgencyAccessScopeChoices({ ...input, canManageProjectAccess: false });
  assert.equal(staffChoices.some(scope => scope.kind === "project"), false);
  assert.equal(ownerChoices.some(scope => scope.kind === "workspace" && scope.id === "development"), false);
  assert.equal(staffChoices.some(scope => scope.kind === "workspace" && scope.id === "development"), false);
});

test("workspace element boundary hides, soft-locks or renders from effective capabilities", () => {
  const child = React.createElement("button", null, "Publish");
  const hidden = renderToStaticMarkup(React.createElement(WorkspaceElementBoundary, {
    capabilities: [],
    elementKey: "development.publish",
    required: "use",
    children: child,
  }));
  assert.equal(hidden, "");

  const readOnly = renderToStaticMarkup(React.createElement(WorkspaceElementBoundary, {
    capabilities: ["element.development.publish.view"],
    elementKey: "development.publish",
    required: "use",
    children: child,
  }));
  assert.match(readOnly, /data-access-state="readonly"/);
  assert.match(readOnly, /inert=""/);

  const interactive = renderToStaticMarkup(React.createElement(AccessBoundary, {
    capabilities: ["dev.project.run_local"],
    capability: "dev.project.run_local",
    children: React.createElement("button", null, "Start preview"),
  }));
  assert.match(interactive, />Start preview</);
  assert.doesNotMatch(interactive, /readonly/);
});

test("AI element levels project to read-only history, conversation use and managed configuration", () => {
  const common = {
    projectId: "project_one",
    projectName: "Project one",
    configured: false,
    model: "gpt-5-mini",
    userName: "Staff",
    initialConversation: {
      id: "agency_one|project_one",
      agencyId: "agency_one",
      projectId: "project_one",
      threads: [{
        id: "thread_one",
        title: "Homepage",
        createdAt: 1,
        updatedAt: 1,
        messages: [{ id: "message_one", role: "user" as const, content: "Keep this visible", createdAt: 1 }],
      }],
      evictedMessages: 0,
      updatedAt: 1,
    },
    initialLimits: { threadsPerProject: 10, messagesPerThread: 100, messageChars: 4_000, projectChars: 100_000 },
    prefill: "",
    onConfigure: () => undefined,
  };

  const view = renderToStaticMarkup(React.createElement(AquaEditorAIThread, {
    ...common,
    canUse: false,
    canManage: false,
  }));
  assert.match(view, /Keep this visible/);
  assert.match(view, /History is read-only/);
  assert.doesNotMatch(view, /aqua-editor-ai-composer|Start a new conversation|Rename Homepage|Delete Homepage|Set this project.s key/);

  const use = renderToStaticMarkup(React.createElement(AquaEditorAIThread, {
    ...common,
    canUse: true,
    canManage: false,
  }));
  assert.match(use, /aqua-editor-ai-composer|Start a new conversation/);
  assert.doesNotMatch(use, /History is read-only/);
  const keyConfigurationButton = /Set this project&#x27;s key<\/button>/;
  assert.doesNotMatch(use, keyConfigurationButton);

  const manage = renderToStaticMarkup(React.createElement(AquaEditorAIThread, {
    ...common,
    canUse: true,
    canManage: true,
    initialConversation: {
      ...common.initialConversation,
      threads: common.initialConversation.threads.map(thread => ({ ...thread, messages: [] })),
    },
  }));
  assert.match(manage, keyConfigurationButton);
});
