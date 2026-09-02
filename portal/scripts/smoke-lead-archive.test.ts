// "Archive" now means archive — issue #62.
//
// The control said Archive. The confirmation said *"removed from the active
// leads board"*. The service hard-deleted the lead row, its email and phone
// pointers and its index entry, with no archived state, no list and no way
// back — and it left the linked foundation PIPELINE CARD behind, holding a
// snapshot of the name, email and phone of a lead that no longer existed, on a
// board where nothing showed it was stale.
//
// This file drives the real foundation pipeline rather than a stub port,
// because the orphaned card is half the defect and a stub cannot leave one.
//
// ── What each half is protecting ─────────────────────────────────────────
//
//   • archive is REVERSIBLE — the row, the index entry and the identity
//     pointers survive, and the card is removed;
//   • restore puts the card back in the column it LEFT, not wherever the
//     board's default happens to be;
//   • purge is the permanent one, it removes the card too, and the route makes
//     you archive first so it is never one click from the same button;
//   • an archived lead is invisible to `list()` and therefore to campaign
//     audiences — the one place where getting this wrong emails somebody;
//   • the same person enquiring again RESTORES their lead, rather than the
//     enquiry landing silently in a record nobody can see.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Stub `server-only` so `src/server/*` loads under tsx --test.
const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type PipelinesMod = typeof import("../src/server/pipelines");
type StorageMod = typeof import("../src/server/storage");
type TenantsMod = typeof import("../src/server/tenants");
type PortsMod = typeof import("../src/lib/server/leadsPipelinePorts");
type PluginMod = typeof import("@aqua/plugin-leads-pipeline/server");

let pipelines: PipelinesMod;
let storageMod: StorageMod;
let tenants: TenantsMod;
let ports: PortsMod;
let plugin: PluginMod;

before(async () => {
  pipelines = await import("../src/server/pipelines");
  storageMod = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  ports = await import("../src/lib/server/leadsPipelinePorts");
  plugin = await import("@aqua/plugin-leads-pipeline/server");
});

const ACTOR = "usr_archive_smoke";

/**
 * One-shot fault injection, so a half-completed archive is something this test
 * can CAUSE rather than describe. Archive touches two stores that can fail
 * independently — the foundation pipeline (the card) and plugin storage (the
 * lead row) — and the acceptance clause for #62 asks that a forced partial
 * failure converges on a retry instead of stranding the lead between states.
 *
 * Each slot holds the message the NEXT matching call throws with, and disarms
 * itself as it throws, so the retry runs against a healthy world.
 */
interface ArchiveFaults {
  /** The next `removeLeadCards` throws — the card half fails first. */
  removeLeadCards: string | null;
  /** The next write to a `lead:` row throws — the card is already gone. */
  leadWrite: string | null;
}

/** A fresh agency with the default pipelines seeded, and a leads container on it. */
async function world() {
  await storageMod.ensureHydrated();
  await storageMod.reset();
  const agency = tenants.createAgency({ name: "Archive Co", slug: "archive-co" });
  pipelines.seedDefaultPipelines(agency.id);

  const faults: ArchiveFaults = { removeLeadCards: null, leadWrite: null };
  const trip = (slot: keyof ArchiveFaults) => {
    const message = faults[slot];
    if (!message) return;
    faults[slot] = null;
    throw new Error(message);
  };

  const data: Record<string, unknown> = {};
  const exclusiveQueues = new Map<string, Promise<void>>();
  const events: string[] = [];
  // The activity log is the other place an archive can CLAIM to have happened.
  // The event bus alone does not cover it, and "Archived lead X." written for an
  // archive that threw is exactly the dishonest-success this codebase forbids.
  const activityActions: string[] = [];
  const pluginStorage = {
    async get<T>(key: string) { return data[key] as T | undefined; },
    async set<T>(key: string, value: T) {
      if (key.startsWith("lead:")) trip("leadWrite");
      data[key] = value;
    },
    async setIfAbsent<T>(key: string, value: T) {
      if (Object.prototype.hasOwnProperty.call(data, key)) return false;
      data[key] = value; return true;
    },
    async runExclusive<T>(key: string, operation: () => Promise<T>) {
      const previous = exclusiveQueues.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const queued = previous.catch(() => undefined).then(() => gate);
      exclusiveQueues.set(key, queued);
      await previous.catch(() => undefined);
      try {
        return await operation();
      } finally {
        release();
        if (exclusiveQueues.get(key) === queued) exclusiveQueues.delete(key);
      }
    },
    async del(key: string) { delete data[key]; },
    async list(prefix?: string) {
      const keys = Object.keys(data);
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };

  // The REAL adapter, so an orphaned card is a thing this test can observe —
  // wrapped only so the card half can be made to fail on demand.
  const pipeline = {
    ...ports.pipelinePort,
    removeLeadCards(args: Parameters<NonNullable<typeof ports.pipelinePort.removeLeadCards>>[0]) {
      trip("removeLeadCards");
      return ports.pipelinePort.removeLeadCards?.(args) ?? 0;
    },
  };

  const container = plugin.buildLeadsPipelineContainer({
    agencyId: agency.id as never,
    storage: pluginStorage as never,
    activity: { logActivity(input: { action: string }) { activityActions.push(input.action); } } as never,
    events: { emit(_scope: unknown, name: string) { events.push(name); } } as never,
    tenant: { getAgency: () => null } as never,
    pluginInstalls: { get: () => null, list: () => [] } as never,
    pipeline: pipeline as never,
  });

  const leadsPipeline = pipelines.getPipelineBySlug(agency.id, "leads")!;
  const cardsFor = (leadId: string) =>
    pipelines.listCards(leadsPipeline.id)
      .filter(card => card.kind === "lead")
      .filter(card => (card.lead as unknown as { leadId?: string }).leadId === leadId);

  return { agencyId: agency.id, container, events, activityActions, faults, leadsPipeline, cardsFor };
}

describe("archiving a lead keeps the lead", () => {
  it("takes it off the active board, keeps the record, and lists it as archived", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "kept@example.com", name: "Kept", source: "manual" }, ACTOR);

    const archived = await w.container.leads.archive(lead.id, ACTOR);
    assert.ok(archived?.archivedAt, "the lead was not marked archived");
    assert.equal(archived?.archivedBy, ACTOR);

    assert.deepEqual((await w.container.leads.list()).map(l => l.id), [],
      "an archived lead is still on the active board — the default must exclude it");
    assert.ok(await w.container.leads.get(lead.id), "archiving destroyed the record");
    assert.deepEqual((await w.container.leads.list({ archived: "only" })).map(l => l.id), [lead.id]);
    assert.deepEqual((await w.container.leads.list({ archived: "include" })).map(l => l.id), [lead.id]);
  });

  it("keeps the identity pointers, so the person is still findable", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert(
      { email: "findable@example.com", phone: "+447700900123", source: "manual" }, ACTOR);
    await w.container.leads.archive(lead.id, ACTOR);

    // `getByEmail`/`getByPhone` resolve through the pointer keys. The old hard
    // delete removed them; keeping them is what lets the same person come back
    // to their own record instead of becoming a second one.
    assert.equal((await w.container.leads.getByEmail("findable@example.com"))?.id, lead.id);
    assert.equal((await w.container.leads.getByPhone("+447700900123"))?.id, lead.id);
  });

  it("is idempotent — archiving twice does not stack journey events", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "twice@example.com", source: "manual" }, ACTOR);
    const first = await w.container.leads.archive(lead.id, ACTOR);
    const second = await w.container.leads.archive(lead.id, ACTOR);
    assert.equal(second?.archivedAt, first?.archivedAt);
    assert.equal(
      (second?.journeyEvents ?? []).filter(event => event.type === "archived").length, 1,
      "a second archive appended another event to the journey");
  });
});

describe("the pipeline card — the half that was left behind", () => {
  it("archiving removes the card that held the lead's contact details", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "carded@example.com", name: "Carded", source: "manual" }, ACTOR);
    assert.equal(w.cardsFor(lead.id).length, 1, "capture did not create a card, so this test proves nothing");

    await w.container.leads.archive(lead.id, ACTOR);
    assert.equal(w.cardsFor(lead.id).length, 0,
      "the pipeline card survived the archive, still holding the lead's name, email and phone");
    // …and the lead no longer claims to have one.
    assert.equal((await w.container.leads.get(lead.id))?.pipelineCardId, undefined,
      "the lead kept a pipelineCardId pointing at a card that no longer exists");
  });

  it("purging removes the card too", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "gone@example.com", source: "manual" }, ACTOR);
    assert.equal(await w.container.leads.purge(lead.id, ACTOR), true);
    assert.equal(w.cardsFor(lead.id).length, 0, "a purged lead left its card behind");
    assert.equal(await w.container.leads.get(lead.id), null);
  });

  it("sweeps by leadId even when the lead never stored a card id", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "unlinked@example.com", source: "manual" }, ACTOR);
    // Every lead captured before the foundation was wired up has no
    // `pipelineCardId`, and its card is reachable only by the stamped leadId.
    await w.container.leads.update(lead.id, { pipelineCardId: undefined }, ACTOR);
    await w.container.leads.archive(lead.id, ACTOR);
    assert.equal(w.cardsFor(lead.id).length, 0,
      "a card belonging to a lead with no stored card id was left behind");
  });
});

describe("restoring", () => {
  it("puts the lead back on the board, in the column it left", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "back@example.com", source: "manual" }, ACTOR);
    const card = w.cardsFor(lead.id)[0]!;
    const proposal = w.leadsPipeline.columns.find(column => column.id !== card.columnId)!;
    pipelines.moveCard(w.agencyId, card.id, proposal.id, 0);

    await w.container.leads.archive(lead.id, ACTOR);
    const restored = await w.container.leads.restore(lead.id, ACTOR);

    assert.equal(restored?.archivedAt, undefined, "the lead is still marked archived after a restore");
    assert.deepEqual((await w.container.leads.list()).map(l => l.id), [lead.id]);
    const cards = w.cardsFor(lead.id);
    assert.equal(cards.length, 1, "restore did not put a card back on the board");
    assert.equal(cards[0]!.columnId, proposal.id,
      "the restored card went to the default column instead of the one it was archived from");
    assert.equal((await w.container.leads.get(lead.id))?.pipelineCardId, cards[0]!.id);
  });

  it("records both moves in the journey rather than leaving a hole in it", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "journey@example.com", source: "manual" }, ACTOR);
    await w.container.leads.archive(lead.id, ACTOR);
    await w.container.leads.restore(lead.id, ACTOR);
    const types = ((await w.container.leads.get(lead.id))?.journeyEvents ?? []).map(event => event.type);
    assert.ok(types.includes("archived"), "the archive is missing from the journey");
    assert.ok(types.includes("restored"), "the restore is missing from the journey");
  });

  it("emits the events a subscriber can act on", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "events@example.com", source: "manual" }, ACTOR);
    await w.container.leads.archive(lead.id, ACTOR);
    await w.container.leads.restore(lead.id, ACTOR);
    await w.container.leads.archive(lead.id, ACTOR);
    await w.container.leads.purge(lead.id, ACTOR);
    assert.ok(w.events.includes("leads.lead.archived"));
    assert.ok(w.events.includes("leads.lead.restored"));
    assert.ok(w.events.includes("leads.lead.purged"),
      "a permanent deletion emitted the same event as a reversible archive");
  });
});

describe("when half of the archive fails", () => {
  // The acceptance clause #62 was raised with asks for a FORCED partial failure,
  // not a description of one. Archive spans two stores that fail independently —
  // the foundation pipeline holding the card, and plugin storage holding the row —
  // so each half is broken here in turn and the retry is required to converge.

  it("a failed card removal leaves the lead unarchived, and the retry converges", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "faulty@example.com", source: "manual" }, ACTOR);
    const card = w.cardsFor(lead.id)[0]!;
    const proposal = w.leadsPipeline.columns.find(column => column.id !== card.columnId)!;
    pipelines.moveCard(w.agencyId, card.id, proposal.id, 0);

    w.faults.removeLeadCards = "pipeline unavailable";
    await assert.rejects(() => w.container.leads.archive(lead.id, ACTOR), /pipeline unavailable/);

    // Nothing half-done: the card is removed BEFORE the row is written, so a
    // failure here has touched nothing at all.
    const after = await w.container.leads.get(lead.id);
    assert.equal(after?.archivedAt, undefined,
      "the lead was marked archived even though its card could not be removed");
    assert.deepEqual((await w.container.leads.list()).map(l => l.id), [lead.id],
      "the lead fell off the active board without being archived");
    assert.equal(w.cardsFor(lead.id).length, 1, "the card went missing on a failed archive");
    assert.equal((after?.journeyEvents ?? []).filter(event => event.type === "archived").length, 0,
      "the journey records an archive that never happened");
    assert.equal(w.events.filter(name => name === "leads.lead.archived").length, 0,
      "subscribers were told the lead was archived before the archive succeeded");
    assert.equal(w.activityActions.filter(action => action === "leads.lead.archived").length, 0,
      "the activity log claims an archive that failed");

    // Retry against a healthy pipeline. The identity lock releases on a throw,
    // so this does not deadlock, and the whole archive lands exactly once.
    const archived = await w.container.leads.archive(lead.id, ACTOR);
    assert.ok(archived?.archivedAt, "the retry did not archive the lead");
    assert.equal(w.cardsFor(lead.id).length, 0, "the retry left the card on the board");
    assert.equal((archived?.journeyEvents ?? []).filter(event => event.type === "archived").length, 1,
      "the failed attempt and the retry each wrote an 'archived' event");
    assert.equal(w.events.filter(name => name === "leads.lead.archived").length, 1,
      "the archived event was emitted more than once across the failure and the retry");
    assert.equal(w.activityActions.filter(action => action === "leads.lead.archived").length, 1,
      "the activity log records the archive a different number of times than it happened");
    assert.equal(archived?.archivedFromColumnId, proposal.id,
      "the retry forgot which column the card was in");

    const restored = await w.container.leads.restore(lead.id, ACTOR);
    assert.equal(restored?.archivedAt, undefined);
    assert.equal(w.cardsFor(lead.id)[0]?.columnId, proposal.id,
      "a lead archived on the second attempt did not come back to the column it left");
  });

  it("a failed row write after the card is gone still converges, at the cost of the remembered column", async () => {
    const w = await world();
    // A freshly captured lead shows where the board puts a card by default —
    // asserted below rather than assumed from a column label.
    const { lead: benchmark } = await w.container.leads.upsert({ email: "fresh@example.com", source: "manual" }, ACTOR);
    const defaultColumnId = w.cardsFor(benchmark.id)[0]!.columnId;

    const { lead } = await w.container.leads.upsert({ email: "torn@example.com", source: "manual" }, ACTOR);
    const card = w.cardsFor(lead.id)[0]!;
    const proposal = w.leadsPipeline.columns.find(column => column.id !== card.columnId)!;
    pipelines.moveCard(w.agencyId, card.id, proposal.id, 0);

    w.faults.leadWrite = "storage write failed";
    await assert.rejects(() => w.container.leads.archive(lead.id, ACTOR), /storage write failed/);

    // THIS half really is torn, and deliberately in this direction: the card
    // goes first, so a failed write leaves an active lead with no card — which
    // a retry fixes — rather than an orphan card holding a name, email and
    // phone for a lead nobody can see, which is the defect #62 was raised for.
    const after = await w.container.leads.get(lead.id);
    assert.equal(after?.archivedAt, undefined, "the lead was marked archived by a write that failed");
    assert.equal((after?.journeyEvents ?? []).filter(event => event.type === "archived").length, 0);
    assert.equal(w.cardsFor(lead.id).length, 0);
    assert.equal(w.events.filter(name => name === "leads.lead.archived").length, 0);
    assert.equal(w.activityActions.filter(action => action === "leads.lead.archived").length, 0,
      "the activity log claims an archive that failed");

    const archived = await w.container.leads.archive(lead.id, ACTOR);
    assert.ok(archived?.archivedAt, "the retry did not archive the lead");
    assert.equal(w.cardsFor(lead.id).length, 0);
    assert.equal((archived?.journeyEvents ?? []).filter(event => event.type === "archived").length, 1);
    assert.equal(w.events.filter(name => name === "leads.lead.archived").length, 1);
    assert.equal(w.activityActions.filter(action => action === "leads.lead.archived").length, 1,
      "the activity log records the archive a different number of times than it happened");

    // The one thing this path genuinely loses, recorded rather than hidden: the
    // column is read FROM the card, and the card went with the first attempt,
    // so the retry has nothing left to remember.
    assert.equal(archived?.archivedFromColumnId, undefined,
      "the retry claimed to remember a column it could no longer read");

    // What must NOT be lost is the lead itself. Restore still puts it back on
    // the board — in the default column rather than the one it left.
    const restored = await w.container.leads.restore(lead.id, ACTOR);
    assert.equal(restored?.archivedAt, undefined);
    const cards = w.cardsFor(lead.id);
    assert.equal(cards.length, 1, "a lead archived through a torn write could not be restored to the board");
    assert.equal(cards[0]!.columnId, defaultColumnId);
    assert.notEqual(defaultColumnId, proposal.id, "this test proves nothing if the default IS the moved-to column");
    assert.deepEqual(
      (await w.container.leads.list()).map(l => l.id).sort(), [benchmark.id, lead.id].sort(),
      "the restored lead is not back on the active board");
  });
});

describe("the same person coming back", () => {
  it("restores the archived lead instead of writing into an invisible one", async () => {
    const w = await world();
    const { lead } = await w.container.leads.upsert({ email: "return@example.com", name: "Ret", source: "manual" }, ACTOR);
    await w.container.leads.archive(lead.id, ACTOR);

    const again = await w.container.leads.upsert(
      { email: "return@example.com", source: "website", notes: "Asked about the summer package." }, ACTOR);

    assert.equal(again.created, false, "the returning enquiry created a SECOND lead for the same person");
    assert.equal(again.lead.id, lead.id);
    assert.equal(again.lead.archivedAt, undefined,
      "the enquiry landed in a record that is still archived, where nobody will see it");
    assert.deepEqual((await w.container.leads.list()).map(l => l.id), [lead.id],
      "the returning lead is not on the active board");
    assert.equal(w.cardsFor(lead.id).length, 1, "the returning lead has no card on the board");
  });
});

describe("an archived lead must not be emailed", () => {
  it("is excluded from a campaign audience", async () => {
    const w = await world();
    const { lead: staying } = await w.container.leads.upsert({ email: "stay@example.com", source: "manual" }, ACTOR);
    const { lead: leaving } = await w.container.leads.upsert({ email: "leave@example.com", source: "manual" }, ACTOR);
    await w.container.leads.archive(leaving.id, ACTOR);

    const audience = await w.container.leads.resolveAudience({});
    assert.deepEqual(audience.map(l => l.id), [staying.id],
      "an archived lead was in a campaign audience — this is the failure that sends a real email");
  });
});

describe("permanent deletion is a second, deliberate act", () => {
  it("the route refuses to purge a lead that is not archived", () => {
    const source = readFileSync(join(ROOT, "src/built-ins/modules/leads-pipeline/src/api/handlers.ts"), "utf-8");
    assert.match(source, /if \(!existing\.archivedAt\) return badRequest\("Archive this lead before deleting it permanently\."\);/,
      "purge no longer requires the lead to be archived first");
  });

  it("archive, restore and purge are three separate routes", () => {
    const source = readFileSync(join(ROOT, "src/built-ins/modules/leads-pipeline/src/api/routes.ts"), "utf-8");
    for (const path of ["leads/archive", "leads/restore", "leads/purge"]) {
      assert.ok(source.includes(`"${path}"`), `${path} is not routed`);
    }
  });

  it("the confirmation no longer promises something the service does not do", () => {
    const source = readFileSync(join(ROOT, "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx"), "utf-8");
    assert.match(source, /They move to the Archived view and can be restored\./,
      "the archive confirmation does not say the lead can be restored");
    assert.match(source, /This cannot be undone\./,
      "the permanent delete does not warn that it is permanent");
  });

  it("the Archived view exists and offers restore", () => {
    // The view moved to its own module on 2026-08-29 — the first cut of a
    // 2,953-line workspace. Both halves of the guarantee are still asserted, but
    // each against the file that now holds it: the VIEW in `_ArchivedLeads`, and
    // the way IN from the board still in the workspace. Reading only the
    // workspace would have passed while the view was deleted.
    const view = readFileSync(join(ROOT, "src/app/portal/agency/pipelines/[slug]/_ArchivedLeads.tsx"), "utf-8");
    assert.match(view, /function ArchivedLeads\(/, "there is no Archived view to restore from");
    assert.match(view, /onRestore/, "the Archived view offers no way back");

    const workspace = readFileSync(join(ROOT, "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx"), "utf-8");
    assert.match(workspace, /workFilter === "archived"/, "the Archived view is not reachable from the board");
    assert.match(workspace, /<ArchivedLeads/, "the board no longer renders the Archived view");
  });

  it("a new journey event cannot silently inherit the 'Converted to client' label", () => {
    // `journeyEventLabel` moved to `_leadShared` on 2026-08-29 because BOTH the
    // workspace and the extracted details editor call it. That is exactly why it
    // is shared, and exactly why this assertion follows it rather than staying
    // pointed at the workspace.
    const source = readFileSync(join(ROOT, "src/app/portal/agency/pipelines/[slug]/_leadShared.tsx"), "utf-8");
    // The old fall-through returned "Converted to client" for anything it did
    // not recognise, so adding `archived` labelled it as the most consequential
    // thing on the screen.
    assert.match(source, /if \(event\.type === "converted"\) return "Converted to client";/,
      "the converted label is back to being a fall-through");
    assert.match(source, /if \(event\.type === "archived"\) return "Archived";/);
  });
});
