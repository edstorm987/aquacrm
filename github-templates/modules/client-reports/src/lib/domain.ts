// Client-reports domain.

import type { ClientId, UserId } from "./tenancy";

export type ReportStatus = "draft" | "published" | "sent";
export const REPORT_STATUSES: readonly ReportStatus[] = ["draft", "published", "sent"] as const;

export const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  draft: ["published"],
  published: ["sent", "draft"],   // unpublish back to draft is allowed
  sent: [],
};

export type SectionKind =
  | "summary" | "metrics" | "wins" | "deliverables" | "next-steps";

export const SECTION_KINDS: readonly SectionKind[] =
  ["summary", "metrics", "wins", "deliverables", "next-steps"] as const;

// Structured payload for metrics sections; UI can render a small
// table from this shape. Honesty contract (chapter #68): metrics
// without a connector display "Connect <connector> to populate" and
// `provisional: true` so the customer sees they aren't real.
export interface MetricRow {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string | number;
  provisional?: boolean;
  source?: string;
}

export interface MetricsSectionData {
  rows: MetricRow[];
  // The connector this section expects (e.g. "ga4", "stripe").
  // When absent and `rows` empty, the UI shows a placeholder card.
  connector?: string;
  placeholder?: string;
}

export type SectionData = MetricsSectionData | undefined;

export interface ReportSection {
  id: string;
  kind: SectionKind;
  title: string;
  body: string;            // markdown
  data?: SectionData;      // structured payload (kind === "metrics")
  ordering: number;
}

export interface Report {
  id: string;
  agencyId: string;
  clientId: ClientId;
  phaseId: string;
  status: ReportStatus;
  title: string;
  sections: ReportSection[];
  sharedWithCustomer: boolean;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  sentAt?: number;
}

export interface CreateReportInput {
  phaseId: string;
  title: string;
  sections?: Array<Omit<ReportSection, "id" | "ordering">>;
}

export interface UpdateReportPatch {
  title?: string;
  sharedWithCustomer?: boolean;
  sections?: ReportSection[];   // full-replace shape; caller manages ids
}

export interface CreateDraftFromPhaseOpts {
  phaseId: string;
  phaseLabel?: string;
  deliverables?: string[];      // injected by foundation event router
                                // from R006 milestones — empty when
                                // unavailable, sections still render.
  metricsConnectors?: string[]; // e.g. ["ga4", "stripe"] — one
                                // metrics-section per connector.
}

export interface PhaseAdvancedEvent {
  fromPhaseId: string;
  toPhaseId: string;
  fromPhaseLabel?: string;
  toPhaseLabel?: string;
  deliverables?: string[];
  metricsConnectors?: string[];
}

// Default body for the placeholder metrics section when no connector
// data is wired (chapter #68 honesty contract).
export const METRICS_PLACEHOLDER_BODY =
  "*Metrics will populate once the connector is wired. Until then this section is a placeholder.*";
