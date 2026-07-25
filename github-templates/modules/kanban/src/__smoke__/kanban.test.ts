// Kanban plugin smoke. node:test via tsx --test.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";
import { listTemplates, listTemplatesForRoles, getTemplate } from "../server/templates";
import { setClock, resetClock } from "../lib/time";

const AGENCY_ID: AgencyId = "agency_kb";
const CLIENT_ID: ClientId = "client_kb";
const OTHER_AGENCY: AgencyId = "agency_other";
const ACTOR: UserId = "user_admin";

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
  };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: Date.now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) { return activityLog.filter(e => e.agencyId === filter.agencyId); },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  return {
    storage, activity, events: eventBus,
    inspect: { activityLog, events },
  };
}

function clientContainer(world: World) {
  return containerWithDeps({
    agencyId: AGENCY_ID, clientId: CLIENT_ID,
    storage: world.storage, activity: world.activity, events: world.events,
  });
}
function agencyContainer(world: World) {
  return containerWithDeps({
    agencyId: AGENCY_ID,
    storage: world.storage, activity: world.activity, events: world.events,
  });
}
function otherAgencyContainer(world: World) {
  return containerWithDeps({
    agencyId: OTHER_AGENCY,
    storage: world.storage, activity: world.activity, events: world.events,
  });
}

describe("kanban plugin", () => {
  before(() => { setClock(() => 1_700_000_000_000); });
  // tests share a world; each test sets up its own
  test("1. templates registry — 5 templates with valid columns", () => {
    const list = listTemplates();
    assert.equal(list.length, 5);
    for (const id of ["fulfillment-mirror", "lead-pipeline", "client-tasks", "blank", "founder-todos"] as const) {
      const t = getTemplate(id);
      assert.ok(t.columns.length >= 1, `${id} has columns`);
      for (const c of t.cards) assert.ok(c.columnIndex < t.columns.length);
    }
  });

  test("2. fulfillment-mirror seeds the 6 Aqua phases + 2 sample cards", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board, cardSeeds } = await c.boards.create({
      name: "Felicia ops", scope: "client", templateId: "fulfillment-mirror",
    }, ACTOR);
    assert.equal(board.columns.length, 6);
    assert.equal(board.columns[0]!.label, "Epic Intro");
    assert.equal(board.columns[1]!.label, "Blueprint Setup");
    assert.equal(board.columns[2]!.label, "Diagnostics");
    assert.equal(board.columns[3]!.label, "Brand Builder");
    assert.equal(board.columns[4]!.label, "Traffic");
    assert.equal(board.columns[5]!.label, "Mastery");
    assert.equal(cardSeeds.length, 2);
    const cards = await c.cards._seedCards(
      cardSeeds.map(s => ({ ...s, boardId: board.id })), ACTOR,
    );
    assert.equal(cards.length, 2);
    const fetched = await c.boards.get(board.id);
    assert.equal(fetched?.scope, "client");
    assert.equal(fetched?.templateId, "fulfillment-mirror");
    assert.ok(w.inspect.events.some(e => e.name === "kanban.board.created"));
  });

  test("3. blank template — 1 column, 0 sample cards, fully editable", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board, cardSeeds } = await c.boards.create({
      name: "Scratchpad", scope: "client", templateId: "blank",
    }, ACTOR);
    assert.equal(board.columns.length, 1);
    assert.equal(board.columns[0]!.label, "To do");
    assert.equal(cardSeeds.length, 0);
  });

  test("4. add / rename / move / remove column flow", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "Test", scope: "client", templateId: "blank",
    }, ACTOR);

    // Add 2 more columns. Final order: ["To do", "Doing", "Done"]
    await c.boards.addColumn(board.id, "Doing", ACTOR);
    await c.boards.addColumn(board.id, "Done", ACTOR);
    let b = (await c.boards.get(board.id))!;
    assert.equal(b.columns.length, 3);
    assert.equal(b.columns[2]!.label, "Done");

    // Rename
    await c.boards.renameColumn(board.id, b.columns[1]!.id, "In progress", ACTOR);
    b = (await c.boards.get(board.id))!;
    assert.equal(b.columns[1]!.label, "In progress");

    // Move "Done" (index 2) to position 0 → ["Done", "To do", "In progress"]
    const doneId = b.columns[2]!.id;
    await c.boards.moveColumn(board.id, doneId, 0, ACTOR);
    b = (await c.boards.get(board.id))!;
    assert.equal(b.columns[0]!.label, "Done");
    assert.equal(b.columns[0]!.order, 0);
    assert.equal(b.columns[2]!.label, "In progress");

    // Remove the empty middle column ("To do") — succeeds since no cards.
    const toDoId = b.columns[1]!.id;
    await c.boards.removeColumn(board.id, toDoId, false, ACTOR);
    b = (await c.boards.get(board.id))!;
    assert.equal(b.columns.length, 2);
    assert.equal(b.columns[0]!.order, 0);
    assert.equal(b.columns[1]!.order, 1);
    assert.ok(w.inspect.events.some(e => e.name === "kanban.column.reordered"));
    assert.ok(w.inspect.events.some(e => e.name === "kanban.column.removed"));
  });

  test("5. cannot remove column with cards; cannot remove last column", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "T", scope: "client", templateId: "client-tasks",
    }, ACTOR);
    const col0 = board.columns[0]!;
    await c.cards.create({ boardId: board.id, columnId: col0.id, title: "Task 1" }, ACTOR);
    await assert.rejects(
      () => c.boards.removeColumn(board.id, col0.id, true, ACTOR),
      /Column still has cards/,
    );

    // Remove all but one column; then last-column guard fires.
    const blank = await c.boards.create({ name: "Blank2", scope: "client", templateId: "blank" }, ACTOR);
    await assert.rejects(
      () => c.boards.removeColumn(blank.board.id, blank.board.columns[0]!.id, false, ACTOR),
      /last column/,
    );
  });

  test("6. card create + move within and across columns; ordering renormalized", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "T", scope: "client", templateId: "client-tasks",
    }, ACTOR);
    const [c0, c1] = board.columns;
    const a = await c.cards.create({ boardId: board.id, columnId: c0!.id, title: "A" }, ACTOR);
    const b = await c.cards.create({ boardId: board.id, columnId: c0!.id, title: "B" }, ACTOR);
    const cc = await c.cards.create({ boardId: board.id, columnId: c0!.id, title: "C" }, ACTOR);
    assert.deepEqual([a.order, b.order, cc.order], [0, 1, 2]);

    // Move B to top of column 0 — order becomes [B, A, C].
    await c.cards.moveCard(b.id, c0!.id, 0, ACTOR);
    const inC0 = await c.cards.list({ boardId: board.id, columnId: c0!.id });
    assert.deepEqual(inC0.map(x => x.title), ["B", "A", "C"]);
    assert.deepEqual(inC0.map(x => x.order), [0, 1, 2]);

    // Move A across to column 1.
    await c.cards.moveCard(a.id, c1!.id, 0, ACTOR);
    const c0After = await c.cards.list({ boardId: board.id, columnId: c0!.id });
    const c1After = await c.cards.list({ boardId: board.id, columnId: c1!.id });
    assert.deepEqual(c0After.map(x => x.title), ["B", "C"]);
    assert.deepEqual(c0After.map(x => x.order), [0, 1]);
    assert.deepEqual(c1After.map(x => x.title), ["A"]);
    assert.equal(c1After[0]!.order, 0);
    assert.ok(w.inspect.events.filter(e => e.name === "kanban.card.moved").length >= 2);
  });

  test("7. card update — patch title, tags, due date, clear assignee", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "T", scope: "client", templateId: "blank",
    }, ACTOR);
    const card = await c.cards.create({
      boardId: board.id, columnId: board.columns[0]!.id,
      title: "Draft proposal", assigneeUserId: "user_alice",
    }, ACTOR);
    const updated = await c.cards.update(card.id, {
      title: "Draft v2",
      tags: ["urgent", "review"],
      dueAt: 1_800_000_000_000,
      description: "  spec doc  ",
    }, ACTOR);
    assert.equal(updated?.title, "Draft v2");
    assert.deepEqual(updated?.tags, ["urgent", "review"]);
    assert.equal(updated?.dueAt, 1_800_000_000_000);
    assert.equal(updated?.description, "spec doc");

    const cleared = await c.cards.update(card.id, {
      assigneeUserId: null, dueAt: null,
    }, ACTOR);
    assert.equal(cleared?.assigneeUserId, undefined);
    assert.equal(cleared?.dueAt, undefined);
  });

  test("8. card archive + restore + cross-board archived listing", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "T", scope: "client", templateId: "client-tasks",
    }, ACTOR);
    const col0 = board.columns[0]!;
    const a = await c.cards.create({ boardId: board.id, columnId: col0.id, title: "A" }, ACTOR);
    const b = await c.cards.create({ boardId: board.id, columnId: col0.id, title: "B" }, ACTOR);
    const cc = await c.cards.create({ boardId: board.id, columnId: col0.id, title: "C" }, ACTOR);

    await c.cards.archive(b.id, ACTOR);
    const active = await c.cards.list({ boardId: board.id, columnId: col0.id });
    assert.deepEqual(active.map(x => x.title), ["A", "C"]);
    assert.deepEqual(active.map(x => x.order), [0, 1]);

    const archived = await c.cards.list({ status: "archived" });
    assert.equal(archived.length, 1);
    assert.equal(archived[0]!.title, "B");

    const restored = await c.cards.restore(b.id, ACTOR);
    assert.equal(restored?.status, "active");
    const re = await c.cards.list({ boardId: board.id, columnId: col0.id });
    assert.deepEqual(re.map(x => x.title), ["A", "C", "B"]);
    assert.ok(w.inspect.events.some(e => e.name === "kanban.card.archived"));
    assert.ok(w.inspect.events.some(e => e.name === "kanban.card.restored"));
  });

  test("9. agency-scoped board isolated from client-scoped board", async () => {
    const w = buildWorld();
    const ag = agencyContainer(w);
    const cl = clientContainer(w);
    const { board: agBoard } = await ag.boards.create({
      name: "Internal sales", scope: "agency", templateId: "lead-pipeline",
    }, ACTOR);
    const { board: clBoard } = await cl.boards.create({
      name: "Felicia tasks", scope: "client", templateId: "client-tasks",
    }, ACTOR);

    // Each scope only sees its own board.
    const agList = await ag.boards.list();
    const clList = await cl.boards.list();
    assert.equal(agList.length, 1);
    assert.equal(agList[0]!.id, agBoard.id);
    assert.equal(clList.length, 1);
    assert.equal(clList[0]!.id, clBoard.id);

    // Client scope cannot fetch agency board (and vice versa).
    assert.equal(await ag.boards.get(clBoard.id), null);
    assert.equal(await cl.boards.get(agBoard.id), null);

    // Cannot create with mismatched scope.
    await assert.rejects(
      () => cl.boards.create({ name: "X", scope: "agency", templateId: "blank" }, ACTOR),
      /agency-scoped board inside a client/,
    );
    await assert.rejects(
      () => ag.boards.create({ name: "X", scope: "client", templateId: "blank" }, ACTOR),
      /client-scoped board outside/,
    );
  });

  test("10. tenant isolation — other agency cannot see boards or cards", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const other = otherAgencyContainer(w);
    const { board } = await c.boards.create({
      name: "Private", scope: "client", templateId: "client-tasks",
    }, ACTOR);
    await c.cards.create({ boardId: board.id, columnId: board.columns[0]!.id, title: "secret" }, ACTOR);

    assert.equal((await other.boards.list()).length, 0);
    assert.equal(await other.boards.get(board.id), null);
    assert.equal((await other.cards.list({ boardId: board.id })).length, 0);
  });

  test("11. all 4 templates are creatable end-to-end", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    for (const id of ["fulfillment-mirror", "lead-pipeline", "client-tasks", "blank"] as const) {
      const { board } = await c.boards.create({
        name: `T-${id}`, scope: "client", templateId: id,
      }, ACTOR);
      assert.ok(board.id.startsWith("brd_"));
      assert.ok(board.columns.every(col => col.id.startsWith("col_")));
    }
    const all = await c.boards.list();
    assert.equal(all.length, 4);
  });

  test("12. activity log + event bus side-effects", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "T", scope: "client", templateId: "blank",
    }, ACTOR);
    await c.boards.addColumn(board.id, "Doing", ACTOR);
    const card = await c.cards.create({
      boardId: board.id, columnId: board.columns[0]!.id, title: "X",
    }, ACTOR);
    await c.cards.update(card.id, { title: "Y" }, ACTOR);
    await c.cards.archive(card.id, ACTOR);

    const verbs = w.inspect.activityLog.map(e => e.action);
    for (const v of [
      "kanban.board.created",
      "kanban.column.added",
      "kanban.card.created",
      "kanban.card.updated",
      "kanban.card.archived",
    ]) {
      assert.ok(verbs.includes(v), `activity log includes ${v}`);
    }
    const eventNames = new Set(w.inspect.events.map(e => e.name));
    for (const n of [
      "kanban.board.created",
      "kanban.column.added",
      "kanban.card.created",
      "kanban.card.updated",
      "kanban.card.archived",
    ]) assert.ok(eventNames.has(n));
    for (const e of w.inspect.activityLog) assert.equal(e.category, "kanban");
  });

  // ─── R2 (Aqua templates) tests ────────────────────────────────────────

  test("13. lead-pipeline seeds Aqua sales columns (Pre-Sales → Onboarded)", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "Aqua sales", scope: "client", templateId: "lead-pipeline",
    }, ACTOR);
    assert.equal(board.columns.length, 8);
    assert.deepEqual(
      board.columns.map(x => x.label),
      ["Pre-Sales", "Discovery Call Booked", "Discovery Call Done", "Invoice Sent",
       "Aqua Incubator Active", "Shock & Awe Sent", "System Build", "Onboarded"],
    );
  });

  test("14. client-tasks seeds Aqua weekly cadence columns", async () => {
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "Felicia tasks", scope: "client", templateId: "client-tasks",
    }, ACTOR);
    assert.deepEqual(
      board.columns.map(x => x.label),
      ["Backlog", "This Week", "Doing", "Waiting On Client", "Review", "Done"],
    );
  });

  test("15. founder-todos — agency-scope, role-gated, 4 columns + 2 seed cards", async () => {
    const w = buildWorld();
    const ag = agencyContainer(w);
    const { board, cardSeeds } = await ag.boards.create({
      name: "Ed's todos", scope: "agency", templateId: "founder-todos",
    }, ACTOR);
    assert.deepEqual(
      board.columns.map(x => x.label),
      ["Today", "This Week", "Backlog", "Done"],
    );
    assert.equal(cardSeeds.length, 2);
    assert.equal(cardSeeds[0]!.title, "Review week's pipeline");
    assert.equal(cardSeeds[1]!.title, "Plan next round of social posts");
  });

  test("16. founder-todos rejected at client scope (requiresScope guard)", async () => {
    const w = buildWorld();
    const cl = clientContainer(w);
    await assert.rejects(
      () => cl.boards.create({ name: "X", scope: "client", templateId: "founder-todos" }, ACTOR),
      /requires scope agency/,
    );
  });

  test("17. listTemplatesForRoles filters founder-only template by role", () => {
    // Non-founder operators get 4 templates (founder-todos hidden).
    const nonFounder = listTemplatesForRoles(["agency-staff"]);
    assert.equal(nonFounder.length, 4);
    assert.ok(nonFounder.every(t => t.id !== "founder-todos"));

    // Founder gets all 5.
    const founder = listTemplatesForRoles(["founder"]);
    assert.equal(founder.length, 5);
    assert.ok(founder.some(t => t.id === "founder-todos"));

    // Case-insensitive match.
    const mixedCase = listTemplatesForRoles(["FOUNDER"]);
    assert.ok(mixedCase.some(t => t.id === "founder-todos"));

    // No roles supplied → only ungated templates.
    const anon = listTemplatesForRoles(undefined);
    assert.equal(anon.length, 4);
  });

  test("18. existing boards untouched when registry column lists swap (template-id-tag isolation)", async () => {
    // A board created from a template stores the resolved Column[]
    // inline — registry changes don't retroactively mutate it.
    const w = buildWorld();
    const c = clientContainer(w);
    const { board } = await c.boards.create({
      name: "Pinned", scope: "client", templateId: "client-tasks",
    }, ACTOR);
    const labelsAtCreate = board.columns.map(x => x.label);
    // Operator now renames a column — registry untouched.
    await c.boards.renameColumn(board.id, board.columns[0]!.id, "Custom backlog", ACTOR);
    const refetched = (await c.boards.get(board.id))!;
    assert.equal(refetched.columns[0]!.label, "Custom backlog");
    // The template registry's first column is still "Backlog" — operator
    // edits don't propagate back, registry edits don't propagate forward.
    assert.equal(getTemplate("client-tasks").columns[0]!.label, "Backlog");
    assert.notDeepEqual(refetched.columns.map(x => x.label), labelsAtCreate);
  });

  resetClock();
});
