import type { AgencyTaskPriority } from "@/server/types";

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
