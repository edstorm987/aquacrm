// SOPs plugin smoke. node:test via tsx --test.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";
import { renderMarkdown } from "../server/markdown";
import { TAG_FAMILIES, slugify } from "../lib/domain";
import { setClock, resetClock } from "../lib/time";

const AGENCY_ID: AgencyId = "agency_aqua";
const OTHER_AGENCY: AgencyId = "agency_other";
const ACTOR: UserId = "user_admin";

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
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

function container(world: World, agencyId: AgencyId = AGENCY_ID) {
  return containerWithDeps({
    agencyId,
    storage: world.storage, activity: world.activity, events: world.events,
  });
}

describe("@aqua/plugin-sops smoke", () => {
  before(() => setClock(() => 1_700_000_000_000));

  test("1. tag families registry exposes the 5 chapter §9c families", () => {
    assert.deepEqual(TAG_FAMILIES, ["sales", "service", "leads", "standards", "mastery"]);
  });

  test("2. slugify normalizes titles", () => {
    assert.equal(slugify("Sales Presentation"), "sales-presentation");
    assert.equal(slugify("Aqua Incubator 3.0 — Onboarding!"), "aqua-incubator-3-0-onboarding");
    assert.equal(slugify(""), "sop");
  });

  test("3. CRUD round-trip: create / get / update / archive / restore", async () => {
    const w = buildWorld();
    const c = container(w);
    const created = await c.sops.create({ title: "Lead Magnets", tags: ["sales"], body: "# Hero" }, ACTOR);
    assert.equal(created.title, "Lead Magnets");
    assert.equal(created.slug, "lead-magnets");
    assert.equal(created.status, "draft");
    assert.deepEqual(created.tags, ["sales"]);

    const fetched = await c.sops.get(created.id);
    assert.equal(fetched?.id, created.id);

    const updated = await c.sops.update(created.id, { body: "# Hero\n\nUpdated", status: "published" }, ACTOR);
    assert.equal(updated?.status, "published");
    assert.match(updated!.body, /Updated/);

    const archived = await c.sops.archive(created.id, ACTOR);
    assert.equal(archived?.status, "archived");

    const restored = await c.sops.restore(created.id, ACTOR);
    assert.equal(restored?.status, "draft");
  });

  test("4. tag-family filtering: list filters by tag + status", async () => {
    const w = buildWorld();
    const c = container(w);
    await c.sops.create({ title: "A", tags: ["sales"] }, ACTOR);
    await c.sops.create({ title: "B", tags: ["service"] }, ACTOR);
    await c.sops.create({ title: "C", tags: ["sales", "standards"] }, ACTOR);
    const sales = await c.sops.list({ tag: "sales" });
    assert.equal(sales.length, 2);
    const standards = await c.sops.list({ tag: "standards" });
    assert.equal(standards.length, 1);
    assert.equal(standards[0]!.title, "C");
  });

  test("5. status transitions: draft → published → archived → draft", async () => {
    const w = buildWorld();
    const c = container(w);
    const s = await c.sops.create({ title: "Cycle", tags: ["service"] }, ACTOR);
    assert.equal(s.status, "draft");
    const pub = await c.sops.setStatus(s.id, "published", ACTOR);
    assert.equal(pub?.status, "published");
    const arch = await c.sops.archive(s.id, ACTOR);
    assert.equal(arch?.status, "archived");
    const back = await c.sops.restore(s.id, ACTOR);
    assert.equal(back?.status, "draft");
  });

  test("6. rendered markdown contains expected HTML (heading, list, code, bold)", () => {
    const md = "# Title\n\nPara with **bold** + `code`.\n\n- one\n- two\n\n```\nfn();\n```";
    const html = renderMarkdown(md);
    assert.match(html, /<h1>Title<\/h1>/);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<code>code<\/code>/);
    assert.match(html, /<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
    assert.match(html, /<pre><code>fn\(\);<\/code><\/pre>/);
  });

  test("7. tagCounts endpoint matches actual data + ignores archived", async () => {
    const w = buildWorld();
    const c = container(w);
    await c.sops.create({ title: "S1", tags: ["sales"] }, ACTOR);
    await c.sops.create({ title: "S2", tags: ["sales", "leads"] }, ACTOR);
    const archived = await c.sops.create({ title: "X", tags: ["sales"] }, ACTOR);
    await c.sops.archive(archived.id, ACTOR);
    const counts = await c.sops.tagCounts();
    assert.equal(counts.sales, 2);   // archived not counted
    assert.equal(counts.leads, 1);
    assert.equal(counts.service, 0);
  });

  test("8. seedDefaults creates 9 placeholder SOPs across 5 families, idempotent", async () => {
    const w = buildWorld();
    const c = container(w);
    const first = await c.sops.seedDefaults(ACTOR);
    assert.equal(first.length, 9);
    const counts = await c.sops.tagCounts();
    for (const fam of TAG_FAMILIES) {
      assert.ok(counts[fam] >= 1, `tag family "${fam}" has at least one seed`);
    }
    const second = await c.sops.seedDefaults(ACTOR);
    assert.equal(second.length, 0);
  });

  test("9. agency tenant isolation — other agency sees nothing", async () => {
    const w = buildWorld();
    const c1 = container(w, AGENCY_ID);
    await c1.sops.create({ title: "Private", tags: ["standards"] }, ACTOR);
    const c2 = container(w, OTHER_AGENCY);
    const list = await c2.sops.list();
    assert.equal(list.length, 0);
  });

  test("10. unique slug — duplicate titles get suffixed", async () => {
    const w = buildWorld();
    const c = container(w);
    const a = await c.sops.create({ title: "Communication SOP", tags: ["standards"] }, ACTOR);
    const b = await c.sops.create({ title: "Communication SOP", tags: ["standards"] }, ACTOR);
    const cc = await c.sops.create({ title: "Communication SOP", tags: ["standards"] }, ACTOR);
    assert.equal(a.slug, "communication-sop");
    assert.equal(b.slug, "communication-sop-2");
    assert.equal(cc.slug, "communication-sop-3");
    const bySlug = await c.sops.getBySlug("communication-sop-2");
    assert.equal(bySlug?.id, b.id);
  });

  test("11. invalid + duplicate tags filtered on create + update", async () => {
    const w = buildWorld();
    const c = container(w);
    const s = await c.sops.create({ title: "X", tags: ["sales", "sales", "bogus" as never] }, ACTOR);
    assert.deepEqual(s.tags, ["sales"]);
    const u = await c.sops.update(s.id, { tags: ["service", "service", "sales"] }, ACTOR);
    assert.deepEqual(u?.tags, ["service", "sales"]);
  });

  test("12. activity log + event bus side-effects on every mutator", async () => {
    const w = buildWorld();
    const c = container(w);
    const s = await c.sops.create({ title: "E", tags: ["service"] }, ACTOR);
    await c.sops.update(s.id, { body: "x" }, ACTOR);
    await c.sops.archive(s.id, ACTOR);
    await c.sops.restore(s.id, ACTOR);
    const cats = w.inspect.activityLog.map(e => e.action);
    assert.ok(cats.includes("sops.sop.created"));
    assert.ok(cats.includes("sops.sop.updated"));
    const evNames = w.inspect.events.map(e => e.name);
    assert.ok(evNames.includes("sops.sop.created"));
    assert.ok(evNames.includes("sops.sop.archived"));
    assert.ok(evNames.includes("sops.sop.restored"));
    for (const e of w.inspect.activityLog) assert.equal(e.category, "sops");
  });

  test("13. title query filter is case-insensitive substring match", async () => {
    const w = buildWorld();
    const c = container(w);
    await c.sops.create({ title: "Sales Presentation", tags: ["sales"] }, ACTOR);
    await c.sops.create({ title: "Lead Magnets", tags: ["sales"] }, ACTOR);
    const r = await c.sops.list({ query: "PRESENT" });
    assert.equal(r.length, 1);
    assert.equal(r[0]!.title, "Sales Presentation");
  });
});

// reset clock at module-end so other suites run with real time.
process.on("exit", () => resetClock());
