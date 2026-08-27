// Cinematic mode — the USER-FACING name for whether the app's cutscenes and
// route transitions play.
//
//   • Cinematic mode ON           → cutscenes & transitions PLAY.
//   • Cinematic mode OFF (DEFAULT) → they are skipped for speed.
//
// This replaces the old "Performance mode" toggle, whose stored key
// (`aqua-performance-mode`, value "1" = SKIP) carried the inverted meaning.
// The three transition consumers (ClientWorkspaceTransition,
// CommandCenterTransition, DevModeLoadIn) now ask `cinematicModeEnabled()` and
// skip when it returns false.
//
// Migration: an existing `aqua-performance-mode` value is honoured on first
// read — perfMode "1" (was: skip) → cinematic OFF, perfMode "0" → cinematic ON
// — so anyone who had switched cutscenes off keeps them off. The setter clears
// the legacy key once a fresh cinematic preference is written.

export const CINEMATIC_MODE_STORAGE_KEY = "aqua-cinematic-mode";
export const CINEMATIC_MODE_EVENT = "aqua-cinematic-mode:change";

/** The legacy key. `"1"` meant "skip cutscenes" (performance mode ON). */
export const LEGACY_PERFORMANCE_MODE_STORAGE_KEY = "aqua-performance-mode";

/**
 * Derive the cinematic preference from a raw cinematic value plus a raw legacy
 * value. Pure so it can be unit-tested without a DOM. Default is FALSE: the
 * app must feel immediate unless somebody explicitly opts into cinematics.
 */
export function resolveCinematicPreference(
  cinematicRaw: string | null,
  legacyRaw: string | null,
): boolean {
  if (cinematicRaw === "1") return true;
  if (cinematicRaw === "0") return false;
  // No cinematic preference yet — fall back to the migrated legacy value.
  if (legacyRaw === "1") return false; // old performance-mode ON = skip = cinematic OFF
  if (legacyRaw === "0") return true;
  return false; // default: favour an immediate workspace over a load-in scene
}

export function cinematicModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return resolveCinematicPreference(
      window.localStorage.getItem(CINEMATIC_MODE_STORAGE_KEY),
      window.localStorage.getItem(LEGACY_PERFORMANCE_MODE_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

export function setCinematicMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CINEMATIC_MODE_STORAGE_KEY, enabled ? "1" : "0");
    // Retire the legacy key so it can never contradict a fresh choice.
    window.localStorage.removeItem(LEGACY_PERFORMANCE_MODE_STORAGE_KEY);
  } catch {
    /* The preference still applies to this page when storage is unavailable. */
  }
  document.documentElement.dataset.cinematicMode = String(enabled);
  window.dispatchEvent(new CustomEvent(CINEMATIC_MODE_EVENT, { detail: { enabled } }));
}
