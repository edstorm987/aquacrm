// This file renders client components. The canonical smoke command runs under
// the React Server condition, where react-dom/server deliberately refuses to
// load; re-exec this one file in the client-render lane before importing it.
import "./client-render-condition";

import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Sidebar from "../src/built-ins/modules/website-editor/src/components/canvas/Sidebar";
import BlockCatalog from "../src/built-ins/modules/website-editor/src/components/editor/BlockCatalog";
import {
  blockDefinitionIsAvailable,
  listAvailableBlockDefinitions,
  listBlockDefinitions,
} from "../src/built-ins/modules/website-editor/src/components/blockRegistry";

const requiredDefinitions = listBlockDefinitions().filter(definition => definition.requiresPlugin);

test("requiresPlugin definitions are hidden until their tenant plugin is enabled", () => {
  assert.ok(requiredDefinitions.length > 0, "fixture must include plugin-backed blocks");

  const withoutPlugins = listAvailableBlockDefinitions([]);
  const withEcommerce = listAvailableBlockDefinitions(["ecommerce"]);

  for (const definition of requiredDefinitions) {
    assert.equal(
      blockDefinitionIsAvailable(definition, []),
      false,
      `${definition.type} ignored requiresPlugin=${definition.requiresPlugin}`,
    );
    assert.equal(
      withoutPlugins.some(candidate => candidate.type === definition.type),
      false,
      `${definition.type} leaked into an unprovisioned palette`,
    );
    if (definition.requiresPlugin === "ecommerce") {
      assert.equal(
        withEcommerce.some(candidate => candidate.type === definition.type),
        true,
        `${definition.type} stayed hidden after ecommerce was enabled`,
      );
    }
  }
});

test("the mounted Sidebar does not offer unavailable plugin blocks", () => {
  const render = (enabledPluginIds: readonly string[]) => renderToStaticMarkup(
    React.createElement(Sidebar, {
      blocks: [],
      selectedId: null,
      enabledPluginIds,
      onSelect: () => undefined,
      onAddTopLevel: () => undefined,
    }),
  );

  const unavailable = render([]);
  const available = render(["ecommerce"]);
  for (const definition of requiredDefinitions.filter(item => item.requiresPlugin === "ecommerce")) {
    assert.equal(unavailable.includes(`>${definition.label}<`), false);
    assert.equal(available.includes(`>${definition.label}<`), true);
  }
});

test("the secondary block catalog uses the same restrictive availability selector", () => {
  const unavailable = renderToStaticMarkup(React.createElement(BlockCatalog, {
    onInsert: () => undefined,
  }));
  const available = renderToStaticMarkup(React.createElement(BlockCatalog, {
    onInsert: () => undefined,
    enabledPluginIds: ["ecommerce"],
  }));

  for (const definition of requiredDefinitions.filter(item => item.requiresPlugin === "ecommerce")) {
    assert.equal(unavailable.includes(`data-block-type="${definition.type}"`), false);
    assert.equal(available.includes(`data-block-type="${definition.type}"`), true);
  }
});
