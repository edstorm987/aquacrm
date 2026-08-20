import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createFileSop,
  createInteractiveSop,
  createWrittenSop,
  getSop,
  updateSop,
  validateSopBlockTree,
} from "../src/engines/sop/server/sops";
import { mutate } from "../src/server/storage";
import {
  COMPOSER_BLOCK_TYPES,
  composerBlockType,
  createComposerBlock,
} from "../src/app/portal/agency/sop-library/composerBlocks";
// Side-effect import: registers the website element definitions (heading, text,
// image, video-embed, banner, …) into the shared element registry the composer
// seeds blocks from. Without it `createComposerBlock` would produce empty props
// and the schema check below would consult no definition — the exact thing the
// composer depends on.
import "@/built-ins/modules/website-editor/src/components/blockRegistry";
import type { Block } from "@/engines/editor/elements";

const AGENCY_ID = `ag_sop_composer_${Date.now()}`;
const ACTOR_ID = "usr_sop_composer";
const createdSopIds: string[] = [];

after(() => {
  mutate(state => {
    for (const id of createdSopIds) delete state.sops[id];
  });
});

// What the composer produces: one block per palette type, seeded through the
// element engine and then edited exactly the way the modal edits a field.
function composeTree(): Block[] {
  return COMPOSER_BLOCK_TYPES.map(entry => {
    const block = createComposerBlock(entry.type);
    // Edit the first text-ish field the way the UI would, to prove edited
    // content still yields a valid tree.
    const editable = entry.fields.find(field => field.control === "text" || field.control === "textarea");
    if (editable) block.props = { ...block.props, [editable.key]: `Composed ${entry.label}` };
    return block;
  });
}

describe("SOP Engine — interactive SOP composer", () => {
  it("every palette type resolves to a registered element definition", () => {
    for (const entry of COMPOSER_BLOCK_TYPES) {
      const block = createComposerBlock(entry.type);
      assert.equal(block.type, entry.type);
      assert.ok(block.id && typeof block.id === "string", "composed block must carry a string id");
      assert.ok(block.props && typeof block.props === "object", "composed block must carry seeded props");
      // The palette entry is discoverable by its type.
      assert.ok(composerBlockType(entry.type), `${entry.type} should be a known composer type`);
    }
  });

  it("a composed block tree validates against the element-engine schema", () => {
    const tree = composeTree();
    const problems = validateSopBlockTree(tree);
    assert.deepEqual(problems, [], `composed tree should be schema-valid, got: ${JSON.stringify(problems)}`);
  });

  it("round-trips a composed tree through the sops create/get path as kind:interactive", () => {
    const tree = composeTree();
    const sop = createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "Composed onboarding SOP",
      blocks: tree,
      category: "Onboarding",
      tags: ["interactive"],
      actorUserId: ACTOR_ID,
    });
    createdSopIds.push(sop.id);

    assert.equal(sop.kind, "interactive");
    assert.equal(sop.content, undefined, "an interactive SOP must not be coerced onto the written content path");

    const fetched = getSop(AGENCY_ID, sop.id);
    assert.ok(fetched, "composed interactive SOP should be retrievable");
    assert.equal(fetched?.kind, "interactive");
    assert.deepEqual(fetched?.blocks, tree, "composed block tree must survive persistence byte-for-byte");
  });

  it("editing a composed block persists through the interactive update path", () => {
    const sop = createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "Editable interactive SOP",
      blocks: [createComposerBlock("heading")],
      actorUserId: ACTOR_ID,
    });
    createdSopIds.push(sop.id);

    const edited: Block[] = (sop.blocks ?? []).map(block => ({ ...block, props: { ...block.props, text: "Edited heading" } }));
    const updated = updateSop(AGENCY_ID, sop.id, { blocks: edited }, ACTOR_ID);
    assert.ok(updated, "update should return the SOP");
    assert.equal(updated?.kind, "interactive");
    assert.equal((updated?.blocks?.[0]?.props as { text?: string } | undefined)?.text, "Edited heading");
  });

  it("the schema gate rejects an out-of-vocabulary field value", () => {
    // `banner` tone is a closed enum (info / promo / alert). A composed block
    // with a value outside it must be flagged — proving the element engine's own
    // schema is what gates the composed tree, not a hand-rolled check.
    const banner = createComposerBlock("banner");
    banner.props = { ...banner.props, tone: "not-a-tone" };
    const problems = validateSopBlockTree([banner]);
    assert.ok(problems.some(problem => problem.key === "tone"), "engine schema should flag an illegal banner tone");

    assert.throws(() => createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "Invalid composed SOP",
      blocks: [banner],
      actorUserId: ACTOR_ID,
    }), /invalid blocks/i);
  });

  it("the written and file SOP paths are unchanged by the composer", () => {
    const written = createWrittenSop({
      agencyId: AGENCY_ID,
      title: "Still a written SOP",
      content: "Plain procedure text.",
      actorUserId: ACTOR_ID,
    });
    createdSopIds.push(written.id);
    assert.equal(written.kind, "written");
    assert.equal(written.content, "Plain procedure text.");
    assert.equal(written.blocks, undefined, "a written SOP must not gain a block tree");

    const file = createFileSop({
      id: `sop_file_${Date.now()}`,
      agencyId: AGENCY_ID,
      title: "Still a file SOP",
      resourceType: "document",
      fileName: "handbook.pdf",
      contentType: "application/pdf",
      size: 1234,
      storageProvider: "local",
      storageKey: "handbook.pdf",
      createdBy: ACTOR_ID,
    });
    createdSopIds.push(file.id);
    assert.equal(file.kind, "file");
    assert.equal(file.blocks, undefined, "a file SOP must not gain a block tree");
  });
});
