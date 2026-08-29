import "server-only";

import {
  SUBPROCESSOR_EXPECTATIONS,
  assertPostureHonesty,
  type CompliancePosture,
} from "@/lib/compliance/compliancePosture";
import { buildCompliancePostureForAgency } from "@/lib/server/compliancePostureSource";
import { isHipaaTrackEnabled, listComplianceDeclarations, listLegalDocuments } from "@/server/legalDocuments";
import { listClients } from "@/server/tenants";
import { listTradingCompanies } from "@/server/tradingCompanies";
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

  const legalDocuments: LegalRegisterRow[] = listLegalDocuments(agencyId).map(document => ({
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

  const declarations: DeclarationRow[] = listComplianceDeclarations(agencyId).map(document => ({
    id: document.id,
    reference: document.reference,
    status: document.status,
    effectiveAt: document.effectiveAt,
    updatedAt: document.updatedAt,
    companyIds: document.companyIds,
  }));

  const subprocessors = buildSubprocessorRegister(legalDocuments);
  const security = buildSecurityPosture();

  const erasureClients: ErasureClientRow[] = listClients(agencyId, { includeArchived: true }).map(client => ({
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
