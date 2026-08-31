// What still cites a filed legal document, before anyone deletes it.
//
// The failure this guards is silent in both directions. Permanent deletion
// removed only the register row:
//
//   • a finance obligation kept its `linkedLegalDocumentId`, and the obligation
//     card derives its "Open document" link with a `find()`. A purged document
//     therefore raises nothing — the link is simply not rendered, and an
//     insurance renewal whose policy evidence was destroyed looks exactly like
//     one that never had any.
//   • a governance decision kept its `documentId`, and the capital register
//     went on printing "document legal-minute-2" as though the minute
//     authorising a share issue were still openable.
//
// Compliance evidence that vanishes without a trace is worse than evidence
// never filed, because the surrounding record still claims it exists. So this
// file proves three things:
//
//   1. the inventory finds BOTH reference sites, neither of which is a plain
//      column — obligations live in plugin data under every enabled
//      agency-finance install, decisions are nested inside a company profile's
//      capital plan — and counts nothing that is not really a citation;
//   2. a permanent delete with dependants is REFUSED, with the dependants
//      named, and the register row and its citations all survive the refusal;
//   3. an explicit detach clears every citation and the row in ONE transaction,
//      and archiving — the default answer — keeps everything resolvable.
//
// The fixtures write through the REAL plugin storage adapter and the REAL
// company-profile writer, so the test cannot pass by agreeing with itself
// about a key format the runtime does not use.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";

// First, and statically — see the note in dev-console-request-scope.ts. The
// route under test authenticates with the REAL `requireRole` → `cookies()`, so
// it is driven inside Next's own request scope rather than behind a module
// stub that would answer the cookie question and silently fail the rest.
import { withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

let sessionCookie = "";

import { ensureHydrated, getState } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { issueSession } from "../src/lib/server/auth/auth";
import { upsertInstall } from "../src/server/pluginInstalls";
import { makePluginStorage } from "../src/lib/server/pluginStorage";
import { getCompanyProfile, updateCompanyProfile } from "../src/server/company";
import { LegalDocumentInUseError, createLegalDocument, getLegalDocument, updateLegalDocument } from "../src/server/legalDocuments";
import {
  collectLegalDocumentDependants,
  legalDocumentDependencyInventory,
  legalDocumentHasDependants,
} from "../src/server/legalDocumentDependencies";
import { BudgetService } from "../src/built-ins/modules/agency-finance/src/server/budgets";
import { FinanceOperationsService } from "../src/built-ins/modules/agency-finance/src/server/operations";
import type { ActivityLogPort, EventBusPort, StoragePort } from "../src/built-ins/modules/agency-finance/src/server/ports";
import type { AgencyId, UserId } from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import type { LegalDocument } from "../src/server/types";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

let agencyId = "";
let actorId = "";
let installId = "";
let cited: LegalDocument;
let unreferenced: LegalDocument;
let obligationId = "";
let decisionId = "";
let operations: FinanceOperationsService;

function makeDocument(agency: string, id: string, title: string): LegalDocument {
  return createLegalDocument({
    id,
    agencyId: agency,
    companyIds: [],
    title,
    category: "insurance",
    status: "active",
    // No stored binary, so `deletePrivateUpload` reports "skipped" and the
    // provider half of the delete path is not what this file is testing.
    fileName: "policy.pdf",
    contentType: "application/pdf",
    size: 2_048,
    storageProvider: "local",
    storageKey: "",
    createdBy: actorId || "seed",
  });
}

before(async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "Legal deps", slug: `legal-deps-${Date.now()}` });
  agencyId = agency.id;
  const email = `owner-${Date.now()}@example.com`;
  const owner = createUser({ agencyId, email, name: "Ed", role: "agency-owner", password: "correct horse battery staple" });
  actorId = owner.id;
  sessionCookie = issueSession({ userId: owner.id, email, role: "agency-owner", agencyId });

  cited = makeDocument(agencyId, `legal_cited_${Date.now()}`, "Professional indemnity policy");
  unreferenced = makeDocument(agencyId, `legal_free_${Date.now()}`, "Old office lease");

  // ── A finance obligation, through the real plugin storage adapter ────────
  const install = upsertInstall({ pluginId: "agency-finance", scope: { agencyId }, enabled: true, config: {}, features: {} });
  installId = install.id;
  const pluginStorage = makePluginStorage(installId);
  const storage: StoragePort = {
    async get<T>(key: string) { return await pluginStorage.get<T>(key); },
    async set<T>(key: string, value: T) { await pluginStorage.set(key, value); },
    async del(key: string) { await pluginStorage.del(key); },
    async list(prefix = "") { return await pluginStorage.list(prefix); },
  };
  const activity = { logActivity: () => ({}) as never, listActivity: () => [] } satisfies ActivityLogPort;
  const events = { emit: () => undefined } satisfies EventBusPort;
  const budgets = new BudgetService(agencyId as AgencyId, storage, activity, events);
  operations = new FinanceOperationsService(agencyId as AgencyId, storage, activity, events, budgets);
  const obligation = await operations.createObligation(actorId as UserId, {
    name: "Professional indemnity renewal",
    type: "insurance",
    currency: "gbp",
    expectedCostCents: 48_000,
    linkedLegalDocumentId: cited.id,
  });
  obligationId = obligation.id;

  // ── A governance decision, through the real company-profile writer ───────
  const profile = getCompanyProfile(agencyId, null);
  const saved = updateCompanyProfile(agencyId, {
    ...profile,
    capital: {
      ...profile.capital,
      decisions: [{
        id: "decision-cover", title: "Approve indemnity cover", kind: "board", status: "approved",
        summary: "Board approved the indemnity renewal.", documentId: cited.id, relatedRecordIds: [],
      }],
    },
  }, actorId, null, { expectedRevision: profile.revision });
  decisionId = saved.capital.decisions[0]!.id;
});

describe("the inventory finds every place a document id can hide", () => {
  it("finds the obligation in plugin data AND the decision nested in the capital plan", () => {
    const inventory = legalDocumentDependencyInventory(agencyId, cited.id);
    assert.equal(inventory.total, 2, `expected two dependants, found ${inventory.total}: ${JSON.stringify(inventory.byKind)}`);
    assert.deepEqual(Object.keys(inventory.byKind).sort(), ["finance-obligation", "governance-decision"],
      "a reference site is missing — an inventory that misses one is worse than none, because it "
      + "reports 'safe to delete' and is wrong");
    assert.deepEqual(inventory.dependants.map(dependant => dependant.id).sort(), [decisionId, obligationId].sort());
  });

  it("names each dependant well enough for a person to go and fix it", () => {
    for (const dependant of collectLegalDocumentDependants(getState(), agencyId, cited.id)) {
      assert.ok(dependant.id, `${dependant.kind} has no id to navigate to`);
      assert.ok(dependant.label.trim(), `${dependant.kind} has no label`);
      assert.ok(dependant.location.trim(), `${dependant.kind} does not say where to go`);
      assert.doesNotMatch(dependant.label, /^undefined/, `${dependant.kind} label is a stringified undefined`);
    }
  });

  it("an UNCITED document comes back empty — the count means something", () => {
    assert.equal(legalDocumentDependencyInventory(agencyId, unreferenced.id).total, 0,
      "an uncited document reported dependants — the matcher is too loose");
    assert.equal(legalDocumentHasDependants(agencyId, unreferenced.id), false);
    assert.equal(legalDocumentHasDependants(agencyId, cited.id), true);
  });

  it("another agency's records are not counted", () => {
    const other = createAgency({ name: "Elsewhere", slug: `elsewhere-${Date.now()}` });
    assert.equal(legalDocumentDependencyInventory(other.id, cited.id).total, 0,
      "the inventory counted another agency's dependants");
  });

  it("switching the finance module OFF does not switch the guard off with it", async () => {
    // Disabling an install keeps its `pluginData` (only `deleteInstall` removes
    // it), so the obligation is still there and comes back the moment the
    // module is switched on again. If the inventory skipped a disabled
    // install, a toggle would be enough to make the guard answer "nothing
    // cites it", the purge would succeed, and the returning obligation would
    // hold an id that is no longer in the register with no detach recorded.
    upsertInstall({ pluginId: "agency-finance", scope: { agencyId }, enabled: false, config: {}, features: {} });
    try {
      assert.ok(getState().pluginData?.[installId], "disabling the install deleted its data — this test's premise is wrong");
      assert.equal(legalDocumentDependencyInventory(agencyId, cited.id).total, 2,
        "a disabled module's obligation stopped counting, so the register would report this document safe to delete");

      const { deleteLegalDocument } = await import("../src/server/legalDocuments");
      assert.throws(() => deleteLegalDocument(agencyId, cited.id, { actorUserId: actorId }), LegalDocumentInUseError,
        "turning the finance module off was enough to get a cited document permanently deleted");
    } finally {
      upsertInstall({ pluginId: "agency-finance", scope: { agencyId }, enabled: true, config: {}, features: {} });
    }
    // …and the obligation is right there again, still citing it.
    assert.equal((await operations.getObligation(obligationId))?.linkedLegalDocumentId, cited.id);
    assert.equal(legalDocumentDependencyInventory(agencyId, cited.id).total, 2);
  });
});

describe("a permanent delete with dependants is refused, not silently completed", () => {
  it("the store refuses, names what cites it, and leaves EVERYTHING intact", async () => {
    const { deleteLegalDocument } = await import("../src/server/legalDocuments");
    let error: LegalDocumentInUseError | null = null;
    try { deleteLegalDocument(agencyId, cited.id, { actorUserId: actorId }); } catch (thrown) { error = thrown as LegalDocumentInUseError; }
    assert.ok(error instanceof LegalDocumentInUseError, "a permanent delete with dependants was not refused");
    assert.equal(error.dependants.length, 2);
    assert.match(error.message, /Professional indemnity renewal/);
    assert.match(error.message, /Approve indemnity cover/);
    assert.match(error.message, /Archive it/, "a refusal must say how it is dealt with, not just that it failed");

    // A refusal that half-applied would be the same damage in reverse.
    assert.ok(getLegalDocument(agencyId, cited.id), "the register row was removed by a refused delete");
    const obligation = await operations.getObligation(obligationId);
    assert.equal(obligation?.linkedLegalDocumentId, cited.id, "the obligation was detached by a refused delete");
    assert.equal(getCompanyProfile(agencyId, null).capital.decisions[0]?.documentId, cited.id,
      "the decision was detached by a refused delete");
  });

  it("the DELETE route answers 409 with the inventory rather than a bare failure", async () => {
    const { DELETE } = await import("../src/app/api/portal/company/legal/route");
    const response = await withSession(sessionCookie, () =>
      DELETE(new Request(`http://localhost/api/portal/company/legal?id=${encodeURIComponent(cited.id)}`, { method: "DELETE" })));
    assert.equal(response.status, 409);
    const body = await response.json() as { ok: boolean; code?: string; error?: string; dependencies?: { total: number } };
    assert.equal(body.ok, false);
    assert.equal(body.code, "legal_document_in_use");
    assert.equal(body.dependencies?.total, 2, "the refusal did not carry the inventory the dialog renders");
    assert.match(body.error ?? "", /Archive it/);
    assert.ok(getLegalDocument(agencyId, cited.id), "the document was deleted despite the 409");
  });

  it("the removal preview and the DELETE guard read the same inventory", async () => {
    const { GET } = await import("../src/app/api/portal/company/legal/route");
    const response = await withSession(sessionCookie, () =>
      GET(new Request(`http://localhost/api/portal/company/legal?dependencies=${encodeURIComponent(cited.id)}`)));
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; dependencies: { total: number; dependants: Array<{ id: string }> } };
    assert.equal(body.dependencies.total, 2);
    assert.deepEqual(
      body.dependencies.dependants.map(dependant => dependant.id).sort(),
      legalDocumentDependencyInventory(agencyId, cited.id).dependants.map(dependant => dependant.id).sort(),
      "the dialog would show a different answer from the one the server enforces",
    );
  });

  it("archiving — the default answer — keeps the record and every citation resolvable", async () => {
    const archived = updateLegalDocument(agencyId, cited.id, { status: "archived" }, actorId);
    assert.equal(archived?.status, "archived");
    assert.ok(getLegalDocument(agencyId, cited.id), "archiving destroyed the record");
    assert.equal(legalDocumentDependencyInventory(agencyId, cited.id).total, 2,
      "archiving quietly dropped the citations it is supposed to preserve");
    updateLegalDocument(agencyId, cited.id, { status: "active" }, actorId);
  });
});

describe("an explicit detach clears every citation and the row together", () => {
  it("detaches both, in one transaction, and logs what it reconciled", async () => {
    const { deleteLegalDocument } = await import("../src/server/legalDocuments");
    const activityBefore = Object.values(getState().activity ?? {}).length;

    const purged = deleteLegalDocument(agencyId, cited.id, { detach: true, actorUserId: actorId });
    assert.ok(purged, "the detach delete returned nothing");
    assert.equal(purged.detached.length, 2);
    assert.equal(getLegalDocument(agencyId, cited.id), null, "the register row survived the purge");

    const obligation = await operations.getObligation(obligationId);
    assert.equal(obligation?.linkedLegalDocumentId, "",
      "the obligation still holds a dangling document id — the exact silent state this guard exists to prevent");
    assert.equal(getCompanyProfile(agencyId, null).capital.decisions[0]?.documentId, undefined,
      "the decision still cites a document that is no longer in the register");
    assert.equal(legalDocumentDependencyInventory(agencyId, cited.id).total, 0);

    const entries = Object.values(getState().activity ?? {}) as Array<{ action?: string; message?: string }>;
    assert.ok(entries.length > activityBefore, "the purge was not recorded at all");
    const purgeEntry = entries.find(entry => entry.action === "legal.document_deleted");
    assert.ok(purgeEntry, "the permanent deletion left no activity record");
    assert.match(purgeEntry.message ?? "", /Professional indemnity renewal/,
      "the audit line does not name what it detached, so the reconciliation is unverifiable");
  });

  it("the detached capital plan is now savable again, and its revision moved", () => {
    const profile = getCompanyProfile(agencyId, null);
    assert.equal(profile.capital.decisions[0]?.documentId, undefined);
    // Touching the plan re-runs the whole graph check. Before the detach this
    // save would be refused for citing a document that is not in the register.
    const resaved = updateCompanyProfile(agencyId, {
      ...profile,
      capital: { ...profile.capital, decisions: [{ ...profile.capital.decisions[0]!, summary: "Reworded." }] },
    }, actorId, null, { expectedRevision: profile.revision });
    assert.equal(resaved.capital.decisions[0]?.summary, "Reworded.");
  });

  it("a dependant-free document still deletes without ceremony", async () => {
    const { deleteLegalDocument } = await import("../src/server/legalDocuments");
    const purged = deleteLegalDocument(agencyId, unreferenced.id, { actorUserId: actorId });
    assert.ok(purged, "an uncited document was refused");
    assert.equal(purged.detached.length, 0);
    assert.equal(getLegalDocument(agencyId, unreferenced.id), null);
  });
});

describe("the surfaces holding a document id say so instead of dropping it", () => {
  it("the obligation card renders a named removed-link state, not nothing", () => {
    const source = read("src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx");
    assert.match(source, /item\.linkedLegalDocumentId \? <span[^>]*>Linked document no longer in the register/,
      "an obligation whose evidence was deleted still renders identically to one that never had any");
  });

  it("the register's removal path is a dialog with the inventory, not a bare confirm", () => {
    const source = read("src/app/portal/agency/company/_LegalCompliancePanel.tsx");
    assert.doesNotMatch(source, /window\.confirm\(/,
      "deleting filed evidence is still a yes/no confirm that names neither the archive option nor the dependants");
    assert.match(source, /dependencies=/, "the dialog does not fetch the inventory the server enforces");
    assert.match(source, /detach=true/, "the dialog cannot express the explicit detach the server requires");
    assert.match(source, /Archive instead/, "archiving is not offered as the default answer");
  });
});

describe("a permanent delete never destroys the file while the row survives", () => {
  // The route's own ordering is the contract under test. The store's re-check is
  // the authoritative one and the preview above it can go stale, so a citation
  // appearing mid-delete has to leave BOTH the row and the binary intact. The
  // earlier ordering deleted the binary first and then let the store refuse,
  // which answered 409 — "archive it to keep the evidence" — about evidence it
  // had just destroyed.
  it("the route removes the register row before it touches the stored binary", () => {
    const source = read("src/app/api/portal/company/legal/route.ts");
    const rowDelete = source.indexOf("deleteLegalDocument(session.agencyId, id, { detach");
    const fileDelete = source.indexOf("await deletePrivateUpload({");
    assert.ok(rowDelete > 0 && fileDelete > 0, "the DELETE path no longer performs both halves");
    assert.ok(
      rowDelete < fileDelete,
      "the stored binary is destroyed before the store's authoritative dependant re-check, so a citation appearing in that window loses the file and keeps the row",
    );
  });

  it("a provider refusal restores the row, so the file keeps its only handle", async () => {
    const { deleteLegalDocument, restoreLegalDocument } = await import("../src/server/legalDocuments");
    const doomed = createLegalDocument({
      id: `legal_${Math.random().toString(36).slice(2, 10)}`,
      agencyId, companyId: null, title: "Restorable policy", category: "insurance",
      status: "active", reference: "", tags: [], notes: "",
      storageProvider: "local", storageKey: "legal-uploads/restorable.pdf",
      fileName: "restorable.pdf", fileSize: 12, mimeType: "application/pdf",
      createdBy: actorId,
    } as Parameters<typeof createLegalDocument>[0]);

    const purged = deleteLegalDocument(agencyId, doomed.id, { actorUserId: actorId });
    assert.ok(purged, "the uncited document was refused");
    assert.equal(getLegalDocument(agencyId, doomed.id), null, "the row survived its own delete");

    // What the route does when deletePrivateUpload answers { ok: false }.
    assert.equal(restoreLegalDocument(purged.document), true, "the row could not be put back");
    const back = getLegalDocument(agencyId, doomed.id);
    assert.ok(back, "the restored row is not readable");
    assert.equal(back.storageKey, doomed.storageKey, "the restored row lost the handle on its stored file");
    assert.equal(back.createdAt, doomed.createdAt, "restoring re-stamped createdAt, so the row now lies about its age");

    assert.equal(restoreLegalDocument(purged.document), false, "restoring over a live row silently overwrote it");
  });
});
