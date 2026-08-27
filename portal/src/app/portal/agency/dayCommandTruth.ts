type RadarSummary = {
  critical: number;
  warning: number;
};

export type DayRadarTruth = {
  state: "critical" | "warning" | "unknown" | "clear";
  watchLabel: "Red" | "Amber" | "Unknown" | "Clear";
  criticalLabel: string;
  warningLabel: string;
  contacts: number | null;
};

/**
 * A zero-shaped paused placeholder is not a successful Radar result. Known
 * incidents still win if a caller ever supplies them alongside a paused flag,
 * but an unscanned zero can only be unknown; only a loaded zero is clear.
 */
export function dayRadarTruth(summary: RadarSummary, paused: boolean): DayRadarTruth {
  if (summary.critical > 0) {
    return {
      state: "critical",
      watchLabel: "Red",
      criticalLabel: String(summary.critical),
      warningLabel: String(summary.warning),
      contacts: summary.critical + summary.warning,
    };
  }
  if (summary.warning > 0) {
    return {
      state: "warning",
      watchLabel: "Amber",
      criticalLabel: String(summary.critical),
      warningLabel: String(summary.warning),
      contacts: summary.warning,
    };
  }
  if (paused) {
    return {
      state: "unknown",
      watchLabel: "Unknown",
      criticalLabel: "Unknown",
      warningLabel: "Unknown",
      contacts: null,
    };
  }
  return {
    state: "clear",
    watchLabel: "Clear",
    criticalLabel: "0",
    warningLabel: "0",
    contacts: 0,
  };
}

export type DaySensorWatchState = "critical" | "warning" | "unknown" | "learning" | "healthy";

export function daySensorWatchState(
  summary: RadarSummary,
  radarPaused: boolean,
  instrumentStatuses: string[],
  intelligencePaused: boolean,
): DaySensorWatchState {
  if (summary.critical > 0 || instrumentStatuses.includes("critical")) return "critical";
  if (summary.warning > 0 || instrumentStatuses.includes("warning")) return "warning";
  if (radarPaused || intelligencePaused) return "unknown";
  if (instrumentStatuses.some(status => status === "learning" || status === "blind")) return "learning";
  return "healthy";
}

export type AttentionTruth = {
  tone: "critical" | "warning" | "info" | "clear";
  label: string;
};

/** Known client risks remain visible; an empty deferred fleet cannot say clear. */
export function clientAttentionTruth(count: number, riskCount: number, radarPaused: boolean): AttentionTruth {
  if (count > 0) {
    return {
      tone: riskCount ? "critical" : "warning",
      label: `${count} to review${riskCount ? ` · ${riskCount} at risk` : ""}`,
    };
  }
  if (radarPaused) return { tone: "info", label: "Not scanned" };
  return { tone: "clear", label: "All clear" };
}

/** A zero KPI count is clear only after the deferred intelligence scan loaded. */
export function intelligenceAttentionTruth(attention: number, paused: boolean): AttentionTruth {
  if (attention > 0) return { tone: "warning", label: `${attention} on watch` };
  if (paused) return { tone: "info", label: "KPI scan paused" };
  return { tone: "clear", label: "0 on watch" };
}
