export const PERFORMANCE_MODE_STORAGE_KEY = "aqua-performance-mode";
export const PERFORMANCE_MODE_EVENT = "aqua-performance-mode:change";

export function performanceModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPerformanceMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* The preference still applies to this page when storage is unavailable. */
  }
  document.documentElement.dataset.performanceMode = String(enabled);
  window.dispatchEvent(new CustomEvent(PERFORMANCE_MODE_EVENT, { detail: { enabled } }));
}
