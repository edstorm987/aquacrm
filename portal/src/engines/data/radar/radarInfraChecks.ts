import type {
  BusinessRadarCheck,
  RadarInfraDatabaseHealth,
  RadarInfraHealthSnapshot,
  RadarCheckStatus,
} from "@/engines/data/radar/businessRadar";
import { RADAR_PROBE_CADENCE_MS } from "@/engines/data/radar/businessRadar";

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
 *
 * AGE IS PART OF THE ANSWER (issues #170). Every check reads the snapshot's own
 * `checkedAt` — it used to stamp all of them with the Pulse's `now`, so a
 * 24-hour-old "connected" rendered identically to one probed a second ago. The
 * snapshot's age is stated as evidence on every check, gets a `freshness` check
 * of its own, and once the evidence is older than the deployed probe cadence a
 * reading stops being proof and degrades to `blind` — the same rule the module
 * health family already applies, and it cuts both ways: an expired `down` is no
 * more current than an expired `connected`.
 */

const HREF = "/portal/agency?station=command&panel=infra-health";

// Latency guardrails for a DB round-trip (ms).
const LATENCY_WATCH_MS = 250;
const LATENCY_WARNING_MS = 500;
const LATENCY_CRITICAL_MS = 1_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
  checkedAt?: number,
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
    // `measuredAt` is when the Pulse read the snapshot; `lastSeenAt` is when the
    // probe behind it actually ran. Keeping them separate is the whole point.
    measuredAt: now,
    lastSeenAt: checkedAt,
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

/**
 * An answer older than the deployed probe cadence is no longer evidence of
 * anything current. `inactive` stays inactive — "there is nothing to probe on
 * this backend" does not become a blind spot by ageing — everything else
 * becomes a visible blind spot rather than a stale claim.
 */
function agedOut(status: RadarCheckStatus, stale: boolean): RadarCheckStatus {
  if (!stale || status === "inactive") return status;
  return "blind";
}

function ageEvidence(age: number, stale: boolean): string[] {
  return [
    `Evidence checked ${duration(age)} ago`,
    `Probe cadence ${duration(RADAR_PROBE_CADENCE_MS)}`,
    ...(stale ? ["Outside the probe cadence — reading not treated as current"] : []),
  ];
}

function staleDetail(age: number): string {
  return ` This reading is ${duration(age)} old — outside the ${duration(RADAR_PROBE_CADENCE_MS)} probe cadence — so it is shown as a blind spot rather than as a current answer.`;
}

function databaseChecks(db: RadarInfraDatabaseHealth, now: number, checkedAt: number, age: number, stale: boolean): BusinessRadarCheck[] {
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
      agedOut(reachabilityStatus(db), stale),
      `${scopeLabel} reachability`,
      (db.status === "connected"
        ? `${scopeLabel} responded to a round-trip query on the ${db.backend} backend.`
        : db.status === "down"
          ? `${scopeLabel} could not be reached: ${db.error ?? "probe failed"}.`
          : `${scopeLabel} is not probed on this backend.`) + (stale && db.status !== "untested" ? staleDetail(age) : ""),
      [`Backend ${db.backend}`, `Status ${db.status}`, ...(db.error ? [db.error] : []), ...rowCounts, ...ageEvidence(age, stale)],
      now,
      undefined,
      checkedAt,
    ),
    check(
      `${familyId}:latency`,
      "threshold",
      familyId,
      scopeLabel,
      agedOut(latencyStatus(db), stale),
      `${scopeLabel} round-trip latency`,
      (db.latencyMs === null
        ? `${scopeLabel} latency is not measured on this backend.`
        : `${scopeLabel} answered in ${db.latencyMs}ms (guardrail ${LATENCY_WARNING_MS}ms).`) + (stale && db.latencyMs !== null ? staleDetail(age) : ""),
      [db.latencyMs === null ? "Latency unavailable" : `Latency ${db.latencyMs}ms`, `Warning ${LATENCY_WARNING_MS}ms`, `Critical ${LATENCY_CRITICAL_MS}ms`, ...ageEvidence(age, stale)],
      now,
      db.latencyMs ?? undefined,
      checkedAt,
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
  const checkedAt = snapshot.checkedAt;
  const age = Math.max(0, now - checkedAt);
  const stale = age > RADAR_PROBE_CADENCE_MS;
  const checks = [
    ...databaseChecks(snapshot.primary, now, checkedAt, age, stale),
    ...snapshot.external.flatMap(db => databaseChecks(db, now, checkedAt, age, stale)),
  ];
  checks.push(
    check(
      "infra:storage:usage",
      "threshold",
      "infra:storage",
      "Storage usage",
      agedOut(snapshot.storage.measurable ? (snapshot.storage.bucketBytes === null ? "watch" : "pass") : "inactive", stale),
      "Storage usage",
      (snapshot.storage.measurable
        ? `Storage usage on the ${snapshot.storage.backend} backend.`
        : snapshot.storage.note) + (stale && snapshot.storage.measurable ? staleDetail(age) : ""),
      [`Backend ${snapshot.storage.backend}`, snapshot.storage.measurable ? `Bytes ${snapshot.storage.bucketBytes ?? "unknown"}` : "Bucket bytes not available in-app", ...ageEvidence(age, stale)],
      now,
      snapshot.storage.bucketBytes ?? undefined,
      checkedAt,
    ),
  );
  // The age of the evidence is itself a check, so "how old is what Radar is
  // showing me?" is answerable on the Radar surface instead of being invisible.
  checks.push(
    check(
      "infra:probe:freshness",
      "freshness",
      "infra:probe",
      "Infra probe",
      age > 3 * RADAR_PROBE_CADENCE_MS ? "critical" : stale ? "warning" : "pass",
      "Infra probe freshness",
      stale
        ? `The Infra sweep last ran ${duration(age)} ago, outside its ${duration(RADAR_PROBE_CADENCE_MS)} schedule. Every database and storage reading below is dated by that run, not by this page load.`
        : `The Infra sweep last ran ${duration(age)} ago, inside its ${duration(RADAR_PROBE_CADENCE_MS)} schedule. Database and storage readings are dated by that run, not by this page load.`,
      ageEvidence(age, stale),
      now,
      age,
      checkedAt,
    ),
  );
  return checks;
}

// Day-and-over ages keep their hours remainder rather than rounding to whole
// days. Rounding produced sentences that read as self-contradictory the moment
// the cadence became daily — a 25-hour-old reading rendered "1d", so the stale
// detail said "this reading is 1d old — outside the 1d probe cadence", which
// invites the reader to conclude the surface is broken rather than that their
// probe is late. Same shape as `formatRadarDuration` in the agency UI.
function duration(milliseconds: number): string {
  if (milliseconds < MINUTE) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  if (milliseconds < HOUR) return `${Math.round(milliseconds / MINUTE)}m`;
  if (milliseconds < DAY) return `${Math.round(milliseconds / HOUR)}h`;
  const days = Math.floor(milliseconds / DAY);
  const hours = Math.round((milliseconds % DAY) / HOUR);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}
