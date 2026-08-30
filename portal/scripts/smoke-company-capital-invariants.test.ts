/**
 * Capital and ownership register integrity — issues #65.
 *
 * The register calls itself the authoritative cap table: ownership, voting
 * control, approval coverage and the distribution position are all calculated
 * from the retained values, and the mounted workspace offers hard deletes.
 * Before this, `updateCompanyProfile()` sent the nested capital plan through six
 * independent shape/range cleaners, so a single round-trip happily retained
 * duplicate ids, an owner in a class that does not exist, a movement approved by
 * a decision that does not exist, a £100 dividend with £250 paid and a £300
 * allocation to a missing owner, and a decision carrying 80% for plus 70%
 * against. These pin the graph contract that replaced that.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, test } from "node:test";

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

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Company = typeof import("../src/server/company");
type LegalDocuments = typeof import("../src/server/legalDocuments");
type CapitalPlan = import("../src/server/types").CompanyCapitalPlan;

let storage: Storage;
let tenants: Tenants;
let company: Company;
let legalDocuments: LegalDocuments;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  company = await import("../src/server/company");
  legalDocuments = await import("../src/server/legalDocuments");
  await storage.ensureHydrated();
});

/** A coherent register: one class, one owner, one approved movement and one distribution. */
function soundCapital(): CapitalPlan {
  return {
    currency: "GBP",
    shareClasses: [{ id: "ordinary", name: "Ordinary", authorisedShares: 100, nominalValueCents: 100, votingRightsPerShare: 1, dividendEligible: true }],
    shareholders: [{ id: "holder-ed", name: "Ed Hallam", kind: "founder", shareClassId: "ordinary", shares: 100, investedCents: 10_000, status: "active", director: true, boardSeat: true }],
    transactions: [{ id: "capital-1", kind: "capital-contribution", title: "Founder capital", shareholderId: "holder-ed", shareClassId: "ordinary", amountCents: 10_000, currency: "GBP", shares: 100, occurredAt: 123_456, status: "completed", approvalId: "decision-1" }],
    investments: [],
    dividends: [{ id: "dividend-1", title: "2026 distribution", period: "FY 2026", currency: "GBP", declaredCents: 10_000, paidCents: 10_000, status: "paid", allocations: [{ shareholderId: "holder-ed", amountCents: 10_000 }], approvalId: "decision-1" }],
    decisions: [{ id: "decision-1", title: "Approve capital and distribution", kind: "board", status: "approved", summary: "Approved after reviewing cash and reserves.", votesForPercent: 100, votesAgainstPercent: 0, relatedRecordIds: ["capital-1", "dividend-1"] }],
  };
}

async function seed(slug: string) {
  await storage.reset();
  const agency = tenants.createAgency({ name: slug, slug });
  const initial = company.getCompanyProfile(agency.id);
  const saved = company.updateCompanyProfile(agency.id, { ...initial, capital: soundCapital() }, "executive_test", null, { expectedRevision: initial.revision });
  return { agency, saved };
}

function refusal(run: () => void): InstanceType<Company["CompanyCapitalConflictError"]> {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof company.CompanyCapitalConflictError, `the save should have been refused, got ${caught === undefined ? "a successful save" : String(caught)}`);
  return caught as InstanceType<Company["CompanyCapitalConflictError"]>;
}

test("a coherent capital register still saves, and an over-issued class stays a surfaced flag rather than a silent refusal", async () => {
  const { agency, saved } = await seed("capital-sound");
  assert.equal(saved.capital.shareholders[0]?.name, "Ed Hallam");
  assert.deepEqual(company.getCompanyProfile(agency.id).capital, saved.capital, "the sound plan round-trips unchanged");

  // Issued beyond authorised is a real state the register flags "Over-issued"
  // in the open. Refusing the save would hide it instead of correcting it.
  const overIssued = { ...saved.capital, shareholders: [{ ...saved.capital.shareholders[0]!, shares: 250 }] };
  const stored = company.updateCompanyProfile(agency.id, { ...saved, capital: overIssued }, "executive_test", null, { expectedRevision: saved.revision });
  assert.equal(stored.capital.shareholders[0]?.shares, 250, "an over-issued class is retained and flagged, not rejected");
});

test("the capital register refuses an internally impossible or dangling plan whole, naming every record", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Capital Invariants", slug: "capital-invariants" });
  const initial = company.getCompanyProfile(agency.id);

  // The exact probe recorded in issues #65.
  const error = refusal(() => company.updateCompanyProfile(agency.id, {
    ...initial,
    capital: {
      currency: "GBP",
      shareClasses: [
        { id: "ordinary", name: "Ordinary", authorisedShares: 100, nominalValueCents: 100, votingRightsPerShare: 1, dividendEligible: true },
        { id: "ordinary", name: "Ordinary (duplicate)", authorisedShares: 500, nominalValueCents: 100, votingRightsPerShare: 10, dividendEligible: true },
      ],
      shareholders: [
        { id: "holder-ed", name: "Ed Hallam", kind: "founder", shareClassId: "ordinary", shares: 100, investedCents: 10_000, status: "active", director: true, boardSeat: true },
        { id: "holder-ed", name: "Ed Hallam (duplicate)", kind: "founder", shareClassId: "ordinary", shares: 900, investedCents: 0, status: "active", director: true, boardSeat: true },
        { id: "holder-ghost", name: "Ghost Investor", kind: "investor", shareClassId: "class-that-does-not-exist", shares: 40, investedCents: 5_000, status: "active", director: false, boardSeat: false },
      ],
      transactions: [{ id: "capital-1", kind: "share-issue", title: "Unbacked issue", shareholderId: "holder-missing", shareClassId: "class-missing", amountCents: 100_000, currency: "GBP", shares: 50, occurredAt: 123_456, status: "completed", approvalId: "decision-missing" }],
      investments: [],
      dividends: [{ id: "dividend-1", title: "Impossible distribution", period: "FY 2026", currency: "GBP", declaredCents: 10_000, paidCents: 25_000, status: "paid", allocations: [{ shareholderId: "holder-nobody", amountCents: 30_000 }], approvalId: "decision-missing" }],
      decisions: [{ id: "decision-1", title: "Approve everything", kind: "board", status: "approved", summary: "Approved.", votesForPercent: 80, votesAgainstPercent: 70, relatedRecordIds: [] }],
    },
  }, "executive_test", null, { expectedRevision: initial.revision }));

  const reasons = error.conflicts.map(conflict => conflict.reason).join(" | ");
  assert.match(reasons, /reuses the id ordinary/, "a duplicate share-class id is named");
  assert.match(reasons, /reuses the id holder-ed/, "a duplicate shareholder id is named");
  assert.match(reasons, /Ghost Investor.*class-that-does-not-exist/, "an owner in a class that does not exist is named");
  assert.match(reasons, /Unbacked issue.*owner holder-missing/, "a movement naming a missing owner is named");
  assert.match(reasons, /Unbacked issue.*share class class-missing/, "a movement naming a missing class is named");
  assert.match(reasons, /Unbacked issue.*approval decision-missing/, "a movement claiming an approval that does not exist is named");
  assert.match(reasons, /Impossible distribution.*GBP 250\.00 paid against GBP 100\.00 declared/, "paying beyond the declaration is named");
  assert.match(reasons, /Impossible distribution.*allocates GBP 300\.00 against GBP 100\.00 declared/, "allocating beyond the declaration is named");
  assert.match(reasons, /Impossible distribution.*owner holder-nobody/, "an allocation to somebody who is not on the cap table is named");
  assert.match(reasons, /Approve everything.*80% for plus 70% against/, "a vote that does not fit inside 100% is named");
  assert.ok(error.conflicts.every(conflict => conflict.recordId && conflict.record), "every conflict identifies the record it is about");

  // Refused whole: nothing was half-applied and the revision did not move.
  const stored = company.getCompanyProfile(agency.id);
  assert.equal(stored.revision, 0, "a refused capital save does not advance the revision");
  assert.deepEqual(stored.capital.shareholders, [], "no part of the impossible plan landed");
  assert.deepEqual(stored.capital.dividends, []);
  assert.deepEqual(stored.capital.decisions, []);
});

test("an impossible share of the vote is refused by name rather than silently clamped into range", async () => {
  const { agency, saved } = await seed("capital-votes");
  const error = refusal(() => company.updateCompanyProfile(agency.id, {
    ...saved,
    capital: { ...saved.capital, decisions: [{ ...saved.capital.decisions[0]!, votesForPercent: 150, votesAgainstPercent: -20 }] },
  }, "executive_test", null, { expectedRevision: saved.revision }));
  const reasons = error.conflicts.map(conflict => conflict.reason).join(" | ");
  assert.match(reasons, /records 150% for/, "150% for is reported, not rewritten as 100%");
  assert.match(reasons, /records -20% against/, "a negative share of the vote is reported, not rewritten as 0%");
  assert.equal(company.getCompanyProfile(agency.id).capital.decisions[0]?.votesForPercent, 100, "the retained decision keeps its real recorded vote");
});

test("a hard delete that would strand a live ledger link is refused with every dependant listed", async () => {
  const { agency, saved } = await seed("capital-deletes");

  // Exactly what the mounted workspace's owner delete used to save: the holder
  // filtered out of the array while the movement and distribution keep its id.
  const ownerDelete = refusal(() => company.updateCompanyProfile(agency.id, {
    ...saved,
    capital: { ...saved.capital, shareholders: saved.capital.shareholders.filter(item => item.id !== "holder-ed") },
  }, "executive_test", null, { expectedRevision: saved.revision }));
  const ownerConflict = ownerDelete.conflicts.find(conflict => conflict.scope === "shareholder");
  assert.ok(ownerConflict, "the refusal is about the shareholder that was removed");
  assert.equal(ownerConflict?.recordId, "holder-ed");
  assert.deepEqual(ownerConflict?.dependants, ["capital movement “Founder capital”", "distribution “2026 distribution”"], "every dependant is calculated and listed, not just counted");
  assert.match(ownerConflict!.reason, /Set them to “former” instead/, "the refusal states how the retirement is actually done");
  assert.equal(company.getCompanyProfile(agency.id).capital.shareholders.length, 1, "the owner is still on the cap table");

  // The decision delete strands both the movement's and the dividend's approval.
  const decisionDelete = refusal(() => company.updateCompanyProfile(agency.id, {
    ...saved,
    capital: { ...saved.capital, decisions: [] },
  }, "executive_test", null, { expectedRevision: saved.revision }));
  const decisionConflict = decisionDelete.conflicts.find(conflict => conflict.scope === "decision");
  assert.equal(decisionConflict?.recordId, "decision-1");
  assert.deepEqual(decisionConflict?.dependants, ["capital movement “Founder capital”", "distribution “2026 distribution”"]);
  assert.match(decisionConflict!.reason, /Mark it “superseded” instead/);

  // A share class cannot be dropped from under its holders either.
  const classDelete = refusal(() => company.updateCompanyProfile(agency.id, {
    ...saved,
    capital: { ...saved.capital, shareClasses: [] },
  }, "executive_test", null, { expectedRevision: saved.revision }));
  assert.match(classDelete.conflicts.map(conflict => conflict.reason).join(" | "), /Ordinary.*shareholder “Ed Hallam”/);

  // The supported retirement is accepted: history stays attached.
  const retired = company.updateCompanyProfile(agency.id, {
    ...saved,
    capital: { ...saved.capital, shareholders: [{ ...saved.capital.shareholders[0]!, status: "former" }] },
  }, "executive_test", null, { expectedRevision: saved.revision });
  assert.equal(retired.capital.shareholders[0]?.status, "former");
  assert.equal(retired.capital.transactions[0]?.shareholderId, "holder-ed", "retiring an owner keeps the ledger link intact");

  // An unrelated record CAN still be deleted — the guard is dependant-driven,
  // not a blanket refusal to remove anything.
  const withSpare = company.updateCompanyProfile(agency.id, {
    ...retired,
    capital: { ...retired.capital, decisions: [...retired.capital.decisions, { id: "decision-2", title: "Unused decision", kind: "board", status: "draft", summary: "Nothing depends on this.", relatedRecordIds: [] }] },
  }, "executive_test", null, { expectedRevision: retired.revision });
  const dropped = company.updateCompanyProfile(agency.id, {
    ...withSpare,
    capital: { ...withSpare.capital, decisions: withSpare.capital.decisions.filter(item => item.id !== "decision-2") },
  }, "executive_test", null, { expectedRevision: withSpare.revision });
  assert.equal(dropped.capital.decisions.length, 1, "a decision nothing depends on is still removable");
});

test("a decision cannot cite evidence that is not in the legal register", async () => {
  const { agency, saved } = await seed("capital-evidence");
  const cite = (documentId: string, revision: number) => company.updateCompanyProfile(agency.id, {
    ...saved,
    capital: { ...saved.capital, decisions: [{ ...saved.capital.decisions[0]!, documentId }] },
  }, "executive_test", null, { expectedRevision: revision });

  const error = refusal(() => cite("minute-that-does-not-exist", saved.revision));
  assert.match(error.conflicts.map(conflict => conflict.reason).join(" | "), /cites document minute-that-does-not-exist, which is not in the legal register/);

  legalDocuments.createLegalDocument({
    id: "legal-minute-1",
    agencyId: agency.id,
    title: "Board minute 2026-03",
    category: "company",
    status: "active",
    fileName: "minute.pdf",
    contentType: "application/pdf",
    size: 1_024,
    storageProvider: "local",
    storageKey: "legal/minute.pdf",
    createdBy: "executive_test",
  });
  const linked = cite("legal-minute-1", company.getCompanyProfile(agency.id).revision);
  assert.equal(linked.capital.decisions[0]?.documentId, "legal-minute-1", "a real register document is accepted as the evidence link");
});

test("a plan the store already holds does not lock the operator out of unrelated executive work", async () => {
  const { agency, saved } = await seed("capital-lockout");
  legalDocuments.createLegalDocument({
    id: "legal-minute-2",
    agencyId: agency.id,
    title: "Board minute 2026-04",
    category: "company",
    status: "active",
    fileName: "minute.pdf",
    contentType: "application/pdf",
    size: 1_024,
    storageProvider: "local",
    storageKey: "legal/minute.pdf",
    createdBy: "executive_test",
  });
  const cited = company.updateCompanyProfile(agency.id, {
    ...saved,
    capital: { ...saved.capital, decisions: [{ ...saved.capital.decisions[0]!, documentId: "legal-minute-2" }] },
  }, "executive_test", null, { expectedRevision: saved.revision });

  // The evidence is removed from the legal register by a different surface, so
  // the retained plan is now citing a document that is not there through no
  // act of the person editing objectives.
  assert.ok(legalDocuments.deleteLegalDocument(agency.id, "legal-minute-2"), "the cited document is gone from the register");

  // Every Battle Table editor PUTs the whole profile, so the untouched capital
  // plan rides along. That must not refuse work that has nothing to do with it.
  const unrelated = company.updateCompanyProfile(agency.id, {
    ...cited,
    mission: "Own the aquatics category.",
  }, "executive_test", null, { expectedRevision: cited.revision });
  assert.equal(unrelated.mission, "Own the aquatics category.", "an unrelated save is not blocked by a plan the store already holds");
  assert.equal(unrelated.capital.decisions[0]?.documentId, "legal-minute-2", "the retained plan is carried through untouched, not silently repaired");

  // Touch the plan and the whole graph is enforced again, dangling cite included.
  const error = refusal(() => company.updateCompanyProfile(agency.id, {
    ...unrelated,
    capital: { ...unrelated.capital, decisions: [{ ...unrelated.capital.decisions[0]!, summary: "Reworded." }] },
  }, "executive_test", null, { expectedRevision: unrelated.revision }));
  assert.match(error.conflicts.map(conflict => conflict.reason).join(" | "), /cites document legal-minute-2, which is not in the legal register/);
});

test("the company PUT answers a capital-graph refusal with an actionable 409, and the register does not offer a delete that would strand a link", () => {
  const route = read("src/app/api/portal/company/route.ts");
  assert.match(route, /CompanyCapitalConflictError[\s\S]*conflict: "capital-invariants", conflicts: error\.conflicts[\s\S]*status: 409/, "the route answers the conflicts, not a bare 500");

  const workspace = read("src/app/portal/agency/_CapitalOwnershipWorkspace.tsx");
  assert.match(workspace, /function dependantsOf\(capital: CompanyCapitalPlan, id: string\)/, "the workspace calculates dependants the same way the server does");
  for (const guarded of [
    /shareClasses: capital\.shareClasses\.filter[\s\S]{0,120}deleteBlocked=\{canEdit && linked\.length/,
    /canEdit && !row\.linked\.length \? <button type="button" aria-label=\{`Delete \$\{row\.holder\.name\}`\}/,
    /canEdit && !dependantsOf\(capital, item\.id\)\.length \? \(\) => void commit\(\{ \.\.\.capital, decisions/,
  ]) {
    assert.match(workspace, guarded, "the hard delete is only offered when nothing still names the record");
  }
  assert.match(workspace, /Linked · retire, do not delete/, "a blocked delete says what to do instead rather than disappearing silently");
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}
