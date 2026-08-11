import assert from "node:assert/strict";
import test from "node:test";

import { clientIdFromPortalReferer } from "../src/lib/server/pluginRequestScope";
import {
  cloneBlock,
  findBlock,
  moveBlock,
} from "../src/built-ins/modules/website-editor/src/components/canvas/blockTreeOps";
import type { Block } from "../src/built-ins/modules/website-editor/src/types/block";

test("client plugin APIs inherit the client workspace from a same-origin referer", () => {
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "http://localhost:3032/portal/clients/cli_123/edit-website?page=home",
    ),
    "cli_123",
  );
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "http://localhost:3032/portal/clients/client%20one/pages",
    ),
    "client one",
  );
});

test("client scope is not inherited from another origin or an agency page", () => {
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "https://example.com/portal/clients/cli_bad/edit-website",
    ),
    undefined,
  );
  assert.equal(
    clientIdFromPortalReferer(
      "http://localhost:3032/api/portal/website-editor/sites",
      "http://localhost:3032/portal/agency/development",
    ),
    undefined,
  );
});

test("visual builder clones nested blocks with fresh identities", () => {
  const block: Block = {
    id: "section_old",
    type: "section",
    props: {},
    children: [{ id: "heading_old", type: "heading", props: { text: "Hello" } }],
  };
  const copy = cloneBlock(block);
  assert.notEqual(copy.id, block.id);
  assert.notEqual(copy.children?.[0]?.id, block.children?.[0]?.id);
  assert.equal(copy.children?.[0]?.props.text, "Hello");
});

test("visual builder can move an element inside a container", () => {
  const blocks: Block[] = [
    { id: "heading", type: "heading", props: { text: "Move me" } },
    { id: "section", type: "section", props: {}, children: [] },
  ];
  const moved = moveBlock(blocks, "heading", "section", "inside");
  assert.equal(moved.length, 1);
  assert.equal(findBlock(moved, "heading")?.parent?.id, "section");
});
