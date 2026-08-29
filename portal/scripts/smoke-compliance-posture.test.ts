import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertPostureHonesty,
  buildCompliancePosture,
  SUBPROCESSOR_EXPECTATIONS,
  type ComplianceControl,
  type ComplianceEvidenceInput,
  type CompliancePosture,
} from "../src/lib/compliance/compliancePosture";

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let legal: typeof import("../src/server/legalDocuments");
let tradingCompanies: typeof import("../src/server/tradingCompanies");
let source: typeof import("../src/lib/server/compliancePostureSource");

const DAY = 86_400_000;
const NOW = 1_760_000_000_000;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  legal = await import("../src/server/legalDocuments");
  tradingCompanies = await import("../src/server/tradingCompanies");
  source = await import("../src/lib/server/compliancePostureSource");
});

function evidence(overrides: Partial<ComplianceEvidenceInput> = {}): ComplianceEvidenceInput {
  return {
    now: NOW,
    companyId: null,
    companyName: "Agency-wide",
    hipaa: { enabled: false, source: "Off." },
    legalRecords: [],
    consent: {
      enquiriesTotal: 0,
      enquiriesWithConsent: 0,
      enquiriesWithVersion: 0,
      latestConsentAt: null,
      taggedSites: 0,
      sitesGatingOnConsent: 0,
      unreadable: false,
    },
    erasure: { implemented: true, reviewPackPresent: true, openReviewQuestions: 8, signedOff: false, liveRunVerified: false },
    audit: { activityEntries: 0, latestAt: null },
    ...overrides,
  };
}

function controls(posture: CompliancePosture): ComplianceControl[] {
  return posture.groups.flatMap(group => group.controls);
}

function control(posture: CompliancePosture, id: string): ComplianceControl {
  const found = controls(posture).find(item => item.id === id);
  assert.ok(found, `expected a control "${id}", got: ${controls(posture).map(item => item.id).join(", ")}`);
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// The honesty rule. These are the tests that matter most: the plan says a
// surface implying "you are now compliant" would be actively harmful — worse
// than not shipping. So the rules are asserted over real built postures.
// ─────────────────────────────────────────────────────────────────────────────

describe("the honesty rule is structural, not decorative", () => {
  it("every control that is not evidenced states what is still missing", () => {
    for (const hipaa of [false, true]) {
      const posture = buildCompliancePosture(evidence({ hipaa: { enabled: hipaa, source: "test" } }));
      const silent = controls(posture).filter(item => item.status !== "met" && !item.gap.trim());
      assert.deepEqual(silent.map(item => item.id), [], "a control reported a non-met status without saying what is missing");
    }
  });

  it("every control that IS evidenced states what that does not prove", () => {
    const posture = buildCompliancePosture(evidence({
      audit: { activityEntries: 12, latestAt: NOW - DAY },
      legalRecords: [{ id: "l1", title: "Privacy notice", category: "policy", status: "active" }],
    }));
    const met = controls(posture).filter(item => item.status === "met");
    assert.ok(met.length > 0, "expected at least one evidenced control in this fixture");
    for (const item of met) {
      assert.ok(item.evidenceLimit.trim().length > 0, `${item.id} reads as evidenced without saying what it does not prove`);
    }
  });

  it("a control only a human can confer can never read as evidenced", () => {
    const posture = buildCompliancePosture(evidence({
      hipaa: { enabled: true, source: "on" },
      legalRecords: [
        { id: "r1", title: "Security risk assessment 2026", category: "policy", status: "active" },
        { id: "r2", title: "HIPAA policies and procedures", category: "policy", status: "active" },
        { id: "r3", title: "Workforce HIPAA training log", category: "policy", status: "active" },
      ],
    }));
    const human = controls(posture).filter(item => item.conferredBy === "human");
    assert.ok(human.length >= 4, "expected the HIPAA track to carry human-only controls");
    for (const item of human) {
      assert.notEqual(item.status, "met", `${item.id} reads as evidenced although only a human can confer it`);
      assert.ok(item.gap.trim().length > 0, `${item.id} has no stated gap`);
    }
  });

  it("assertPostureHonesty passes a real posture and catches a dishonest one", () => {
    const posture = buildCompliancePosture(evidence({ hipaa: { enabled: true, source: "on" } }));
    assert.deepEqual(assertPostureHonesty(posture), []);

    // Forge the three failures the checker exists to catch.
    const forged: CompliancePosture = {
      ...posture,
      groups: [{
        group: "Forged",
        controls: [
          { ...control(posture, "gdpr.dsar-intake"), id: "forged.silent", status: "missing", gap: "   " },
          { ...control(posture, "gdpr.audit-trail"), id: "forged.unqualified", status: "met", evidenceLimit: "" },
          { ...control(posture, "hipaa.legal-signoff"), id: "forged.human-met", status: "met", evidenceLimit: "x" },
        ],
      }],
    };
    const problems = assertPostureHonesty(forged);
    assert.equal(problems.length, 3);
    assert.ok(problems.some(problem => problem.includes("forged.silent")));
    assert.ok(problems.some(problem => problem.includes("forged.unqualified")));
    assert.ok(problems.some(problem => problem.includes("forged.human-met")));
  });

  it("never states compliance anywhere a reader could quote it", () => {
    const posture = buildCompliancePosture(evidence({ hipaa: { enabled: true, source: "on" } }));
    assert.match(posture.summary.headline, /not a compliance claim/i);
    assert.match(posture.disclaimer, /cannot make you compliant/i);
    for (const framework of posture.frameworks) {
      assert.ok(framework.honesty.trim().length > 0, `${framework.id} has no honesty statement`);
    }
    const hipaa = posture.frameworks.find(item => item.id === "hipaa");
    assert.match(hipaa!.honesty, /does NOT make you HIPAA compliant/);
    // No aggregate score: a percentage would be read as a compliance grade.
    assert.equal("score" in posture.summary, false);
    assert.equal("compliant" in posture.summary, false);
  });

  it("absence of a signal is blind, never a pass", () => {
    const posture = buildCompliancePosture(evidence({ consent: { ...evidence().consent, unreadable: true } }));
    const consent = control(posture, "gdpr.consent-ledger");
    assert.equal(consent.status, "blind");
    assert.match(consent.gap, /could not be read/i);

    const noEnquiries = control(buildCompliancePosture(evidence()), "gdpr.consent-ledger");
    assert.equal(noEnquiries.status, "blind", "zero enquiries must not read as clean consent");

    const noActivity = control(buildCompliancePosture(evidence()), "gdpr.audit-trail");
    assert.equal(noActivity.status, "blind");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Evidence, not assumption.
// ─────────────────────────────────────────────────────────────────────────────

describe("posture is built from real evidence", () => {
  it("a processor agreement only counts when a current document names the processor AND the agreement", () => {
    const missing = control(buildCompliancePosture(evidence()), "gdpr.processor.supabase");
    assert.equal(missing.status, "missing");

    // Names Supabase, but is not a DPA — must not count.
    const wrongKind = control(buildCompliancePosture(evidence({
      legalRecords: [{ id: "x", title: "Supabase invoice", category: "other", status: "active", counterparty: "Supabase" }],
    })), "gdpr.processor.supabase");
    assert.equal(wrongKind.status, "missing");

    // A DPA, but with a different processor — must not count either.
    const wrongParty = control(buildCompliancePosture(evidence({
      legalRecords: [{ id: "x", title: "Data processing agreement", category: "contract", status: "active", counterparty: "Stripe" }],
    })), "gdpr.processor.supabase");
    assert.equal(wrongParty.status, "missing");

    const met = control(buildCompliancePosture(evidence({
      legalRecords: [{ id: "x", title: "Data processing agreement", category: "contract", status: "active", counterparty: "Supabase", expiresAt: NOW + 400 * DAY }],
    })), "gdpr.processor.supabase");
    assert.equal(met.status, "met");
    assert.match(met.evidenceLimit, /has not read it/i);
  });

  it("an expired agreement degrades to partly evidenced and says the cover has lapsed", () => {
    const expired = control(buildCompliancePosture(evidence({
      legalRecords: [{ id: "x", title: "Supabase data processing agreement", category: "contract", status: "active", counterparty: "Supabase", expiresAt: NOW - DAY }],
    })), "gdpr.processor.supabase");
    assert.equal(expired.status, "partial");
    assert.match(expired.gap, /expired or archived/i);
  });

  it("consent is graded on the real proportion carrying a version", () => {
    const partial = control(buildCompliancePosture(evidence({
      consent: { enquiriesTotal: 10, enquiriesWithConsent: 10, enquiriesWithVersion: 4, latestConsentAt: NOW - DAY, taggedSites: 1, sitesGatingOnConsent: 1, unreadable: false },
    })), "gdpr.consent-ledger");
    assert.equal(partial.status, "partial");
    assert.match(partial.gap, /6 enquiries have no consent version/);

    const full = control(buildCompliancePosture(evidence({
      consent: { enquiriesTotal: 10, enquiriesWithConsent: 10, enquiriesWithVersion: 10, latestConsentAt: NOW - DAY, taggedSites: 1, sitesGatingOnConsent: 1, unreadable: false },
    })), "gdpr.consent-ledger");
    assert.equal(full.status, "met");
  });

  it("erasure is only partly evidenced while the live run and sign-off are outstanding", () => {
    const today = control(buildCompliancePosture(evidence()), "gdpr.right-to-erasure");
    assert.equal(today.status, "partial");
    assert.match(today.gap, /never been run for real/);
    assert.match(today.gap, /8 questions/);
    assert.match(today.gap, /backups/);

    const done = control(buildCompliancePosture(evidence({
      erasure: { implemented: true, reviewPackPresent: true, openReviewQuestions: 0, signedOff: true, liveRunVerified: true },
    })), "gdpr.right-to-erasure");
    assert.equal(done.status, "met");
  });

  it("names the gaps the DPO pack itself calls out, so the two cannot drift apart quietly", () => {
    const posture = buildCompliancePosture(evidence());
    // Changed to "partial" on 2026-08-28: the export was BUILT
    // (`POST /api/portal/governance/subject-access`), so leaving this at
    // "missing" would have the app under-report a right it can now perform.
    // It is not "met" — the request side (identity verification before
    // releasing someone's data, and a clock against the one-month deadline)
    // still does not exist, which the control's own `gap` now says.
    assert.equal(control(posture, "gdpr.dsar-access").status, "partial");
    assert.match(control(posture, "gdpr.dsar-access").gap, /identity-verification/);
    // Also "partial" as of 2026-08-28: the register, the identity gate and the
    // Art. 12(3) clock are built. It is not "met" because nothing FEEDS the
    // register yet — requests are still typed in by hand and no screen surfaces
    // the clock, so an overdue one is only visible to somebody who looks.
    assert.equal(control(posture, "gdpr.dsar-intake").status, "partial");
    assert.match(control(posture, "gdpr.dsar-intake").gap, /missing is INTAKE/);
    assert.equal(control(posture, "gdpr.ropa").status, "missing");
    assert.equal(control(posture, "gdpr.breach-register").status, "missing");
    assert.equal(control(posture, "gdpr.retention").status, "missing");
    assert.match(control(posture, "gdpr.retention").gap, /Indefinite retention/);
  });

  it("the erasure evidence constant has not drifted from the DPO pack it summarises", () => {
    const pack = readFileSync("docs/compliance/erasure-dpo-pack.md", "utf8");
    const questions = pack.match(/\*\*Q\d+\*\*/g) ?? [];
    assert.equal(
      source.ERASURE_EVIDENCE.openReviewQuestions,
      questions.length,
      "ERASURE_EVIDENCE.openReviewQuestions no longer matches the questions in docs/compliance/erasure-dpo-pack.md",
    );
    // The pack says the live scrub has never been run. If that ever changes the
    // pack must be updated first, and this constant with it.
    assert.match(pack, /never been run against the live database/i);
    assert.equal(source.ERASURE_EVIDENCE.liveRunVerified, false);
    assert.equal(source.ERASURE_EVIDENCE.signedOff, false, "sign-off is a fact about the world, not about the code");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The HIPAA track: an optional per-company toggle that confers nothing.
// ─────────────────────────────────────────────────────────────────────────────

describe("the HIPAA track is optional, per-company, and confers nothing", () => {
  let agencyId: string;
  let medicalId: string;
  let otherId: string;

  beforeEach(() => {
    const agency = tenants.createAgency({ name: "Compliance Co", slug: `compliance-${Math.floor(performance.now() * 1000)}` });
    agencyId = agency.id;
    medicalId = tradingCompanies.createTradingCompany(agencyId, { name: "Aqua Health" }, "ed").id;
    otherId = tradingCompanies.createTradingCompany(agencyId, { name: "Aqua Retail" }, "ed").id;
  });

  it("is off until it is declared, and then only for the company declared", () => {
    assert.equal(legal.isHipaaTrackEnabled(agencyId, medicalId), false);
    legal.setHipaaTrack({ agencyId, companyId: medicalId, companyName: "Aqua Health", enabled: true, actorUserId: "ed" });
    assert.equal(legal.isHipaaTrackEnabled(agencyId, medicalId), true);
    assert.equal(legal.isHipaaTrackEnabled(agencyId, otherId), false, "the track must not leak to another company");
    assert.equal(legal.isHipaaTrackEnabled(agencyId, null), false, "a company-scoped declaration must not switch on the agency-wide scope");
  });

  it("switching it off archives the declaration rather than deleting it", () => {
    legal.setHipaaTrack({ agencyId, companyId: medicalId, companyName: "Aqua Health", enabled: true, actorUserId: "ed" });
    const on = legal.listComplianceDeclarations(agencyId);
    assert.equal(on.length, 1);

    legal.setHipaaTrack({ agencyId, companyId: medicalId, companyName: "Aqua Health", enabled: false, actorUserId: "ed" });
    assert.equal(legal.isHipaaTrackEnabled(agencyId, medicalId), false);
    const off = legal.listComplianceDeclarations(agencyId);
    assert.equal(off.length, 1, "the record of when the track was on must survive");
    assert.equal(off[0].status, "archived");
    assert.equal(off[0].id, on[0].id);
  });

  it("switching it on adds nothing to the legal register the rest of the app reads", () => {
    const before = legal.listLegalDocuments(agencyId).length;
    legal.setHipaaTrack({ agencyId, companyId: medicalId, companyName: "Aqua Health", enabled: true, actorUserId: "ed" });
    assert.equal(legal.listLegalDocuments(agencyId).length, before, "a toggle must not inflate the document count Radar and search read");
    assert.equal(legal.listComplianceDeclarations(agencyId).length, 1);
  });

  it("the declaration is not reachable as a document, so nothing offers a file that does not exist", () => {
    legal.setHipaaTrack({ agencyId, companyId: medicalId, companyName: "Aqua Health", enabled: true, actorUserId: "ed" });
    const [declaration] = legal.listComplianceDeclarations(agencyId);
    assert.equal(declaration.size, 0);
    assert.equal(legal.getLegalDocument(agencyId, declaration.id), null);
    assert.equal(legal.deleteLegalDocument(agencyId, declaration.id), null);
    assert.equal(legal.listComplianceDeclarations(agencyId).length, 1, "the declaration must survive a delete attempt aimed at it");
  });

  it("a hand-written reference cannot switch the track on", () => {
    const forged = legal.createLegalDocument({
      id: `legal_forged_${Math.floor(performance.now() * 1000)}`,
      agencyId,
      companyIds: [medicalId],
      title: "Not a declaration",
      category: "other",
      status: "active",
      reference: legal.HIPAA_TRACK_REFERENCE,
      fileName: "x.pdf",
      contentType: "application/pdf",
      size: 10,
      storageProvider: "local",
      storageKey: "x.pdf",
      createdBy: "ed",
    });
    assert.equal(forged.reference, undefined, "the reserved prefix must be stripped from user input");
    assert.equal(legal.isHipaaTrackEnabled(agencyId, medicalId), false);

    const patched = legal.updateLegalDocument(agencyId, forged.id, { reference: `${legal.HIPAA_TRACK_REFERENCE}` }, "ed");
    assert.equal(patched?.reference, undefined);
    assert.equal(legal.isHipaaTrackEnabled(agencyId, medicalId), false, "a PATCH must not be able to switch a framework on either");
  });

  it("the track adds a BAA control for every subprocessor that could see PHI, all unmet", async () => {
    const off = await source.buildCompliancePostureForAgency({ agencyId, companyId: medicalId, now: NOW });
    assert.equal(off.frameworks.find(item => item.id === "hipaa")?.enabled, false);
    assert.equal(controls(off).some(item => item.framework === "hipaa"), false);
    assert.equal(off.frameworks.find(item => item.id === "gdpr")?.enabled, true, "GDPR is always on");

    legal.setHipaaTrack({ agencyId, companyId: medicalId, companyName: "Aqua Health", enabled: true, actorUserId: "ed" });
    const on = await source.buildCompliancePostureForAgency({ agencyId, companyId: medicalId, now: NOW });
    const expectedBaas = SUBPROCESSOR_EXPECTATIONS.filter(item => item.phi);
    for (const processor of expectedBaas) {
      const baa = control(on, `hipaa.processor.${processor.id}`);
      assert.equal(baa.status, "missing", `${processor.name} must not read as covered without a BAA on file`);
      assert.match(baa.gap, /business associate agreement/i);
    }
    assert.deepEqual(assertPostureHonesty(on), []);
    assert.ok(on.summary.humanOnly >= 4, "the track must show how many controls software can never satisfy");
  });

  it("the posture reads the declaration through the real store, per company", async () => {
    legal.setHipaaTrack({ agencyId, companyId: medicalId, companyName: "Aqua Health", enabled: true, actorUserId: "ed" });
    const medical = await source.buildCompliancePostureForAgency({ agencyId, companyId: medicalId, now: NOW });
    const retail = await source.buildCompliancePostureForAgency({ agencyId, companyId: otherId, now: NOW });
    assert.equal(medical.frameworks.find(item => item.id === "hipaa")?.enabled, true);
    assert.equal(retail.frameworks.find(item => item.id === "hipaa")?.enabled, false);
    assert.equal(medical.companyName, "Aqua Health");
    assert.equal(retail.companyName, "Aqua Retail");
  });
});
