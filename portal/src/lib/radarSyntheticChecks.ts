import type {
  AdvisorDomain,
  BusinessRadarCheck,
  BusinessRadarIssue,
  RadarCheckStatus,
  RadarRuleLens,
} from "@/lib/businessRadar";
import type { RadarTelemetryProperty, RadarTelemetrySnapshot } from "@/lib/server/radarTelemetry";
import type { RadarSyntheticProbeResult } from "@/server/types";
import { isoDateTimeValue } from "@/lib/formatDateTime";

const MINUTE = 60_000;
const DAY = 86_400_000;

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
    canary(common, "connection", !property.publicUrl ? "blind" : !probe ? "blind" : probe.dnsAddresses.length && reachable ? "pass" : "critical", probe?.dnsAddresses.length && reachable ? `${property.label} resolves publicly and answered an independent request.` : `${property.label} has no independently proven public route.`, [property.publicUrl || "Public URL missing", probe?.dnsAddresses.join(", ") || "No public DNS evidence"]),
    canary(common, "freshness", !probe ? "blind" : age! > 60 * MINUTE ? "critical" : age! > 15 * MINUTE ? "warning" : "pass", !probe ? `${property.label} has never completed a synthetic probe.` : age! > 15 * MINUTE ? `${property.label} active verification is stale.` : `${property.label} was independently checked recently.`, [age === null ? "No probe timestamp" : `Probe age ${duration(age)}`, "Freshness agreement 15m"]),
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
  if (age > 15 * MINUTE) issues.push(issue(property, age > 60 * MINUTE ? "critical" : "warning", "systems", `${property.label} canary is stale`, "Independent verification is outside its freshness agreement.", [`Last checked ${duration(age)} ago`, "Freshness agreement 15m"], probe.checkedAt));
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

function duration(milliseconds: number): string {
  if (milliseconds < MINUTE) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / MINUTE)}m`;
  return `${Math.round(milliseconds / DAY)}d`;
}

function readable(value: string): string {
  return value.replace(/[-_:]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
