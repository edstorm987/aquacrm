import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

const AGENCY = "agency-editors";
const ACTOR = "ed";

let adapters: typeof import("../src/lib/server/editing/adapters");
let engine: typeof import("../src/lib/editing/engine");
let portalEditor: typeof import("../src/server/portalEditor");
let mutate: typeof import("../src/server/storage").mutate;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  adapters = await import("../src/lib/server/editing/adapters");
  engine = await import("../src/lib/editing/engine");
  portalEditor = await import("../src/server/portalEditor");
});

beforeEach(() => {
  mutate(state => {
    state.portalEditors = {};
    state.agencyWebsites = {};
  });
});

function seedField(label = "Your name") {
  return portalEditor.savePortalEditorField(AGENCY, "contacts", { id: "field-1", label, type: "text" }, ACTOR);
}

describe("the portal form editor, on the shared loop", () => {
  it("edits a field", async () => {
    seedField();
    const adapter = adapters.portalFormEditAdapter({ agencyId: AGENCY, entity: "contacts", actorUserId: ACTOR });
    const document = await adapter.map();
    const target = document.targets[0];
    const outcome = await engine.runEdits({
      adapter,
      intents: [{ targetId: target.id, expectedFingerprint: target.fingerprint, value: "Full name" }],
      confirm: true,
    });
    assert.equal(outcome.published, true);
    assert.equal(portalEditor.getPortalEditorState(AGENCY).forms.contacts?.[0].label, "Full name");
  });

  it("refuses a second editor's stale change instead of erasing the first", async () => {
    // This is the protection none of these editors had. Both read, both
    // write, and the second silently wins — with the save reporting success,
    // so nothing anywhere says the first edit is gone.
    seedField();
    const adapter = adapters.portalFormEditAdapter({ agencyId: AGENCY, entity: "contacts", actorUserId: ACTOR });
    const document = await adapter.map();
    const target = document.targets[0];

    // Somebody else saves first.
    seedField("Changed by someone else");

    const outcome = await engine.runEdits({
      adapter,
      intents: [{ targetId: target.id, expectedFingerprint: target.fingerprint, value: "Full name" }],
      confirm: true,
    });
    assert.equal(outcome.published, false);
    // Either check may catch it, and that redundancy is the point. The
    // document revision is an `updatedAt` in milliseconds, so two saves in the
    // same tick look identical at document level — the per-target fingerprint
    // is what actually holds the line when timestamps collide.
    assert.ok(["document-stale", "target-changed"].includes(outcome.rejected[0].reason),
      `unexpected rejection: ${outcome.rejected[0].reason}`);
    assert.equal(portalEditor.getPortalEditorState(AGENCY).forms.contacts?.[0].label, "Changed by someone else",
      "the other person's edit must survive");
  });

  it("writes nothing at all on a dry run", async () => {
    seedField();
    const adapter = adapters.portalFormEditAdapter({ agencyId: AGENCY, entity: "contacts", actorUserId: ACTOR });
    const document = await adapter.map();
    const target = document.targets[0];
    const outcome = await engine.runEdits({
      adapter,
      intents: [{ targetId: target.id, expectedFingerprint: target.fingerprint, value: "Full name" }],
    });
    assert.equal(outcome.published, false);
    assert.equal(portalEditor.getPortalEditorState(AGENCY).forms.contacts?.[0].label, "Your name");
  });
});

describe("the agency website, on the shared loop", () => {
  it("edits a page's message", async () => {
    const website = await import("../src/server/agencyWebsite");
    website.ensureAgencyWebsite(AGENCY);
    const adapter = adapters.agencyWebsiteEditAdapter({ agencyId: AGENCY, actorUserId: ACTOR });
    const document = await adapter.map();
    assert.ok(document.targets.length, "the website should have pages to edit");
    const target = document.targets[0];
    const outcome = await engine.runEdits({
      adapter,
      intents: [{ targetId: target.id, expectedFingerprint: target.fingerprint, value: "Rewritten copy" }],
      confirm: true,
    });
    assert.equal(outcome.published, true);
    const updated = website.ensureAgencyWebsite(AGENCY).pages.find(page => page.route === target.id);
    assert.equal(updated?.message, "Rewritten copy");
  });

  it("does not offer deploy status as something to type over", async () => {
    // Status is moved by deploys and telemetry, not by a person. Listing it
    // beside editable copy invites somebody to "fix" a value the next deploy
    // immediately overwrites.
    const website = await import("../src/server/agencyWebsite");
    website.ensureAgencyWebsite(AGENCY);
    const adapter = adapters.agencyWebsiteEditAdapter({ agencyId: AGENCY, actorUserId: ACTOR });
    const document = await adapter.map();
    assert.equal(document.targets.some(target => target.id.includes("status")), false);
  });
});

describe("every editor inherits the same guarantees", () => {
  // The point of the consolidation: these are not re-implemented per surface,
  // so a new editor cannot ship without them.
  it("requires a real boolean to publish, on every adapter", async () => {
    seedField();
    for (const adapter of [
      adapters.portalFormEditAdapter({ agencyId: AGENCY, entity: "contacts", actorUserId: ACTOR }),
      adapters.agencyWebsiteEditAdapter({ agencyId: AGENCY, actorUserId: ACTOR }),
    ]) {
      const document = await adapter.map();
      if (!document.targets.length) continue;
      const target = document.targets[0];
      const outcome = await engine.runEdits({
        adapter,
        intents: [{ targetId: target.id, expectedFingerprint: target.fingerprint, value: "Something else" }],
        confirm: "true" as unknown as boolean,
      });
      assert.equal(outcome.published, false, `${document.id} published on a truthy value`);
    }
  });
});

describe("the client portal, on the shared loop", () => {
  // The one where losing an edit costs most: this is the text a client reads
  // when they log in. It saved through `updateClient`, which merges metadata
  // and keeps whichever write arrived last.
  let tenants: typeof import("../src/server/tenants");
  let clientId: string;

  before(async () => { tenants = await import("../src/server/tenants"); });

  beforeEach(() => {
    // Written straight into state: this exercises the adapter, and going
    // through `createClient` would need a whole seeded agency to do it.
    clientId = "cli_editor_test";
    mutate(state => {
      state.clients[clientId] = {
        id: clientId, agencyId: AGENCY, name: "Cedar Dental", stage: "active",
        createdAt: 1, updatedAt: 1,
        metadata: { portalWelcomeNote: "Welcome aboard", portalSupportEmail: "help@cedar.test" },
      } as never;
    });
  });

  it("edits portal copy", async () => {
    const adapter = adapters.clientPortalEditAdapter({ agencyId: AGENCY, clientId });
    const document = await adapter.map();
    const note = document.targets.find(target => target.id === "portalWelcomeNote")!;
    const outcome = await engine.runEdits({
      adapter,
      intents: [{ targetId: note.id, expectedFingerprint: note.fingerprint, value: "Great to have you" }],
      confirm: true,
    });
    assert.equal(outcome.published, true);
    const metadata = tenants.getClientForAgency(AGENCY, clientId)?.metadata as Record<string, unknown>;
    assert.equal(metadata.portalWelcomeNote, "Great to have you");
  });

  it("leaves fields nobody edited untouched", async () => {
    // The publish writes a metadata patch, and a patch that accidentally
    // included every mapped field would blank the ones left alone.
    const adapter = adapters.clientPortalEditAdapter({ agencyId: AGENCY, clientId });
    const document = await adapter.map();
    const note = document.targets.find(target => target.id === "portalWelcomeNote")!;
    await engine.runEdits({
      adapter,
      intents: [{ targetId: note.id, expectedFingerprint: note.fingerprint, value: "Changed" }],
      confirm: true,
    });
    const metadata = tenants.getClientForAgency(AGENCY, clientId)?.metadata as Record<string, unknown>;
    assert.equal(metadata.portalSupportEmail, "help@cedar.test");
  });

  it("lets two people edit different fields without conflicting", async () => {
    // Ordinary and should not conflict — only editing the same field should.
    const adapter = adapters.clientPortalEditAdapter({ agencyId: AGENCY, clientId });
    const document = await adapter.map();
    const note = document.targets.find(target => target.id === "portalWelcomeNote")!;
    const email = document.targets.find(target => target.id === "portalSupportEmail")!;
    const outcome = await engine.runEdits({
      adapter,
      intents: [
        { targetId: note.id, expectedFingerprint: note.fingerprint, value: "One" },
        { targetId: email.id, expectedFingerprint: email.fingerprint, value: "two@cedar.test" },
      ],
      confirm: true,
    });
    assert.equal(outcome.rejected.length, 0);
    assert.equal(outcome.changes.length, 2);
  });

  it("refuses a stale edit to the same field", async () => {
    const adapter = adapters.clientPortalEditAdapter({ agencyId: AGENCY, clientId });
    const document = await adapter.map();
    const note = document.targets.find(target => target.id === "portalWelcomeNote")!;

    tenants.updateClient(AGENCY, clientId, { metadata: { portalWelcomeNote: "Someone else wrote this" } });

    const outcome = await engine.runEdits({
      adapter,
      intents: [{ targetId: note.id, expectedFingerprint: note.fingerprint, value: "Mine" }],
      confirm: true,
    });
    assert.equal(outcome.published, false);
    const metadata = tenants.getClientForAgency(AGENCY, clientId)?.metadata as Record<string, unknown>;
    assert.equal(metadata.portalWelcomeNote, "Someone else wrote this", "the other person's copy must survive");
  });
});
