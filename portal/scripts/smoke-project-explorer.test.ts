import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AQUA_EXPLORER_MESSAGES,
  AQUA_EXPLORER_PROTOCOL_VERSION,
  explorerTargetOrigin,
  isAquaExplorerDiagnosticsMessage,
  isAquaExplorerReadyMessage,
  isAquaExplorerSelectedMessage,
} from "../src/lib/aquaExplorerBridge";
import { AQUA_TAG_SOURCE } from "../src/lib/aquaTagSource";

test("Project Explorer recognises valid tag bridge messages", () => {
  assert.equal(isAquaExplorerReadyMessage({
    type: AQUA_EXPLORER_MESSAGES.ready,
    version: AQUA_EXPLORER_PROTOCOL_VERSION,
    requestId: "request-1",
    propertyId: "site-1",
    path: "/",
    title: "Example",
    capabilities: {
      inspect: true,
      visualEditing: true,
      editableElements: 3,
    },
  }), true);

  assert.equal(isAquaExplorerDiagnosticsMessage({
    type: AQUA_EXPLORER_MESSAGES.diagnostics,
    version: AQUA_EXPLORER_PROTOCOL_VERSION,
    requestId: "request-2",
    diagnostics: {
      path: "/contact",
      title: "Contact",
      readyState: "complete",
      viewport: { width: 1280, height: 800 },
      document: { width: 1280, height: 2400 },
      counts: { editableElements: 0, forms: 1, images: 4, links: 8, resources: 20 },
      performance: { loadMs: 420 },
      recentErrors: [],
    },
  }), true);

  assert.equal(isAquaExplorerSelectedMessage({
    type: AQUA_EXPLORER_MESSAGES.selected,
    version: AQUA_EXPLORER_PROTOCOL_VERSION,
    element: {
      id: "aqua-element-1",
      tagName: "h1",
      kind: "text",
      label: "Welcome",
      text: "Welcome",
      styles: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        fontSize: "48px",
        fontWeight: "700",
        textAlign: "start",
      },
    },
  }), true);
});

test("Project Explorer rejects malformed bridge messages", () => {
  assert.equal(isAquaExplorerReadyMessage({
    type: AQUA_EXPLORER_MESSAGES.ready,
    version: AQUA_EXPLORER_PROTOCOL_VERSION,
    requestId: "request-1",
    capabilities: { inspect: true },
  }), false);

  assert.equal(isAquaExplorerDiagnosticsMessage({
    type: AQUA_EXPLORER_MESSAGES.diagnostics,
    version: 99,
    requestId: "request-2",
    diagnostics: {},
  }), false);
});

test("Project Explorer keeps postMessage origins explicit", () => {
  assert.equal(explorerTargetOrigin("https://example.com/path?preview=true"), "https://example.com");
  assert.equal(explorerTargetOrigin("http://localhost:3035/"), "http://localhost:3035");
  assert.equal(explorerTargetOrigin("not-a-url"), "*");
});

test("Aqua tag exposes consent-safe diagnostics and preview-only editing", () => {
  assert.match(AQUA_TAG_SOURCE, /aqua-explorer:ping/);
  assert.match(AQUA_TAG_SOURCE, /aqua-explorer:inspect/);
  assert.match(AQUA_TAG_SOURCE, /aqua-explorer:enable/);
  assert.match(AQUA_TAG_SOURCE, /aqua-explorer:patch/);
  assert.match(AQUA_TAG_SOURCE, /aqua-explorer:reset/);
  assert.match(AQUA_TAG_SOURCE, /visualEditing:\s*true/);
  assert.match(AQUA_TAG_SOURCE, /\[data-aqua-edit\], \[data-portal-edit\]/);
  assert.doesNotMatch(AQUA_TAG_SOURCE, /aqua-explorer:save/);
});

test("Aqua tag source remains valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(AQUA_TAG_SOURCE));
});
