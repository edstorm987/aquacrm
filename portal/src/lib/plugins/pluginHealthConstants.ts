// Plugin-health constants with NO dependencies, on purpose.
//
// `PLUGIN_HEALTH_STALE_MS` lived in `pluginHealthRunner.ts`, which imports the
// executable plugin registry — so any module that wanted the NUMBER also
// dragged the whole runtime into its static graph. That is exactly how the
// agency layout ended up statically reaching `_registry.ts` after the
// 2026-08-31 data-architecture moves (caught by smoke-shared-graph-split:
// layout → RadarQuickLookControl → businessIssueRadar → radarObservations →
// pluginHealthRunner → registry). A constant a radar rule compares against
// must not cost the runtime it describes.

const HOUR = 60 * 60 * 1000;

/** How old a plugin-health report may be before Radar calls it stale. */
export const PLUGIN_HEALTH_STALE_MS = 48 * HOUR;
