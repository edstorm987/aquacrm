import "server-only";

import {
  buildCompliancePosture,
  type BreachEvidence,
  type CompliancePosture,
  type ComplianceEvidenceInput,
  type ConsentEvidence,
  type ErasureEvidence,
  type LegalRecordEvidence,
} from "@/lib/compliance/compliancePosture";
import { listBreachIncidents, summariseBreachClock } from "@/lib/server/compliance/breachRegister";
import { isHipaaTrackEnabled, listLegalDocuments } from "@/server/legalDocuments";
import { getState } from "@/server/storage";
import { listTradingCompanies, recordBelongsToCompany } from "@/server/tradingCompanies";
import { listWebsiteEnquiries } from "@/lib/server/websiteEnquiries";

/**
 * Gathers the REAL evidence behind the compliance posture.
 *
 * Every number here comes from something the app actually stores. Nothing is
 * assumed, and when a source cannot be read the posture is told so explicitly
 * (`unreadable`) so the control goes `blind` rather than quietly passing.
 */

/**
 * Facts about the erasure implementation that live in engineering documentation
 * rather than in the data store.
 *
 * These are hand-maintained on purpose — but not on trust:
 * `scripts/smoke-compliance-posture.test.ts` reads
 * `docs/compliance/erasure-dpo-pack.md` and fails if `openReviewQuestions`
 * drifts from the questions actually outstanding in it, and if the pack ever
 * stops saying the live scrub is unverified while this still claims it is.
 *
 * `signedOff` and `liveRunVerified` are the two that make the difference
 * between `partial` and `met`, and both are false because both are true-false
 * statements about the world, not about the code. Flip them only when the thing
 * has actually happened.
 */
export const ERASURE_EVIDENCE: ErasureEvidence = {
  implemented: true,
  reviewPackPresent: true,
  openReviewQuestions: 8,
  signedOff: false,
  liveRunVerified: false,
};

export interface CompliancePostureOptions {
  agencyId: string;
  /** `null` = the agency-wide / shared scope. */
  companyId?: string | null;
  now?: number;
}

export async function buildCompliancePostureForAgency(options: CompliancePostureOptions): Promise<CompliancePosture> {
  const { agencyId } = options;
  const companyId = options.companyId ?? null;
  const now = options.now ?? Date.now();
  const state = getState();

  const company = companyId ? listTradingCompanies(agencyId, true).find(item => item.id === companyId) ?? null : null;
  const companyName = company?.name ?? "Agency-wide";

  const legalRecords: LegalRecordEvidence[] = listLegalDocuments(agencyId)
    .filter(document => recordBelongsToCompany(document.companyIds, companyId))
    .map(document => ({
      id: document.id,
      title: document.title,
      category: document.category,
      status: document.status,
      counterparty: document.counterparty,
      reference: document.reference,
      effectiveAt: document.effectiveAt,
      expiresAt: document.expiresAt,
    }));

  const activity = state.activity.filter(entry => entry.agencyId === agencyId);

  const input: ComplianceEvidenceInput = {
    now,
    companyId,
    companyName,
    hipaa: {
      enabled: isHipaaTrackEnabled(agencyId, companyId),
      source: isHipaaTrackEnabled(agencyId, companyId)
        ? "Switched on by a recorded PHI scope declaration for this company."
        : "Off. This company has no recorded PHI scope declaration.",
    },
    legalRecords,
    consent: await gatherConsentEvidence(agencyId),
    erasure: ERASURE_EVIDENCE,
    breaches: gatherBreachEvidence(agencyId, companyId, now),
    audit: {
      activityEntries: activity.length,
      latestAt: activity.reduce<number | null>((latest, entry) => (latest === null || entry.ts > latest ? entry.ts : latest), null),
    },
  };

  return buildCompliancePosture(input);
}

/**
 * The breach register, scoped and counted.
 *
 * Scoped on the SAME primitive as the legal register above, so a company's
 * posture cannot be answered out of another brand's incident — an incident
 * with no company is a shared/agency-level one and stays visible under every
 * scope.
 *
 * The try/catch is not decoration. If the store cannot be read, this returns
 * `registerAvailable: false` and the control goes `blind`. A register that
 * could not be read produces exactly the same zeroes as a clean one, and the
 * one thing this posture must never do is report "no breaches" because it
 * could not look.
 */
export function gatherBreachEvidence(agencyId: string, companyId: string | null, now: number): BreachEvidence {
  try {
    const scoped = listBreachIncidents(agencyId)
      .filter(incident => recordBelongsToCompany(incident.companyId ? [incident.companyId] : [], companyId));
    const clock = summariseBreachClock(scoped, now);
    return {
      registerAvailable: true,
      total: clock.total,
      open: clock.open,
      awaitingAssessment: clock.awaitingAssessment,
      overdue: clock.overdue,
      notifiedLate: clock.notifiedLate,
    };
  } catch {
    return { registerAvailable: false, total: 0, open: 0, awaitingAssessment: 0, overdue: 0, notifiedLate: 0 };
  }
}

/**
 * What the Aqua Tag and the enquiry pipeline have actually captured.
 *
 * The enquiry store is hosted, so it can be unavailable. When it is, the result
 * says `unreadable` and the consent control reports itself blind — the one
 * thing it must never do is report "no problems found" because it could not
 * look.
 */
async function gatherConsentEvidence(agencyId: string): Promise<ConsentEvidence> {
  const state = getState();
  const siteConfigs = Object.values(state.websiteSiteConfigs ?? {}).filter(config => config.agencyId === agencyId);
  const sitesGatingOnConsent = siteConfigs.filter(config =>
    config.injections.some(injection => injection.enabled && injection.consentCategory !== "necessary")).length;

  const base = {
    taggedSites: siteConfigs.length,
    sitesGatingOnConsent,
  };

  try {
    const enquiries = await listWebsiteEnquiries(agencyId, 500);
    const withConsent = enquiries.filter(enquiry => enquiry.consent !== undefined && enquiry.consent !== null);
    const withVersion = enquiries.filter(enquiry => typeof enquiry.consentVersion === "number");
    const stamps = enquiries
      .map(enquiry => enquiry.consentCapturedAt)
      .filter((value): value is number => typeof value === "number" && value > 0);
    return {
      ...base,
      enquiriesTotal: enquiries.length,
      enquiriesWithConsent: withConsent.length,
      enquiriesWithVersion: withVersion.length,
      latestConsentAt: stamps.length ? Math.max(...stamps) : null,
      unreadable: false,
    };
  } catch {
    return {
      ...base,
      enquiriesTotal: 0,
      enquiriesWithConsent: 0,
      enquiriesWithVersion: 0,
      latestConsentAt: null,
      unreadable: true,
    };
  }
}
