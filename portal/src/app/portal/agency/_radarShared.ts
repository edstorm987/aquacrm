// Small radar helpers, shared by the Command Centre and the Business Radar
// dashboard it lazily loads.
//
// Extracted 2026-08-29 when `BusinessRadarDashboard` was lifted out of
// `_DashboardCommandCenter` (2,787 → 2,139 lines) to cut what the Command
// Centre route compiles. Both files need these; the child importing them back
// from its own parent would be a circular import held together only by the
// fact that the parent's import is dynamic. A third module is the honest shape.
//
// Pure formatting and class-name helpers — no state, no I/O, safe on either
// side of the boundary.

import type {
  AdvisorCoverageSource, AdvisorDomain, BusinessRadarIssue, RadarCheckScope,
  RadarCheckStatus, RadarFindingGroup, RadarRuleLens,
} from "@/engines/data/radar/businessRadar";
import type { RadarInspectionTab } from "./radar/RadarInspectionWorkspace";
import { timestampFromValue } from "@/lib/shared/formatDateTime";
import { resolveFindingKind } from "@/lib/intelligence/businessRecommendedActions";

export function domainLabel(domain: AdvisorDomain): string {
  const labels: Record<AdvisorDomain, string> = {
    company: "Company",
    sales: "Sales",
    inbox: "Inbox",
    clients: "Clients",
    finance: "Finance",
    delivery: "Delivery",
    marketing: "Marketing",
    operations: "Operations",
    compliance: "Compliance",
    development: "Development",
    team: "Team",
    systems: "Systems",
  };
  return labels[domain];
}

export function formatRadarAge(timestamp: number): string {
  const validTimestamp = timestampFromValue(timestamp);
  if (validTimestamp === undefined) return "date needs review";
  const elapsed = Math.max(0, Date.now() - validTimestamp);
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

export function formatRadarDuration(duration: number): string {
  if (duration < 60_000) return `${Math.max(1, Math.round(duration / 1_000))}s`;
  if (duration < 3_600_000) return `${Math.round(duration / 60_000)}m`;
  if (duration < 86_400_000) return `${Math.round(duration / 3_600_000)}h`;
  const days = Math.floor(duration / 86_400_000);
  const hours = Math.round((duration % 86_400_000) / 3_600_000);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function signedInteger(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

export function signedDecimal(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function radarNodeClass(status: "critical" | "warning" | "watch" | "blind" | "inactive" | "healthy"): string {
  if (status === "critical") return "border-red-300/35 bg-red-400/15 text-red-200";
  if (status === "warning") return "border-amber-300/35 bg-amber-400/15 text-amber-200";
  if (status === "watch") return "border-sky-300/35 bg-sky-400/15 text-sky-200";
  if (status === "blind") return "border-white/20 bg-white/10 text-white/45";
  if (status === "inactive") return "border-white/10 bg-white/[0.04] text-white/28";
  return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
}

export function radarSeverityRank(severity: BusinessRadarIssue["severity"]): number {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

export function radarSeverityClass(severity: BusinessRadarIssue["severity"]): string {
  if (severity === "critical") return "bg-red-400/15 text-red-200";
  if (severity === "warning") return "bg-amber-400/15 text-amber-200";
  return "bg-sky-400/15 text-sky-200";
}

export function radarCheckStatusClass(status: RadarCheckStatus): string {
  if (status === "critical") return "bg-red-400/15 text-red-200";
  if (status === "warning") return "bg-amber-400/15 text-amber-200";
  if (status === "watch") return "bg-sky-400/15 text-sky-200";
  if (status === "blind") return "bg-white/10 text-white/55";
  if (status === "learning") return "bg-violet-400/15 text-violet-200";
  if (status === "inactive") return "bg-white/[0.05] text-white/35";
  return "bg-emerald-400/15 text-emerald-200";
}

export function radarCheckStatusLabel(status: RadarCheckStatus): string {
  if (status === "pass") return "Pass";
  if (status === "blind") return "No data yet";
  if (status === "learning") return "Still gathering";
  if (status === "inactive") return "Inactive";
  return status;
}

export function radarCheckIconClass(status: RadarCheckStatus): string {
  if (status === "critical") return "border-red-300/25 bg-red-400/10 text-red-200";
  if (status === "warning") return "border-amber-300/25 bg-amber-400/10 text-amber-200";
  if (status === "watch") return "border-sky-300/25 bg-sky-400/10 text-sky-200";
  if (status === "blind") return "border-white/15 bg-white/[0.06] text-white/45";
  if (status === "learning") return "border-violet-300/25 bg-violet-400/10 text-violet-200";
  if (status === "inactive") return "border-white/10 bg-white/[0.03] text-white/30";
  return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
}

export function coverageStatusLabel(status: AdvisorCoverageSource["status"]): string {
  if (status === "connected") return "Live";
  if (status === "empty") return "Watching";
  if (status === "unavailable") return "Unavailable";
  return "Disconnected";
}

// Turn a machine source id (e.g. "core:clients", "metric:speed-to-lead",
// "module:leads-pipeline:<installId>") into the human label an analyst reads
// without a decoder — the registered coverage source's own label where one is
// found (which also resolves the module:<plugin>:<install> form cleanly),
// otherwise the id stripped of its scope prefix, separators spaced and
// title-cased. Mirrors the engine's evidence-side `readableSource` so the same
// id never reads one way in evidence and another on a dashboard card.
// The plain action-KIND label for a radar issue, so an operator reading the
// signals feed knows whether it can be fixed in-app, is handled elsewhere, or is
// a judgement call — the "action types must be clear, otherwise it's fluff"
// bar. A rolled-up incident's id (`incident:<domain>:<category>`) matches no
// resolution family and would resolve to `judgement` on id alone — so key the
// label off the incident's problem GROUP instead: an infrastructure/reliability/
// compliance incident reads "handled elsewhere", a delivery one "fix here", and
// only genuine commercial/people deviations read "judgement call". This mirrors
// exactly the resolution the Actions/Command path computes for the same finding.
export function radarIssueKindLabel(issue: { id: string; group?: RadarFindingGroup }): "fix here" | "handled elsewhere" | "judgement call" {
  const kind = resolveFindingKind({ id: issue.id, group: issue.group });
  return kind === "in-app" ? "fix here" : kind === "off-system" ? "handled elsewhere" : "judgement call";
}

export function readableSourceId(
  sourceId: string,
  coverage?: readonly { id: string; label: string }[],
): string {
  const match = coverage?.find(source => source.id === sourceId);
  if (match) return match.label;
  return sourceId
    .replace(/^(core|domain|source|module|metric):/, "")
    .replace(/[-_:]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .trim();
}

export type RadarInspectorTarget = {
  tab: RadarInspectionTab;
  query: string;
  domain: AdvisorDomain | "all";
  status: RadarCheckStatus | "all" | "attention" | "applicable" | "assured" | "firing" | "live";
  scope: RadarCheckScope | "all" | "sentinel";
  lens: RadarRuleLens | "all";
  sourceId: string;
  datasetId: string;
  version: number;
};

export type OpenRadarInspector = (target?: Partial<Omit<RadarInspectorTarget, "version">>) => void;

export type RadarMetricHelp = {
  label: string;
  detail: string;
};
