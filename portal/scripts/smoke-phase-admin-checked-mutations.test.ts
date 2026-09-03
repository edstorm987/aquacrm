// Agency Phase Admin (/portal/agency/phases) — checked mutation contract, the
// separate Phase Admin portion of issue #47. Not the Fulfilment module's phase
// UI, which has its own suite (smoke-fulfillment-checked-mutations).
//
// Three layers:
//   1. receipt validators bound to the submitted phase id (and, for preview,
//      to a safe relative demo-client redirect);
//   2. the checked boundary: rejected fetch, unreadable body, malformed JSON,
//      400/409/500/503, false-success 200, incomplete 200 and wrong-phase 200
//      never reach a success continuation, for all four operations;
//   3. the real routes on the memory backend: authoritative receipts, typed
//      refusals with authored messages, and a generic 500 that leaks nothing.
// Plus source pins that hold the mounted components to the contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

import { CheckedMutationError, checkedJsonMutation } from "../src/lib/client/checkedMutation";
import {
  isPhaseAdminPhase,
  isPhaseCreateReceipt,
  isPhaseDeleteReceipt,
  isPhasePreviewReceipt,
  isPhaseUpdateReceipt,
  isSafePhasePreviewRedirect,
  type ExpectedPhaseCreate,
  type ExpectedPhaseUpdate,
  type PhaseAdminPhase,
} from "../src/lib/client/phaseAdminMutationPayloads";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "phase-admin-checked-mutation-test-secret";
process.env.NODE_ENV = "test";
// The preview route hangs off the dev-mode switch (file/memory backend only).
process.env.PORTAL_DEV_MODE = "true";

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

const PHASE_ID = "phase_agency_one_custom";

function phase(overrides: Partial<PhaseAdminPhase> = {}): PhaseAdminPhase {
  return {
    id: PHASE_ID,
    agencyId: "agency_one",
    stage: "discovery",
    label: "Kick-off",
    description: "First call",
    order: 100,
    pluginPreset: [],
    checklist: [],
    isDefault: false,
    customCss: "",
    customJs: "",
    welcomeHeading: "",
    welcomeBody: "",
    isPublicPreset: false,
    ...overrides,
  };
}

const createExpected: ExpectedPhaseCreate = { name: "Kick-off", description: "First call", ordering: 100, customCss: "", customJs: "" };
const updateExpected: ExpectedPhaseUpdate = { ...createExpected, phaseId: PHASE_ID, welcomeHeading: "", welcomeBody: "", isPublicPreset: false };
const REDIRECT = `/portal/clients/luv-and-ker-demo?previewPhase=${encodeURIComponent(PHASE_ID)}`;

function jsonResponse(body: unknown, status = 200): typeof fetch {
  return async () => new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Phase Admin receipt validators bind to the submitted phase", () => {
  it("accepts a complete phase and refuses incomplete or malformed ones", () => {
    assert.equal(isPhaseAdminPhase(phase()), true);
    assert.equal(isPhaseAdminPhase(phase({ id: "" })), false);
    assert.equal(isPhaseAdminPhase(phase({ order: Number.NaN })), false);
    assert.equal(isPhaseAdminPhase({ ...phase(), pluginPreset: "none" }), false);
    assert.equal(isPhaseAdminPhase({ ...phase(), isPublicPreset: "yes" }), false);
    assert.equal(isPhaseAdminPhase(null), false);
  });

  it("create receipts must be a saved phase carrying the submitted values", () => {
    assert.equal(isPhaseCreateReceipt({ ok: true, phase: phase() }, createExpected), true);
    assert.equal(isPhaseCreateReceipt({ ok: true, phase: phase({ description: undefined }) }, { ...createExpected, description: "" }), true, "absent optional text equals an empty submission");
    assert.equal(isPhaseCreateReceipt({ ok: true, phase: phase({ order: 40 }) }, { ...createExpected, ordering: 0 }), true, "a zero ordering lets the server derive the order");
    assert.equal(isPhaseCreateReceipt({ ok: true, phase: phase({ label: "Different" }) }, createExpected), false);
    assert.equal(isPhaseCreateReceipt({ ok: true, phase: phase({ order: 90 }) }, createExpected), false);
    assert.equal(isPhaseCreateReceipt({ ok: true, phase: phase({ customJs: "alert(1)" }) }, createExpected), false);
    assert.equal(isPhaseCreateReceipt({ ok: true, phase: phase({ isDefault: true }) }, createExpected), false);
    assert.equal(isPhaseCreateReceipt({ ok: true }, createExpected), false);
    assert.equal(isPhaseCreateReceipt({ ok: false, phase: phase() }, createExpected), false);
  });

  it("update receipts must name the edited phase and carry every submitted field", () => {
    assert.equal(isPhaseUpdateReceipt({ ok: true, phase: phase() }, updateExpected), true);
    assert.equal(isPhaseUpdateReceipt({ ok: true, phase: phase({ id: "phase_other" }) }, updateExpected), false, "wrong phase");
    assert.equal(isPhaseUpdateReceipt({ ok: true, phase: phase({ welcomeHeading: "Hello" }) }, updateExpected), false);
    assert.equal(isPhaseUpdateReceipt({ ok: true, phase: phase({ isPublicPreset: true }) }, updateExpected), false);
    assert.equal(isPhaseUpdateReceipt({ ok: true, phase: phase({ isPublicPreset: undefined }) }, updateExpected), true, "an absent flag reads as off");
    assert.equal(isPhaseUpdateReceipt({ ok: true, phase: phase({ order: 101 }) }, updateExpected), false);
  });

  it("delete receipts must name the deleted phase", () => {
    assert.equal(isPhaseDeleteReceipt({ ok: true, phaseId: PHASE_ID }, PHASE_ID), true);
    assert.equal(isPhaseDeleteReceipt({ ok: true, phaseId: "phase_other" }, PHASE_ID), false);
    assert.equal(isPhaseDeleteReceipt({ ok: true }, PHASE_ID), false);
    assert.equal(isPhaseDeleteReceipt({ ok: false, phaseId: PHASE_ID }, PHASE_ID), false);
    assert.equal(isPhaseDeleteReceipt({ ok: true, phaseId: PHASE_ID }, ""), false);
  });

  it("preview receipts must name the phase and carry a safe relative demo-client redirect", () => {
    assert.equal(isPhasePreviewReceipt({ ok: true, phaseId: PHASE_ID, redirect: REDIRECT }, PHASE_ID), true);
    assert.equal(isPhasePreviewReceipt({ ok: true, phaseId: "phase_other", redirect: REDIRECT }, PHASE_ID), false, "wrong phase");
    assert.equal(isPhasePreviewReceipt({ ok: true, phaseId: PHASE_ID }, PHASE_ID), false, "incomplete");
    assert.equal(isPhasePreviewReceipt({ ok: true, phaseId: PHASE_ID, redirect: "/portal" }, PHASE_ID), false, "not a demo-client path");
    for (const unsafe of [
      `https://evil.example/portal/clients/luv-and-ker-demo?previewPhase=${PHASE_ID}`,
      `//evil.example/portal/clients/luv-and-ker-demo?previewPhase=${PHASE_ID}`,
      `/\\evil.example/portal/clients/demo?previewPhase=${PHASE_ID}`,
      `/portal/clients/luv-and-ker-demo?previewPhase=phase_other`,
      `/portal/clients/luv-and-ker-demo`,
      `/portal/clients/../agency?previewPhase=${PHASE_ID}`,
      `/portal/clients/demo%0d%0aSet-Cookie:x?previewPhase=${PHASE_ID}`.replace("%0d%0a", "\r\n"),
      `javascript:alert(1)`,
      "",
    ]) {
      assert.equal(isSafePhasePreviewRedirect(unsafe, PHASE_ID), false, `must refuse ${JSON.stringify(unsafe)}`);
    }
    assert.equal(isSafePhasePreviewRedirect(`/portal/clients/luv-and-ker-demo/overview?previewPhase=${PHASE_ID}&tab=files`, PHASE_ID), true);
  });
});

describe("the checked boundary never continues for any of the four operations", () => {
  const operations = [
    { name: "create", validate: (value: unknown) => isPhaseCreateReceipt(value, createExpected), success: { ok: true, phase: phase() }, wrong: { ok: true, phase: phase({ label: "Other" }) } },
    { name: "update", validate: (value: unknown) => isPhaseUpdateReceipt(value, updateExpected), success: { ok: true, phase: phase() }, wrong: { ok: true, phase: phase({ id: "phase_other" }) } },
    { name: "delete", validate: (value: unknown) => isPhaseDeleteReceipt(value, PHASE_ID), success: { ok: true, phaseId: PHASE_ID }, wrong: { ok: true, phaseId: "phase_other" } },
    { name: "preview", validate: (value: unknown) => isPhasePreviewReceipt(value, PHASE_ID), success: { ok: true, phaseId: PHASE_ID, redirect: REDIRECT }, wrong: { ok: true, phaseId: "phase_other", redirect: REDIRECT } },
  ] as const;

  const unreadable = () => {
    const response = new Response("ignored", { status: 200, headers: { "content-type": "application/json" } });
    response.text = async () => { throw new Error("private stream detail"); };
    return response;
  };

  for (const operation of operations) {
    it(`${operation.name}: every refusal class rejects and a valid receipt continues`, async () => {
      const cases: Array<{ label: string; fetcher: typeof fetch; kind: CheckedMutationError["kind"]; status?: number; leak?: string }> = [
        { label: "rejected fetch", fetcher: async () => { throw new TypeError("offline private detail"); }, kind: "transport", leak: "private" },
        { label: "unreadable body", fetcher: async () => unreadable(), kind: "response", leak: "private" },
        { label: "malformed JSON", fetcher: jsonResponse("<html>gateway</html>"), kind: "response" },
        { label: "400", fetcher: jsonResponse({ ok: false, error: "A phase name is required." }, 400), kind: "http", status: 400 },
        { label: "409", fetcher: jsonResponse({ ok: false, error: "default_phase_protected: a default phase cannot be deleted." }, 409), kind: "http", status: 409 },
        { label: "500", fetcher: jsonResponse({ ok: false, error: "private database detail" }, 500), kind: "http", status: 500, leak: "private" },
        { label: "503", fetcher: jsonResponse({ error: "private provider detail" }, 503), kind: "http", status: 503, leak: "private" },
        { label: "false-success 200", fetcher: jsonResponse({ ok: false, error: "Refused after the fact." }), kind: "domain" },
        { label: "incomplete 200", fetcher: jsonResponse({ ok: true }), kind: "domain" },
        { label: "wrong-phase 200", fetcher: jsonResponse(operation.wrong), kind: "domain" },
      ];
      for (const item of cases) {
        let continued = false;
        await assert.rejects(
          checkedJsonMutation("/phase-admin", { method: "POST" }, { fallback: "It could not be done.", fetcher: item.fetcher, validate: operation.validate })
            .then(() => { continued = true; }),
          (error: unknown) => {
            assert.ok(error instanceof CheckedMutationError, `${operation.name} ${item.label}: not a CheckedMutationError`);
            assert.equal(error.kind, item.kind, `${operation.name} ${item.label}: kind`);
            if (item.status !== undefined) assert.equal(error.status, item.status);
            if (item.leak) assert.doesNotMatch(error.message, new RegExp(item.leak), `${operation.name} ${item.label}: leaked detail`);
            return true;
          },
        );
        assert.equal(continued, false, `${operation.name} ${item.label}: success continuation ran`);
      }
      const receipt = await checkedJsonMutation("/phase-admin", { method: "POST" }, { fallback: "It could not be done.", fetcher: jsonResponse(operation.success), validate: operation.validate });
      assert.deepEqual(receipt, operation.success);
    });
  }
});

describe("mounted Phase Admin components hold the contract", () => {
  const files = {
    actions: readFileSync("src/app/portal/agency/phases/_PhaseCardActions.tsx", "utf8"),
    add: readFileSync("src/app/portal/agency/phases/_AddCustomPhaseForm.tsx", "utf8"),
    editor: readFileSync("src/app/portal/agency/phases/[phaseId]/_PhaseEditorForm.tsx", "utf8"),
  };

  it("uses the shared checked contract with try/catch/finally and inline alerts, never raw fetch or window alerts", () => {
    // Each card action is pinned on its own slice, so one compliant component
    // cannot vouch for the other.
    const previewSlice = files.actions.slice(files.actions.indexOf("export function PreviewAsClientButton"), files.actions.indexOf("export function DeletePhaseButton"));
    const deleteSlice = files.actions.slice(files.actions.indexOf("export function DeletePhaseButton"));
    for (const [name, source] of Object.entries({ ...files, preview: previewSlice, delete: deleteSlice })) {
      assert.match(source, /checkedJsonMutation</, `${name}: checked mutation`);
      assert.match(source, /mutationErrorMessage\(/, `${name}: safe message`);
      assert.doesNotMatch(source, /\bfetch\s*\(/, `${name}: no raw fetch`);
      assert.doesNotMatch(source, /\balert\s*\(/, `${name}: no window alert`);
      assert.doesNotMatch(source, /res\.json\(\)/, `${name}: no unchecked body parsing`);
      assert.match(source, /try \{[\s\S]+?\} catch \(cause\) \{[\s\S]+?\} finally \{[\s\S]+?setBusy\(false\);/, `${name}: try/catch/finally settles busy`);
      assert.match(source, /role="alert"/, `${name}: accessible inline error`);
      assert.match(source, /inFlight\.current/, `${name}: single-flight guard`);
      // Busy must ENGAGE, not merely settle: the state is raised before the
      // request and drives both the disabled attribute and aria-busy.
      assert.match(source, /inFlight\.current = true;\s*setBusy\(true\);[\s\S]{0,120}?try \{/, `${name}: busy engages before the request`);
      assert.match(source, /disabled=\{busy\}/, `${name}: the control is disabled while busy`);
      assert.match(source, /aria-busy=\{busy \|\| undefined\}/, `${name}: aria-busy follows the busy state`);
    }
  });

  it("only a validated receipt reloads, navigates or shows Saved", () => {
    const { actions, add, editor } = files;
    const before = (source: string, first: string, second: string, why: string) => {
      const a = source.indexOf(first);
      const b = source.indexOf(second);
      assert.ok(a >= 0, `${why}: missing ${first}`);
      assert.ok(b >= 0, `${why}: missing ${second}`);
      assert.ok(a < b, why);
    };
    const preview = actions.slice(actions.indexOf("export function PreviewAsClientButton"), actions.indexOf("export function DeletePhaseButton"));
    const remove = actions.slice(actions.indexOf("export function DeletePhaseButton"));
    before(preview, "await checkedJsonMutation<PhasePreviewReceipt>", "window.location.assign(receipt.redirect)", "preview navigates only after the checked receipt");
    assert.match(preview, /navigating = true;\s*window\.location\.assign\(receipt\.redirect\);/, "preview marks the navigation before it starts");
    assert.match(preview, /finally \{\s*if \(!navigating\) \{\s*inFlight\.current = false;\s*setBusy\(false\);/, "preview stays busy through a validated navigation and settles on any refusal");
    assert.match(preview, /validate: value => isPhasePreviewReceipt\(value, phaseId\)/);
    assert.doesNotMatch(preview, /location\.href|\?\? "\/portal"/, "preview must not fall back to a default destination");
    before(remove, "await checkedJsonMutation<PhaseDeleteReceipt>", "window.location.reload()", "delete reloads only after the checked receipt");
    assert.match(remove, /finally \{\s*if \(!reloading\) \{\s*inFlight\.current = false;\s*setBusy\(false\);/, "delete stays busy through a validated reload and settles on any refusal");
    assert.match(remove, /validate: value => isPhaseDeleteReceipt\(value, phaseId\)/);
    assert.equal((remove.match(/window\.location\.reload\(\)/g) ?? []).length, 1);
    before(remove, "window.location.reload()", "} catch (cause) {", "a refused delete never reloads");
    before(add, "await checkedJsonMutation<PhaseUpsertReceipt>", "window.location.reload()", "create reloads only after the checked receipt");
    assert.equal((add.match(/window\.location/g) ?? []).length, 1, "create touches window.location exactly once");
    before(add, "window.location.reload()", "} catch (cause) {", "a refused create never reloads");
    assert.match(add, /finally \{\s*if \(!reloading\) \{\s*inFlight\.current = false;\s*setBusy\(false\);/, "create stays busy through a validated reload and settles on any refusal");
    assert.match(add, /validate: value => isPhaseCreateReceipt\(value, expected\)/);
    assert.doesNotMatch(add, /\.reset\(\)/, "a refused create keeps the typed values");
    before(editor, "await checkedJsonMutation<PhaseUpsertReceipt>", "setSaved(true)", "Saved only after the checked receipt");
    assert.match(editor, /finally \{\s*inFlight\.current = false;\s*setBusy\(false\);/, "the editor always settles");
    assert.doesNotMatch(editor, /window\.location|router\.(push|replace|refresh)/, "the editor never reloads or navigates after a save");
    assert.equal((editor.match(/setSaved\(true\)/g) ?? []).length, 1, "Saved is shown from exactly one place");
    assert.match(editor, /validate: value => isPhaseUpdateReceipt\(value, expected\)/);
    before(editor, "setSaved(true)", "} catch (cause) {", "a refused edit never shows Saved");
    assert.match(editor, /setSaved\(false\);[\s\S]{0,200}?try \{/, "a new attempt clears the previous Saved");
    assert.match(editor, /phaseId,\s*name: String\(fd\.get\("name"\)/, "the edit binds the receipt to the page's phase id");
  });
});

describe("Phase Admin routes answer authoritative receipts and classified refusals", () => {
  async function world() {
    const [storage, tenants, users, auth, phases, upsert, del, preview, nextServer, errors] = await Promise.all([
      import("../src/server/storage"),
      import("../src/server/tenants"),
      import("../src/server/users"),
      import("../src/lib/server/auth/auth"),
      import("../src/server/phases"),
      import("../src/app/api/portal/phases/upsert/route"),
      import("../src/app/api/portal/phases/delete/route"),
      import("../src/app/api/auth/preview-as-client-at-phase/route"),
      import("next/server"),
      import("../src/lib/server/phases/phaseMutationErrors"),
    ]);
    await storage.reset();
    const agency = tenants.createAgency({ name: "Phase admin" });
    const other = tenants.createAgency({ name: "Other agency" });
    const owner = users.createUser({ agencyId: agency.id, email: `owner-${agency.id}@phases.test`, name: "Owner", password: "test-password", role: "agency-owner" });
    const staff = users.createUser({ agencyId: agency.id, email: `staff-${agency.id}@phases.test`, name: "Staff", password: "test-password", role: "agency-staff" });
    const cookieFor = (user: typeof owner) => `${auth.SESSION_COOKIE_NAME}=${auth.issueSession({
      userId: user.id, email: user.email, role: user.role, agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id, sessionRev: user.sessionRev ?? 0,
    })}`;
    await storage.flushPendingWrites();
    const request = (url: string, body: unknown, cookie: string | null = cookieFor(owner)) => new nextServer.NextRequest(url, {
      method: "POST",
      headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    return { storage, phases, upsert, del, preview, errors, agency, other, owner, staff, cookieFor, request };
  }

  const refusal = async (response: Response, status: number, error: string | RegExp) => {
    assert.equal(response.status, status, `expected ${status}, got ${response.status}: ${await response.clone().text()}`);
    const body = await response.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    if (typeof error === "string") assert.equal(body.error, error); else assert.match(body.error, error);
  };

  it("upsert creates and edits with authoritative receipts and refuses malformed, foreign and unauthorised requests", async () => {
    const w = await world();
    const url = "http://localhost/api/portal/phases/upsert";
    const created = await w.upsert.POST(w.request(url, createExpected));
    assert.equal(created.status, 200);
    const createdBody = await created.json();
    assert.equal(isPhaseCreateReceipt(createdBody, createExpected), true, JSON.stringify(createdBody));
    const id = createdBody.phase.id as string;
    assert.equal(createdBody.phase.agencyId, w.agency.id);

    const edit: ExpectedPhaseUpdate = { ...updateExpected, phaseId: id, name: "Kick-off call", description: "Updated", ordering: 120, customCss: "body{}", welcomeHeading: "Hi [name]", isPublicPreset: true };
    const edited = await w.upsert.POST(w.request(url, edit));
    assert.equal(edited.status, 200);
    const editedBody = await edited.json();
    assert.equal(isPhaseUpdateReceipt(editedBody, edit), true, JSON.stringify(editedBody));
    assert.equal(w.phases.getPhase(id)?.label, "Kick-off call");

    await refusal(await w.upsert.POST(w.request(url, "not json")), 400, "The request body must be valid JSON.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, name: "   " })), 400, "A phase name is required.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, ordering: "high" })), 400, "Ordering must be a number.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, customJs: 7 })), 400, "customJs must be text.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, stage: 4 })), 400, "Choose a valid stage.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, isPublicPreset: "yes" })), 400, "Public preset must be on or off.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, phaseId: 12 })), 400, "Choose a valid phase.");
    // Over-length input is refused, never silently truncated into a receipt that
    // no longer matches the submission (which would fail validation and let a
    // retry duplicate the phase).
    const countBefore = w.phases.listPhasesForAgency(w.agency.id).length;
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, name: "n".repeat(161) })), 400, "A phase name must be 160 characters or fewer.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, description: "d".repeat(4_001) })), 400, "Description must be 4,000 characters or fewer.");
    await refusal(await w.upsert.POST(w.request(url, { ...createExpected, welcomeHeading: "h".repeat(401) })), 400, "Welcome heading must be 400 characters or fewer.");
    assert.equal(w.phases.listPhasesForAgency(w.agency.id).length, countBefore, "a refused over-length create writes nothing");
    const longName = "x".repeat(160);
    const maxed = await (await w.upsert.POST(w.request(url, { ...createExpected, name: longName }))).json();
    assert.equal(isPhaseCreateReceipt(maxed, { ...createExpected, name: longName }), true, "the exact cap is accepted unchanged");
    await refusal(await w.upsert.POST(w.request(url, { ...edit, phaseId: "phase_missing" })), 404, "That phase no longer exists in this agency.");
    const foreign = w.phases.upsertPhase({ id: "phase_foreign", agencyId: w.other.id, stage: "discovery", label: "Foreign", order: 1, pluginPreset: [], checklist: [] });
    await refusal(await w.upsert.POST(w.request(url, { ...edit, phaseId: foreign.id })), 404, "That phase no longer exists in this agency.");
    assert.equal(w.phases.getPhase(foreign.id)?.label, "Foreign", "a foreign phase is never written");
    await refusal(await w.upsert.POST(w.request(url, createExpected, null)), 401, "unauthorized");
    await refusal(await w.upsert.POST(w.request(url, createExpected, w.cookieFor(w.staff))), 403, "forbidden");
  });

  it("delete answers the deleted phase id and refuses defaults, unknown, foreign and malformed requests", async () => {
    const w = await world();
    const url = "http://localhost/api/portal/phases/delete";
    const custom = await (await w.upsert.POST(w.request("http://localhost/api/portal/phases/upsert", createExpected))).json();
    const id = custom.phase.id as string;
    const seeded = w.phases.upsertPhase({ id: "phase_seeded", agencyId: w.agency.id, stage: "aqua-epic-intro", label: "Epic intro", order: 1, pluginPreset: [], checklist: [] });
    const flagged = w.phases.upsertPhase({ id: "phase_flagged", agencyId: w.agency.id, stage: "discovery", label: "Flagged", order: 2, pluginPreset: [], checklist: [], isDefault: true });
    await refusal(await w.del.POST(w.request(url, "not json")), 400, "The request body must be valid JSON.");
    await refusal(await w.del.POST(w.request(url, { phaseId: " " })), 400, "Choose a phase to delete.");
    await refusal(await w.del.POST(w.request(url, { phaseId: "phase_missing" })), 404, "That phase no longer exists in this agency.");
    await refusal(await w.del.POST(w.request(url, { phaseId: seeded.id })), 409, /^default_phase_protected/);
    await refusal(await w.del.POST(w.request(url, { phaseId: flagged.id })), 409, /^default_phase_protected/);
    const foreign = w.phases.upsertPhase({ id: "phase_foreign_delete", agencyId: w.other.id, stage: "discovery", label: "Foreign", order: 1, pluginPreset: [], checklist: [] });
    await refusal(await w.del.POST(w.request(url, { phaseId: foreign.id })), 404, "That phase no longer exists in this agency.");
    assert.ok(w.phases.getPhase(foreign.id), "a foreign phase is never deleted");
    await refusal(await w.del.POST(w.request(url, { phaseId: id }, w.cookieFor(w.staff))), 403, "forbidden");
    assert.ok(w.phases.getPhase(id), "a refused delete keeps the phase");
    const removed = await w.del.POST(w.request(url, { phaseId: id }));
    assert.equal(removed.status, 200);
    const removedBody = await removed.json();
    assert.deepEqual(removedBody, { ok: true, phaseId: id });
    assert.equal(isPhaseDeleteReceipt(removedBody, id), true);
    assert.equal(w.phases.getPhase(id), null);
    await refusal(await w.del.POST(w.request(url, { phaseId: id })), 404, "That phase no longer exists in this agency.");
  });

  it("preview answers the phase id and a safe redirect with the demo cookies, and refuses when dev mode is off", async () => {
    const w = await world();
    const url = "http://localhost/api/auth/preview-as-client-at-phase";
    const custom = await (await w.upsert.POST(w.request("http://localhost/api/portal/phases/upsert", createExpected))).json();
    const id = custom.phase.id as string;
    await refusal(await w.preview.POST(w.request(url, "not json")), 400, "The request body must be valid JSON.");
    await refusal(await w.preview.POST(w.request(url, { phaseId: "" })), 400, "Choose a phase to preview.");
    await refusal(await w.preview.POST(w.request(url, { phaseId: "phase_missing" })), 404, "That phase no longer exists in this agency.");
    const foreign = w.phases.upsertPhase({ id: "phase_foreign_preview", agencyId: w.other.id, stage: "discovery", label: "Foreign", order: 1, pluginPreset: [], checklist: [] });
    await refusal(await w.preview.POST(w.request(url, { phaseId: foreign.id })), 404, "That phase no longer exists in this agency.");
    await refusal(await w.preview.POST(w.request(url, { phaseId: id }, null)), 401, "unauthorized");
    await refusal(await w.preview.POST(w.request(url, { phaseId: id }, w.cookieFor(w.staff))), 403, "forbidden");

    const started = await w.preview.POST(w.request(url, { phaseId: id }));
    assert.equal(started.status, 200, await started.clone().text());
    const startedBody = await started.json();
    assert.equal(isPhasePreviewReceipt(startedBody, id), true, JSON.stringify(startedBody));
    assert.equal(startedBody.redirect, `/portal/clients/luv-and-ker-demo?previewPhase=${encodeURIComponent(id)}`);
    const cookies = started.headers.getSetCookie?.() ?? [started.headers.get("set-cookie") ?? ""];
    assert.ok(cookies.some(cookie => cookie.startsWith("lk_session_v1=")), "the demo session cookie is issued");
    assert.ok(cookies.some(cookie => cookie.startsWith("lk_preview_phase=")), "the preview-phase cookie is issued");

    const previous = process.env.PORTAL_DEV_MODE;
    process.env.PORTAL_DEV_MODE = "false";
    try {
      await refusal(await w.preview.POST(w.request(url, { phaseId: id })), 404, "Not available.");
    } finally {
      process.env.PORTAL_DEV_MODE = previous;
    }
  });

  it("classifies unexpected failures as a generic captured 500 with no exception text", async () => {
    const w = await world();
    // captureError writes the trace to console.error outside NODE_ENV=test;
    // spy on it so "captured" is proven rather than assumed.
    const env = process.env as Record<string, string | undefined>;
    const originalError = console.error;
    const originalEnv = env.NODE_ENV;
    const captured: unknown[][] = [];
    console.error = (...args: unknown[]) => { captured.push(args); };
    env.NODE_ENV = "development";
    const leaked = (() => {
      try {
        return w.errors.phaseMutationErrorResponse(new Error("ENOSPC: no space left on device, write '/private/state.json'"), { fallback: "The phase could not be saved." });
      } finally {
        console.error = originalError;
        env.NODE_ENV = originalEnv;
      }
    })();
    assert.equal(leaked.status, 500);
    assert.deepEqual(await leaked.json(), { ok: false, error: "The phase could not be saved." });
    assert.equal(captured.length, 1, "an unexpected failure is captured exactly once");
    assert.match(String(captured[0][1]), /ENOSPC/, "the captured trace carries the real error");
    // The REAL delete route: a storage failure inside the transaction must
    // surface as the same generic captured 500, with no exception text.
    const created = w.phases.upsertPhase({ id: `phase_${w.agency.id}_boom`, agencyId: w.agency.id, stage: "discovery", label: "Boom", description: "", order: 5, pluginPreset: [], checklist: [], isDefault: false });
    const state = w.storage.getState() as unknown as Record<string, unknown>;
    const livePhases = state.phases;
    const routeCaptured: unknown[][] = [];
    console.error = (...args: unknown[]) => { routeCaptured.push(args); };
    env.NODE_ENV = "development";
    Object.defineProperty(state, "phases", { configurable: true, enumerable: true, get() { throw new Error("ENOSPC: no space left on device, write '/private/state.json'"); } });
    let fromRoute: Response;
    try {
      fromRoute = await w.del.POST(w.request("http://localhost/api/portal/phases/delete", { phaseId: created.id }));
    } finally {
      Object.defineProperty(state, "phases", { configurable: true, enumerable: true, writable: true, value: livePhases });
      console.error = originalError;
      env.NODE_ENV = originalEnv;
    }
    assert.equal(fromRoute.status, 500);
    const routeBody = await fromRoute.text();
    assert.deepEqual(JSON.parse(routeBody), { ok: false, error: "The phase could not be deleted." });
    assert.doesNotMatch(routeBody, /ENOSPC|state\.json/, "the route leaks no exception text");
    assert.equal(routeCaptured.length, 1, "the route captures the failure exactly once");
    assert.ok(w.phases.getPhase(created.id), "the failed delete removed nothing");
    // Contention is an expected outcome of the transaction, answered as an
    // authored 409 and never pushed into the error sink.
    const coordinator = await import("../src/server/productWorkspaceCoordinator");
    const devFile = await import("../src/lib/server/dev/devFileTransaction");
    const contentionCaptured: unknown[][] = [];
    console.error = (...args: unknown[]) => { contentionCaptured.push(args); };
    env.NODE_ENV = "development";
    try {
      for (const contention of [new coordinator.ProductWorkspaceBusyError(), new coordinator.ProductWorkspaceLeaseLostError("lease lost: internal lease id 42"), new devFile.DevFileConflictError("Another process is still writing this file. Try again in a moment.")]) {
        const busy = w.errors.phaseMutationErrorResponse(contention, { fallback: "The phase could not be saved." });
        assert.equal(busy.status, 409, contention.name);
        assert.deepEqual(await busy.json(), { ok: false, error: w.errors.CONTENTION_MESSAGE }, contention.name);
      }
    } finally {
      console.error = originalError;
      env.NODE_ENV = originalEnv;
    }
    assert.equal(contentionCaptured.length, 0, "contention is not an unexpected failure");
    assert.doesNotMatch(w.errors.CONTENTION_MESSAGE, /lease id|internal/);
    const notFound = w.errors.phaseMutationErrorResponse(new w.errors.PhaseMutationNotFoundError("That phase no longer exists in this agency."), { fallback: "x" });
    assert.equal(notFound.status, 404);
    const conflict = w.errors.phaseMutationErrorResponse(new w.errors.PhaseMutationConflictError("default_phase_protected: a default phase cannot be deleted."), { fallback: "x" });
    assert.equal(conflict.status, 409);
    const routes = [
      "src/app/api/portal/phases/upsert/route.ts",
      "src/app/api/portal/phases/delete/route.ts",
      "src/app/api/auth/preview-as-client-at-phase/route.ts",
    ].map(path => readFileSync(path, "utf8"));
    for (const source of routes) {
      // The catch does nothing but hand the error to the classifier.
      assert.match(source, /\} catch \(error\) \{\s*return phaseMutationErrorResponse\(error, \{/, "the catch delegates to the classifier only");
      assert.equal((source.match(/catch \(/g) ?? []).length, 1, "one catch per route");
      assert.doesNotMatch(source, /error instanceof Error \? error\.message|as Error\)\.message|error\.message|String\(err/, "no exception text reaches a response");
    }
    assert.match(routes[1], /NextResponse\.json\(\{ ok: true, phaseId \}\)/, "delete answers the phase id");
    assert.match(routes[0], /await withPortalStateTransaction\(`phases:\$\{agencyId\}`/, "upsert persists under the state transaction before answering");
    assert.match(routes[1], /await withPortalStateTransaction\(`phases:\$\{agencyId\}`/, "delete persists under the state transaction before answering");
    assert.match(routes[2], /NextResponse\.json\(\{ ok: true, phaseId, redirect \}\)/, "preview answers the phase id and redirect");
    assert.match(routes[0], /NextResponse\.json\(\{ ok: true, phase: saved \}\)/, "upsert answers the saved phase");
  });
});
