import "server-only";

import {
  SUBPROCESSOR_EXPECTATIONS,
  assertPostureHonesty,
  type CompliancePosture,
} from "@/lib/compliance/compliancePosture";
import { buildCompliancePostureForAgency } from "@/lib/server/compliancePostureSource";
import { isHipaaTrackEnabled, listComplianceDeclarations, listLegalDocuments } from "@/server/legalDocuments";
import { listClients } from "@/server/tenants";
import { listTradingCompanies, recordBelongsToCompany } from "@/server/tradingCompanies";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * The Governance workspace snapshot — everything the KNOW-first surface shows,
 * built ONCE from real state so the server page and the GET route return the
 * same shape.
 *
 * The honesty discipline of `compliancePosture.ts` is carried through here: no
 * aggregate score, no boolean "compliant", and where the app cannot see a
 * thing it says so rather than reporting a pass. Nothing in this module invents
 * a fact — every row traces to a real record, a real integration, or a
 * hand-maintained-but-honest statement about what the code does and does not do.
 */

import { listSubjectRequests, subjectRequestClock, type SubjectRequestClock } from "@/lib/server/compliance/subjectRequests";
import { previewRetentionSweep, retentionPolicy, RETENTION_CATEGORIES } from "@/lib/server/compliance/retention";
import { listBreachIncidents, summariseBreachClock, type BreachClock } from "@/lib/server/compliance/breachRegister";

export type SecurityStatus = "in-code" | "configured" | "partial" | "not-verified" | "blind";

export interface SecurityControl {
  id: string;
  group: string;
  title: string;
  /** What would make this trustworthy. */
  requirement: string;
  status: SecurityStatus;
  /** Real, checkable facts this status came from. Never invented. */
  evidence: string[];
  /** What this status does NOT prove — always present, so nothing reads as a green tick. */
  limit: string;
}

export interface LegalRegisterRow {
  id: string;
  title: string;
  category: string;
  status: string;
  counterparty?: string;
  reference?: string;
  effectiveAt?: number;
  expiresAt?: number;
  reminderAt?: number;
  companyIds?: string[];
}

export interface DeclarationRow {
  id: string;
  reference?: string;
  status: string;
  effectiveAt?: number;
  updatedAt: number;
  companyIds?: string[];
}

export interface SubprocessorRow {
  id: string;
  name: string;
  purpose: string;
  personalData: boolean;
  phi: boolean;
  /** A legal record whose counterparty matches this vendor exists (presence only — never read for content). */
  hasAgreementRecord: boolean;
  matchedRecordTitles: string[];
}

export interface ErasureClientRow {
  id: string;
  name: string;
  stage: string;
  status: string;
}

/**
 * A section of this workspace that is genuinely group-wide and therefore does
 * NOT narrow when a company is selected.
 *
 * Issue #68's prescription, followed literally: where a register has no company
 * dimension, say so on the section rather than pretending the scope selector
 * filtered it. A silently unscoped panel under a company label is the same lie
 * as a false green.
 */
export interface AgencyWideSection {
  id: "security" | "requests" | "retention";
  label: string;
  /** Why this section cannot narrow — a fact about where the data is keyed. */
  reason: string;
}

export const AGENCY_WIDE_SECTIONS: readonly AgencyWideSection[] = [
  {
    id: "security",
    label: "Security",
    reason: "These controls are facts about the shipped code and the hosting platform. Neither has a per-company dimension, so the same rows are true for every trading company.",
  },
  {
    id: "requests",
    label: "Subject requests",
    reason: "The subject-request register and its statutory clock are keyed to the agency, not to a company, so every open and overdue request is counted here whichever scope is selected.",
  },
  {
    id: "retention",
    label: "Retention",
    reason: "Retention periods are stored once per agency and the sweep counts across the whole agency, so these numbers do not narrow to one company.",
  },
] as const;

export interface GovernanceSnapshot {
  generatedAt: number;
  companyId: string | null;
  companyName: string;
  companies: Array<{ id: string; name: string }>;
  posture: CompliancePosture;
  /** Any honesty-rule violation the posture builder let through — surfaced, never swallowed. */
  honestyViolations: string[];
  hipaaEnabled: boolean;
  legalDocuments: LegalRegisterRow[];
  declarations: DeclarationRow[];
  subprocessors: SubprocessorRow[];
  security: SecurityControl[];
  erasureClients: ErasureClientRow[];
  /**
   * The sections below that the selected scope does NOT filter, and why. Always
   * present so the page labels them rather than implying a narrowing that the
   * underlying registers cannot do.
   */
  agencyWideSections: AgencyWideSection[];
  /**
   * The DSAR register and its statutory clock.
   *
   * `compliancePosture` named the gap as "no screen surfaces the clock, so an
   * overdue request is only visible to somebody who goes looking". Governance
   * is where somebody looks.
   */
  subjectRequests: SubjectRequestRow[];
  subjectRequestClock: SubjectRequestClock;
  /**
   * What the retention policy WOULD remove, right now. Counting only — the
   * sweep is never run as a side effect of opening a page.
   */
  retentionPreview: { total: number; removed: Record<string, number>; unset: string[] };
  retentionCategories: Array<{ id: string; label: string; describes: string; days?: number }>;
  /**
   * The breach register and its 72-hour clock (GDPR Art. 33/34).
   *
   * `compliancePosture` named this gap in the plainest terms it uses anywhere:
   * "If something happened tonight there is nowhere in the app to record it and
   * no clock counting the 72 hours." This is where somebody records it.
   */
  breaches: BreachRow[];
  breachClock: BreachClock;
}

export interface BreachRow {
  id: string;
  title: string;
  description: string;
  companyIds?: string[];
  discoveredAt: number;
  recordedAt: number;
  notifyDeadlineAt: number;
  dataCategories: string[];
  affectedEstimate?: number;
  /** `undefined` means the Art. 33(1) decision has NOT been made. It is not a
   * "no" — the UI must show it as an open question. */
  notifiable?: boolean;
  assessmentReason?: string;
  authorityNotifiedAt?: number;
  authorityReference?: string;
  delayReason?: string;
  subjectsNotifiedAt?: number;
  closed: boolean;
  outcome?: string;
  /** Past the deadline with nothing notified — computed against the server's
   * own `now`, the same moment the rest of this snapshot was built against. */
  overdue: boolean;
  /** Notified, but after the deadline. Kept visible after closure. */
  notifiedLate: boolean;
}

export interface SubjectRequestRow {
  id: string;
  kind: string;
  subjectLabel: string;
  receivedAt: number;
  dueAt: number;
  identityVerified: boolean;
  closed: boolean;
  overdue: boolean;
  extended: boolean;
}

export interface BuildGovernanceOptions {
  agencyId: string;
  companyId?: string | null;
  now?: number;
}

export async function buildGovernanceSnapshot(options: BuildGovernanceOptions): Promise<GovernanceSnapshot> {
  const { agencyId } = options;
  const companyId = options.companyId ?? null;
  const now = options.now ?? Date.now();

  const companies = listTradingCompanies(agencyId, true).map(company => ({ id: company.id, name: company.name }));
  const companyName = companyId ? companies.find(company => company.id === companyId)?.name ?? "Agency-wide" : "Agency-wide";

  const posture = await buildCompliancePostureForAgency({ agencyId, companyId, now });
  const honestyViolations = assertPostureHonesty(posture);

  // Scoping, on the SAME primitive the posture builder and the company legal
  // route already use (`recordBelongsToCompany`): a record with no companyIds
  // is a shared/parent record and stays visible under every scope, while a
  // record naming another company is not this company's paperwork. Before this,
  // only the posture and the HIPAA flag narrowed — the register, declarations,
  // sub-processor evidence and erasure targets stayed agency-wide under a
  // company label, so one brand's DPA appeared to cover another's (issues #68).
  const legalDocuments: LegalRegisterRow[] = listLegalDocuments(agencyId)
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
      reminderAt: document.reminderAt,
      companyIds: document.companyIds,
    }));

  const declarations: DeclarationRow[] = listComplianceDeclarations(agencyId)
    .filter(document => recordBelongsToCompany(document.companyIds, companyId))
    .map(document => ({
      id: document.id,
      reference: document.reference,
      status: document.status,
      effectiveAt: document.effectiveAt,
      updatedAt: document.updatedAt,
      companyIds: document.companyIds,
    }));

  // Built from the SCOPED register, so "Record on file" can never be answered
  // out of another brand's paperwork.
  const subprocessors = buildSubprocessorRegister(legalDocuments);
  const security = buildSecurityPosture();

  // Scoped on the same primitive as the register: an incident naming no
  // company is an agency-level one and stays visible under every scope, while
  // one naming another brand is not this company's incident (issues #68).
  const scopedBreaches = listBreachIncidents(agencyId)
    .filter(incident => recordBelongsToCompany(incident.companyId ? [incident.companyId] : [], companyId));

  // Erasure is irreversible, so the list you can pick from must not offer
  // another company's client. A client with no `companyId` belongs to no brand
  // and stays offered under every scope, matching the register's convention.
  const erasureClients: ErasureClientRow[] = listClients(agencyId, { includeArchived: true })
    .filter(client => recordBelongsToCompany(client.companyId ? [client.companyId] : [], companyId))
    .map(client => ({
      id: client.id,
      name: client.name,
      stage: client.stage,
      status: client.status,
    }));

  return {
    generatedAt: now,
    companyId,
    companyName,
    companies,
    posture,
    honestyViolations,
    hipaaEnabled: isHipaaTrackEnabled(agencyId, companyId),
    legalDocuments,
    declarations,
    subprocessors,
    security,
    erasureClients,
    agencyWideSections: [...AGENCY_WIDE_SECTIONS],
    subjectRequests: listSubjectRequests(agencyId).map(request => ({
      id: request.id,
      kind: request.kind,
      subjectLabel: request.subjectLabel,
      receivedAt: request.receivedAt,
      dueAt: request.dueAt,
      identityVerified: Boolean(request.identityVerifiedAt),
      closed: Boolean(request.fulfilledAt || request.refusedAt),
      // Computed here rather than in the component: "late" is a fact about a
      // moment, and the server's `now` is the one the rest of this snapshot
      // was built against.
      overdue: !request.fulfilledAt && !request.refusedAt && request.dueAt < now,
      extended: Boolean(request.extendedAt),
    })),
    subjectRequestClock: subjectRequestClock(agencyId, now),
    // Counting only. Opening a compliance page must never delete anything.
    retentionPreview: previewRetentionSweep(agencyId, now),
    retentionCategories: RETENTION_CATEGORIES.map(category => ({
      id: category.id,
      label: category.label,
      describes: category.describes,
      days: retentionPolicy(agencyId)[category.id],
    })),
    breaches: scopedBreaches.map(incident => ({
      id: incident.id,
      title: incident.title,
      description: incident.description,
      companyIds: incident.companyId ? [incident.companyId] : undefined,
      discoveredAt: incident.discoveredAt,
      recordedAt: incident.recordedAt,
      notifyDeadlineAt: incident.notifyDeadlineAt,
      dataCategories: incident.dataCategories,
      affectedEstimate: incident.affectedEstimate,
      notifiable: incident.notifiable,
      assessmentReason: incident.assessmentReason,
      authorityNotifiedAt: incident.authorityNotifiedAt,
      authorityReference: incident.authorityReference,
      delayReason: incident.delayReason,
      subjectsNotifiedAt: incident.subjectsNotifiedAt,
      closed: Boolean(incident.closedAt),
      outcome: incident.outcome,
      // An UNASSESSED incident is overdue too. Waiting to decide does not stop
      // the 72 hours, and a register that only flagged the ones somebody had
      // already admitted were notifiable would reward not deciding.
      overdue: !incident.closedAt
        && !incident.authorityNotifiedAt
        && incident.notifiable !== false
        && incident.notifyDeadlineAt < now,
      notifiedLate: typeof incident.authorityNotifiedAt === "number" && incident.authorityNotifiedAt > incident.notifyDeadlineAt,
    })),
    breachClock: summariseBreachClock(scopedBreaches, now),
  };
}

/**
 * The vendor register. A subprocessor is listed because the codebase integrates
 * it — never because paperwork is on file. `hasAgreementRecord` is presence
 * only: it means a legal record names this counterparty, NOT that a DPA/BAA has
 * been read or is adequate. That distinction is the whole point of the KNOW
 * surface, so the UI must render it as "a record exists", never "covered".
 */
function buildSubprocessorRegister(legalDocuments: LegalRegisterRow[]): SubprocessorRow[] {
  return SUBPROCESSOR_EXPECTATIONS.map(expectation => {
    const matched = legalDocuments.filter(document => {
      const counterparty = (document.counterparty ?? "").toLowerCase();
      return counterparty.length > 0 && expectation.match.some(alias => counterparty.includes(alias.toLowerCase()));
    });
    return {
      id: expectation.id,
      name: expectation.name,
      purpose: expectation.purpose,
      personalData: expectation.personalData,
      phi: expectation.phi,
      hasAgreementRecord: matched.length > 0,
      matchedRecordTitles: matched.map(document => document.title),
    };
  });
}

/**
 * The security posture, KNOW-first. Every row states what the app can honestly
 * say about a control and, crucially, what that does NOT prove. Nothing here is
 * green: "in-code" means the mechanism exists in the shipped source, not that
 * it has been independently reviewed; "not-verified" and "blind" are used
 * wherever the app cannot see the truth (RLS lives in the database; MFA
 * enforcement lives in the identity provider). The one live signal read is
 * whether a Supabase identity provider is configured at all.
 */
function buildSecurityPosture(): SecurityControl[] {
  const supabaseConfigured = Boolean(getSupabasePublicConfig());

  return [
    {
      id: "session-integrity",
      group: "Access & sessions",
      title: "Session tokens are signed and verified",
      requirement: "Session cookies must be tamper-evident and expire.",
      status: "in-code",
      evidence: [
        "Sessions are HMAC-SHA256 signed and verified with a constant-time compare (auth.ts).",
        "Tokens carry an expiry and a session revision that invalidates on role/password change.",
      ],
      limit: "Proves the mechanism ships, not that the signing secret is strong, rotated, or kept out of logs.",
    },
    {
      id: "mfa",
      group: "Access & sessions",
      title: "Multi-factor authentication",
      requirement: "Staff sign-in should require a second factor, enforced at the identity provider.",
      status: supabaseConfigured ? "partial" : "not-verified",
      evidence: supabaseConfigured
        ? [
          "A Supabase identity provider is configured; sessions carry an AAL claim.",
          "MFA enrolment and enforcement are owned by Supabase, not by this app.",
        ]
        : ["No Supabase identity provider is configured in this environment, so MFA cannot be evidenced from here."],
      limit: "The app cannot see whether MFA is actually enrolled or required — that is set in the identity provider.",
    },
    {
      id: "rls",
      group: "Data isolation",
      title: "Row-level security on tenant data",
      requirement: "The database must enforce that one agency cannot read another's rows, independent of app code.",
      status: "not-verified",
      evidence: [
        "The app scopes every query by agencyId, but that is defence-in-depth, not the database boundary.",
        "Whether RLS policies are enabled on the hosted tables is a database fact this app cannot read.",
      ],
      limit: "App-level scoping is not a substitute for RLS. Treat this as unproven until checked in the database.",
    },
    {
      id: "rate-limit",
      group: "Abuse & exposure",
      title: "Rate limiting on sensitive endpoints",
      requirement: "Auth and write endpoints should throttle abusive traffic.",
      status: "in-code",
      evidence: ["A rate-limit helper exists in the codebase (lib/server/rateLimit.ts) and is applied on some routes."],
      limit: "Presence of a helper is not proof of coverage — which routes enforce it has not been audited here.",
    },
    {
      id: "audit-trail",
      group: "Evidence & audit",
      title: "Actions are written to an audit log",
      requirement: "Security- and data-relevant actions should be attributable and durable.",
      status: "in-code",
      evidence: [
        "Legal, compliance and erasure actions call logActivity with an actor and a timestamp.",
        "The erasure audit entry is written AFTER the wipe so it survives it, and names no personal data.",
      ],
      limit: "Proves entries are written, not that the log is tamper-proof, complete, or retained for any period.",
    },
    {
      id: "encryption",
      group: "Data isolation",
      title: "Encryption in transit and at rest",
      requirement: "Data should be encrypted on the wire and on disk.",
      status: "blind",
      evidence: ["In-transit and at-rest encryption are properties of the hosting platform, not visible to app code."],
      limit: "The app cannot verify this. Confirm it in the hosting and database provider settings.",
    },
  ];
}
