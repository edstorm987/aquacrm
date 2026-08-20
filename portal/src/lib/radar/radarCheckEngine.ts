import type {
  AdvisorCoverageSource,
  AdvisorDomain,
  BusinessRadarCheck,
  BusinessSignalStatus,
  RadarCheckStatus,
  RadarDomainSummary,
  RadarRuleLens,
} from "@/lib/radar/businessRadar";
import {
  BUSINESS_RADAR_RULE_CATALOG,
  RADAR_CHECKS_PER_DOMAIN,
  RADAR_SIGNAL_FAMILIES,
  type BusinessRadarRuleDefinition,
} from "@/lib/radar/radarRuleCatalog";
import { isoDateTimeValue } from "@/lib/shared/formatDateTime";

export interface RadarObservation {
  domain: AdvisorDomain;
  familyId: string;
  sourceId: string;
  connected: boolean;
  current: number | null;
  previous?: number | null;
  status: BusinessSignalStatus;
  display: string;
  target: string;
  detail: string;
  href: string;
  measuredAt: number;
  lastSeenAt?: number;
  freshnessMs?: number;
  sampleSize?: number;
  integrity?: boolean;
  minimumSampleSize?: number;
  historySamples?: number;
  historySpanMs?: number;
  zeroIsEvidence?: boolean;
  expectedDirection?: "higher" | "lower" | "neutral";
  anomalyFloor?: number;
}

export function buildRadarCheckMatrix(
  observations: readonly RadarObservation[],
  coverage: readonly AdvisorCoverageSource[],
  now = Date.now(),
): { checks: BusinessRadarCheck[]; domains: RadarDomainSummary[] } {
  const observationByKey = new Map(observations.map(observation => [observationKey(observation.domain, observation.familyId), observation]));
  const coverageByDomain = new Map<AdvisorDomain, AdvisorCoverageSource[]>();
  for (const source of coverage) coverageByDomain.set(source.domain, [...(coverageByDomain.get(source.domain) ?? []), source]);

  const checks = BUSINESS_RADAR_RULE_CATALOG.map(rule => {
    const observation = observationByKey.get(observationKey(rule.domain, rule.familyId));
    return evaluateRadarRule(rule, observation, coverageByDomain.get(rule.domain) ?? [], now);
  });
  const domains = summarizeRadarChecks(checks, coverage);
  return { checks, domains };
}

export function summarizeRadarChecks(
  checks: readonly BusinessRadarCheck[],
  coverage: readonly AdvisorCoverageSource[],
): RadarDomainSummary[] {
  const coverageByDomain = new Map<AdvisorDomain, AdvisorCoverageSource[]>();
  for (const source of coverage) coverageByDomain.set(source.domain, [...(coverageByDomain.get(source.domain) ?? []), source]);
  return (Object.keys(RADAR_SIGNAL_FAMILIES) as AdvisorDomain[]).map(domain => {
    const domainChecks = checks.filter(check => check.domain === domain);
    const blindChecks = domainChecks.filter(check => check.status === "blind").length;
    const passedChecks = domainChecks.filter(check => check.status === "pass").length;
    const firingChecks = domainChecks.filter(check => check.status === "critical" || check.status === "warning").length;
    const watchChecks = domainChecks.filter(check => check.status === "watch").length;
    const learningChecks = domainChecks.filter(check => check.status === "learning").length;
    const inactiveChecks = domainChecks.filter(check => check.status === "inactive").length;
    const applicableChecks = domainChecks.length - inactiveChecks;
    const connectedChecks = applicableChecks - blindChecks;
    const assuredChecks = passedChecks + firingChecks;
    const sources = coverageByDomain.get(domain) ?? [];
    const sourceReadiness = sources.length
      ? sources.reduce((total, source) => total + (source.status === "connected" ? 1 : source.status === "empty" ? 0.35 : 0), 0) / sources.length
      : 0;
    const checkConfidence = applicableChecks
      ? (assuredChecks + watchChecks * 0.6 + learningChecks * 0.25) / applicableChecks
      : 0;
    return {
      domain,
      totalChecks: domainChecks.length,
      passedChecks,
      firingChecks,
      watchChecks,
      blindChecks,
      learningChecks,
      inactiveChecks,
      applicableChecks,
      assuredChecks,
      coveragePercent: applicableChecks ? Math.round(connectedChecks / applicableChecks * 100) : 0,
      assurancePercent: applicableChecks ? Math.round(assuredChecks / applicableChecks * 100) : 0,
      confidencePercent: Math.round(checkConfidence * 100),
      readinessPercent: Math.round((sourceReadiness * 0.65 + checkConfidence * 0.35) * 100),
      sourceCount: sources.length,
      lastSignalAt: newest(domainChecks.map(check => check.lastSeenAt ?? check.measuredAt)),
    };
  });
}

function evaluateRadarRule(
  rule: BusinessRadarRuleDefinition,
  observation: RadarObservation | undefined,
  domainCoverage: readonly AdvisorCoverageSource[],
  now: number,
): BusinessRadarCheck {
  const fallbackSource = domainCoverage[0];
  if (!observation) {
    return check(rule, "blind", {
      sourceId: fallbackSource?.id ?? `domain:${rule.domain}`,
      detail: `No observation is registered for ${rule.familyLabel}. This is an explicit instrumentation gap, not a healthy result.`,
      evidence: [fallbackSource ? `${fallbackSource.label}: ${fallbackSource.status}` : "No domain source is registered"],
      href: fallbackSource ? "/portal/agency/company?view=connections" : "/portal/agency/settings",
      measuredAt: now,
    });
  }

  if (!observation.connected) {
    return check(rule, "blind", {
      ...observation,
      detail: `${observation.detail} The source is not connected, so this check cannot prove health.`,
      evidence: [`Source ${observation.sourceId} is not connected`, `Expected ${observation.target}`],
    });
  }

  const result = evaluateLens(rule.lens, observation, domainCoverage, now);
  return check(rule, result.status, {
    ...observation,
    detail: result.detail,
    evidence: result.evidence,
  });
}

function evaluateLens(
  lens: RadarRuleLens,
  observation: RadarObservation,
  domainCoverage: readonly AdvisorCoverageSource[],
  now: number,
): { status: RadarCheckStatus; detail: string; evidence: string[] } {
  if (lens === "connection") {
    return {
      status: "pass",
      detail: `${observation.detail} The source is connected and available to the radar.`,
      evidence: [`Current ${observation.display}`, `Source ${observation.sourceId}`],
    };
  }
  if (lens === "freshness") {
    if (!observation.lastSeenAt) {
      return {
        status: observation.current === null ? "watch" : "pass",
        detail: observation.current === null ? `${observation.detail} No source timestamp is available yet.` : `${observation.detail} The current snapshot was measured during this sweep.`,
        evidence: [`Measured ${isoDateTimeValue(observation.measuredAt) ?? "date needs review"}`, `Expected ${observation.target}`],
      };
    }
    const age = Math.max(0, now - observation.lastSeenAt);
    const limit = observation.freshnessMs ?? 48 * 60 * 60 * 1000;
    return {
      status: age > limit * 2 ? "critical" : age > limit ? "warning" : "pass",
      detail: age > limit ? `${observation.detail} Reporting is older than the freshness guardrail.` : `${observation.detail} Reporting is fresh.`,
      evidence: [`Last seen ${duration(age)} ago`, `Freshness guardrail ${duration(limit)}`],
    };
  }
  if (lens === "threshold") {
    const status = statusFromSignal(observation.status);
    return {
      status,
      detail: `${observation.detail} Current value: ${observation.display}.`,
      evidence: [`Current ${observation.display}`, `Target ${observation.target}`],
    };
  }
  if (lens === "integrity") {
    const invalid = observation.current !== null && !Number.isFinite(observation.current);
    const emptySample = observation.sampleSize === 0;
    const status: RadarCheckStatus = invalid || observation.integrity === false ? "warning" : emptySample || observation.current === null ? "watch" : "pass";
    return {
      status,
      detail: status === "pass" ? `${observation.detail} The sample is internally consistent.` : `${observation.detail} The sample is empty, incomplete, or inconsistent and needs review.`,
      evidence: [`Sample ${observation.sampleSize ?? "not supplied"}`, `Current ${observation.display}`],
    };
  }

  if (lens === "continuity") {
    if (!observation.lastSeenAt) {
      return {
        status: "watch",
        detail: `${observation.detail} The source is connected, but reporting continuity cannot be proved without a timestamp.`,
        evidence: ["Last signal unavailable", `Expected ${observation.target}`],
      };
    }
    const age = Math.max(0, now - observation.lastSeenAt);
    const cadence = observation.freshnessMs ?? 48 * 60 * 60 * 1000;
    const status: RadarCheckStatus = age > cadence * 4 ? "critical" : age > cadence * 2 ? "warning" : age > cadence ? "watch" : "pass";
    return {
      status,
      detail: status === "pass" ? `${observation.detail} The signal is reporting inside its continuity window.` : `${observation.detail} The reporting cadence has broken or is approaching silence.`,
      evidence: [`Last signal ${duration(age)} ago`, `Continuity window ${duration(cadence)}`],
    };
  }

  if (lens === "baseline") {
    const baselineReady = observation.previous !== null && observation.previous !== undefined && Number.isFinite(observation.previous);
    return {
      status: baselineReady ? "pass" : "watch",
      detail: baselineReady ? `${observation.detail} A comparable historical baseline is available.` : `${observation.detail} Historical context is not yet deep enough to prove normal behaviour.`,
      evidence: [`Current ${observation.display}`, baselineReady ? `Previous ${observation.previous}` : "Previous period unavailable"],
    };
  }

  if (lens === "confidence") {
    const sample = observation.sampleSize;
    const required = observation.minimumSampleSize ?? (observation.expectedDirection === "neutral" ? 1 : 5);
    const structurallyUnsound = observation.integrity === false || (observation.current !== null && !Number.isFinite(observation.current));
    const zeroProvesState = observation.zeroIsEvidence === true && observation.current === 0;
    const enoughSample = zeroProvesState || (typeof sample === "number" && sample >= required);
    const status: RadarCheckStatus = structurallyUnsound ? "warning" : enoughSample ? "pass" : "watch";
    return {
      status,
      detail: status === "pass" ? `${observation.detail} The evidence volume is sufficient for this decision.` : `${observation.detail} Treat the conclusion cautiously until the sample becomes larger or cleaner.`,
      evidence: [`Sample ${sample ?? "not supplied"}`, `Confidence floor ${required}`, zeroProvesState ? "Zero is valid evidence for this guardrail" : `Current ${observation.display}`],
    };
  }

  if (lens === "resilience") {
    const availableSources = domainCoverage.filter(source => source.status === "connected" || source.status === "empty");
    const age = observation.lastSeenAt ? Math.max(0, now - observation.lastSeenAt) : null;
    const cadence = observation.freshnessMs ?? 48 * 60 * 60 * 1000;
    const degraded = observation.integrity === false || (age !== null && age > cadence * 2);
    const status: RadarCheckStatus = degraded ? "warning" : availableSources.length > 1 ? "pass" : "watch";
    return {
      status,
      detail: status === "pass" ? `${observation.detail} Multiple readable sources or controls support continued observability.` : degraded ? `${observation.detail} The evidence path is degraded and may fail silently.` : `${observation.detail} This conclusion currently depends on a single registered source.`,
      evidence: [`${availableSources.length} available domain source${availableSources.length === 1 ? "" : "s"}`, age === null ? "Signal age unavailable" : `Signal age ${duration(age)}`, `Integrity ${observation.integrity === false ? "degraded" : "valid"}`],
    };
  }

  const change = percentageChange(observation.current, observation.previous);
  if (change === null) {
    const signalStatus = statusFromSignal(observation.status);
    if (lens === "forecast" && (signalStatus === "critical" || signalStatus === "warning")) {
      return {
        status: signalStatus,
        detail: `${observation.detail} The current guardrail is already breached, even though a trajectory baseline is unavailable.`,
        evidence: [`Current ${observation.display}`, `Target ${observation.target}`, "Forecast baseline unavailable"],
      };
    }
    return {
      status: "watch",
      detail: `${observation.detail} A comparable previous period is not available yet.`,
      evidence: [`Current ${observation.display}`, "Previous period unavailable"],
    };
  }
  const direction = observation.expectedDirection ?? "neutral";
  const adverse = direction === "higher" ? change < 0 : direction === "lower" ? change > 0 : false;
  const magnitude = Math.abs(change);
  if (lens === "trend") {
    const status: RadarCheckStatus = adverse && magnitude >= 75 ? "critical" : adverse && magnitude >= 35 ? "warning" : magnitude >= 50 ? "watch" : "pass";
    return {
      status,
      detail: `${observation.detail} The current period is ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% against the preceding period.`,
      evidence: [`Current ${observation.current ?? "unknown"}`, `Previous ${observation.previous ?? "unknown"}`, `Change ${signed(change)}%`],
    };
  }

  if (lens === "forecast") {
    const currentStatus = statusFromSignal(observation.status);
    const status: RadarCheckStatus = currentStatus === "critical"
      ? "critical"
      : currentStatus === "warning" && adverse
        ? "warning"
        : currentStatus === "warning" || currentStatus === "watch" || (adverse && magnitude >= 15)
          ? "watch"
          : "pass";
    return {
      status,
      detail: status === "pass" ? `${observation.detail} Current momentum remains compatible with the operating guardrail.` : `${observation.detail} Current momentum is not yet on a confidently safe trajectory.`,
      evidence: [`Current ${observation.display}`, `Target ${observation.target}`, `Momentum ${signed(change)}%`],
    };
  }

  if (lens === "volatility") {
    const floor = observation.anomalyFloor ?? 5;
    const enoughVolume = Math.max(Math.abs(observation.current ?? 0), Math.abs(observation.previous ?? 0)) >= floor;
    const status: RadarCheckStatus = enoughVolume && magnitude >= 200 ? "warning" : enoughVolume && magnitude >= 75 ? "watch" : "pass";
    return {
      status,
      detail: status === "pass" ? `${observation.detail} Movement remains inside the stability envelope.` : `${observation.detail} Movement is unusually volatile and deserves a closer look even if the current value appears acceptable.`,
      evidence: [`Movement ${signed(change)}%`, `Volume floor ${floor}`, `Current ${observation.display}`],
    };
  }

  const floor = observation.anomalyFloor ?? 5;
  const enoughVolume = Math.max(Math.abs(observation.current ?? 0), Math.abs(observation.previous ?? 0)) >= floor;
  const status: RadarCheckStatus = enoughVolume && adverse && magnitude >= 100 ? "warning" : enoughVolume && magnitude >= 100 ? "watch" : "pass";
  return {
    status,
    detail: status === "pass" ? `${observation.detail} No material pattern break was detected.` : `${observation.detail} A ${magnitude.toFixed(1)}% movement crossed the anomaly guardrail.`,
    evidence: [`Change ${signed(change)}%`, `Anomaly floor ${floor}`, `Direction ${direction}`],
  };
}

function check(
  rule: BusinessRadarRuleDefinition,
  status: RadarCheckStatus,
  observation: Partial<RadarObservation> & { sourceId: string; detail: string; evidence: string[]; href: string; measuredAt: number },
): BusinessRadarCheck {
  return {
    id: `check:${rule.domain}:${rule.familyId}:${rule.lens}`,
    ruleId: rule.id,
    domain: rule.domain,
    familyId: rule.familyId,
    familyLabel: rule.familyLabel,
    lens: rule.lens,
    lensLabel: rule.lensLabel,
    scope: "kpi",
    status,
    title: `${rule.familyLabel}: ${rule.lensLabel.toLowerCase()}`,
    detail: observation.detail,
    evidence: observation.evidence,
    href: observation.href,
    sourceId: observation.sourceId,
    measuredAt: observation.measuredAt,
    value: observation.current ?? undefined,
    previousValue: observation.previous ?? undefined,
    lastSeenAt: observation.lastSeenAt,
    sampleSize: observation.sampleSize,
    historySamples: observation.historySamples,
    historySpanMs: observation.historySpanMs,
    expectedDirection: observation.expectedDirection,
  };
}

function statusFromSignal(status: BusinessSignalStatus): RadarCheckStatus {
  if (status === "healthy") return "pass";
  if (status === "unknown") return "watch";
  return status;
}

function observationKey(domain: AdvisorDomain, familyId: string): string {
  return `${domain}:${familyId}`;
}

function percentageChange(current: number | null, previous: number | null | undefined): number | null {
  if (current === null || previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return (current - previous) / Math.abs(previous) * 100;
}

function duration(milliseconds: number): string {
  if (milliseconds < 60_000) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < 3_600_000) return `${Math.round(milliseconds / 60_000)}m`;
  if (milliseconds < 86_400_000) return `${Math.round(milliseconds / 3_600_000)}h`;
  return `${Math.round(milliseconds / 86_400_000)}d`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function newest(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && value > 0);
  return valid.length ? Math.max(...valid) : undefined;
}

if (RADAR_CHECKS_PER_DOMAIN < 140) throw new Error("Business radar domains must retain at least 140 checks.");
