// Privacy mode — one key, two controls.
//
// Ed, 2026-08-29: *"I want it mirrored in both places like everything else I
// asked — every setting in settings."*
//
// The topbar keeps its button, because privacy mode is the one toggle you reach
// for BECAUSE somebody just walked up behind you; a settings page is too far
// away at that moment. Settings gets the same switch so the list of what this
// workspace can do is complete.
//
// Two controls, one key — extracted here rather than copied, for the reason
// this session kept relearning: a second copy of a storage key drifts, and the
// day it drifts one control silently stops turning the other off.
//
// ── sessionStorage, deliberately ──────────────────────────────────────────
//
// Privacy mode ends when the session does. A person who blurred their screen
// for a meeting should not find their own numbers still hidden next Monday and
// conclude the app is broken.

export const PRIVACY_MODE_STORAGE_KEY = "milesymedia-privacy-mode";
export const PRIVACY_MODE_EVENT = "aquacrm:privacy-mode";
/** The attribute `globals.css` hangs the blur rules on. */
export const PRIVACY_MODE_ATTRIBUTE = "data-privacy-mode";

export function privacyModeEnabled(): boolean {
  try {
    return window.sessionStorage.getItem(PRIVACY_MODE_STORAGE_KEY) === "on";
  } catch {
    // Private browsing throws on sessionStorage. Off is the honest answer:
    // claiming privacy mode is ON while nothing is blurred is the one wrong
    // direction for this particular toggle.
    return false;
  }
}

/**
 * Turn it on or off, everywhere.
 *
 * Writes the key, sets the attribute, and fires the event so the OTHER control
 * repaints. Without the event, toggling in Settings would leave the topbar
 * button showing the wrong state until a reload — which reads as "the setting
 * did not take".
 */
export function setPrivacyMode(enabled: boolean): void {
  try {
    window.sessionStorage.setItem(PRIVACY_MODE_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* private mode — the attribute below still applies for this page */
  }
  document.documentElement.toggleAttribute(PRIVACY_MODE_ATTRIBUTE, enabled);
  window.dispatchEvent(new CustomEvent(PRIVACY_MODE_EVENT, { detail: { enabled } }));
}
