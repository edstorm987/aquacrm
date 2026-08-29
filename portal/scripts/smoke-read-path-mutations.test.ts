// Reads that can write — the guard over issue #21's inventory.
//
// The finding is real and long-standing: GET routes and rendered pages that
// reach `mutate()`. What was missing is not the observation, it is a way to
// keep the list TRUE. A number in a document ("28 GETs and 26 renders") stops
// being right the day after it is written, and nothing announces it.
//
// So this re-derives the list from source on every run and compares it with the
// declared one. Three different things now fail loudly:
//
//   • a NEW read path that can write is not in the declaration;
//   • a path whose CAUSE changed is a different finding wearing the same name;
//   • a path that was FIXED leaves a stale declaration behind, and says so.
//
// The last one is the one that matters most for a long-lived audit: the usual
// way an inventory rots is that somebody fixes something and nobody removes the
// line about it, until nobody trusts any of the lines.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildCallGraph,
  writingReadRoutes,
  writingRenders,
  causeOf,
  apiRoutes,
  renderedFiles,
  type CallGraph,
} from "./read-path-mutations";
import {
  CAUSE_RULINGS,
  DECLARED_READ_ROUTES,
  DECLARED_RENDERS,
  PASS_THROUGH,
  UNRULED_CAUSE_CEILING,
} from "./read-path-mutation-inventory";
import { ROOT } from "./read-path-mutations";

// One graph for the file — the walk is the slow part, and nothing mutates it.
let graph: CallGraph | null = null;
const g = (): CallGraph => (graph ??= buildCallGraph(PASS_THROUGH));

const line = (entry: { path: string; cause: string }) => `${entry.path}  →  ${entry.cause}`;

function derivedRoutes(): string[] {
  return writingReadRoutes(g()).map(route => line({ path: route.path, cause: causeOf(g(), route.file, "GET") }));
}

function derivedRenders(): string[] {
  return writingRenders(g()).map(file => line({ path: file, cause: causeOf(g(), file, "default") }));
}

describe("the analyser itself", () => {
  it("finds the app at all", () => {
    // A broken walk would return nothing and every assertion below would pass
    // by vacuum — the classic way a source sweep quietly stops sweeping.
    assert.ok(apiRoutes(g()).length > 100, `only ${apiRoutes(g()).length} API routes found — the walk is broken`);
    assert.ok(renderedFiles(g()).length > 100, `only ${renderedFiles(g()).length} rendered files found`);
    assert.ok(g().mutating.size > 200, `only ${g().mutating.size} writing functions found`);
  });

  it("does not flag ordinary reads", () => {
    // These three are the canaries. Every version of this analyser that got the
    // graph wrong flagged them, and flagging them is what turns the inventory
    // from an answer into "almost everything, which is no answer at all".
    for (const name of ["getAgency", "listClients", "getClientForAgency"]) {
      assert.equal(g().mutating.has(`src/server/tenants.ts#${name}`), false,
        `${name} is a pure read but the analyser calls it a write — the graph is over-reaching again`);
    }
    // …and it still sees the real ones.
    assert.equal(g().mutating.has("src/server/agencyProducts.ts#ensureDefaultAgencyProducts"), true,
      "the analyser stopped seeing a function that calls mutate() directly");
    assert.equal(g().mutating.has("src/built-ins/runtime/_runtime.ts#installPlugin"), true,
      "the analyser stopped following a call into a writing function");
  });

  it("treats hydration as hydration, not as a hidden write", () => {
    // `ensureHydrated` loads state and, in the signed-request realm, writes as
    // part of doing so. Counting it made 44 of 48 GET routes look guilty.
    assert.equal(g().mutating.has("src/server/storage.ts#ensureHydrated"), false,
      "storage hydration is being counted as a read-time mutation again");
  });
});

describe("the removals, behaviourally", () => {
  it("reading the product catalogue creates and repairs NOTHING on disk", async () => {
    // Removal #1 (2026-08-27). `ensureDefaultAgencyProducts` was the widest
    // read-time write in the app — eight rendered surfaces plus
    // `/api/portal/search`. It did two jobs: seed the one default product, and
    // repair legacy records. The seed moved to `bootstrapAgency`; the repair is
    // applied in memory by `agencyProductsForRead`.
    const storage = await import("../src/server/storage");
    const { createAgency } = await import("../src/server/tenants");
    const { agencyProductsForRead, createAgencyProduct } = await import("../src/server/agencyProducts");
    await storage.ensureHydrated();
    await storage.reset();

    const agency = createAgency({ name: "Read only products", slug: "read-only-products" });
    // A brand-new agency created WITHOUT bootstrap has no products, and reading
    // must not invent one.
    assert.deepEqual(agencyProductsForRead(agency.id, true), []);
    assert.equal(Object.keys(storage.getState().agencyProducts).length, 0,
      "reading an empty catalogue seeded a product");

    // A stored product missing its newer fields comes back REPAIRED…
    const product = createAgencyProduct(agency.id, { name: "Legacy thing" }, "system");
    storage.mutate(state => {
      const row = state.agencyProducts[product.id]!;
      delete (row as { internalWorkspace?: unknown }).internalWorkspace;
      (row as { sopIds?: unknown }).sopIds = undefined;
    });
    const read = agencyProductsForRead(agency.id, true);
    assert.ok(read[0]!.internalWorkspace, "the read did not repair a legacy record");
    assert.deepEqual(read[0]!.sopIds, []);

    // …and the STORED record is still the broken one, because a read is a read.
    assert.equal(storage.getState().agencyProducts[product.id]!.internalWorkspace, undefined,
      "reading the catalogue wrote the repair back to disk");
  });
});

describe("removal #2 — a page render cannot run automations", () => {
  it("the Marketing workspace data reports the backlog instead of executing it", async () => {
    // The sharpest of the read-time writes. `processAutomationSweep` resumes
    // waiting runs and EXECUTES them, so rendering Marketing could send a
    // customer an email — a side effect with outward consequences, triggered by
    // looking at a screen. Not a seeder, and not idempotent.
    const source = readFileSync(join(ROOT, "src/app/portal/agency/automations/_automationWorkspaceData.ts"), "utf-8");
    assert.doesNotMatch(source.replace(/\/\/[^\n]*/g, " "), /processAutomationSweep\s*\(/,
      "rendering Marketing executes automations again — this one can email a customer");
    assert.match(source, /dueAutomationRuns\(agencyId\)/,
      "the page no longer reports the backlog, so a stopped scheduler is invisible");

    // …and counting them writes nothing.
    const storage = await import("../src/server/storage");
    const { dueAutomationRuns } = await import("../src/server/automations");
    await storage.ensureHydrated();
    await storage.reset();
    const before = JSON.stringify(storage.getState().automationRuns);
    dueAutomationRuns("any-agency");
    assert.equal(JSON.stringify(storage.getState().automationRuns), before,
      "counting the due runs changed them");
  });

  it("NO unauthenticated visitor can trigger a write any more", () => {
    // The one that mattered most for a public launch: the marketing site's
    // layout called `ensurePrimaryAgencyWebsite()`, so a stranger loading the
    // home page created the tenant's website record.
    for (const file of ["src/app/(website)/layout.tsx", "src/app/(website)/client-centre/page.tsx"]) {
      const source = readFileSync(join(ROOT, file), "utf-8").replace(/\/\/[^\n]*/g, " ");
      assert.doesNotMatch(source, /ensurePrimaryAgencyWebsite\s*\(/,
        `${file} is public and writes on render again`);
      assert.match(source, /readPrimaryAgencyWebsite\s*\(/);
    }
  });

  it("reading the primary website stores nothing, even with no record at all", async () => {
    const storage = await import("../src/server/storage");
    const { createAgency } = await import("../src/server/tenants");
    const { readPrimaryAgencyWebsite } = await import("../src/server/agencyWebsite");
    await storage.ensureHydrated();
    await storage.reset();
    createAgency({ name: "Public read", slug: "public-read" });

    const website = readPrimaryAgencyWebsite();
    assert.ok(website, "the public site would render without its own configuration");
    assert.equal(Object.keys(storage.getState().agencyWebsites).length, 0,
      "a visitor loading the public site created the tenant's website record");
  });

  it("the scheduler still owns the sweep", () => {
    // Removing it from the render must not remove it altogether — otherwise
    // waiting automations would never resume at all.
    const cron = readFileSync(join(ROOT, "src/app/api/internal/sweep/route.ts"), "utf-8");
    assert.match(cron, /processAutomationSweep/,
      "nothing runs the automation sweep any more, so a waiting run never resumes");
  });
});

describe("the declared inventory matches the code", () => {
  it("every GET-only route that can write is declared, with its cause", () => {
    assert.deepEqual(derivedRoutes().sort(), DECLARED_READ_ROUTES.map(line).sort(),
      "the writing-read routes have changed. A NEW line means a read gained a hidden write; a MISSING line means one was fixed and the declaration is stale. Update scripts/read-path-mutation-inventory.ts either way.");
  });

  it("every rendered page or layout that can write is declared, with its cause", () => {
    assert.deepEqual(derivedRenders().sort(), DECLARED_RENDERS.map(line).sort(),
      "the writing renders have changed — see scripts/read-path-mutation-inventory.ts");
  });

  it("no declared entry names a cause nobody has ruled on", () => {
    for (const entry of [...DECLARED_READ_ROUTES, ...DECLARED_RENDERS]) {
      assert.ok(CAUSE_RULINGS[entry.cause],
        `${entry.path} reaches ${entry.cause}, which has no ruling. Every write a read can reach needs one — "deliberate" is an answer, silence is not.`);
    }
  });

  it("every ruling says something", () => {
    for (const [cause, ruling] of Object.entries(CAUSE_RULINGS)) {
      assert.ok(ruling.note.length > 30, `${cause}'s ruling has no reasoning behind it`);
      // A deliberate write must not be parked in the backlog category, and an
      // unruled one must not be quietly called deliberate.
      if (ruling.category === "unruled") assert.equal(ruling.verdict, "open", `${cause} is unruled but marked deliberate`);
      if (ruling.verdict === "deliberate") assert.notEqual(ruling.category, "unruled", `${cause} is deliberate but categorised unruled`);
    }
  });

  it("no ruling is left for a cause that no longer appears", () => {
    const live = new Set([...DECLARED_READ_ROUTES, ...DECLARED_RENDERS].map(entry => entry.cause));
    for (const cause of Object.keys(CAUSE_RULINGS)) {
      assert.ok(live.has(cause),
        `${cause} has a ruling but nothing reaches it any more — delete the ruling so the file stays trustworthy`);
    }
  });
});

describe("the backlog can shrink but not grow", () => {
  it("the unruled count is at or below its pin", () => {
    const unruled = Object.entries(CAUSE_RULINGS).filter(([, ruling]) => ruling.category === "unruled");
    assert.ok(unruled.length <= UNRULED_CAUSE_CEILING,
      `${unruled.length} causes are unruled, above the pinned ${UNRULED_CAUSE_CEILING}: ${unruled.map(([name]) => name).join(", ")}`);
    // Ratchet: when the count drops, the pin comes down with it, so the space
    // that was won cannot be quietly given back.
    assert.equal(unruled.length, UNRULED_CAUSE_CEILING,
      `${unruled.length} causes are now unruled — lower UNRULED_CAUSE_CEILING to ${unruled.length} so the progress holds`);
  });

  it("every suppression says why it is not a write", () => {
    // A pass-through entry removes a path from the inventory, so it is the one
    // place in this file where being wrong hides something rather than showing
    // it. Each one owes a sentence, and it has to name a real function.
    for (const [id, reason] of Object.entries(PASS_THROUGH)) {
      assert.ok(reason.length > 40, `${id} is suppressed with no reasoning behind it`);
      const [file, name] = id.split("#");
      const unit = g().modules.get(file!)?.units.get(name!);
      assert.ok(unit, `${id} is suppressed but no longer exists — delete the suppression`);
    }
  });

  it("the deliberate ones are actually accounted for", () => {
    const deliberate = Object.entries(CAUSE_RULINGS).filter(([, r]) => r.verdict === "deliberate");
    // Callbacks and cron are the two categories where a write behind a GET is
    // normal. If this set ever empties, something has been miscategorised.
    assert.ok(deliberate.some(([, r]) => r.category === "callback"));
    assert.ok(deliberate.some(([, r]) => r.category === "cron"));
    assert.ok(deliberate.some(([, r]) => r.category === "audit"));
  });
});
