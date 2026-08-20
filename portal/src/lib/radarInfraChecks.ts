import type {
  BusinessRadarCheck,
  RadarInfraDatabaseHealth,
  RadarInfraHealthSnapshot,
  RadarCheckStatus,
} from "@/lib/businessRadar";

/**
 * Infra-scope radar checks (radar upgrade Stage 4).
 *
 * Pure: turns the Infra sweep's snapshot into `infra`-scope checks the Pulse
 * folds into its check set — exactly as the synthetic canaries ride the
 * `synthetic` scope. This keeps the 2,040 catalogue untouched while a down/slow
 * DB becomes a real critical finding across reachability/latency, never a fake
 * pass. Every check is domain `systems`, scope `infra` (→ probe tier, external
 * dependency via the classifier).
 *
 * Honest states: `untested` (file/memory backend, or an external target with no
 * connection wired) → `inactive` (nothing to prove here, not a blind spot and
 * not a pass); storage bytes not measurable → `inactive` with the reason.
 */

const HREF = "/portal/agency?station=command&panel=infra-health";

// Latency guardrails for a DB round-trip (ms).
const LATENCY_WATCH_MS = 250;
const LATENCY_WARNING_MS = 500;
const LATENCY_CRITICAL_MS = 1_000;

function check(
  id: string,
  lens: BusinessRadarCheck["lens"],
  familyId: string,
  familyLabel: string,
  status: RadarCheckStatus,
  title: string,
  detail: string,
  evidence: string[],
  now: number,
  value?: number,
): BusinessRadarCheck {
  return {
    id,
    ruleId: `infra:${lens}`,
    domain: "systems",
    familyId,
    familyLabel,
    lens,
    lensLabel: lens.charAt(0).toUpperCase() + lens.slice(1),
    scope: "infra",
    status,
    title,
    detail,
    evidence,
    href: HREF,
    sourceId: familyId,
    measuredAt: now,
    value,
  };
}

function reachabilityStatus(db: RadarInfraDatabaseHealth): RadarCheckStatus {
  if (db.status === "connected") return "pass";
  if (db.status === "down") return "critical";
  return "inactive"; // untested — nothing to reach on this backend/target
}

function latencyStatus(db: RadarInfraDatabaseHealth): RadarCheckStatus {
  if (db.status === "down") return "critical";
  if (db.status === "untested" || db.latencyMs === null) return "inactive";
  if (db.latencyMs >= LATENCY_CRITICAL_MS) return "critical";
  if (db.latencyMs >= LATENCY_WARNING_MS) return "warning";
  if (db.latencyMs >= LATENCY_WATCH_MS) return "watch";
  return "pass";
}

function databaseChecks(db: RadarInfraDatabaseHealth, now: number): BusinessRadarCheck[] {
  const familyId = `infra:database:${db.id}`;
  const scopeLabel = db.external ? `External database ${db.label}` : db.label;
  const rowCounts = db.rowCounts
    ? Object.entries(db.rowCounts).map(([table, count]) => `${table}: ${count}`)
    : [];
  return [
    check(
      `${familyId}:reachability`,
      "connection",
      familyId,
      scopeLabel,
      reachabilityStatus(db),
      `${scopeLabel} reachability`,
      db.status === "connected"
        ? `${scopeLabel} responded to a round-trip query on the ${db.backend} backend.`
        : db.status === "down"
          ? `${scopeLabel} could not be reached: ${db.error ?? "probe failed"}.`
          : `${scopeLabel} is not probed on this backend.`,
      [`Backend ${db.backend}`, `Status ${db.status}`, ...(db.error ? [db.error] : []), ...rowCounts],
      now,
    ),
    check(
      `${familyId}:latency`,
      "threshold",
      familyId,
      scopeLabel,
      latencyStatus(db),
      `${scopeLabel} round-trip latency`,
      db.latencyMs === null
        ? `${scopeLabel} latency is not measured on this backend.`
        : `${scopeLabel} answered in ${db.latencyMs}ms (guardrail ${LATENCY_WARNING_MS}ms).`,
      [db.latencyMs === null ? "Latency unavailable" : `Latency ${db.latencyMs}ms`, `Warning ${LATENCY_WARNING_MS}ms`, `Critical ${LATENCY_CRITICAL_MS}ms`],
      now,
      db.latencyMs ?? undefined,
    ),
  ];
}

/**
 * Build the infra-scope checks from the latest Infra sweep snapshot. With no
 * snapshot yet (sweep hasn't run), emit a single honest `learning` check rather
 * than silence, so uninstrumented infra is visible.
 */
export function buildInfraHealthChecks(snapshot: RadarInfraHealthSnapshot | undefined, now: number): BusinessRadarCheck[] {
  if (!snapshot) {
    return [
      check(
        "infra:database:primary:reachability",
        "connection",
        "infra:database:primary",
        "AquaCRM database",
        "learning",
        "AquaCRM database reachability",
        "The Infra sweep has not recorded database health yet. It will populate on the next scheduled or full scan.",
        ["Infra sweep not yet run"],
        now,
      ),
    ];
  }
  const checks = [
    ...databaseChecks(snapshot.primary, now),
    ...snapshot.external.flatMap(db => databaseChecks(db, now)),
  ];
  checks.push(
    check(
      "infra:storage:usage",
      "threshold",
      "infra:storage",
      "Storage usage",
      snapshot.storage.measurable ? (snapshot.storage.bucketBytes === null ? "watch" : "pass") : "inactive",
      "Storage usage",
      snapshot.storage.measurable
        ? `Storage usage on the ${snapshot.storage.backend} backend.`
        : snapshot.storage.note,
      [`Backend ${snapshot.storage.backend}`, snapshot.storage.measurable ? `Bytes ${snapshot.storage.bucketBytes ?? "unknown"}` : "Bucket bytes not available in-app"],
      now,
      snapshot.storage.bucketBytes ?? undefined,
    ),
  );
  return checks;
}
