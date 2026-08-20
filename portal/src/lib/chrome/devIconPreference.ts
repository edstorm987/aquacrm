// Dev tools icon visibility — a server-readable preference driving whether the
// topbar Dev Console icon (`DevConsoleButton`) is shown.
//
// The profile-menu "Dev Mode" toggle used to NAVIGATE straight to the dev
// workspace (a bug: a menu toggle should toggle, not teleport). It now flips
// this cookie and reloads; the topbar reads it server-side and shows/hides the
// icon. Entering the workspace happens from INSIDE the icon's popover.
//
// Default: SHOWN. Founders see the icon today, so an absent cookie must keep it
// visible — turning the toggle OFF is the only thing that hides it. The
// server-side founder + Dev-Mode gate still applies on top of this preference;
// this cookie can only ever HIDE an icon the founder is already entitled to.

/** Cookie name. Read on the server by `devIconPreference()`. */
export const DEV_ICON_COOKIE = "aqua_dev_icon";

/** Client read of the current preference. Default true (shown). */
export function devIconCookieEnabled(): boolean {
  if (typeof document === "undefined") return true;
  // Only an explicit "0" hides it; anything else (including absent) shows it.
  return !document.cookie.split("; ").some(entry => entry === `${DEV_ICON_COOKIE}=0`);
}

/** Persist the preference and reload so the topbar re-renders with/without it. */
export function setDevIconCookie(shown: boolean): void {
  if (typeof document === "undefined") return;
  if (shown) {
    // Clearing back to the default (also shown) keeps cookies tidy.
    document.cookie = `${DEV_ICON_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    document.cookie = `${DEV_ICON_COOKIE}=0; path=/; max-age=31536000; samesite=lax`;
  }
  if (typeof window !== "undefined") window.location.reload();
}
