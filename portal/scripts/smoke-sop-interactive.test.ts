import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createFileSop,
  createInteractiveSop,
  createWrittenSop,
  getSop,
  updateSop,
  validateSopBlockTree,
} from "../src/server/sops";
import { mutate } from "../src/server/storage";
import type { BlockTreeJSON } from "@/engines/editor/elements";
// Side-effect import: registers the portal-only element definitions
// (`approval-panel`, `file-upload`) into the shared element registry, so the
// SOP block-tree validation below actually consults a real element-engine
// schema (an approval panel `requires` a title). Without a registered
// definition the engine fails soft, which is a different code path we also
// assert on ("unknown type" below).
import "@/engines/editor/elements/portalElements";

const AGENCY_ID = `ag_sop_interactive_${Date.now()}`;
const ACTOR_ID = "usr_sop_interactive";
const createdSopIds: string[] = [];

after(() => {
  mutate(state => {
    for (const id of createdSopIds) delete state.sops[id];
  });
});

// A valid element-engine block tree built from registered element types.
// Nested children exercise the recursive walk; every node has a string id, a
// string type, and satisfies its element's required props.
function validTree(): BlockTreeJSON {
  return [
    {
      id: "sop_block_root",
      type: "approval-panel",
      props: { eyebrow: "Decisions", title: "Approve the brand direction", body: "Review and respond to keep the work moving." },
      children: [
        {
          id: "sop_block_child",
          type: "file-upload",
          props: { title: "Upload the signed brief", actionLabel: "Upload" },
        },
      ],
    },
  ];
}

describe("SOP Engine — interactive SOP foundation", () => {
  it("round-trips an interactive SopDocument with its block tree intact", () => {
    const tree = validTree();
    const sop = createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "Interactive onboarding walk-through",
      blocks: tree,
      category: "Onboarding",
      tags: ["interactive", "onboarding"],
      actorUserId: ACTOR_ID,
    });
    createdSopIds.push(sop.id);

    assert.equal(sop.kind, "interactive");
    assert.equal(sop.resourceType, "procedure");
    assert.deepEqual(sop.blocks, tree);

    const fetched = getSop(AGENCY_ID, sop.id);
    assert.ok(fetched, "interactive SOP should be retrievable");
    assert.equal(fetched?.kind, "interactive");
    assert.deepEqual(fetched?.blocks, tree, "block tree must survive persistence byte-for-byte");
    // The block tree must not have been coerced into the markdown/content path.
    assert.equal(fetched?.content, undefined);
  });

  it("validates the block tree via the element-engine schema (rejects a block missing a required prop)", () => {
    // `approval-panel` declares `title` as required. A block that omits it must
    // be rejected — proving the engine's own schema is what gates persistence,
    // not a hand-rolled second validator.
    const problems = validateSopBlockTree([
      { id: "sop_block_missing_title", type: "approval-panel", props: { body: "no title here" } },
    ]);
    assert.ok(problems.some(problem => problem.key === "title"), "engine schema should flag the missing required title");

    assert.throws(() => createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "Invalid interactive SOP",
      blocks: [{ id: "sop_block_missing_title", type: "approval-panel", props: { body: "no title here" } }],
      actorUserId: ACTOR_ID,
    }), /invalid blocks/i);
  });

  it("rejects structurally broken trees (missing id, duplicate id, non-array)", () => {
    assert.throws(() => createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "No id",
      blocks: [{ type: "approval-panel", props: { title: "x" } } as unknown as BlockTreeJSON[number]],
      actorUserId: ACTOR_ID,
    }), /invalid blocks/i);

    assert.throws(() => createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "Duplicate id",
      blocks: [
        { id: "dup", type: "approval-panel", props: { title: "one" } },
        { id: "dup", type: "approval-panel", props: { title: "two" } },
      ],
      actorUserId: ACTOR_ID,
    }), /invalid blocks/i);

    assert.throws(() => createInteractiveSop({
      agencyId: AGENCY_ID,
      title: "Not a tree",
      blocks: "nope" as unknown as BlockTreeJSON,
      actorUserId: ACTOR_ID,
    }), /block tree/i);
  });

  it("fails soft on an unregistered element type (structure ok, props not schema-checked)", () => {
    // A type with no registered definition is left alone — additive and
    // decision-free, matching how the renderer degrades an unknown type.
    const tree: BlockTreeJSON = [{ id: "sop_block_custom", type: "totally-made-up-element", props: {} }];
    assert.deepEqual(validateSopBlockTree(tree), []);
    const sop = createInteractiveSop({ agencyId: AGENCY_ID, title: "Custom element SOP", blocks: tree, actorUserId: ACTOR_ID });
    createdSopIds.push(sop.id);
    assert.deepEqual(getSop(AGENCY_ID, sop.id)?.blocks, tree);
  });

  it("updates an interactive SOP's block tree, and rejects an invalid replacement", () => {
    const sop = createInteractiveSop({ agencyId: AGENCY_ID, title: "Editable interactive SOP", blocks: validTree(), actorUserId: ACTOR_ID });
    createdSopIds.push(sop.id);

    const nextTree: BlockTreeJSON = [{ id: "sop_block_v2", type: "approval-panel", props: { title: "Revised approval step" } }];
    const updated = updateSop(AGENCY_ID, sop.id, { blocks: nextTree }, ACTOR_ID);
    assert.deepEqual(updated?.blocks, nextTree, "valid replacement block tree should persist");

    assert.throws(() => updateSop(AGENCY_ID, sop.id, {
      blocks: [{ id: "sop_block_bad", type: "approval-panel", props: {} }],
    }, ACTOR_ID), /invalid blocks/i);
    // The rejected update must not have mutated the stored tree.
    assert.deepEqual(getSop(AGENCY_ID, sop.id)?.blocks, nextTree);
  });

  it("leaves written and file SOP behaviour unchanged (no block tree, kinds preserved)", () => {
    const written = createWrittenSop({
      agencyId: AGENCY_ID,
      title: "Traditional written SOP",
      content: "Step one. Step two. Step three.",
      actorUserId: ACTOR_ID,
    });
    createdSopIds.push(written.id);
    assert.equal(written.kind, "written");
    assert.equal(written.resourceType, "procedure");
    assert.equal(written.blocks, undefined, "a written SOP must not gain a block tree");
    assert.equal(written.content, "Step one. Step two. Step three.");

    // Passing a block tree to a written SOP's update is ignored — the field is
    // interactive-only.
    const editedWritten = updateSop(AGENCY_ID, written.id, {
      content: "Updated body.",
      blocks: validTree(),
    }, ACTOR_ID);
    assert.equal(editedWritten?.content, "Updated body.");
    assert.equal(editedWritten?.blocks, undefined, "written SOP update must not adopt a block tree");

    const file = createFileSop({
      id: `sop_file_${Date.now()}`,
      agencyId: AGENCY_ID,
      title: "Uploaded training video",
      resourceType: "video",
      fileName: "guide.mp4",
      contentType: "video/mp4",
      size: 2048,
      storageProvider: "local",
      storageKey: "guide-key",
      createdBy: ACTOR_ID,
    });
    createdSopIds.push(file.id);
    assert.equal(file.kind, "file");
    assert.equal(file.resourceType, "video");
    assert.equal(file.blocks, undefined, "a file SOP must not gain a block tree");
  });
});
