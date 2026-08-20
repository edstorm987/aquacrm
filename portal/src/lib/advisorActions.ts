import type { AgencyTaskPriority } from "@/server/types";
import type { RadarFindingGroup } from "@/lib/businessRadar";
import type { EvidenceStep } from "@/lib/inbox/resolutionEvidence";
import type { ResolutionKind } from "@/lib/inbox/resolutionExplain";

export type AdvisorActionCategory =
  | "company"
  | "client"
  | "sales"
  | "finance"
  | "delivery"
  | "support"
  | "development"
  | "marketing"
  | "operations";

export interface AdvisorActionSuggestion {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  category: AdvisorActionCategory;
  priority: AgencyTaskPriority;
  confidence: "high" | "medium" | "low";
  dueAt: number;
  href: string;
  sourceAlertIds: string[];
  // ── Actionability enrichment (radar upgrade Stage 7 — Part F) ──────────────
  /** How this can be dealt with. Drives the Resolve/Mark-done/Evidence control on acceptance. */
  kind?: ResolutionKind;
  /** The clearance condition — what makes this finding go away (becomes the task's expected outcome). */
  expectedOutcome?: string;
  /** Concrete, ordered instruction steps — lets one finding decompose into several tasks. */
  steps?: EvidenceStep[];
  /** A suggested owner role for the proposed task (a human still confirms). */
  suggestedOwner?: string;
  /** Top-level problem bucket (Stage 5), so the Actions workspace groups tasks the way Radar does. */
  group?: RadarFindingGroup;
}

export const ADVISOR_CATEGORY_HREF: Record<AdvisorActionCategory, string> = {
  company: "/portal/agency?station=battle",
  client: "/portal/clients",
  sales: "/portal/agency/pipelines/leads",
  finance: "/portal/agency/agency-finance",
  delivery: "/portal/agency/fulfilment",
  support: "/portal/agency/inbox",
  development: "/portal/agency/fulfilment?view=technical",
  marketing: "/portal/agency/marketing",
  operations: "/portal/agency/actions",
};
