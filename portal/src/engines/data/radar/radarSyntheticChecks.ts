import type {
  AdvisorDomain,
  BusinessRadarCheck,
  BusinessRadarIssue,
  RadarCheckStatus,
  RadarRuleLens,
} from "@/engines/data/radar/businessRadar";
import type { RadarTelemetryProperty, RadarTelemetrySnapshot } from "@/engines/data/server/radar/radarTelemetry";
import type { RadarSyntheticProbeResult } from "@/server/types";
import { RADAR_PROBE_CADENCE_MS } from "@/engines/data/radar/businessRadar";
import { isoDateTimeValue } from "@/lib/shared/formatDateTime";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 86_400_000;

/**
 * The canary freshness agreement, derived from the cadence the deployment
 * actually runs the Deep sweep at (issues #170).
 *
 * These thresholds were hardcoded at 15m/60m while nothing ran the probes more
 * often than once a day, so every live property sat at warning/critical for
 * ~23 of every 24 hours: a hosting decision rendered as a per-property outage,
 * which is the fastest way to teach someone to ignore the board. Same shape the
 * source sentinels already use — a miss at one cadence, an escalation at three
 * — so a cadence change moves both honestly in one edit.
 */
const FRESHNESS_AGREEMENT_MS = RADAR_PROBE_CADENCE_MS;
const FRESHNESS_CRITICAL_MS = 3 * RADAR_PROBE_CADENCE_MS;

export function buildSyntheticCanaryChecks(
  telemetry: RadarTelemetrySnapshot,
  probes: Record<string, RadarSyntheticProbeResult>,
  now: number,
): BusinessRadarCheck[] {
  return telemetry.properties.filter(property => property.expectedLive).flatMap(property => canaryChecks(property, probes[property.id], now));
}

export function buildSyntheticCanaryIssues(
  telemetry: RadarTelemetrySnapshot,
  probes: Record<string, RadarSyntheticProbeResult>,
  now: number,
): BusinessRadarIssue[] {
  return telemetry.properties.filter(property => property.expectedLive).flatMap(property => canaryIssues(property, probes[property.id], now));
}

function canaryChecks(property: RadarTelemetryProperty, probe: RadarSyntheticProbeResult | undefined, now: number): BusinessRadarCheck[] {
  const age = probe ? Math.max(0, now - probe.checkedAt) : null;
  const statusCode = probe?.statusCode;
  const reachable = typeof statusCode === "number";
  const isHttps = safeProtocol(probe?.finalUrl || property.publicUrl) === "https:";
  const html = Boolean(probe?.contentType?.includes("text/html") && (probe.htmlBytes ?? 0) > 0);
  const securityCount = probe ? Object.values(probe.securityHeaders).filter(Boolean).length : 0;
  const common = {
    domain: "development" as const,
    familyId: `synthetic:${property.id}`,
    familyLabel: property.label,
    scope: "synthetic" as const,
    href: property.href,
    sourceId: `synthetic:${property.id}`,
    measuredAt: now,
    lastSeenAt: probe?.checkedAt,
  };

  return [
    canary(common, "connection", !property.publicUrl ? "blind" : !probe ? "blind" : probe.dnsAddresses.length && reachable ? "pass" : "critical", !property.publicUrl ? `No public address is set for ${property.label}, so it cannot be independently checked — add its public URL in the property's settings to switch on active monitoring.` : !probe ? `${property.label} has not yet been reached by an independent probe — the background canary runs on a schedule and will populate this; a persistent absence means the probe is not running.` : probe.dnsAddresses.length && reachable ? `${property.label} resolves publicly and answered an independent request.` : `${property.label} has no independently proven public route.`, [property.publicUrl || "Public URL missing", probe?.dnsAddresses.join(", ") || "No public DNS evidence"]),
    canary(common, "freshness", !probe ? "blind" : age! > FRESHNESS_CRITICAL_MS ? "critical" : age! > FRESHNESS_AGREEMENT_MS ? "warning" : "pass", !probe ? `${property.label} has never completed a synthetic probe, so its live health is unverified — the background canary runs on a schedule and will record one; a persistent absence means the probe is not running.` : age! > FRESHNESS_AGREEMENT_MS ? `${property.label} active verification is stale — last independently checked ${duration(age!)} ago, outside its ${duration(FRESHNESS_AGREEMENT_MS)} agreement.` : `${property.label} was last independently checked ${duration(age!)} ago, inside its ${duration(FRESHNESS_AGREEMENT_MS)} agreement.`, [age === null ? "No probe timestamp" : `Probe age ${duration(age)}`, `Freshness agreement ${duration(FRESHNESS_AGREEMENT_MS)}`]),
    canary(common, "threshold", !probe ? "blind" : !reachable || (statusCode ?? 599) >= 500 ? "critical" : (statusCode ?? 499) >= 400 ? "warning" : "pass", reachable ? `${property.label} returned HTTP ${statusCode}.` : `${property.label} did not return an HTTP response.`, [`HTTP ${statusCode ?? "unavailable"}`, probe?.error || "Request completed"]),
    canary(common, "trend", !probe ? "blind" : probe.durationMs > 8_000 ? "critical" : probe.durationMs > 3_000 ? "warning" : probe.durationMs > 1_500 ? "watch" : "pass", !probe ? `${property.label} latency has no active sample.` : `${property.label} answered the canary in ${probe.durationMs}ms.`, [probe ? `End-to-end ${probe.durationMs}ms` : "No latency sample", "Warning 3000ms"]),
    canary(common, "anomaly", !probe ? "blind" : probe.failureKind === "redirect" || probe.redirectCount > 5 ? "critical" : probe.redirectCount > 2 ? "warning" : "pass", !probe ? `${property.label} redirect behaviour has not been inspected.` : `${property.label} completed with ${probe.redirectCount} redirect${probe.redirectCount === 1 ? "" : "s"}.`, [`Redirects ${probe?.redirectCount ?? "unknown"}`, probe?.finalUrl || "Final URL unknown"]),
    canary(common, "integrity", !probe ? "blind" : !reachable || !html ? "critical" : "pass", html ? `${property.label} returned a readable HTML document.` : `${property.label} did not return trustworthy HTML content.`, [probe?.contentType || "Content type unavailable", `${probe?.htmlBytes ?? 0} HTML bytes inspected`]),
    canary(common, "continuity", !probe ? "blind" : probe.titleDetected ? "pass" : "warning", probe?.titleDetected ? `${property.label} retains a discoverable page title.` : `${property.label} has no title in the inspected document.`, [probe?.titleDetected ? "Title detected" : "Title missing", "First 128KB inspected"]),
    canary({ ...common, domain: "marketing" }, "baseline", !probe ? "blind" : (probe.formsDetected ?? 0) > 0 ? "pass" : "watch", (probe?.formsDetected ?? 0) > 0 ? `${property.label} exposes a form in the inspected page.` : `${property.label} exposes no form on the monitored entry page; this may be intentional.`, [`Forms ${probe?.formsDetected ?? "unknown"}`, "Entry page only"]),
    canary(common, "confidence", !probe ? "blind" : securityCount >= 5 ? "pass" : securityCount >= 3 ? "watch" : "warning", !probe ? `${property.label} response security cannot be verified.` : `${property.label} returned ${securityCount}/6 expected browser security headers.`, [`Security headers ${securityCount}/6`, probe ? missingSecurityHeaders(probe) : "Headers unavailable"]),
    canary(common, "forecast", !probe ? "blind" : !isHttps || probe.tlsValid === false || (probe.tlsDaysRemaining ?? 999) < 7 ? "critical" : (probe.tlsDaysRemaining ?? 999) < 30 ? "warning" : probe.tlsDaysRemaining === undefined ? "watch" : "pass", !probe ? `${property.label} certificate health has not been checked.` : !isHttps ? `${property.label} is not protected by HTTPS.` : probe.tlsDaysRemaining === undefined ? `${property.label} certificate expiry could not be read.` : `${property.label} certificate has ${probe.tlsDaysRemaining} days remaining.`, [isHttps ? "HTTPS yes" : "HTTPS no", probe?.tlsDaysRemaining === undefined ? "TLS expiry unavailable" : `TLS expires in ${probe.tlsDaysRemaining}d`]),
    canary({ ...common, domain: "marketing" }, "volatility", !probe ? "blind" : probe.tagDetected ? "pass" : property.tagDeclared || property.lastSeenAt ? "warning" : "watch", probe?.tagDetected ? `${property.label} contains an Aqua-compatible telemetry marker.` : `${property.label} did not expose an Aqua-compatible telemetry marker in inspected HTML.`, [probe?.tagDetected ? "Aqua Tag marker found" : "Aqua Tag marker not found", property.lastSeenAt ? `Passive telemetry seen ${duration(now - property.lastSeenAt)} ago` : "No passive event evidence"]),
    canary(common, "resilience", !probe ? "blind" : reachable && property.lastSeenAt ? "pass" : reachable ? "watch" : "critical", reachable && property.lastSeenAt ? `${property.label} has independent active and passive evidence.` : reachable ? `${property.label} is actively reachable but passive telemetry is absent.` : `${property.label} has neither a successful canary nor a current active response.`, [reachable ? "Active canary answered" : "Active canary failed", property.lastSeenAt ? "Passive telemetry present" : "Passive telemetry absent"]),
  ];
}

function canaryIssues(property: RadarTelemetryProperty, probe: RadarSyntheticProbeResult | undefined, now: number): BusinessRadarIssue[] {
  if (!property.publicUrl) return [issue(property, "critical", "systems", "Live property has no canary URL", "This property is marked live but has no public URL for an independent availability check.", ["Expected live yes", "Public URL missing"], now)];
  if (!probe) return [issue(property, "critical", "systems", "Active canary has never run", "Passive telemetry alone cannot prove this live property is currently reachable. Run the radar or check the scheduled sweep.", [property.publicUrl, "No synthetic result retained"], now)];

  const issues: BusinessRadarIssue[] = [];
  const age = Math.max(0, now - probe.checkedAt);
  if (!probe.statusCode || probe.statusCode >= 500 || ["dns", "timeout", "network", "unsafe-url", "redirect"].includes(probe.failureKind ?? "")) {
    issues.push(issue(property, "critical", "development", `${property.label} failed its active availability canary`, probe.error || "The property did not produce a healthy independent response.", [`Failure ${probe.failureKind || "no-response"}`, `HTTP ${probe.statusCode ?? "unavailable"}`, probe.finalUrl || probe.url], probe.checkedAt));
  } else if (probe.statusCode >= 400) {
    issues.push(issue(property, "warning", "development", `${property.label} returned HTTP ${probe.statusCode}`, "The site answered, but the monitored entry point is returning an error response.", [probe.finalUrl || probe.url, `HTTP ${probe.statusCode}`], probe.checkedAt));
  }
  if (age > FRESHNESS_AGREEMENT_MS) issues.push(issue(property, age > FRESHNESS_CRITICAL_MS ? "critical" : "warning", "systems", `${property.label} canary is stale`, "Independent verification is outside its freshness agreement — the scheduled probe sweep has not run on time.", [`Last checked ${duration(age)} ago`, `Freshness agreement ${duration(FRESHNESS_AGREEMENT_MS)}`], probe.checkedAt));
  if (probe.durationMs > 3_000) issues.push(issue(property, probe.durationMs > 8_000 ? "critical" : "warning", "development", `${property.label} is slow from the canary`, "End-to-end response time crossed the active monitoring guardrail.", [`Response ${probe.durationMs}ms`, "Warning 3000ms"], probe.checkedAt));
  if (safeProtocol(probe.finalUrl || property.publicUrl) !== "https:") issues.push(issue(property, "critical", "development", `${property.label} is not protected by HTTPS`, "The final public destination is using unencrypted HTTP.", [probe.finalUrl || property.publicUrl, `Redirects ${probe.redirectCount}`], probe.checkedAt));
  if (probe.tlsValid === false) issues.push(issue(property, "critical", "development", `${property.label} TLS validation failed`, "The certificate chain, hostname, or validity window could not be trusted by the independent canary.", [probe.finalUrl || probe.url, "TLS valid no"], probe.checkedAt));
  else if (probe.tlsDaysRemaining !== undefined && probe.tlsDaysRemaining < 30) issues.push(issue(property, probe.tlsDaysRemaining < 7 ? "critical" : "warning", "compliance", `${property.label} certificate expires soon`, "Renew the public certificate before visitors or integrations lose trust.", [`${probe.tlsDaysRemaining} days remaining`, probe.tlsExpiresAt ? isoDateTimeValue(probe.tlsExpiresAt) ?? "Expiry needs review" : "Expiry unavailable"], probe.checkedAt));
  if (probe.contentType && !probe.contentType.includes("text/html")) issues.push(issue(property, "critical", "development", `${property.label} is not serving HTML`, "The monitored public entry point returned an unexpected document type.", [probe.contentType, `${probe.htmlBytes ?? 0} bytes inspected`], probe.checkedAt));
  if (!probe.tagDetected) issues.push(issue(property, property.tagDeclared || property.lastSeenAt ? "warning" : "watch", "marketing", `${property.label} Aqua Tag marker is missing`, "The independent page inspection could not find an Aqua-compatible telemetry marker. Confirm deployment and consent behaviour.", ["Marker not found", property.lastSeenAt ? "Passive events exist" : "No passive events"], probe.checkedAt));
  const securityCount = Object.values(probe.securityHeaders).filter(Boolean).length;
  if (securityCount < 3) issues.push(issue(property, "warning", "development", `${property.label} browser security headers are weak`, "The public response is missing most of the baseline browser hardening headers.", [`${securityCount}/6 headers present`, missingSecurityHeaders(probe)], probe.checkedAt));
  return issues;
}

function canary(
  common: {
    domain: AdvisorDomain;
    familyId: string;
    familyLabel: string;
    scope: "synthetic";
    href: string;
    sourceId: string;
    measuredAt: number;
    lastSeenAt?: number;
  },
  lens: RadarRuleLens,
  status: RadarCheckStatus,
  detail: string,
  evidence: string[],
): BusinessRadarCheck {
  return {
    id: `${common.familyId}:${lens}`,
    ruleId: `synthetic:${lens}`,
    ...common,
    lens,
    lensLabel: readable(lens),
    status,
    title: `${common.familyLabel}: ${readable(lens).toLowerCase()}`,
    detail,
    evidence,
  };
}

function issue(
  property: RadarTelemetryProperty,
  severity: BusinessRadarIssue["severity"],
  domain: BusinessRadarIssue["domain"],
  title: string,
  detail: string,
  evidence: string[],
  detectedAt: number,
): BusinessRadarIssue {
  return {
    id: `synthetic:${property.id}:${slug(title)}`,
    severity,
    domain,
    title,
    detail,
    evidence,
    href: property.href,
    detectedAt,
    sourceIds: [`synthetic:${property.id}`, property.id],
  };
}

function missingSecurityHeaders(probe: RadarSyntheticProbeResult): string {
  const labels: Record<keyof RadarSyntheticProbeResult["securityHeaders"], string> = {
    strictTransportSecurity: "HSTS",
    contentSecurityPolicy: "CSP",
    frameProtection: "frame protection",
    contentTypeOptions: "nosniff",
    referrerPolicy: "referrer policy",
    permissionsPolicy: "permissions policy",
  };
  const missing = Object.entries(probe.securityHeaders).filter(([, present]) => !present).map(([key]) => labels[key as keyof typeof labels]);
  return missing.length ? `Missing ${missing.join(", ")}` : "All baseline headers present";
}

function safeProtocol(value?: string): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).protocol; } catch { return undefined; }
}

// The missing hours band mattered little while the agreement was 15 minutes and
// every age it ever printed was small. On the daily cadence it prints the age of
// every live canary, and "Probe age 1200m" is not a readable way to say 20 hours
// — nor "1d" a readable way to say 25. → issues #170.
function duration(milliseconds: number): string {
  if (milliseconds < MINUTE) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < HOUR) return `${Math.round(milliseconds / MINUTE)}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / HOUR)}h`;
  const days = Math.floor(milliseconds / DAY);
  const hours = Math.round((milliseconds % DAY) / HOUR);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function readable(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
