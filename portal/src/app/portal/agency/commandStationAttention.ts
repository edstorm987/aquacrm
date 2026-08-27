import type { CommandStationAttention } from "./_CommandStationNav";

export function radarStationAttention(
  summary: { critical: number; warning: number },
  paused: boolean,
): CommandStationAttention {
  if (paused) {
    return {
      count: 0,
      tone: "info",
      label: "Radar paused · run scan to load current incidents",
    };
  }
  return {
    count: summary.critical + summary.warning,
    tone: summary.critical ? "critical" : summary.warning ? "warning" : "clear",
    label: summary.critical
      ? `${summary.critical} critical and ${summary.warning} warning Radar incidents`
      : summary.warning
        ? `${summary.warning} warning Radar incidents`
        : "Radar has no critical or warning incidents",
  };
}

export function devTeamStationAttention(
  loaded: boolean,
  blockedCount: number,
  launchBlockerCount: number,
): CommandStationAttention {
  if (!loaded) {
    return {
      count: 0,
      tone: "info",
      label: "Blocked status loads with the Dev Team station",
    };
  }
  const stalledCount = Math.max(0, blockedCount - launchBlockerCount);
  return {
    count: blockedCount,
    tone: launchBlockerCount ? "critical" : blockedCount ? "warning" : "clear",
    label: blockedCount
      ? `${blockedCount} blocked on the Dev Team board — ${launchBlockerCount} open launch blocker${launchBlockerCount === 1 ? "" : "s"} and ${stalledCount} stalled plan${stalledCount === 1 ? "" : "s"}`
      : "Nothing is blocked on the Dev Team board",
  };
}
