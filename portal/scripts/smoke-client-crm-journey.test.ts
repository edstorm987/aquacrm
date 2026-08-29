// Journey pipelines — the client's own kanban, its rules, and the wiring that
// makes the email action real.
//
// Built 28 August 2026. Ed: *"give them a kanban board as well so that they can
// create their own journey pipelines and move contacts about and set
// automations and more"*, as a toggleable add-on *"just like the editor"*.
//
// ── What this file is actually guarding ──────────────────────────────────
//
// Three things, in descending order of how badly they would fail silently:
//
// 1. **The email action is not a mask.** It emits a cross-plugin event. If
//    nothing subscribes, the rule reports success and no mail is ever sent —
//    indistinguishable, from the client's side, from a working feature. While
//    building this, email-sender's OTHER four declared subscribers turned out
//    to be exactly that: declared in `EVENT_SUBSCRIPTIONS`, whose comment
//    claims a router reads it, with no router anywhere. So the wire is pinned
//    here by reading the real source, not by trusting the declaration.
//
// 2. **Automations cannot spin.** A `move-to-stage` action can satisfy another
//    rule's `card-entered-stage` trigger. Two rules pointing at each other is a
//    loop a client can build by accident in a minute.
//
// 3. **The feature gate agrees with the host.** Three places decide whether the
//    add-on is on. The first draft of the module's own check read a missing key
//    as ON while both host gates read it as OFF — which would have hidden the
//    nav link and refused the API while the page rendered the board anyway.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach, afterEach } from "node:test";

import { containerWithDeps } from "../src/built-ins/modules/client-crm/src/server/foundationAdapter";
import { journeyEnabled } from "../src/built-ins/modules/client-crm/src/api/handlers";
import { AUTOMATION_EMAIL_EVENT, MAX_AUTOMATION_DEPTH } from "../src/built-ins/modules/client-crm/src/lib/journey";
import { setClock, resetClock } from "../src/built-ins/modules/client-crm/src/lib/time";
import type { PluginStorage } from "../src/built-ins/modules/client-crm/src/lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../src/built-ins/modules/client-crm/src/server/ports";

const AGENCY = "agency_journey";
const CLIENT = "client_journey";
const ACTOR = "user_client_owner";
const DAY = 86_400_000;

let clockValue = 1_700_000_000_000;

function world(opts?: { emailSenderInstalled?: boolean }) {
  const data = new Map<string, unknown>();
  const events: Array<{ name: string; payload: unknown }> = [];
  // email-sender is agency-scoped and installed by the AGENCY, not the client.
  // Default true so the ordinary tests exercise the ordinary case.
  const hasEmailSender = opts?.emailSenderInstalled !== false;

  const storage: PluginStorage = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix?: string) {
      const keys = [...data.keys()];
      return prefix ? keys.filter(key => key.startsWith(prefix)) : keys;
    },
  };
  const tenant: TenantPort = { getClient: () => null, getClientForAgency: () => null };
  const user: UserPort = { getUser: () => null };
  const activity: ActivityLogPort = {
    logActivity: input => ({
      id: `act_${data.size}`, ts: clockValue, agencyId: input.agencyId, clientId: input.clientId,
      actorUserId: input.actorUserId, category: input.category, action: input.action,
      message: input.message, metadata: input.metadata,
    }),
    listActivity: () => [],
  };
  const events_: EventBusPort = { emit(_scope, name, payload) { events.push({ name, payload }); } };
  const pluginInstalls: PluginInstallStorePort = {
    getInstall: (_scope, pluginId) => pluginId === "email-sender" && hasEmailSender
      ? ({ id: "milesymedia|email-sender", pluginId, agencyId: AGENCY, enabled: true,
           config: {}, features: {}, installedAt: 0, updatedAt: 0 } as never)
      : null,
  };

  const build = (agencyId = AGENCY, clientId = CLIENT) => containerWithDeps({
    agencyId, clientId, storage, tenant, user, activity, events: events_, pluginInstalls,
  });
  return { build, events, storage };
}

/** A pipeline with the five starter stages, plus two contacts on it. */
async function seeded(opts?: { emailSenderInstalled?: boolean }) {
  const w = world(opts);
  const c = w.build();
  const pipeline = await c.pipelines.create({ name: "Enquiries" }, ACTOR);
  const alice = await c.contacts.create({ email: "alice@example.test", name: "Alice" }, ACTOR);
  const bob = await c.contacts.create({ email: "bob@example.test", name: "Bob" }, ACTOR);
  const stages = Object.fromEntries(pipeline.stages.map(stage => [stage.name, stage.id])) as Record<string, string>;
  return { ...w, c, pipeline, alice, bob, stages };
}

beforeEach(() => { clockValue = 1_700_000_000_000; setClock(() => clockValue); });
afterEach(() => { resetClock(); });

// ══════════════════════════════════════════════════════════════════════════

describe("pipelines", () => {
  it("starts a new board with usable stages rather than an empty one", async () => {
    const { pipeline } = await seeded();
    assert.deepEqual(
      pipeline.stages.map(stage => stage.name),
      ["New enquiry", "Contacted", "Quoted", "Won", "Lost"],
      "an empty kanban has nowhere to drop anything and no hint what a stage is for",
    );
    assert.deepEqual(pipeline.stages.map(s => s.order), [0, 1, 2, 3, 4]);
    // Meaning comes from `kind`, never the label — a board renamed into another
    // language still has to know which column is the end.
    assert.equal(pipeline.stages.find(s => s.name === "Won")?.kind, "won");
    assert.equal(pipeline.stages.find(s => s.name === "Lost")?.kind, "lost");
    assert.equal(pipeline.isDefault, true, "the first board must be openable without being named");
  });

  it("keeps exactly one default board", async () => {
    const { c } = await seeded();
    const second = await c.pipelines.create({ name: "Second", isDefault: true }, ACTOR);
    const all = await c.pipelines.list();
    assert.deepEqual(all.filter(p => p.isDefault).map(p => p.id), [second.id]);
    assert.equal((await c.pipelines.getDefault())?.id, second.id);
  });

  it("never leaves a client with boards but no default", async () => {
    const { c, pipeline } = await seeded();
    await c.pipelines.create({ name: "Second" }, ACTOR);
    await c.pipelines.delete(pipeline.id, ACTOR);
    const all = await c.pipelines.list();
    assert.equal(all.length, 1);
    assert.equal(all[0]?.isDefault, true, "the survivor must be promoted, or nothing opens");
  });

  it("deleting a board removes its cards but never its people", async () => {
    const { c, pipeline, alice } = await seeded();
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    await c.pipelines.delete(pipeline.id, ACTOR);
    assert.equal((await c.pipelines.listCardsForContact(alice.id)).length, 0);
    assert.ok(await c.contacts.get(alice.id), "deleting a board must not delete the contact");
  });

  it("refuses one contact twice on the same board", async () => {
    const { c, pipeline, alice } = await seeded();
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    await assert.rejects(
      () => c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR),
      /already on this pipeline/,
    );
  });

  it("scopes every read to the tenant", async () => {
    const { build, pipeline } = await seeded();
    const intruder = build("agency_other", CLIENT);
    assert.equal(await intruder.pipelines.get(pipeline.id), null);
    assert.deepEqual(await intruder.pipelines.list(), []);
  });
});

describe("stages", () => {
  it("will not strand people when a column is deleted", async () => {
    const { c, pipeline, alice, stages } = await seeded();
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);

    const refused = await c.pipelines.deleteStage(pipeline.id, stages["New enquiry"]!, ACTOR);
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.error, "stage_not_empty:1",
      "the count travels with the refusal — the UI's next question is always how many");

    const moved = await c.pipelines.deleteStage(pipeline.id, stages["New enquiry"]!, ACTOR, stages["Contacted"]!);
    assert.equal(moved.ok, true);
    const cards = await c.pipelines.listCards(pipeline.id);
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.stageId, stages["Contacted"], "the card moved rather than vanishing");
  });

  it("refuses to remove the last column", async () => {
    const { c } = await seeded();
    const solo = await c.pipelines.create(
      { name: "Solo", stages: [{ name: "Only", kind: "open", tone: "slate" }] }, ACTOR,
    );
    const result = await c.pipelines.deleteStage(solo.id, solo.stages[0]!.id, ACTOR);
    assert.equal(result.ok === false && result.error, "last_stage",
      "a board with no columns cannot be drawn or added to");
  });

  it("renumbers order contiguously after a delete", async () => {
    const { c, pipeline, stages } = await seeded();
    const result = await c.pipelines.deleteStage(pipeline.id, stages["Quoted"]!, ACTOR);
    assert.equal(result.ok, true);
    const after = await c.pipelines.get(pipeline.id);
    assert.deepEqual(after?.stages.map(s => s.order), [0, 1, 2, 3]);
  });
});

describe("moving cards", () => {
  it("resets the stage clock on a real move, but not on a reorder", async () => {
    const { c, pipeline, alice, stages } = await seeded();
    const { card } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);

    clockValue += 5 * DAY;
    await c.pipelines.moveCard(card.id, stages["Contacted"]!, undefined, ACTOR);
    assert.equal((await c.pipelines.getCard(card.id))?.enteredStageAt, clockValue);

    const entered = clockValue;
    clockValue += 2 * DAY;
    // Same stage: a reorder is not progress and must not reset "idle 9 days".
    await c.pipelines.moveCard(card.id, stages["Contacted"]!, 0, ACTOR);
    assert.equal((await c.pipelines.getCard(card.id))?.enteredStageAt, entered);
  });

  it("keeps positions contiguous in both the source and destination columns", async () => {
    const { c, pipeline, alice, bob, stages } = await seeded();
    const carol = await c.contacts.create({ email: "carol@example.test" }, ACTOR);
    const first = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: bob.id }, ACTOR);
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: carol.id }, ACTOR);

    await c.pipelines.moveCard(first.card.id, stages["Quoted"]!, undefined, ACTOR);

    const cards = await c.pipelines.listCards(pipeline.id);
    const source = cards.filter(card => card.stageId === stages["New enquiry"]).map(card => card.position);
    assert.deepEqual(source.sort(), [0, 1], "the column it left must not keep a gap");
    const destination = cards.filter(card => card.stageId === stages["Quoted"]).map(card => card.position);
    assert.deepEqual(destination, [0]);
  });
});

describe("the board projection", () => {
  it("totals only cards that carry a value, and refuses to add up mixed currencies", async () => {
    const { c, pipeline, alice, bob, stages } = await seeded();
    const a = await c.pipelines.createCard(
      { pipelineId: pipeline.id, contactId: alice.id, valueMinor: 25_000, currency: "GBP" }, ACTOR,
    );
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: bob.id }, ACTOR);

    let board = await c.pipelines.buildBoard(pipeline.id, await c.contacts.list());
    const stage = board?.stages.find(s => s.id === stages["New enquiry"]);
    assert.equal(stage?.valueMinor, 25_000);
    assert.equal(stage?.valuedCardCount, 1, "an untracked card is not a £0 card");
    assert.equal(board?.currency, "GBP");
    assert.equal(board?.mixedCurrency, false);

    await c.pipelines.updateCard(a.card.id, { valueMinor: 25_000, currency: "GBP" }, ACTOR);
    const carol = await c.contacts.create({ email: "carol@example.test" }, ACTOR);
    await c.pipelines.createCard(
      { pipelineId: pipeline.id, contactId: carol.id, valueMinor: 1_000, currency: "EUR" }, ACTOR,
    );
    board = await c.pipelines.buildBoard(pipeline.id, await c.contacts.list());
    assert.equal(board?.mixedCurrency, true);
    assert.equal(board?.currency, undefined, "incomparable money must not be summed into one figure");
  });

  it("flags an idle card only once its stage's threshold is passed", async () => {
    const { c, pipeline, alice } = await seeded();
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    // "New enquiry" flags after 3 days.
    let board = await c.pipelines.buildBoard(pipeline.id, await c.contacts.list(), clockValue + 2 * DAY);
    assert.equal(board?.stages[0]?.cards[0]?.idle, false);
    board = await c.pipelines.buildBoard(pipeline.id, await c.contacts.list(), clockValue + 3 * DAY);
    assert.equal(board?.stages[0]?.cards[0]?.idle, true);
    assert.equal(board?.stages[0]?.cards[0]?.idleDays, 3);
  });

  it("still draws a card whose contact has gone, labelled", async () => {
    const { c, pipeline, alice } = await seeded();
    await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    const board = await c.pipelines.buildBoard(pipeline.id, []);
    assert.equal(board?.stages[0]?.cards[0]?.contactEmail, "(contact removed)",
      "hidden, it is a card nobody can find or clear");
  });
});

// ══════════════════════════════════════════════════════════════════════════

describe("automations", () => {
  it("fires on the card's FIRST landing, not only on later moves", async () => {
    // The first version treated creation as a non-entry, which made
    // "when someone reaches New enquiry, tag them" skip every new person.
    const { c, pipeline, alice, stages } = await seeded();
    await c.automations.create({
      pipelineId: pipeline.id,
      name: "Tag arrivals",
      trigger: { type: "card-entered-stage", stageId: stages["New enquiry"]! },
      actions: [{ type: "add-tag", tag: "new-lead" }],
    }, ACTOR);

    const { transition } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    const outcomes = await c.automations.runForTransition(transition, ACTOR);

    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0]?.actionsRun, 1);
    assert.deepEqual(outcomes[0]?.failures, []);
    assert.deepEqual((await c.contacts.get(alice.id))?.tags, ["new-lead"], "the tag must really be written");
  });

  it("runs a left-stage rule only when the card actually leaves", async () => {
    const { c, pipeline, alice, stages } = await seeded();
    await c.automations.create({
      pipelineId: pipeline.id,
      name: "Left new",
      trigger: { type: "card-left-stage", stageId: stages["New enquiry"]! },
      actions: [{ type: "add-tag", tag: "progressed" }],
    }, ACTOR);

    const { card, transition } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    assert.deepEqual(await c.automations.runForTransition(transition, ACTOR), [], "arriving is not leaving");

    const moved = await c.pipelines.moveCard(card.id, stages["Contacted"]!, undefined, ACTOR);
    const outcomes = await c.automations.runForTransition(moved!, ACTOR);
    assert.equal(outcomes.length, 1);
    assert.ok((await c.contacts.get(alice.id))?.tags.includes("progressed"));
  });

  it("reports a failing action instead of abandoning the rule or swallowing it", async () => {
    const { c, pipeline, alice, stages } = await seeded();
    await c.contacts.update(alice.id, { status: "unsubscribed" }, ACTOR);
    await c.automations.create({
      pipelineId: pipeline.id,
      name: "Welcome",
      trigger: { type: "card-created" },
      actions: [
        { type: "send-email", subject: "Hello", body: "Hi there" },
        { type: "add-tag", tag: "welcomed" },
      ],
    }, ACTOR);

    const { transition } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    const outcomes = await c.automations.runForTransition(transition, ACTOR);

    assert.equal(outcomes[0]?.actionsRun, 1, "the second action still ran");
    assert.equal(outcomes[0]?.failures.length, 1);
    assert.match(outcomes[0]!.failures[0]!.reason, /unsubscribed/,
      "a correct refusal must still be reported, or it looks like a bug");
    assert.ok((await c.contacts.get(alice.id))?.tags.includes("welcomed"));
    void stages;
  });

  it("refuses a rule naming a stage that is not on its pipeline", async () => {
    const { c, pipeline } = await seeded();
    await assert.rejects(
      () => c.automations.create({
        pipelineId: pipeline.id,
        name: "Bad",
        trigger: { type: "card-entered-stage", stageId: "stg_not_here" },
        actions: [{ type: "add-tag", tag: "x" }],
      }, ACTOR),
      /not on this pipeline/,
      "caught on write, while the client is still looking at the form",
    );
  });

  it("emits the email event with the payload email-sender expects", async () => {
    const { c, pipeline, alice, events } = await seeded();
    await c.automations.create({
      pipelineId: pipeline.id,
      name: "Say hello",
      trigger: { type: "card-created" },
      actions: [{ type: "send-email", subject: "Thanks for enquiring", body: "We will be in touch." }],
    }, ACTOR);

    const { transition } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    await c.automations.runForTransition(transition, ACTOR);

    const sent = events.filter(event => event.name === AUTOMATION_EMAIL_EVENT);
    assert.equal(sent.length, 1);
    const payload = sent[0]!.payload as Record<string, unknown>;
    assert.equal(payload.contactEmail, "alice@example.test");
    assert.equal(payload.subject, "Thanks for enquiring");
    assert.ok(payload.automationId && payload.cardId, "both are needed for the send to be idempotent");
  });
});

describe("automation cascades", () => {
  it("carries a move through to the next rule", async () => {
    const { c, pipeline, alice, stages } = await seeded();
    await c.automations.create({
      pipelineId: pipeline.id, name: "Advance",
      trigger: { type: "card-created" },
      actions: [{ type: "move-to-stage", stageId: stages["Contacted"]! }],
    }, ACTOR);
    await c.automations.create({
      pipelineId: pipeline.id, name: "Tag contacted",
      trigger: { type: "card-entered-stage", stageId: stages["Contacted"]! },
      actions: [{ type: "add-tag", tag: "contacted" }],
    }, ACTOR);

    const { card, transition } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    const outcomes = await c.automations.runForTransition(transition, ACTOR);

    assert.equal((await c.pipelines.getCard(card.id))?.stageId, stages["Contacted"]);
    assert.ok((await c.contacts.get(alice.id))?.tags.includes("contacted"),
      "the second rule must see the move the first one made");
    assert.equal(outcomes.length, 2);
  });

  it("stops two rules that move a card back and forth, and says so", async () => {
    // The accident a client can build in under a minute.
    const { c, pipeline, alice, stages } = await seeded();
    await c.automations.create({
      pipelineId: pipeline.id, name: "To quoted",
      trigger: { type: "card-entered-stage", stageId: stages["Contacted"]! },
      actions: [{ type: "move-to-stage", stageId: stages["Quoted"]! }],
    }, ACTOR);
    await c.automations.create({
      pipelineId: pipeline.id, name: "Back to contacted",
      trigger: { type: "card-entered-stage", stageId: stages["Quoted"]! },
      actions: [{ type: "move-to-stage", stageId: stages["Contacted"]! }],
    }, ACTOR);

    const { card } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    const moved = await c.pipelines.moveCard(card.id, stages["Contacted"]!, undefined, ACTOR);

    // The real assertion is that this RETURNS AT ALL. A ring with no guard
    // recurses until the stack gives out.
    const outcomes = await c.automations.runForTransition(moved!, ACTOR);

    assert.ok(outcomes.length <= MAX_AUTOMATION_DEPTH + 2, `the cascade must be bounded, saw ${outcomes.length}`);
    // The visited set stops the ring on its second pass, well inside the depth
    // budget — the depth cap alone would let it run to the limit every time.
    assert.equal(outcomes.filter(o => o.haltedByDepth).length, 0,
      "the visited set should catch this before the depth cap has to");
    assert.equal(outcomes.length, 2, "each rule fires once, then the ring is cut");
  });

  it("bounds a long chain of distinct rules with the depth budget", async () => {
    // The case the visited set alone does not cover: every rule is different,
    // so nothing repeats — only depth stops it.
    const { c } = await seeded();
    const long = await c.pipelines.create({
      name: "Chain",
      stages: Array.from({ length: MAX_AUTOMATION_DEPTH + 3 }, (_, i) => ({
        name: `S${i}`, kind: "open" as const, tone: "slate" as const,
      })),
    }, ACTOR);
    const contact = await c.contacts.create({ email: "chain@example.test" }, ACTOR);
    for (let i = 0; i < long.stages.length - 1; i += 1) {
      await c.automations.create({
        pipelineId: long.id, name: `Step ${i}`,
        trigger: { type: "card-entered-stage", stageId: long.stages[i]!.id },
        actions: [{ type: "move-to-stage", stageId: long.stages[i + 1]!.id }],
      }, ACTOR);
    }

    const { transition } = await c.pipelines.createCard({ pipelineId: long.id, contactId: contact.id }, ACTOR);
    const outcomes = await c.automations.runForTransition(transition, ACTOR);

    assert.ok(outcomes.some(outcome => outcome.haltedByDepth),
      "a long chain must report that it was cut, not stop silently halfway");
    const card = (await c.pipelines.listCards(long.id))[0];
    assert.ok(
      long.stages.findIndex(stage => stage.id === card?.stageId) <= MAX_AUTOMATION_DEPTH + 1,
      "the card must not have run the whole chain",
    );
  });

  it("a disabled rule does nothing", async () => {
    const { c, pipeline, alice, stages } = await seeded();
    const rule = await c.automations.create({
      pipelineId: pipeline.id, name: "Off",
      trigger: { type: "card-created" },
      actions: [{ type: "add-tag", tag: "should-not-appear" }],
    }, ACTOR);
    await c.automations.update(rule.id, { enabled: false }, ACTOR);

    const { transition } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    assert.deepEqual(await c.automations.runForTransition(transition, ACTOR), []);
    assert.deepEqual((await c.contacts.get(alice.id))?.tags, []);
    void stages;
  });
});

// ══════════════════════════════════════════════════════════════════════════

describe("the add-on toggle means the same thing in all three places", () => {
  const HANDLERS = "src/built-ins/modules/client-crm/src/api/handlers.ts";
  const DISPATCHER = "src/app/api/portal/[module]/[...rest]/route.ts";
  const SIDEBAR = "src/lib/chrome/sidebarLayout.ts";

  it("the module reads an absent flag as OFF, exactly like the host does", () => {
    assert.equal(journeyEnabled({ install: { features: { "journey-pipelines": true } } }), true);
    assert.equal(journeyEnabled({ install: { features: { "journey-pipelines": false } } }), false);
    // The one that matters: an install predating the feature.
    assert.equal(journeyEnabled({ install: { features: {} } }), false);
    assert.equal(journeyEnabled({}), false);
  });

  it("and the two host gates still read it that way", () => {
    // Pinning the host's rule, not just ours. If either of these changes, the
    // three answers diverge and the module's check has to move with it.
    assert.match(
      readFileSync(DISPATCHER, "utf8"),
      /route\.requiresFeature && !install\.features\[route\.requiresFeature\]/,
      "the API dispatcher must still treat a missing feature key as disabled",
    );
    assert.match(
      readFileSync(SIDEBAR, "utf8"),
      /!install\?\.features\[navItem\.requiresFeature\]/,
      "the sidebar must still hide a nav item whose feature key is missing",
    );
    assert.match(
      readFileSync(HANDLERS, "utf8"),
      /Boolean\(ctx\.install\?\.features\?\.\["journey-pipelines"\]\)/,
      "and the module must still agree with both",
    );
  });

  it("every journey route declares the feature, so the dispatcher gates it", () => {
    const routes = readFileSync("src/built-ins/modules/client-crm/src/api/routes.ts", "utf8");
    const journeyBlock = routes.slice(routes.indexOf("export const JOURNEY_ROUTES"));
    const declared = journeyBlock.match(/\{ path: "/g)?.length ?? 0;
    const gated = journeyBlock.match(/requiresFeature: "journey-pipelines"/g)?.length ?? 0;
    assert.ok(declared > 0, "the journey route block must still be found");
    assert.equal(gated, declared, `all ${declared} journey routes must be feature-gated, ${gated} are`);
  });

  it("the manifest ships the feature so it can be toggled at all", () => {
    const manifest = readFileSync("src/built-ins/modules/client-crm/index.ts", "utf8");
    assert.match(manifest, /id: "journey-pipelines"/, "the toggle must exist in the manifest");
    assert.match(manifest, /requiresFeature: "journey-pipelines"/, "and the nav items must name it");
  });
});

describe("the email action is really wired, not merely declared", () => {
  it("email-sender declares a subscriber for the event the runner emits", () => {
    const adapter = readFileSync("src/built-ins/modules/email-sender/src/server/foundationAdapter.ts", "utf8");
    assert.ok(
      adapter.includes(`event: "${AUTOMATION_EMAIL_EVENT}"`),
      `email-sender must declare a subscriber for ${AUTOMATION_EMAIL_EVENT}`,
    );
    const emails = readFileSync("src/built-ins/modules/email-sender/src/server/emails.ts", "utf8");
    assert.match(emails, /async onCrmAutomationEmailRequested\(/,
      "and the handler it names must exist on EmailService");
  });

  it("something actually subscribes it to the bus", () => {
    // THE point of this file. email-sender's `EVENT_SUBSCRIPTIONS` comment
    // claims "Foundation's R6 router reads this list and subscribes" — no such
    // router exists, which is why its four other declared subscribers are
    // dormant. A declaration is not a wire, so the wire is asserted directly.
    const wiring = readFileSync("src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts", "utf8");
    assert.match(
      wiring,
      new RegExp(`subscribeForPlugin\\(\\s*"email-sender",\\s*"${AUTOMATION_EMAIL_EVENT}"`),
      "without this line the rule reports success and no email is ever sent",
    );
    assert.match(wiring, /onCrmAutomationEmailRequested/, "and it must call the handler");
  });

  it("says so when the agency has no email sending set up, instead of reporting a send", async () => {
    // Found in the 2026-08-28 browser walk. The board announced
    // "Booked — say thanks · 2 actions" for an agency with NO email-sender
    // install — the event was emitted into an empty room, no mail was ever
    // sent, and the client would have waited for a reply that was not coming.
    const { c, pipeline, alice, events } = await seeded({ emailSenderInstalled: false });
    await c.automations.create({
      pipelineId: pipeline.id, name: "Say hello",
      trigger: { type: "card-created" },
      actions: [{ type: "send-email", subject: "Hi", body: "Hello" }],
    }, ACTOR);

    const { transition } = await c.pipelines.createCard({ pipelineId: pipeline.id, contactId: alice.id }, ACTOR);
    const outcomes = await c.automations.runForTransition(transition, ACTOR);

    assert.equal(outcomes[0]?.actionsRun, 0, "nothing was sent, so nothing may be counted as run");
    assert.match(outcomes[0]!.failures[0]!.reason, /has not set up email sending/);
    assert.equal(events.filter(e => e.name === AUTOMATION_EMAIL_EVENT).length, 0,
      "and no event is emitted into an empty room");
  });

  it("the event name is a constant, so the two ends cannot drift apart", () => {
    const runner = readFileSync("src/built-ins/modules/client-crm/src/server/automations.ts", "utf8");
    assert.match(runner, /AUTOMATION_EMAIL_EVENT/, "the runner must emit the constant");
    assert.doesNotMatch(
      runner,
      /"crm\.automation\.email_requested"/,
      "and must not re-spell the name at the emit site",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════

describe("erasure reaches the journey data (GDPR Art. 17)", () => {
  // A board holds real personal data: a card's `note`, an automation's email
  // subject and body — all free text a client types about a named person — plus
  // the contact rows the cards point at.
  //
  // Today that is erased by the DEFAULT path, and completely: `client-crm` is
  // client-scoped, declares no `onEraseClient` and no `dataDisposition`, so
  // `sweepPluginData` takes the `delete state.pluginData[installId]` branch and
  // the whole slice goes. `smoke-client-erasure.test.ts` already asserts that
  // slice drops.
  //
  // What THAT test cannot see is the two ways this feature could quietly fall
  // out of erasure later, both of which look like ordinary improvements:
  //
  //   1. Somebody gives client-crm `dataDisposition: "retain"` (to keep a
  //      de-identified contact history, say) — and every board, note and
  //      automation body is retained with it.
  //   2. Somebody gives client-crm an `onEraseClient` hook that strips contact
  //      PII but does not know journey storage exists — the hook takes
  //      precedence over the sweep, so the boards would survive a lawful
  //      erasure while the erasure log reported "hook" and looked clean.
  //
  // Both are pinned here, at the module rather than in the erasure engine,
  // because the person who makes either change will be editing this module.

  const MANIFEST = "src/built-ins/modules/client-crm/index.ts";

  it("client-crm still takes the delete-everything path", () => {
    const manifest = readFileSync(MANIFEST, "utf8");
    assert.doesNotMatch(
      manifest,
      /dataDisposition:\s*"retain"/,
      "Retaining client-crm's slice would retain every journey board with it — the card notes and "
      + "the automation email bodies are free text about named people. If a retain flag is genuinely "
      + "wanted, journey storage must be excluded from it first, and this assertion updated to say so.",
    );
  });

  it("an onEraseClient hook, if one is ever added, must handle journey storage too", () => {
    const manifest = readFileSync(MANIFEST, "utf8");
    if (!/onEraseClient/.test(manifest)) return; // the current, correct state

    // A hook OVERRIDES the generic sweep (`clientErasure.ts`: `if (disposition
    // === "hook") continue;`), so from the moment one exists it owns all of it.
    assert.match(
      manifest,
      /journey\//,
      "client-crm now declares onEraseClient, which takes precedence over the generic sweep — so it "
      + "must erase the `journey/` keys (pipelines, cards, automations) itself. Without that, boards "
      + "survive a lawful erasure and the log still reports a clean 'hook' disposition.",
    );
  });

  it("every journey row carries the tenant stamp the generic prune looks for", async () => {
    // The other prune path (`pruneClientId`, used for agency-scoped and orphan
    // slices) finds rows by `clientId` on the object. Client-scoped installs do
    // not need it today, but a row without the stamp is invisible to it — and
    // an install's scope is not this file's to guarantee for ever.
    const { c, pipeline, alice } = await seeded();
    const { card } = await c.pipelines.createCard(
      { pipelineId: pipeline.id, contactId: alice.id, note: "Prefers to be called in the morning" }, ACTOR,
    );
    const automation = await c.automations.create({
      pipelineId: pipeline.id, name: "Follow up",
      trigger: { type: "card-created" },
      actions: [{ type: "send-email", subject: "Hello Alice", body: "About your enquiry…" }],
    }, ACTOR);

    for (const [label, row] of [["pipeline", pipeline], ["card", card], ["automation", automation]] as const) {
      assert.equal(row.agencyId, AGENCY, `${label} must carry agencyId`);
      assert.equal(row.clientId, CLIENT, `${label} must carry clientId, or a prune sweep cannot find it`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════

describe("the board is reachable at all", () => {
  // Found in the 2026-08-28 browser walk, and it is not a small thing: a
  // feature nobody can navigate to is not shipped.
  //
  // Client-scoped plugins declare `navItems`, and NOTHING renders them.
  // `buildSidebar` is called in exactly two places — `app/portal/agency/layout.tsx`
  // and `app/portal/clients/page.tsx` — **both with `scope: "agency"`**. The
  // client workspace layout (`app/portal/clients/[clientId]/layout.tsx`) builds
  // its panel by hand and never calls the builder, so the `scope === "client"`
  // branch inside it is dead for that surface.
  //
  // Wiring it needs a client-side nav catalogue, because the chrome deliberately
  // avoids importing executable manifests for a stated performance reason
  // (`lib/chrome/agencySidebarPluginCatalog.ts` header). That is a host-level
  // decision, so it is written up rather than taken here.
  //
  // Meanwhile the module's own index page IS the navigation, and these
  // assertions stop someone deleting those links in the belief that the sidebar
  // covers it.

  const CONTACTS_PAGE = "src/built-ins/modules/client-crm/src/pages/ContactsPage.tsx";

  it("the CRM landing page links to the board and its automations", () => {
    const page = readFileSync(CONTACTS_PAGE, "utf8");
    assert.match(page, /\$\{base\}\/pipelines/, "the landing page must reach the board");
    assert.match(page, /\$\{base\}\/automations/, "and the automations behind it");
    assert.match(page, /features\?\.\["journey-pipelines"\]/,
      "and must hide both when the add-on is off, or it advertises a 404");
  });

  it("the board and the automations page reach each other", () => {
    const board = readFileSync("src/built-ins/modules/client-crm/src/pages/PipelinesPage.tsx", "utf8");
    const rules = readFileSync("src/built-ins/modules/client-crm/src/pages/AutomationsPage.tsx", "utf8");
    assert.match(board, /client-crm\/automations/, "board → automations");
    assert.match(rules, /client-crm\/pipelines/, "automations → board");
  });

  it("the client workspace renders plugin nav, so the board has a real home", () => {
    // This started life as a tripwire asserting the OPPOSITE — that the layout
    // did not call buildSidebar — because on 2026-08-28 it did not, and the
    // board was reachable only by URL. That was fixed the same day rather than
    // left as a note: `clientSidebarPluginCatalog.ts` plus the layout wiring.
    // The links on ContactsPage are kept as a hub, not as the only way in.
    const layout = readFileSync("src/app/portal/clients/[clientId]/layout.tsx", "utf8");
    assert.match(layout, /CLIENT_SIDEBAR_PLUGIN_CATALOG/,
      "the client workspace must render plugin navigation; see smoke-client-sidebar-catalog.test.ts");
  });
});
