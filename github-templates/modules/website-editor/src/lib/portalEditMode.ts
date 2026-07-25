"use client";

// Portal-edit-mode helpers. Faithful port of `02/src/lib/portalEditMode.ts`.
//
// `buildEditorUrl` is what SitesPage's "Edit in editor" buttons call to
// construct the deep-link into the visual editor for a given site/host.
// In R4 the URL convention is plugin-namespaced
// (`/portal/clients/[clientId]/editor`) — the host argument is kept for
// API compatibility but ignored.

const EDIT_FLAG_KEY = "lk_portal_edit_mode_v1";
const EVENT = "lk-portal-edit-mode-change";

// Path patterns that the edit overlay never activates on (login, public
// API endpoints, etc.). The storefront overlay reads this when deciding
// whether to inject the Edit-mode chrome.
const EXCLUDED_PATHS = [
  /^\/api\//,
  /^\/login/,
  /^\/account/,
  /^\/checkout/,
  /^\/_next\//,
];

export function isExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return EXCLUDED_PATHS.some(rx => rx.test(pathname));
}

export function isEditModeFlagged(): boolean {
  if (typeof window === "undefined") return false;
  // URL flag wins (operator just navigated in from the editor host).
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("portal_edit") === "1") return true;
  } catch { /* malformed URL; fall through */ }
  // Otherwise honour the persisted flag.
  try { return window.localStorage.getItem(EDIT_FLAG_KEY) === "1"; }
  catch { return false; }
}

export function setEditMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(EDIT_FLAG_KEY, "1");
    else window.localStorage.removeItem(EDIT_FLAG_KEY);
  } catch { /* sealed-off browser */ }
  window.dispatchEvent(new Event(EVENT));
}

export function onEditModeChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// Build a URL into the visual editor for a given (host, path).
// Round-4: collapses to the plugin-namespaced editor route since
// foundation routes plugin admin pages there. The host argument is
// kept for API compatibility with 02's signature.
export function buildEditorUrl(_host: string | undefined, path: string = "/"): string {
  const params = new URLSearchParams();
  if (path && path !== "/") params.set("path", path);
  const qs = params.toString();
  return `../editor${qs ? `?${qs}` : ""}`;
}
