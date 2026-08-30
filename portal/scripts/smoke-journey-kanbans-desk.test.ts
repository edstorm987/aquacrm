// Journey → Kanbans, and Ed's own boards.
//
// Ed, 2026-08-30: *"in journey make a new tab on journey called kanbans and
// move all the kanbans here instead as its all too crowded ... i want to be
// able to create my own in the app please permission gated of course."*
//
// The wall this file mostly guards: the free-card API must NEVER reach a
// non-custom pipeline. Lead cards emit journey events on move; fulfilment
// cards move through move-client's product-stage transactions. A custom-card
// endpoint that touched either would corrupt semantics silently.

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

type Pipelines = typeof import("../src/server/pipelines");
let createPipeline: Pipelines["createPipeline"];
let addCard: Pipelines["addCard"];
let listCards: Pipelines["listCards"];
let moveCard: Pipelines["moveCard"];
let updateCardPayload: Pipelines["updateCardPayload"];

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  ({ createPipeline, addCard, listCards, moveCard, updateCardPayload } = await import("../src/server/pipelines"));
});

const AGENCY = "kanban-agency";

describe("the desk exists and is gated", () => {
  const workspace = read("src/app/portal/clients/_JourneyCommercialWorkspace.tsx");
  const desk = read("src/app/portal/clients/_JourneyKanbansDesk.tsx");

  it("Journey carries the Kanbans desk", () => {
    assert.match(workspace, /\{ id: "kanbans", label: "Kanbans"/, "the desk left the DESKS list");
    assert.match(workspace, /desk === "kanbans" \? <div className="mt-5 min-w-0">\{kanbans\}<\/div> : null/);
  });

  it("the Kanbans desk renders ALONE — the client-rail block is not a catch-all", () => {
    // The regression this pins: the block below the desk nav used to render for
    // every desk except pipeline/meetings, so selecting Kanbans ALSO drew a
    // header mis-titled "Aqua Health", the brand/service filters, the client
    // rail and a ContractsPanel underneath the board directory.
    assert.doesNotMatch(workspace, /desk !== "pipeline" && desk !== "meetings" \?/,
      'the client-rail block is a catch-all again — every new desk double-renders "Aqua Health" beneath it');
    const rail = /const CLIENT_RAIL_DESKS: readonly JourneyDesk\[\] = \[([^\]]*)\]/.exec(workspace);
    assert.ok(rail, "the client-rail block no longer names the desks it serves");
    const serves = rail[1]!.split(",").map(entry => entry.trim().replace(/"/g, "")).filter(Boolean);
    assert.deepEqual(serves, ["payments", "contracts", "aqua-health"],
      "the client-rail block serves a desk it has no header, no title and no panel for");
    assert.match(workspace, /\{CLIENT_RAIL_DESKS\.includes\(desk\) \?/,
      "the client-rail block stopped consulting CLIENT_RAIL_DESKS");
  });

  it("creation and deletion are manage-only", () => {
    assert.match(desk, /level === "manage" \? \(\s*<button/, "New board is no longer gated to manage");
    assert.match(desk, /row\.deletable && level === "manage"/, "board delete is no longer gated");
  });

  it("does not sell linked cards it cannot deliver yet", () => {
    // Dead disabled options teach people controls are decoration. One honest
    // line instead.
    assert.match(desk, /Cards are free-text for now\. Linked lead, client and task cards come later\./);
  });
});

describe("the custom-only wall", () => {
  it("both routes refuse non-custom pipelines in source", () => {
    const boards = read("src/app/api/portal/pipelines/boards/route.ts");
    assert.match(boards, /board\.kind !== "custom"/, "boards route lost the custom-only wall");
    assert.match(boards, /requireCurrentWorkspaceElementAccess\("growth", "growth\.leads", "manage"\)/);
    const cards = read("src/app/api/portal/pipelines/cards/route.ts");
    assert.match(cards, /board\.kind !== "custom"/, "cards route lost the custom-only wall");
    assert.match(cards, /requireCurrentWorkspaceElementAccess\("growth", "growth\.leads", "use"\)/);
  });

  it("updateCardPayload edits ONLY custom cards", () => {
    const board = createPipeline({ agencyId: AGENCY, kind: "custom", name: "Wall test", columns: [
      { id: "a", label: "A", order: 0 }, { id: "b", label: "B", order: 1 },
    ], allowedCardKinds: ["custom"] });
    const card = addCard(AGENCY, board.id, { kind: "custom", payload: { title: "One" } as never, columnId: "a" });
    assert.ok(card, "custom card should be addable");
    const edited = updateCardPayload(AGENCY, card!.id, { title: "Two" });
    assert.ok(edited, "custom card should be editable");

    const leadBoard = createPipeline({ agencyId: AGENCY, kind: "leads", name: "Leads wall", columns: [
      { id: "new", label: "New", order: 0 },
    ], allowedCardKinds: ["lead"] });
    const lead = addCard(AGENCY, leadBoard.id, { kind: "lead", lead: { name: "L", email: "l@x.com" }, columnId: "new" } as never);
    if (lead) {
      assert.equal(updateCardPayload(AGENCY, lead.id, { title: "hijack" }), null,
        "a lead card accepted a custom payload edit — the wall is down");
    }
  });
});

describe("column removal re-homes instead of stranding", () => {
  it("the boards route moves affected cards before saving the columns", () => {
    // The board silently HIDES any card whose column no longer exists —
    // deleting a column without this leaves cards there-but-unreachable.
    const boards = read("src/app/api/portal/pipelines/boards/route.ts");
    assert.match(boards, /const keep = new Set\(columns\.map\(column => column\.id\)\);[\s\S]{0,400}moveCard\(session\.agencyId, card\.id, fallback\)/,
      "removed-column cards are stranded invisibly again");
  });

  it("moveCard itself works on custom cards through the custom transport", () => {
    const board = createPipeline({ agencyId: AGENCY, kind: "custom", name: "Move test", columns: [
      { id: "x", label: "X", order: 0 }, { id: "y", label: "Y", order: 1 },
    ], allowedCardKinds: ["custom"] });
    const card = addCard(AGENCY, board.id, { kind: "custom", payload: { title: "Mover" } as never, columnId: "x" })!;
    assert.ok(moveCard(AGENCY, card.id, "y"));
    assert.equal(listCards(board.id)[0]!.columnId, "y");
  });
});

describe("PipelineBoard stays backwards-compatible", () => {
  it("defaults to the move-client transport when onMoveCard is absent", () => {
    const board = read("src/app/portal/agency/pipelines/[slug]/_PipelineBoard.tsx");
    assert.match(board, /if \(onMoveCard\) \{/, "the custom transport hook is gone");
    assert.match(board, /fetch\("\/api\/portal\/pipelines\/move-client"/,
      "the default transport changed — every existing board caller breaks");
    assert.match(board, /cardNoun = "client"/,
      "the empty-column copy defaults away from clients — existing boards change wording");
  });
});
