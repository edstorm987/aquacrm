import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CheckedMutationError,
  checkedJsonMutation,
} from "../src/lib/client/checkedMutation";
import {
  isPerformanceExperiment,
  isPerformanceExperimentAmendReceipt,
  isPerformanceExperimentDeleteReceipt,
  isPerformanceExperimentSaveReceipt,
  type ExpectedPerformanceExperimentSave,
  type PerformanceExperimentSaveReceipt,
} from "../src/lib/client/performanceMutationPayloads";
import type { PerformanceExperiment } from "../src/server/types";
import { withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "performance-experiment-mutation-test-secret";
process.env.NODE_ENV = "test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

const experiment = (overrides: Partial<PerformanceExperiment> = {}): PerformanceExperiment => ({
  id: "exp_one",
  agencyId: "agency_one",
  clientId: "client_one",
  name: "Homepage outcome",
  hypothesis: "A clearer outcome will increase contact enquiries.",
  primaryMetric: "Form conversions",
  status: "running",
  variants: [
    { id: "a", name: "Version A", visitors: 100, conversions: 10 },
    { id: "b", name: "Version B", visitors: 100, conversions: 15 },
  ],
  version: 2,
  revision: 1,
  startedAt: 1_700_000_000_000,
  createdBy: "owner_one",
  createdAt: 1_699_999_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const expectedSave: ExpectedPerformanceExperimentSave = {
  id: "exp_one",
  expectedVersion: 1,
  clientId: "client_one",
  name: "Homepage outcome",
  hypothesis: "A clearer outcome will increase contact enquiries.",
  primaryMetric: "Form conversions",
  status: "running",
  variants: [
    { id: "a", name: "Version A", visitors: 100, conversions: 10 },
    { id: "b", name: "Version B", visitors: 100, conversions: 15 },
  ],
};

function jsonResponse(body: unknown, status = 200): typeof fetch {
  return async () => Response.json(body, { status });
}

function textResponse(body: string, status = 200): typeof fetch {
  return async () => new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function saveReceipt(saved = experiment(), experiments = [saved]): PerformanceExperimentSaveReceipt {
  return { ok: true, experiment: saved, experiments };
}

describe("Performance experiment checked mutation receipts", () => {
  it("requires complete experiment records and an exact authoritative save identity", () => {
    const saved = experiment();
    assert.equal(isPerformanceExperiment(saved), true);
    assert.equal(isPerformanceExperiment({ ...saved, version: 0 }), false);
    assert.equal(isPerformanceExperiment({ ...saved, status: "invented" }), false);
    assert.equal(isPerformanceExperiment({ ...saved, variants: [{ id: "a", name: "A", visitors: 1, conversions: 2 }] }), false);
    assert.equal(isPerformanceExperiment({ ...saved, variants: [{ ...saved.variants[0] }, { ...saved.variants[1], id: "A" }] }), false);

    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved), expectedSave), true);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved), { ...expectedSave, expectedVersion: 2 }), false);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt({ ...saved, id: "exp_wrong" }), expectedSave), false);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved, []), expectedSave), false);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved, [{ ...saved, name: "Stale copy" }]), expectedSave), false);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved, [saved, saved]), expectedSave), false);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved, [saved, experiment({ id: "exp_other", clientId: "client_other" })]), expectedSave), false);
  });

  it("accepts and checks the exact identity of every variant in a 3+ variant save", () => {
    const variants = [
      ...expectedSave.variants,
      { id: "c", name: "Version C", visitors: 80, conversions: 12 },
      { id: "d", name: "Version D", visitors: 90, conversions: 18 },
    ];
    const expected = { ...expectedSave, variants };
    const saved = experiment({ variants });
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved), expected), true);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved), { ...expected, variants: variants.slice(0, 2) }), false);
    assert.equal(isPerformanceExperimentSaveReceipt(saveReceipt(saved), {
      ...expected,
      variants: variants.map(variant => variant.id === "c" ? { ...variant, name: "Changed C" } : variant),
    }), false);
  });

  it("binds amendments to the source revision and delete receipts to the removed id", () => {
    const source = experiment({
      status: "complete",
      version: 4,
      endedAt: 1_700_000_100_000,
      amendedByExperimentId: "exp_two",
      variants: [
        ...expectedSave.variants,
        { id: "c", name: "Version C", visitors: 80, conversions: 12 },
        { id: "d", name: "Version D", visitors: 90, conversions: 18 },
      ],
    });
    const amendment = experiment({
      id: "exp_two",
      status: "draft",
      version: 1,
      revision: 2,
      startedAt: undefined,
      endedAt: undefined,
      amendsExperimentId: source.id,
      amendedByExperimentId: undefined,
      variants: source.variants.map(variant => ({ ...variant, visitors: 0, conversions: 0 })),
    });
    const receipt = saveReceipt(amendment, [amendment, source]);
    const expected = { sourceId: source.id, sourceVersion: 3, sourceRevision: 1, clientId: "client_one" };
    assert.equal(isPerformanceExperimentAmendReceipt(receipt, expected), true);
    assert.equal(isPerformanceExperimentAmendReceipt(receipt, { ...expected, sourceVersion: 2 }), false);
    assert.equal(isPerformanceExperimentAmendReceipt(saveReceipt(amendment, [amendment]), expected), false);
    assert.equal(isPerformanceExperimentAmendReceipt(saveReceipt({ ...amendment, amendsExperimentId: "exp_wrong" }, [source, { ...amendment, amendsExperimentId: "exp_wrong" }]), expected), false);
    const missingVariant = { ...amendment, variants: amendment.variants.slice(0, 2) };
    assert.equal(isPerformanceExperimentAmendReceipt(saveReceipt(missingVariant, [source, missingVariant]), expected), false);
    const renamedVariant = { ...amendment, variants: amendment.variants.map(variant => variant.id === "c" ? { ...variant, name: "Changed C" } : variant) };
    assert.equal(isPerformanceExperimentAmendReceipt(saveReceipt(renamedVariant, [source, renamedVariant]), expected), false);

    assert.equal(isPerformanceExperimentDeleteReceipt({ ok: true, experimentId: amendment.id, experiments: [source] }, { experimentId: amendment.id, clientId: "client_one" }), true);
    assert.equal(isPerformanceExperimentDeleteReceipt({ ok: true, experimentId: "exp_wrong", experiments: [source] }, { experimentId: amendment.id, clientId: "client_one" }), false);
    assert.equal(isPerformanceExperimentDeleteReceipt({ ok: true, experimentId: amendment.id, experiments: [source, amendment] }, { experimentId: amendment.id, clientId: "client_one" }), false);
  });

  it("rejects transport, unreadable JSON, HTTP failures and domain refusals without continuing", async () => {
    const unreadableResponse = {
      ok: true,
      status: 200,
      text: async () => { throw new Error("stream failed"); },
    } as Response;
    const cases: Array<{ fetcher: typeof fetch; kind: CheckedMutationError["kind"] }> = [
      { fetcher: async () => { throw new TypeError("offline"); }, kind: "transport" },
      { fetcher: async () => unreadableResponse, kind: "response" },
      { fetcher: textResponse("not-json"), kind: "response" },
      { fetcher: jsonResponse({ ok: false, error: "That test changed. Reload and retry." }, 409), kind: "http" },
      { fetcher: jsonResponse({ ok: false, error: "private provider detail" }, 503), kind: "http" },
      { fetcher: jsonResponse({ ok: false, error: "The mutation was refused." }), kind: "domain" },
    ];

    for (const item of cases) {
      let continued = false;
      await assert.rejects(
        checkedJsonMutation<PerformanceExperimentSaveReceipt>(
          "/api/portal/performance/experiments",
          { method: "POST" },
          {
            fallback: "Could not save this test.",
            fetcher: item.fetcher,
            validate: value => isPerformanceExperimentSaveReceipt(value, expectedSave),
          },
        ).then(() => { continued = true; }),
        (error: unknown) => error instanceof CheckedMutationError && error.kind === item.kind,
      );
      assert.equal(continued, false);
    }
  });

  it("rejects malformed and wrong-identity 200s without a success continuation", async () => {
    const saved = experiment();
    for (const body of [
      { ok: true },
      { ok: true, experiment: "saved", experiments: [] },
      saveReceipt({ ...saved, id: "exp_wrong" }),
      saveReceipt(saved, [{ ...saved, version: saved.version + 1 }]),
    ]) {
      let continued = false;
      await assert.rejects(
        checkedJsonMutation<PerformanceExperimentSaveReceipt>(
          "/api/portal/performance/experiments",
          { method: "POST" },
          {
            fallback: "Could not save this test.",
            fetcher: jsonResponse(body),
            validate: value => isPerformanceExperimentSaveReceipt(value, expectedSave),
          },
        ).then(() => { continued = true; }),
        (error: unknown) => error instanceof CheckedMutationError && error.kind === "domain",
      );
      assert.equal(continued, false);
    }
  });
});

describe("mounted Performance experiment mutation flow", () => {
  it("uses parent-owned experiments and reports every checked mutation through the callback", () => {
    const panel = readFileSync("src/app/portal/agency/performance/_ExperimentsPanel.tsx", "utf8");
    assert.match(panel, /checkedJsonMutation/);
    assert.match(panel, /mutationErrorMessage/);
    assert.doesNotMatch(panel, /\bfetch\s*\(/);
    assert.match(panel, /experimentMutationIds\.current\.size > 0/);
    assert.match(panel, /const experimentBusy = busyExperimentIds\.size > 0/);
    assert.match(panel, /busyExperimentIds\.has\(experiment\.id\)/);
    assert.match(panel, /aria-busy=\{busyExperimentIds\.has\(experiment\.id\) \|\| undefined\}/);
    assert.match(panel, /beginMutationSequence: \(\) => number/);
    assert.match(panel, /onExperimentsChange: \(experiments: PerformanceExperiment\[\], sequence: number\) => void/);
    assert.match(panel, /initialExperiments\.length/);
    assert.match(panel, /initialExperiments\.map\(experiment/);
    assert.doesNotMatch(panel, /useState\(initialExperiments\)/);
    assert.doesNotMatch(panel, /\bsetExperiments\b/);
    assert.match(panel, /useEffect\(\(\) => \{[\s\S]{0,220}?setEditing\(null\)[\s\S]{0,220}?\}, \[clientId\]\)/);

    const remove = panel.slice(panel.indexOf("async function remove"), panel.indexOf("async function amend"));
    assert.ok(remove.indexOf("beginExperimentMutation") < remove.indexOf("checkedJsonMutation"));
    assert.ok(remove.indexOf("beginMutationSequence()") < remove.indexOf("checkedJsonMutation"));
    assert.ok(remove.indexOf("checkedJsonMutation") < remove.indexOf("onExperimentsChange(result.experiments, sequence)"));
    assert.match(remove, /catch[\s\S]{0,180}?setOperationError\(mutationErrorMessage/);
    assert.match(remove, /finally[\s\S]{0,220}?finishExperimentMutation\(experiment\.id\)/);

    const amend = panel.slice(panel.indexOf("async function amend"), panel.indexOf("\n  return (", panel.indexOf("async function amend")));
    assert.ok(amend.indexOf("beginExperimentMutation") < amend.indexOf("checkedJsonMutation"));
    assert.ok(amend.indexOf("beginMutationSequence()") < amend.indexOf("checkedJsonMutation"));
    assert.ok(amend.indexOf("checkedJsonMutation") < amend.indexOf("onExperimentsChange(result.experiments, sequence)"));
    assert.ok(amend.indexOf("onExperimentsChange(result.experiments, sequence)") < amend.indexOf("setEditing(result.experiment)"));
    assert.match(amend, /finally[\s\S]{0,220}?finishExperimentMutation\(experiment\.id\)/);

    const submit = panel.slice(panel.indexOf("async function submit"), panel.indexOf("\n  return (", panel.indexOf("async function submit")));
    assert.ok(submit.indexOf("beginMutationSequence()") < submit.indexOf("checkedJsonMutation"));
    assert.ok(submit.indexOf("checkedJsonMutation") < submit.indexOf("onSaved(result.experiment, result.experiments, sequence)"));
    assert.match(submit, /catch[\s\S]{0,180}?setError\(mutationErrorMessage/);
    assert.match(submit, /finally[\s\S]{0,80}?setBusy\(false\)/);
    assert.equal((panel.match(/role="alert"/g) ?? []).length, 2);
    assert.match(panel, /onSaved=\{\(_saved, authoritativeExperiments, sequence\) => \{[\s\S]{0,120}?onExperimentsChange\(authoritativeExperiments, sequence\);[\s\S]{0,140}?setEditing\(null\)/);
  });

  it("keeps local dialog state on the active client while every authoritative receipt reaches the sequenced parent", () => {
    const panel = readFileSync("src/app/portal/agency/performance/_ExperimentsPanel.tsx", "utf8");
    assert.match(panel, /const clientGeneration = useRef\(0\)/);
    assert.match(panel, /if \(activeClientId\.current !== clientId\) \{[\s\S]{0,140}?clientGeneration\.current \+= 1/);
    assert.match(panel, /activeClientId\.current === mutationClientId[\s\S]{0,100}?clientGeneration\.current === mutationClientGeneration/);
    assert.equal((panel.match(/const mutationClientGeneration = clientGeneration\.current;/g) ?? []).length, 2);
    assert.match(panel, /const dialogClientGeneration = clientGeneration\.current/);
    assert.match(panel, /isActive=\{\(\) => isActiveClientMutation\(clientId, dialogClientGeneration\)\}/);
    // The receipt is applied through the parent FIRST (sequence-guarded there), and only the
    // local dialog close is gated on the panel still showing the same client selection.
    assert.match(panel, /onExperimentsChange\(authoritativeExperiments, sequence\);[\s\S]{0,60}?if \(!isActiveClientMutation\(clientId, dialogClientGeneration\)\) return;[\s\S]{0,40}?setEditing\(null\)/);
    const remove = panel.slice(panel.indexOf("async function remove"), panel.indexOf("async function amend"));
    assert.doesNotMatch(remove, /if \(isActiveClientMutation\([^)]*\)\) \{\s*onExperimentsChange/, "a delete receipt must never be discarded on a client switch");
    const amend = panel.slice(panel.indexOf("async function amend"), panel.indexOf("\n  return (", panel.indexOf("async function amend")));
    assert.match(amend, /onExperimentsChange\(result\.experiments, sequence\);\s*if \(isActiveClientMutation\(mutationClientId, mutationClientGeneration\)\) \{\s*setEditing\(result\.experiment\)/);
    assert.match(panel, /catch \(cause\) \{[\s\S]{0,100}?if \(isActive\(\)\) setError/);

    const workspace = readFileSync("src/app/portal/agency/performance/_PerformanceWorkspace.tsx", "utf8");
    assert.match(workspace, /function applyIfLatest\(family: "reports" \| "experiments" \| "milestones", clientId: string, sequence: number\): boolean \{\s*const key = `\$\{family\}:\$\{clientId\}`;\s*if \(sequence <= \(appliedSequences\.current\.get\(key\) \?\? 0\)\) return false;/);
    for (const family of ["reports", "experiments", "milestones"]) {
      assert.match(workspace, new RegExp(`if \\(!applyIfLatest\\("${family}", clientId, sequence\\)\\) return;`));
    }
    assert.match(workspace, /<ClientPerformance\s+key=\{selected\.id\}/);
    assert.match(workspace, /beginExperimentMutation=\{\(\) => beginMutation\("experiments", selected\.id\)\}/);
    assert.match(workspace, /beginMilestoneMutation=\{\(\) => beginMutation\("milestones", selected\.id\)\}/);
    assert.match(workspace, /beginReportMutation=\{\(\) => beginMutation\("reports", selected\.id\)\}/);
  });

  it("renders and submits every existing variant while new tests still default to A and B", () => {
    const panel = readFileSync("src/app/portal/agency/performance/_ExperimentsPanel.tsx", "utf8");
    assert.match(panel, /const editableVariants = experiment\?\.variants \?\? DEFAULT_EXPERIMENT_VARIANTS/);
    assert.match(panel, /const variants = editableVariants\.map\(\(variant, index\) => \(\{/);
    assert.match(panel, /id: variant\.id/);
    assert.match(panel, /name: cleanFormString\(data\.get\(`variant-\$\{index\}`\), 120\)/);
    assert.match(panel, /\(experiment\?\.variants \?\? DEFAULT_EXPERIMENT_VARIANTS\)\.map\(\(variant, index\)/);
    assert.match(panel, /<VariantFields key=\{variant\.id\} index=\{index\} variant=\{variant\}/);
    assert.doesNotMatch(panel, /experiment\?\.variants\[[01]\]/);
    assert.doesNotMatch(panel, /variant[AB]/);
    assert.match(panel, /const DEFAULT_EXPERIMENT_VARIANTS:[\s\S]{0,180}?id: "a"[\s\S]{0,100}?id: "b"/);
  });

  it("returns mutation identity and authoritative experiment collections from the route", () => {
    const route = readFileSync("src/app/api/portal/performance/experiments/route.ts", "utf8");
    assert.match(route, /withPortalStateTransaction[\s\S]{0,1800}?listAuthoritativeExperiments/);
    assert.match(route, /ok: true, experiment: result\.experiment, experiments: result\.experiments/);
    assert.match(route, /ok: true, experimentId: result\.experimentId, experiments: result\.experiments/);
    assert.match(route, /listPerformanceExperiments\(agencyId\)\.filter\(experiment => experiment\.clientId === clientId\)/);
  });
});

describe("Performance experiment route receipts", () => {
  it("returns exact save/delete identities with a scoped authoritative collection", async () => {
    const [storage, tenants, users, auth, performanceExperiments, route, nextServer] = await Promise.all([
      import("../src/server/storage"),
      import("../src/server/tenants"),
      import("../src/server/users"),
      import("../src/lib/server/auth/auth"),
      import("../src/server/performanceExperiments"),
      import("../src/app/api/portal/performance/experiments/route"),
      import("next/server"),
    ]);
    await storage.reset();
    const agency = tenants.createAgency({ name: "Experiment receipts" });
    const owner = users.createUser({
      agencyId: agency.id,
      email: `owner-${agency.id}@experiments.test`,
      name: "Experiment owner",
      password: "test-password",
      role: "agency-owner",
    });
    const token = auth.issueSession({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    });
    performanceExperiments.createPerformanceExperiment(agency.id, {
      clientId: "client_outside_the_agency_panel",
      name: "Client-only experiment",
    }, owner.id);
    await storage.flushPendingWrites();

    const request = (body: unknown) => new nextServer.NextRequest("http://localhost/api/portal/performance/experiments", {
      method: "POST",
      headers: {
        cookie: `${auth.SESSION_COOKIE_NAME}=${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const draftInput = {
      name: "Agency homepage",
      hypothesis: "The shorter headline wins.",
      primaryMetric: "Form conversions",
      status: "draft" as const,
      variants: [
        { id: "a", name: "Version A", visitors: 0, conversions: 0 },
        { id: "b", name: "Version B", visitors: 0, conversions: 0 },
        { id: "c", name: "Version C", visitors: 0, conversions: 0 },
        { id: "d", name: "Version D", visitors: 0, conversions: 0 },
      ],
    };
    const createResponse = await route.POST(request(draftInput));
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(isPerformanceExperimentSaveReceipt(created, draftInput), true);
    assert.equal(created.experiments.every((item: PerformanceExperiment) => item.clientId === undefined), true);

    const updateInput = {
      ...draftInput,
      id: created.experiment.id as string,
      expectedVersion: created.experiment.version as number,
      status: "running" as const,
    };
    const updateResponse = await route.POST(request(updateInput));
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(isPerformanceExperimentSaveReceipt(updated, updateInput), true);
    assert.deepEqual(updated.experiment.variants, draftInput.variants);

    const secondResponse = await route.POST(request({ ...draftInput, name: "Delete me" }));
    const second = await secondResponse.json();
    const deleteResponse = await route.DELETE(new nextServer.NextRequest(
      `http://localhost/api/portal/performance/experiments?id=${encodeURIComponent(second.experiment.id)}&expectedVersion=${second.experiment.version}`,
      { method: "DELETE", headers: { cookie: `${auth.SESSION_COOKIE_NAME}=${token}` } },
    ));
    assert.equal(deleteResponse.status, 200);
    assert.equal(isPerformanceExperimentDeleteReceipt(await deleteResponse.json(), {
      experimentId: second.experiment.id,
      clientId: undefined,
    }), true);
  });
});

describe("Performance experiment route error classification", () => {
  it("answers malformed requests 400, stale versions 409, missing records 404 and never echoes an unexpected failure", async () => {
    const [storage, tenants, users, auth, performanceExperiments, route, nextServer, errors] = await Promise.all([
      import("../src/server/storage"),
      import("../src/server/tenants"),
      import("../src/server/users"),
      import("../src/lib/server/auth/auth"),
      import("../src/server/performanceExperiments"),
      import("../src/app/api/portal/performance/experiments/route"),
      import("next/server"),
      import("../src/lib/server/performance/performanceMutationErrors"),
    ]);
    await storage.reset();
    const agency = tenants.createAgency({ name: "Experiment refusals" });
    const owner = users.createUser({
      agencyId: agency.id,
      email: `owner-${agency.id}@refusals.test`,
      name: "Refusal owner",
      password: "test-password",
      role: "agency-owner",
    });
    const token = auth.issueSession({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    });
    await storage.flushPendingWrites();
    const headers = { cookie: `${auth.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" };
    const post = (body: unknown) => route.POST(new nextServer.NextRequest("http://localhost/api/portal/performance/experiments", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
    const remove = (query: string) => route.DELETE(new nextServer.NextRequest(
      `http://localhost/api/portal/performance/experiments${query}`,
      { method: "DELETE", headers },
    ));
    const refusal = async (response: Response, status: number, error: string) => {
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { ok: false, error });
    };

    // Request-shape refusals are safe 400s decided before any persistence.
    await refusal(await post("not json"), 400, "experiment required");
    await refusal(await post({ name: "Bad action", action: "publish" }), 400, "Choose a valid experiment action.");
    await refusal(await post({ variants: [] }), 400, "Experiment name required.");
    await refusal(await post({ name: "Bad variants", variants: "ab" }), 400, "Variants must be a list.");
    await refusal(await post({ name: "Bad client", clientId: 42 }), 400, "Choose a valid client.");
    await refusal(await post({ id: "exp_missing", name: "No version" }), 400, "expectedVersion is required to change an existing experiment.");
    await refusal(await post({ action: "amend" }), 400, "Choose an experiment to amend.");
    // Domain rule refusals from the experiment module are 400s with their authored text.
    await refusal(await post({ name: "Too few", variants: [{ id: "a" }] }), 400, "An experiment needs between two and six variants.");
    await refusal(await post({ name: "Impossible", variants: [{ id: "a", visitors: 1, conversions: 2 }, { id: "b" }] }), 400, "Conversions cannot exceed visitors for a.");
    await refusal(await post({ name: "Not a draft", status: "running" }), 400, "New experiments must start as a draft.");
    // Tenancy and identity refusals are 404s.
    await refusal(await post({ name: "Unknown client", clientId: "cli_missing" }), 404, "client not found");
    await refusal(await post({ id: "exp_missing", expectedVersion: 1, name: "Unknown" }), 404, "experiment not found");
    await refusal(await remove("?id=exp_missing&expectedVersion=1"), 404, "experiment not found");
    await refusal(await remove(""), 400, "Choose an experiment to delete.");
    await refusal(await remove("?id=exp_missing"), 400, "expectedVersion is required to delete an experiment.");

    // A real record: stale versions and illegal transitions are 409 conflicts.
    const created = await (await post({ name: "Real test" })).json();
    assert.equal(created.ok, true);
    const id = created.experiment.id as string;
    await refusal(await post({ id, expectedVersion: 99, name: "Stale" }), 409, "This experiment changed in another session. Reload it before continuing.");
    await refusal(await post({ id, expectedVersion: 1, name: "Real test", status: "complete" }), 409, "Experiment status cannot move from draft to complete.");
    await refusal(await post({ action: "amend", id, expectedVersion: 1 }), 409, "Only a completed experiment can be amended.");
    await refusal(await remove(`?id=${id}&expectedVersion=7`), 409, "This experiment changed in another session. Reload it before continuing.");
    assert.equal(performanceExperiments.listPerformanceExperiments(agency.id).length, 1, "refused writes must not change the store");

    // Anything that is not a typed refusal is captured and answered generically.
    const unexpected = errors.performanceMutationErrorResponse(new Error("connection to pg://user:secret@db failed"), { fallback: "Could not save experiment." });
    assert.equal(unexpected.status, 500);
    const unexpectedBody = await unexpected.json();
    assert.deepEqual(unexpectedBody, { ok: false, error: "Could not save experiment." });
    const notError = errors.performanceMutationErrorResponse("string failure", { fallback: "Could not delete experiment." });
    assert.equal(notError.status, 500);
    assert.deepEqual(await notError.json(), { ok: false, error: "Could not delete experiment." });
    const authRefusal = errors.performanceMutationErrorResponse(new auth.AuthError(403, "forbidden"), { fallback: "Could not save experiment." });
    assert.equal(authRefusal.status, 403);
    assert.deepEqual(await authRefusal.json(), { ok: false, error: "forbidden" });
  });

  it("routes every Performance mutation failure through the shared classifier instead of echoing messages", () => {
    const experiments = readFileSync("src/app/api/portal/performance/experiments/route.ts", "utf8");
    const milestones = readFileSync("src/app/api/tenants/client-milestones/route.ts", "utf8");
    for (const source of [experiments, milestones]) {
      assert.match(source, /performanceMutationErrorResponse\(/);
      assert.doesNotMatch(source, /error instanceof Error \? error\.message/);
      assert.doesNotMatch(source, /throw new Error\(/);
    }
    assert.match(experiments, /PerformanceMutationNotFoundError\("client not found"\)/);
    assert.match(experiments, /PerformanceMutationNotFoundError\("experiment not found"\)/);
    // The record lookup and the client element gate must sit INSIDE the refreshed
    // transaction in both handlers, so a warm multi-instance snapshot cannot skip
    // the gate or scope the authoritative list from a stale copy.
    for (const handler of ["export async function POST", "export async function DELETE"]) {
      const body = experiments.slice(experiments.indexOf(handler), experiments.indexOf("\nexport async function", experiments.indexOf(handler) + 10) === -1 ? undefined : experiments.indexOf("\nexport async function", experiments.indexOf(handler) + 10));
      const transactionAt = body.indexOf("withPortalStateTransaction(");
      const lookupAt = body.indexOf("listPerformanceExperiments(");
      const gateAt = body.indexOf("requireCurrentClientWorkspaceElementAccess(");
      assert.ok(transactionAt >= 0 && lookupAt > transactionAt && gateAt > lookupAt, `${handler}: transaction → fresh lookup → gate`);
    }
    assert.match(milestones, /withPortalStateTransaction\(`client-milestones:/);
    const helper = readFileSync("src/lib/server/performance/performanceMutationErrors.ts", "utf8");
    assert.match(helper, /captureError\(error, input\.breadcrumb\)/);
    assert.match(helper, /refusal\(500, input\.fallback\)/);
    const domain = readFileSync("src/server/performanceExperiments.ts", "utf8");
    assert.doesNotMatch(domain, /throw new Error\(/, "every experiment refusal must be a typed validation or conflict error");
  });
});

describe("Performance experiment dialog normalisation matches the server", () => {
  it("clears a blank hypothesis on the wire and expects the server's defaults for blank optional fields", async () => {
    const [storage, tenants, users, auth, route, nextServer] = await Promise.all([
      import("../src/server/storage"),
      import("../src/server/tenants"),
      import("../src/server/users"),
      import("../src/lib/server/auth/auth"),
      import("../src/app/api/portal/performance/experiments/route"),
      import("next/server"),
    ]);
    await storage.reset();
    const agency = tenants.createAgency({ name: "Experiment normalisation" });
    const owner = users.createUser({
      agencyId: agency.id,
      email: `owner-${agency.id}@normalise.test`,
      name: "Normalising owner",
      password: "test-password",
      role: "agency-owner",
    });
    const token = auth.issueSession({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    });
    await storage.flushPendingWrites();
    const post = (body: unknown) => route.POST(new nextServer.NextRequest("http://localhost/api/portal/performance/experiments", {
      method: "POST",
      headers: { cookie: `${auth.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }));

    // Exactly what the dialog now sends for a new test with a blank measure and blank variant names.
    const createBody = { name: "Blank fields", hypothesis: "", primaryMetric: "", status: "draft" as const, variants: [{ id: "a", name: "", visitors: 0, conversions: 0 }, { id: "b", name: "", visitors: 0, conversions: 0 }] };
    const created = await (await post(createBody)).json();
    assert.equal(created.ok, true);
    assert.equal(isPerformanceExperimentSaveReceipt(created, {
      ...createBody,
      hypothesis: undefined,
      primaryMetric: "Form conversions",
      variants: [{ id: "a", name: "Version A", visitors: 0, conversions: 0 }, { id: "b", name: "Version B", visitors: 0, conversions: 0 }],
    }), true, "the dialog's expectation must accept the server's defaults");

    // Set a hypothesis, then clear it: the cleared string must clear the record and the receipt must be accepted.
    const withHypothesis = await (await post({ ...createBody, id: created.experiment.id, expectedVersion: created.experiment.version, hypothesis: "Shorter wins." })).json();
    assert.equal(withHypothesis.experiment.hypothesis, "Shorter wins.");
    const cleared = await (await post({ ...createBody, id: created.experiment.id, expectedVersion: withHypothesis.experiment.version, hypothesis: "" })).json();
    assert.equal(cleared.ok, true);
    assert.equal(cleared.experiment.hypothesis, undefined, "a cleared hypothesis must not keep the old text");
    assert.equal(isPerformanceExperimentSaveReceipt(cleared, {
      ...createBody,
      id: created.experiment.id,
      expectedVersion: withHypothesis.experiment.version,
      hypothesis: undefined,
      primaryMetric: "Form conversions",
      variants: [{ id: "a", name: "Version A", visitors: 0, conversions: 0 }, { id: "b", name: "Version B", visitors: 0, conversions: 0 }],
    }), true);
  });

  it("pins the dialog's wire body and receipt expectation split", () => {
    const panel = readFileSync("src/app/portal/agency/performance/_ExperimentsPanel.tsx", "utf8");
    const submit = panel.slice(panel.indexOf("async function submit"), panel.indexOf("\n  return (", panel.indexOf("async function submit")));
    assert.match(submit, /const hypothesis = cleanFormString\(data\.get\("hypothesis"\), 1_000\);/);
    assert.match(submit, /body: JSON\.stringify\(body\)/);
    assert.match(submit, /hypothesis: hypothesis \|\| undefined,/);
    assert.match(submit, /primaryMetric: primaryMetric \|\| experiment\?\.primaryMetric \|\| "Form conversions",/);
    assert.match(submit, /name: cleanFormString\(data\.get\(`variant-\$\{index\}`\), 120\) \|\| `Version \$\{String\.fromCharCode\(65 \+ index\)\}`/);
    assert.match(submit, /validate: value => isPerformanceExperimentSaveReceipt\(value, payload\)/);
  });
});


describe("Performance experiment client-scoped route and normalisation edges", () => {
  it("serves client-scoped saves through the element gate with client-scoped receipts and refuses a foreign client 404", async () => {
    const [storage, tenants, users, auth, route, nextServer, performanceExperimentsModule] = await Promise.all([
      import("../src/server/storage"),
      import("../src/server/tenants"),
      import("../src/server/users"),
      import("../src/lib/server/auth/auth"),
      import("../src/app/api/portal/performance/experiments/route"),
      import("next/server"),
      import("../src/server/performanceExperiments"),
    ]);
    await storage.reset();
    const agency = tenants.createAgency({ name: "Client-scoped experiments" });
    const client = tenants.createClient(agency.id, { name: "Scoped client" });
    const otherAgency = tenants.createAgency({ name: "Other agency" });
    const foreign = tenants.createClient(otherAgency.id, { name: "Foreign client" });
    const manager = users.createUser({
      agencyId: agency.id,
      email: `manager-${agency.id}@scoped.test`,
      name: "Scoped manager",
      password: "test-password",
      role: "agency-manager",
    });
    storage.mutate(state => {
      state.accessGrants.scopedExperimentGrant = {
        id: "scopedExperimentGrant",
        agencyId: agency.id,
        userId: manager.id,
        scope: { kind: "client", id: client.id },
        environment: "live",
        capabilities: ["element.client.marketing.view", "element.client.marketing.use", "element.client.marketing.manage"],
        createdBy: manager.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    const token = auth.issueSession({
      userId: manager.id,
      email: manager.email,
      role: manager.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: manager.sessionRev ?? 0,
    });
    await storage.flushPendingWrites();
    const post = (body: unknown) => withSession(token, () => route.POST(new nextServer.NextRequest("http://localhost/api/portal/performance/experiments", {
      method: "POST",
      headers: { cookie: `${auth.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    })));
    const input = { clientId: client.id, name: "Scoped headline", hypothesis: "", primaryMetric: "Form conversions", status: "draft" as const, variants: [{ id: "a", name: "Version A", visitors: 0, conversions: 0 }, { id: "b", name: "Version B", visitors: 0, conversions: 0 }] };
    const created = await (await post(input)).json();
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(isPerformanceExperimentSaveReceipt(created, { ...input, hypothesis: undefined }), true);
    assert.equal(created.experiments.every((item: PerformanceExperiment) => item.clientId === client.id), true, "the authoritative list is scoped to the client");

    // A client owned by ANOTHER agency is refused by `routeTenantScope` before the
    // route's own 404 branch runs. Today that refusal is a 403 (the recorded #168
    // house-convention inconsistency, unchanged by this cohort); the assertion
    // pins that it is refused and that nothing was written, not the exact code.
    const foreignResponse = await post({ ...input, clientId: foreign.id });
    assert.ok(foreignResponse.status === 403 || foreignResponse.status === 404, `foreign client refused, got ${foreignResponse.status}`);
    assert.equal((await foreignResponse.json()).ok, false);
    assert.equal(performanceExperimentsModule.listPerformanceExperiments(otherAgency.id).length, 0, "a refused foreign save must not write into the other agency");

    // An update that was cut at the length cap on a space still matches its receipt,
    // because the dialog trims after the cap exactly as the server does.
    const longName = `${"H".repeat(159)} tail`.slice(0, 160);
    assert.notEqual(longName, longName.trim(), "fixture must end with a space at the cap");
    const trimmed = longName.trim();
    const updated = await (await post({ ...input, id: created.experiment.id, expectedVersion: created.experiment.version, name: trimmed })).json();
    assert.equal(updated.experiment.name, trimmed);
    assert.equal(isPerformanceExperimentSaveReceipt(updated, { ...input, id: created.experiment.id, expectedVersion: created.experiment.version, name: trimmed, hypothesis: undefined }), true);
  });

  it("refuses a null variant entry as a 400 and keeps amendment variant ids at the creation cap", async () => {
    const [performanceExperiments, tenants, storage] = await Promise.all([
      import("../src/server/performanceExperiments"),
      import("../src/server/tenants"),
      import("../src/server/storage"),
    ]);
    const route = readFileSync("src/app/api/portal/performance/experiments/route.ts", "utf8");
    assert.match(route, /!Array\.isArray\(value\.variants\) \|\| !value\.variants\.every\(isJsonRecord\)/);
    await storage.reset();
    const agency = tenants.createAgency({ name: "Amend caps" });
    const longId = "v".repeat(58);
    const draft = performanceExperiments.createPerformanceExperiment(agency.id, { name: "Long ids", variants: [{ id: longId, visitors: 4, conversions: 1 }, { id: "b", visitors: 4, conversions: 2 }] }, "actor");
    const running = performanceExperiments.updatePerformanceExperiment(agency.id, draft.id, { expectedVersion: 1, status: "running" }, "actor")!;
    const complete = performanceExperiments.updatePerformanceExperiment(agency.id, draft.id, { expectedVersion: running.version, status: "complete" }, "actor")!;
    const amendment = performanceExperiments.amendPerformanceExperiment(agency.id, draft.id, complete.version, "actor")!;
    assert.deepEqual(amendment.variants.map(variant => variant.id), [longId, "b"], "amendment must preserve stable ids up to the creation cap");
    assert.equal(isPerformanceExperimentAmendReceipt(
      { ok: true, experiment: amendment, experiments: performanceExperiments.listPerformanceExperiments(agency.id) },
      { sourceId: draft.id, sourceVersion: complete.version, sourceRevision: complete.revision, clientId: undefined },
    ), true);
    const dialog = readFileSync("src/app/portal/agency/performance/_ExperimentsPanel.tsx", "utf8");
    assert.match(dialog, /value\.trim\(\)\.slice\(0, maxLength\)\.trim\(\)/, "form strings must trim after the cap");
  });
});
