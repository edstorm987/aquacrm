/**
 * Compliance posture — the KNOW side of the compliance & legal plan.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HONESTY RULE (non-negotiable, copied from the plan)
 *
 *   The app CANNOT make anyone compliant. It provides controls, evidence, and a
 *   truthful posture with the gaps named. Never assume or claim compliance;
 *   verify from real evidence. True GDPR/HIPAA also needs BAAs, policies and
 *   legal sign-off that the code can only TRACK, never CONFER.
 *
 * That rule is enforced structurally in this file, not just written in a comment:
 *
 *   1. There is no boolean "compliant" anywhere in this model, and no score that
 *      could be mistaken for one.
 *   2. Every control that is NOT `met` must carry a non-empty `gap` — the answer
 *      to "what is still missing here".
 *   3. Every control that IS `met` must carry a non-empty `evidenceLimit` — the
 *      answer to "what does this green actually prove?". A document being in the
 *      register proves a record exists, not that its contents are adequate.
 *   4. A control whose `conferredBy` is `"human"` can never be `met` on app data
 *      alone. The best it can reach is `partial` — "tracked, not conferred".
 *   5. Absence of a signal is `blind`, never a pass. Same discipline as Radar.
 *
 * `assertPostureHonesty` below re-checks 2–4 over a built posture so the rules
 * are testable rather than aspirational.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module is deliberately pure (no `server-only`, no state access) so both
 * the API route and the client panel can share exactly one definition of what a
 * control is and when it counts as evidenced. Evidence gathering lives in
 * `lib/server/compliancePostureSource.ts`.
 */

export type ComplianceFrameworkId = "gdpr" | "hipaa";

/**
 * Who can actually satisfy a control.
 *
 * - `app`      — the software itself implements it, so the software can prove it.
 * - `evidence` — the software can only prove it by holding a current document.
 * - `human`    — the software can NEVER confer it. A signature, a legal opinion,
 *                a training session. The app tracks that a human did it; the
 *                doing is outside the app. These can never read as `met`.
 */
export type ControlConferrer = "app" | "evidence" | "human";

/**
 * `met` is the strongest word this model uses. It means "the evidence this
 * control asks for is present and current" — never "compliant".
 */
export type ControlStatus = "met" | "partial" | "missing" | "blind";

export interface ComplianceControl {
  id: string;
  framework: ComplianceFrameworkId;
  /** Grouping shown in the UI, e.g. "Lawful basis", "Subject rights". */
  group: string;
  title: string;
  /** What would have to be true for this to be `met`. */
  requirement: string;
  conferredBy: ControlConferrer;
  status: ControlStatus;
  /** Real, checkable facts this status was derived from. Never invented. */
  evidence: string[];
  /** Required when status !== "met": what is still missing here. */
  gap: string;
  /** Required when status === "met": what this green does NOT prove. */
  evidenceLimit: string;
  /** Where in the app to go and do something about it, when there is somewhere. */
  href?: string;
}

export interface ComplianceControlGroup {
  group: string;
  controls: ComplianceControl[];
}

export interface CompliancePostureSummary {
  /** Counts by status. There is deliberately no aggregate percentage. */
  met: number;
  partial: number;
  missing: number;
  blind: number;
  total: number;
  /** Controls no amount of software can satisfy on its own. */
  humanOnly: number;
  /**
   * The one sentence Ed reads first. Written so it can never be quoted as a
   * compliance claim.
   */
  headline: string;
}

export interface CompliancePosture {
  generatedAt: number;
  companyId: string | null;
  companyName: string;
  frameworks: FrameworkState[];
  groups: ComplianceControlGroup[];
  summary: CompliancePostureSummary;
  /**
   * Shown verbatim on the surface. Present on every posture, in every state.
   */
  disclaimer: string;
}

export interface FrameworkState {
  id: ComplianceFrameworkId;
  label: string;
  /** GDPR is always on. HIPAA is an optional per-company track. */
  enabled: boolean;
  /** `always-on` for GDPR; for HIPAA, how it came to be on (or off). */
  source: string;
  /**
   * The sentence that stops the track being read as a compliance stamp.
   * Non-empty for every framework, always.
   */
  honesty: string;
}

/**
 * Third parties the codebase actually integrates with, taken from §9 of the
 * DPO review pack (docs/compliance/erasure-dpo-pack.md). Listing one here is
 * NOT a statement that it is contracted or live — it is the list of paperwork
 * to go and check.
 */
export interface SubprocessorExpectation {
  id: string;
  name: string;
  purpose: string;
  /** Personal data reaches it, so a GDPR Art. 28 processor agreement is needed. */
  personalData: boolean;
  /** PHI could reach it, so a HIPAA business associate agreement is needed. */
  phi: boolean;
  /** Aliases matched (case-insensitively) against a legal record's counterparty. */
  match: string[];
}

export const SUBPROCESSOR_EXPECTATIONS: readonly SubprocessorExpectation[] = [
  { id: "supabase", name: "Supabase", purpose: "Primary hosted database — enquiries, inbox, consent events", personalData: true, phi: true, match: ["supabase"] },
  { id: "vercel", name: "Vercel", purpose: "Hosting and blob storage for uploaded media", personalData: true, phi: true, match: ["vercel"] },
  { id: "stripe", name: "Stripe", purpose: "Payments", personalData: true, phi: false, match: ["stripe"] },
  { id: "postmark", name: "Postmark / SMTP", purpose: "Outbound email — message content leaves the system on send", personalData: true, phi: true, match: ["postmark", "smtp", "resend"] },
  { id: "openai", name: "OpenAI", purpose: "Assistant features (only when a key is configured)", personalData: true, phi: true, match: ["openai"] },
] as const;

/** Everything the posture builder needs, gathered from real state by the source module. */
export interface ComplianceEvidenceInput {
  now: number;
  companyId: string | null;
  companyName: string;
  /** HIPAA on/off for THIS company, and where that decision is recorded. */
  hipaa: { enabled: boolean; source: string };
  legalRecords: LegalRecordEvidence[];
  consent: ConsentEvidence;
  erasure: ErasureEvidence;
  breaches: BreachEvidence;
  audit: { activityEntries: number; latestAt: number | null };
}

/**
 * The breach register at a glance (GDPR Art. 33/34).
 *
 * These are counts off the real register in `lib/server/compliance/
 * breachRegister.ts`, not a hand-maintained claim. `registerAvailable` exists
 * so that a reader who cannot reach the store gets `blind` rather than the
 * much worse "zero breaches" — an unreadable register and a clean one produce
 * identical zeroes, and only one of them is good news.
 */
export interface BreachEvidence {
  registerAvailable: boolean;
  total: number;
  open: number;
  /** The Art. 33(1) risk decision has not been recorded yet. */
  awaitingAssessment: number;
  /** Past 72 hours from discovery with no supervisory notification recorded. */
  overdue: number;
  /** Notified, but after the deadline. A fact that never expires. */
  notifiedLate: number;
}

/** A legal-register record, narrowed to the fields the posture reads. */
export interface LegalRecordEvidence {
  id: string;
  title: string;
  category: string;
  status: string;
  counterparty?: string;
  reference?: string;
  effectiveAt?: number;
  expiresAt?: number;
}

export interface ConsentEvidence {
  /** Enquiries carrying an explicit consent decision, out of how many. */
  enquiriesTotal: number;
  enquiriesWithConsent: number;
  enquiriesWithVersion: number;
  latestConsentAt: number | null;
  /** Tagged sites, and how many gate any third-party tool on consent. */
  taggedSites: number;
  sitesGatingOnConsent: number;
  /** True when the consent source could not be read at all (offline/unhydrated). */
  unreadable: boolean;
}

export interface ErasureEvidence {
  /** The right-to-erasure machinery exists in code and is exercised by tests. */
  implemented: boolean;
  /** A reviewer-ready pack has been written. */
  reviewPackPresent: boolean;
  /** Questions in that pack still awaiting a DPO/solicitor ruling. */
  openReviewQuestions: number;
  /** A named human has signed the framework off. The app can only track this. */
  signedOff: boolean;
  /** The hosted-database scrub has been run against a real (throwaway) record. */
  liveRunVerified: boolean;
}

const DAY = 86_400_000;

export const COMPLIANCE_DISCLAIMER =
  "This is a posture, not a compliance statement. AquaCRM cannot make you compliant — "
  + "it holds controls and evidence and names what is missing. Whether these choices are "
  + "lawful, and for how long, is a decision for a DPO or solicitor.";

export const HIPAA_HONESTY =
  "Turning this track on does NOT make you HIPAA compliant and does not change what the "
  + "app is allowed to do with PHI. It switches on a checklist that tracks each requirement "
  + "and its evidence. The parts that matter most — signed BAAs with every subprocessor, a "
  + "risk assessment, workforce training, legal sign-off — happen outside this software and "
  + "can only ever be recorded here.";

export const GDPR_HONESTY =
  "GDPR applies whether or not it is switched on, so it always is. What follows is what the "
  + "app can see of your position — not an assessment of it.";

export function buildCompliancePosture(input: ComplianceEvidenceInput): CompliancePosture {
  const controls = [
    ...buildGdprControls(input),
    ...(input.hipaa.enabled ? buildHipaaControls(input) : []),
  ].map(normaliseControl);

  const groups: ComplianceControlGroup[] = [];
  for (const control of controls) {
    const existing = groups.find(group => group.group === control.group);
    if (existing) existing.controls.push(control);
    else groups.push({ group: control.group, controls: [control] });
  }

  const met = controls.filter(control => control.status === "met").length;
  const partial = controls.filter(control => control.status === "partial").length;
  const missing = controls.filter(control => control.status === "missing").length;
  const blind = controls.filter(control => control.status === "blind").length;
  const humanOnly = controls.filter(control => control.conferredBy === "human").length;

  return {
    generatedAt: input.now,
    companyId: input.companyId,
    companyName: input.companyName,
    frameworks: [
      { id: "gdpr", label: "UK GDPR / data protection", enabled: true, source: "always-on", honesty: GDPR_HONESTY },
      { id: "hipaa", label: "HIPAA readiness track", enabled: input.hipaa.enabled, source: input.hipaa.source, honesty: HIPAA_HONESTY },
    ],
    groups,
    summary: {
      met,
      partial,
      missing,
      blind,
      total: controls.length,
      humanOnly,
      headline: `${met} of ${controls.length} controls have current evidence in the app. `
        + `${partial} are partly evidenced, ${missing} have none, and ${blind} cannot be seen from here. `
        + `${humanOnly} of them can never be satisfied by software at all. This is not a compliance claim.`,
    },
    disclaimer: COMPLIANCE_DISCLAIMER,
  };
}

/**
 * Enforces the honesty rules as code. Exported so tests assert them over a real
 * posture rather than trusting the builder.
 *
 * Returns the list of violations — empty means the posture is honest by these
 * rules. It deliberately does not throw: a caller may want to render the
 * violations rather than blow up a page.
 */
export function assertPostureHonesty(posture: CompliancePosture): string[] {
  const problems: string[] = [];
  for (const group of posture.groups) {
    for (const control of group.controls) {
      if (control.status !== "met" && !control.gap.trim()) {
        problems.push(`${control.id}: status "${control.status}" with no stated gap.`);
      }
      if (control.status === "met" && !control.evidenceLimit.trim()) {
        problems.push(`${control.id}: reads as met without saying what that does not prove.`);
      }
      if (control.status === "met" && control.conferredBy === "human") {
        problems.push(`${control.id}: a human-conferred control can never read as met.`);
      }
    }
  }
  if (/\bcompliant\b/i.test(posture.summary.headline) && !/not a compliance claim/i.test(posture.summary.headline)) {
    problems.push("summary.headline reads as a compliance claim.");
  }
  for (const framework of posture.frameworks) {
    if (!framework.honesty.trim()) problems.push(`${framework.id}: framework has no honesty statement.`);
  }
  return problems;
}

/**
 * A human-conferred control is capped at `partial` no matter how good the
 * evidence looks, and a control with no stated gap is downgraded to `blind`
 * rather than silently reading as a pass.
 */
function normaliseControl(control: ComplianceControl): ComplianceControl {
  if (control.status === "met" && control.conferredBy === "human") {
    return {
      ...control,
      status: "partial",
      gap: control.gap || "Recorded in the app, but the app cannot confer this — a human has to have actually done it.",
    };
  }
  if (control.status !== "met" && !control.gap.trim()) {
    return { ...control, status: "blind", gap: "No gap was stated for this control, so it is treated as unseen rather than as a pass." };
  }
  return control;
}

// ─── GDPR ────────────────────────────────────────────────────────────────────

function buildGdprControls(input: ComplianceEvidenceInput): ComplianceControl[] {
  const { now, legalRecords, consent, erasure, audit } = input;
  const current = (record: LegalRecordEvidence) => record.status !== "archived"
    && record.status !== "expired"
    && !(record.expiresAt && record.expiresAt < now);

  const policyMatching = (pattern: RegExp) => legalRecords.filter(record =>
    record.category === "policy" && pattern.test(`${record.title} ${record.reference ?? ""}`));

  const privacyPolicies = policyMatching(/privacy|data protection/i);
  const currentPrivacy = privacyPolicies.filter(current);
  const cookiePolicies = policyMatching(/cookie/i);
  const currentCookie = cookiePolicies.filter(current);
  const retentionPolicies = policyMatching(/retention|schedule/i).filter(current);
  const ropaRecords = legalRecords.filter(record => /ropa|record[s]? of processing|processing map/i.test(`${record.title} ${record.reference ?? ""}`)).filter(current);
  const breachRecords = legalRecords.filter(record => /breach|incident/i.test(`${record.title} ${record.reference ?? ""}`));

  const controls: ComplianceControl[] = [];

  // ── Lawful basis & transparency ──
  controls.push(expiryAware({
    id: "gdpr.privacy-policy",
    framework: "gdpr",
    group: "Lawful basis & transparency",
    title: "Published privacy notice",
    requirement: "A current privacy notice is held in the legal register, in date, telling people what you do with their data.",
    conferredBy: "evidence",
    status: currentPrivacy.length ? "met" : privacyPolicies.length ? "partial" : "missing",
    evidence: privacyPolicies.length
      ? privacyPolicies.map(record => describeRecord(record, now))
      : ["No policy record in the legal register matches a privacy notice."],
    gap: currentPrivacy.length
      ? ""
      : privacyPolicies.length
        ? "A privacy notice is on file but it is expired or archived. Replace it with a current version."
        : "No privacy notice is recorded. Add one to the legal register (category: policy) so there is something to point at.",
    evidenceLimit: "Proves a document exists and is in date. The app has not read it and cannot tell you whether it describes what the system actually does.",
    href: "/portal/agency/company?view=legal",
  }, currentPrivacy, now));

  controls.push({
    id: "gdpr.cookie-policy",
    framework: "gdpr",
    group: "Lawful basis & transparency",
    title: "Cookie policy matched to the consent banner",
    requirement: "A current cookie policy is on file, and the Aqua Tag is actually gating tools on consent.",
    conferredBy: "evidence",
    status: currentCookie.length && consent.sitesGatingOnConsent > 0 ? "met"
      : currentCookie.length || consent.sitesGatingOnConsent > 0 ? "partial"
        : consent.taggedSites === 0 ? "blind" : "missing",
    evidence: [
      currentCookie.length ? `${currentCookie.length} current cookie policy record${currentCookie.length === 1 ? "" : "s"} in the legal register.` : "No current cookie policy in the legal register.",
      consent.taggedSites
        ? `${consent.sitesGatingOnConsent} of ${consent.taggedSites} tagged site${consent.taggedSites === 1 ? "" : "s"} gate a third-party tool on the visitor's consent.`
        : "No tagged sites are configured, so there is nothing to gate.",
    ],
    gap: currentCookie.length && consent.sitesGatingOnConsent > 0
      ? ""
      : consent.taggedSites === 0
        ? "No site is tagged, so the app cannot see whether cookies are being set or gated anywhere."
        : !currentCookie.length
          ? "No current cookie policy is recorded, so the banner is asking for consent against nothing written down."
          : "A cookie policy exists but no tagged site gates any tool on consent — either nothing needs gating, or the gating is not switched on.",
    evidenceLimit: "Proves a policy record exists and that at least one tool is configured behind a consent category. It does not prove the banner's wording is adequate, nor that every tag on the page respects it.",
    href: "/portal/agency/company?view=legal",
  });

  controls.push({
    id: "gdpr.consent-ledger",
    framework: "gdpr",
    group: "Lawful basis & transparency",
    title: "Consent captured as an auditable record",
    requirement: "Where consent is the basis, each enquiry carries the decision, the purpose and the version of the wording consented to.",
    conferredBy: "app",
    status: consent.unreadable ? "blind"
      : consent.enquiriesTotal === 0 ? "blind"
        : consent.enquiriesWithVersion === consent.enquiriesWithConsent && consent.enquiriesWithConsent === consent.enquiriesTotal ? "met"
          : consent.enquiriesWithConsent > 0 ? "partial" : "missing",
    evidence: consent.unreadable
      ? ["The enquiry store could not be read, so consent capture could not be checked."]
      : [
        `${consent.enquiriesWithConsent} of ${consent.enquiriesTotal} enquiries carry an explicit consent decision.`,
        `${consent.enquiriesWithVersion} carry the version of the wording consented to.`,
        consent.latestConsentAt ? `Most recent consent captured ${Math.round((now - consent.latestConsentAt) / DAY)} days ago.` : "No consent timestamp recorded yet.",
      ],
    gap: consent.unreadable
      ? "The enquiry store could not be read. Until it can, treat consent capture as unknown, not as working."
      : consent.enquiriesTotal === 0
        ? "There are no enquiries yet, so there is no consent evidence either way. This is unseen, not clean."
        : consent.enquiriesWithVersion < consent.enquiriesTotal
          ? `${consent.enquiriesTotal - consent.enquiriesWithVersion} ${consent.enquiriesTotal - consent.enquiriesWithVersion === 1 ? "enquiry has" : "enquiries have"} no consent version, so you cannot show what wording those people agreed to.`
          : "",
    evidenceLimit: "Proves a decision was stored against each enquiry. It does not prove the wording was adequate, nor that consent was freely given.",
    href: "/portal/agency/inbox",
  });

  // ── Records of processing ──
  controls.push({
    id: "gdpr.ropa",
    framework: "gdpr",
    group: "Records of processing",
    title: "Records of processing activities (ROPA)",
    requirement: "A map of what personal data is held, where, on what lawful basis, and for how long — held as a record, not just as engineering notes.",
    conferredBy: "evidence",
    status: ropaRecords.length ? "met" : "missing",
    evidence: ropaRecords.length
      ? ropaRecords.map(record => describeRecord(record, now))
      : [
        "No ROPA record is in the legal register.",
        "A partial data map does exist as engineering documentation (docs/workspace/database.md and §3 of the erasure DPO pack) — but it is not a maintained ROPA and nothing in the app tracks its freshness.",
      ],
    gap: ropaRecords.length ? "" : "There is no ROPA. The erasure DPO pack covers one process (erasure) across one set of tables; it is the first slice, not the map.",
    evidenceLimit: "Proves a ROPA record is on file and in date. The app cannot check that it still matches the data the system actually holds.",
    href: "/portal/agency/company?view=legal",
  });

  controls.push({
    id: "gdpr.retention",
    framework: "gdpr",
    group: "Records of processing",
    title: "Retention policy with an end date",
    requirement: "Each category of personal data has a stated retention period, and something actually enforces it.",
    conferredBy: "evidence",
    status: retentionPolicies.length ? "partial" : "missing",
    evidence: [
      retentionPolicies.length
        ? `${retentionPolicies.length} retention policy record${retentionPolicies.length === 1 ? "" : "s"} in the legal register.`
        : "No retention policy record in the legal register.",
      "An expiry mechanism exists (`retention.ts`) covering the activity log, the DSAR register and enquiry notices, with a preview that counts before anything is deleted.",
      "Every period is UNSET by default and unset means keep forever, so the control changes nothing until a number is chosen — a sweep that shipped with defaults would have started deleting on a schedule nobody picked.",
      "An OPEN subject request never expires however old: it is still running a statutory clock, and age is not the same as being finished with.",
      "Still unexpired by anything: the erasure policy's RETAIN set (finance, contracts, deliverable proof, the erasure audit) — question Q1 in the DPO pack, and a legal answer rather than a default this app may choose.",
    ],
    gap: retentionPolicies.length
      ? "The enforcing mechanism exists, but no PERIOD has been chosen for any category — so it is still keep-forever in practice. Set the days per category, preview what that would remove, then enable it."
      : "Indefinite retention. The mechanism to expire data now exists and is off until a number is set, but nothing is recorded in the legal register saying what the periods should BE — the stated-policy half of Art. 5(1)(e) is still missing.",
    evidenceLimit: "",
    href: "/portal/agency/company?view=legal",
  });

  // ── Subject rights ──
  controls.push({
    id: "gdpr.right-to-erasure",
    framework: "gdpr",
    group: "Subject rights",
    title: "Right to erasure (Art. 17)",
    requirement: "Erasure can actually be carried out across the app, its plugins and the hosted database, and leaves a no-PII audit record.",
    conferredBy: "app",
    status: erasure.implemented && erasure.liveRunVerified && erasure.signedOff ? "met"
      : erasure.implemented ? "partial" : "missing",
    evidence: [
      erasure.implemented
        ? "Implemented: a per-client erasure sweep covers the app store, plugin-owned storage and the hosted tables, under a delete / anonymise / retain disposition policy, with one no-PII audit record surviving."
        : "No erasure machinery found.",
      erasure.reviewPackPresent
        ? "A reviewer-ready pack exists at docs/compliance/erasure-dpo-pack.md, written so a DPO can check the claims rather than take our word for them."
        : "No reviewer pack has been written.",
      erasure.liveRunVerified
        ? "The hosted-database scrub has been run against a real throwaway record."
        : "The hosted-database scrub has NEVER been run against the live database — it is proven against a faithful fake only.",
    ],
    gap: erasure.implemented && erasure.liveRunVerified && erasure.signedOff
      ? ""
      : [
        !erasure.liveRunVerified ? "the hosted-database scrub has never been run for real" : "",
        erasure.openReviewQuestions > 0 ? `${erasure.openReviewQuestions} questions in the DPO pack are still unanswered` : "",
        !erasure.signedOff ? "no DPO or solicitor has signed the disposition policy off" : "",
        "backups and point-in-time recovery are unaddressed — a restore would resurrect erased records",
        "data already sent to a subprocessor is not reached by the erasure button",
      ].filter(Boolean).join("; ") + ".",
    evidenceLimit: "Proves the sweep does what the tests say it does. It does not prove the disposition policy is the lawful one.",
    href: "/portal/clients",
  });

  controls.push({
    id: "gdpr.dsar-intake",
    framework: "gdpr",
    group: "Subject rights",
    title: "DSAR intake and the statutory clock",
    requirement: "A place to log that a request arrived, verify who is asking, and track the response deadline.",
    conferredBy: "app",
    status: "partial",
    evidence: [
      "The DSAR register records each request against the right exercised, who asked, and when it was RECEIVED — the clock runs from receipt, not from data entry, so a request logged days after it arrived is already that far into its month.",
      "Art. 12(3) is enforced as a stored deadline: one calendar month, clamped at month-end so 31 Jan + 1 month lands on 28 Feb rather than rolling into March and handing back time the rule does not allow.",
      "Art. 12(6) is enforced as a SEQUENCE, not a prompt: `fulfilSubjectRequest` throws `identity_unverified` until identity has been checked, and the verification timestamp is write-once so it cannot be quietly reassigned.",
      "One extension is allowed, requires a written reason, and runs from the ORIGINAL deadline — extending from today would reward answering late.",
      "`subjectRequestClock` reports open / overdue / due-within-7-days / awaiting-identity. Pinned by smoke-subject-requests.",
      "Surfaced on the Governance workspace under Subject requests: the clock, every request with its due date, and overdue ones marked — so a deadline is visible without going looking for it.",
    ],
    gap: "The register, its clock and the screen that surfaces them all exist. What is still missing is INTAKE: requests arrive by email and are logged by hand, so the register is only as complete as somebody's diligence. Choosing an intake channel — a form, a monitored address — is the remaining half.",
    evidenceLimit: "",
  });

  controls.push({
    id: "gdpr.dsar-access",
    framework: "gdpr",
    group: "Subject rights",
    title: "Subject access and portability",
    requirement: "A person's data can be exported and handed to them in a usable form.",
    conferredBy: "app",
    status: "partial",
    evidence: [
      "POST /api/portal/governance/subject-access exports everything held about one person, as JSON (Art. 20 asks for a structured, machine-readable format).",
      "It searches EVERY collection in state rather than a maintained list, so a collection added later cannot be silently absent from an export — pinned by smoke-subject-access-export.",
      "Only the caller's own agency's records are included; matches that carry no agencyId are reported as unattributable rather than dropped or leaked.",
      "Each fulfilment is written to the activity log, naming the subject by id only so no address enters the audit trail.",
    ],
    gap: "The export exists and is complete; what is still missing around it is the REQUEST side — no identity-verification step before releasing someone's data, and no response clock against the one-month deadline. Fulfilment is evidenced; receipt is not.",
    evidenceLimit: "",
  });

  // ── Processors & incidents ──
  for (const processor of SUBPROCESSOR_EXPECTATIONS.filter(item => item.personalData)) {
    controls.push(processorAgreementControl(processor, "gdpr", legalRecords, now, {
      group: "Processors",
      kind: "data processing agreement",
      pattern: /\bdpa\b|data processing|processor agreement/i,
      note: "Art. 28 requires a written contract with every processor.",
    }));
  }

  controls.push(breachRegisterControl(input, breachRecords, now));

  controls.push({
    id: "gdpr.audit-trail",
    framework: "gdpr",
    group: "Incidents",
    title: "Audit trail of who did what",
    requirement: "Actions across the workspace are logged with an actor and a timestamp.",
    conferredBy: "app",
    status: audit.activityEntries > 0 ? "met" : "blind",
    evidence: audit.activityEntries > 0
      ? [`${audit.activityEntries} activity entries recorded for this agency.`,
        audit.latestAt ? `Most recent entry ${Math.round((now - audit.latestAt) / DAY)} days ago.` : "No timestamp on the most recent entry."]
      : ["No activity entries found for this agency, so the audit trail cannot be confirmed to be working."],
    gap: audit.activityEntries > 0 ? "" : "No activity has been logged. That may mean a new workspace, or it may mean logging is not reaching this agency — it is unseen, not clean.",
    evidenceLimit: "Proves actions are being written to a log. It does not prove the log is tamper-evident, retained for any particular period, or complete — nothing checks for gaps.",
    href: "/portal/agency/settings#logs",
  });

  return controls;
}

// ─── HIPAA ───────────────────────────────────────────────────────────────────

function buildHipaaControls(input: ComplianceEvidenceInput): ComplianceControl[] {
  const { now, legalRecords } = input;
  const controls: ComplianceControl[] = [];

  // The gating reality first, so it is the first thing read on the track.
  for (const processor of SUBPROCESSOR_EXPECTATIONS.filter(item => item.phi)) {
    controls.push(processorAgreementControl(processor, "hipaa", legalRecords, now, {
      group: "Business associate agreements",
      kind: "business associate agreement (BAA)",
      pattern: /\bbaa\b|business associate/i,
      note: "None of these providers offer a BAA by default. This is the gating reality of the whole track.",
    }));
  }

  const humanControl = (id: string, group: string, title: string, requirement: string, evidence: string[], gap: string, href?: string): ComplianceControl => ({
    id, framework: "hipaa", group, title, requirement,
    conferredBy: "human",
    // Deliberately never `met` — normaliseControl would cap it anyway.
    status: "partial",
    evidence, gap, evidenceLimit: "", href,
  });

  const documented = (pattern: RegExp) => legalRecords.filter(record =>
    pattern.test(`${record.title} ${record.reference ?? ""}`)
    && record.status !== "archived" && record.status !== "expired"
    && !(record.expiresAt && record.expiresAt < now));

  const riskAssessments = documented(/risk assessment|risk analysis/i);
  const hipaaPolicies = documented(/hipaa|phi|protected health/i).filter(record => record.category === "policy");
  const training = documented(/training/i);

  controls.push(humanControl(
    "hipaa.risk-assessment",
    "Administrative safeguards",
    "Security risk assessment",
    "A written risk analysis covering every system that touches PHI, reviewed periodically.",
    riskAssessments.length
      ? riskAssessments.map(record => describeRecord(record, now))
      : ["No risk assessment record is on file."],
    riskAssessments.length
      ? "A record is on file. The app cannot tell you whether the analysis is adequate, current in substance, or covers the systems actually in use — only a human can."
      : "No risk assessment has been done or recorded. This is a prerequisite for the rest of the track, not an item to work through later.",
    "/portal/agency/company?view=legal",
  ));

  controls.push(humanControl(
    "hipaa.policies",
    "Administrative safeguards",
    "Written policies and procedures",
    "Documented policies covering access, minimum-necessary use, incident response and sanctions.",
    hipaaPolicies.length
      ? hipaaPolicies.map(record => describeRecord(record, now))
      : ["No HIPAA/PHI policy record is on file."],
    hipaaPolicies.length
      ? "Policy records exist. The app has not read them and cannot judge whether they cover what is required."
      : "No PHI policies are recorded.",
    "/portal/agency/company?view=legal",
  ));

  controls.push(humanControl(
    "hipaa.training",
    "Administrative safeguards",
    "Workforce training",
    "Everyone who can reach PHI has been trained, with a record of when.",
    training.length ? training.map(record => describeRecord(record, now)) : ["No training record is on file."],
    training.length
      ? "A record exists but the app cannot confirm who attended, or that everyone with access is covered."
      : "No training has been recorded. The app does not know who can reach PHI, so it cannot even tell you who would need it.",
    "/portal/agency/company?view=legal",
  ));

  controls.push({
    id: "hipaa.access-audit",
    framework: "hipaa",
    group: "Technical safeguards",
    title: "Access control and PHI access audit",
    requirement: "Access to PHI is restricted to those who need it, and every access is logged and reviewable.",
    conferredBy: "app",
    status: "partial",
    evidence: [
      "Role and agency scope are enforced on server mutations, and a general activity log exists.",
      "There is no PHI-specific access control, no marking of which records are PHI, and no audit of reads — only of actions.",
    ],
    gap: "Nothing in the app knows which data is PHI, so 'who looked at this patient's record' cannot be answered. Read access is not audited at all.",
    evidenceLimit: "",
    href: "/portal/agency/settings#logs",
  });

  controls.push({
    id: "hipaa.encryption",
    framework: "hipaa",
    group: "Technical safeguards",
    title: "Encryption in transit and at rest",
    requirement: "PHI is encrypted travelling to the app and while stored, including in uploads and backups.",
    conferredBy: "app",
    status: "blind",
    evidence: [
      "Transport encryption is provided by the hosting platform for traffic to the app.",
      "Encryption at rest depends on the hosted database and blob storage configuration. This build does not verify it, so it is not claimed.",
    ],
    gap: "The app cannot see how its own storage is configured. Until someone confirms encryption at rest — including uploaded documents and database backups — treat this as unknown rather than done.",
    evidenceLimit: "",
  });

  controls.push({
    id: "hipaa.minimum-necessary",
    framework: "hipaa",
    group: "Technical safeguards",
    title: "Minimum necessary and automatic logoff",
    requirement: "Users see only the PHI their job needs, and idle sessions end on their own.",
    conferredBy: "app",
    status: "missing",
    evidence: ["No minimum-necessary filtering and no PHI-aware session timeout exist in the app today."],
    gap: "Both are unbuilt. Neither is hard to add, but neither is present, and the track should not read as if they were.",
    evidenceLimit: "",
  });

  controls.push(humanControl(
    "hipaa.legal-signoff",
    "Sign-off",
    "Legal sign-off that the track is adequate",
    "A named solicitor or compliance adviser has reviewed the arrangement and said so in writing.",
    ["The app can record that this happened. It can never be the thing that happened."],
    "No sign-off recorded. Everything above can be green and you would still not be HIPAA compliant without this and the BAAs.",
    "/portal/agency/company?view=legal",
  ));

  return controls;
}

// ─── shared helpers ──────────────────────────────────────────────────────────

/**
 * GDPR Art. 33/34 — the breach register and its 72-hour clock.
 *
 * This control used to be permanently `missing`, because there was nothing to
 * read: it regex-matched `/breach|incident/` over legal-document titles, which
 * meant a policy PDF called "Incident response" was the closest thing the
 * posture had to a register. Now it reads the real register.
 *
 * The ladder is deliberate and it never rests on "no news is good news":
 *
 *   blind   — the register could not be read. Zero incidents and an
 *             unreadable store look identical, so they must not report
 *             identically.
 *   partial — a deadline has been missed, or a decision is still owed.
 *   met     — the register exists and nothing on it is overdue or undecided,
 *             with the evidenceLimit saying plainly that this is a statement
 *             about the RECORDS, not about whether a breach happened.
 */
function breachRegisterControl(
  input: ComplianceEvidenceInput,
  legacyRecords: LegalRecordEvidence[],
  now: number,
): ComplianceControl {
  const { breaches } = input;
  const base = {
    id: "gdpr.breach-register",
    framework: "gdpr" as const,
    group: "Incidents",
    title: "Breach register and the 72-hour clock",
    requirement: "An incident can be recorded — what data, who was told, when — against the 72-hour notification deadline (Art. 33), with the decision not to notify documented (Art. 33(5)).",
    conferredBy: "app" as const,
    href: "/portal/agency/governance?view=breaches",
  };

  if (!breaches.registerAvailable) {
    return {
      ...base,
      status: "blind",
      evidence: ["The breach register could not be read, so nothing here counts as a clean result."],
      gap: "The register exists in code but could not be read for this agency. Until it can be, treat the incident position as unknown rather than clear.",
      evidenceLimit: "",
    };
  }

  const evidence: string[] = [
    breaches.total === 0
      ? "The breach register is in place and holds no incidents for this agency."
      : `${breaches.total} incident${breaches.total === 1 ? "" : "s"} on the register; ${breaches.open} still open.`,
    "Each incident carries a 72-hour deadline counted from DISCOVERY, not from the date it was typed in, so a breach logged days later is already reported as late.",
    "An incident cannot be closed while it is assessed as notifiable and no supervisory notification has been recorded.",
  ];
  if (breaches.notifiedLate > 0) {
    evidence.push(`${breaches.notifiedLate} notification${breaches.notifiedLate === 1 ? " was" : "s were"} recorded after the 72-hour deadline, with the reason for the delay on the record (Art. 33(1)).`);
  }
  if (legacyRecords.length) {
    evidence.push(`${legacyRecords.length} incident-related document${legacyRecords.length === 1 ? "" : "s"} also sit in the legal register: ${legacyRecords.map(record => describeRecord(record, now)).join("; ")}`);
  }

  const failings: string[] = [];
  if (breaches.overdue > 0) {
    failings.push(`${breaches.overdue} incident${breaches.overdue === 1 ? " is" : "s are"} past 72 hours from discovery with no supervisory notification recorded`);
  }
  if (breaches.awaitingAssessment > 0) {
    failings.push(`${breaches.awaitingAssessment} open incident${breaches.awaitingAssessment === 1 ? " has" : "s have"} no recorded Art. 33(1) risk decision, so "not notifiable" has not been decided — only left unanswered`);
  }

  if (failings.length) {
    return {
      ...base,
      status: "partial",
      evidence,
      gap: `The register is working, but ${failings.join(", and ")}. Open the breach register and deal with them.`,
      evidenceLimit: "",
    };
  }

  return {
    ...base,
    status: "met",
    evidence,
    evidenceLimit: "Proves that a register with a running 72-hour clock exists and that nothing recorded on it is overdue or undecided. It does NOT prove no breach happened — nothing in this app detects one, every incident here was entered by a human, and a breach nobody noticed leaves no trace. It also does not prove a notification that was recorded was accurate or adequate.",
    gap: "",
  };
}

function processorAgreementControl(
  processor: SubprocessorExpectation,
  framework: ComplianceFrameworkId,
  legalRecords: LegalRecordEvidence[],
  now: number,
  options: { group: string; kind: string; pattern: RegExp; note: string },
): ComplianceControl {
  const matches = legalRecords.filter(record => {
    const haystack = `${record.title} ${record.counterparty ?? ""} ${record.reference ?? ""}`.toLowerCase();
    const namesProcessor = processor.match.some(alias => haystack.includes(alias));
    return namesProcessor && options.pattern.test(haystack);
  });
  const currentMatches = matches.filter(record => record.status !== "archived" && record.status !== "expired" && !(record.expiresAt && record.expiresAt < now));

  return {
    id: `${framework}.processor.${processor.id}`,
    framework,
    group: options.group,
    title: `${processor.name} — ${options.kind}`,
    requirement: `A current ${options.kind} with ${processor.name} is held in the legal register. ${processor.purpose}.`,
    conferredBy: "evidence",
    status: currentMatches.length ? "met" : matches.length ? "partial" : "missing",
    evidence: matches.length
      ? matches.map(record => describeRecord(record, now))
      : [`No legal record names ${processor.name} alongside a ${options.kind}.`, options.note],
    gap: currentMatches.length
      ? ""
      : matches.length
        ? `A ${options.kind} for ${processor.name} is on file but expired or archived. Renew it, or the cover has lapsed.`
        : `No ${options.kind} with ${processor.name} is recorded. ${options.note}`,
    evidenceLimit: `Proves a document naming ${processor.name} is on file and in date. The app has not read it and cannot confirm it is signed, countersigned, or covers the processing you actually do.`,
    href: "/portal/agency/company?view=legal",
  };
}

/**
 * Adds an expiry warning to an otherwise-met evidence control: a document
 * expiring inside 30 days is still `met`, but the evidence says so out loud.
 */
function expiryAware(control: ComplianceControl, currentRecords: LegalRecordEvidence[], now: number): ComplianceControl {
  const expiringSoon = currentRecords.filter(record => record.expiresAt && record.expiresAt >= now && record.expiresAt <= now + 30 * DAY);
  if (!expiringSoon.length) return control;
  return {
    ...control,
    evidence: [...control.evidence, `${expiringSoon.length} of these expire within 30 days.`],
    evidenceLimit: `${control.evidenceLimit} It also expires within 30 days.`,
  };
}

function describeRecord(record: LegalRecordEvidence, now: number): string {
  const parts = [`"${record.title}"`, `status ${record.status}`];
  if (record.counterparty) parts.push(`with ${record.counterparty}`);
  if (record.expiresAt) {
    const days = Math.round((record.expiresAt - now) / DAY);
    parts.push(days >= 0 ? `expires in ${days} day${days === 1 ? "" : "s"}` : `EXPIRED ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`);
  } else {
    parts.push("no expiry recorded");
  }
  return parts.join(" · ");
}
