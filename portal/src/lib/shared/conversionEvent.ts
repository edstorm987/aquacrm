// The ONE conversion-event predicate.
//
// Until 2026-08-30 this exact expression existed three times, verbatim, in
// three files (radarTelemetry's isConversion, commandIntelligenceService's
// scopedConversion, performanceAnalytics' isConversion) — three copies of the
// same business rule that could only ever drift apart silently, feeding the
// website-conversion KPI from whichever copy a surface happened to reach.
// Canonical metric registry: command:website-conversion names this as its
// exclusion rule; smoke-metric-registry.test.ts pins that the three consumers
// import it rather than restating it.
//
// Pure and client-safe: performanceAnalytics is a client-usable module.

/** Does a telemetry event count as a conversion? */
export function isConversionTelemetryEvent(event: { type: string; metric?: string }): boolean {
  return event.type === "conversion"
    || event.type === "form"
    || (event.type === "interaction" && event.metric === "conversion");
}
