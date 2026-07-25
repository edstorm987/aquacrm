"use client";

// Activity logging is owned by the foundation; until T1 publishes a
// shim, route logActivity to a no-op so the lifted popup admin page
// stays green.
const logActivity: (..._args: unknown[]) => void = () => {};

// Discount popup customisation. Stored in localStorage so admins can edit
// trigger conditions, copy and styling without redeploying.

const KEY = "lk_popup_config_v1";
const EVENT = "lk-popup-change";

export type PopupTrigger = "delay" | "scroll" | "exit" | "always";

export interface PopupConfig {
  enabled: boolean;
  // Trigger
  trigger: PopupTrigger;
  delaySeconds: number;            // for "delay"
  scrollPercent: number;           // for "scroll"
  // Copy
  eyebrow: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  consentLabel: string;
  declineLabel: string;
  // Reveal screen
  successText: string;
  discountCode: string;
  copyLabel: string;
  copiedLabel: string;
  // Visibility rules
  hideForLoggedIn: boolean;
  hideAfterSeen: boolean;
  hideForReturningCustomers: boolean;
  // Styling
  accentColor: string;
  // Targeting
  showOnPaths: string[];           // empty = all paths
  hideOnPaths: string[];
}

export const DEFAULT_POPUP: PopupConfig = {
  enabled: true,
  trigger: "delay",
  delaySeconds: 4,
  scrollPercent: 50,
  eyebrow: "Unlock The Ritual",
  headline: "Take 10% off your first order",
  subheadline: "Join the Odo community for exclusive early access to small-batch releases and ancestral skincare wisdom.",
  ctaLabel: "Reveal My Code",
  consentLabel: "I agree to receive marketing emails with exclusive offers and ancestral skincare wisdom.",
  declineLabel: "No thanks, I prefer paying full price",
  successText: "Your code is ready!",
  discountCode: "ODO10",
  copyLabel: "Copy Code",
  copiedLabel: "Copied!",
  hideForLoggedIn: true,
  hideAfterSeen: true,
  hideForReturningCustomers: true,
  accentColor: "#E8621A",
  showOnPaths: [],
  hideOnPaths: ["/checkout", "/admin", "/account"],
};

export function getPopupConfig(): PopupConfig {
  if (typeof window === "undefined") return DEFAULT_POPUP;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_POPUP;
    return { ...DEFAULT_POPUP, ...(JSON.parse(raw) as Partial<PopupConfig>) };
  } catch {
    return DEFAULT_POPUP;
  }
}

export function savePopupConfig(patch: Partial<PopupConfig>) {
  if (typeof window === "undefined") return;
  const next = { ...getPopupConfig(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
  logActivity({
    category: "marketing",
    action: `Updated discount popup${patch.enabled !== undefined ? ` (${patch.enabled ? "enabled" : "disabled"})` : ""}`,
    resourceLink: "/admin/popup",
  });
}

export function resetPopupConfig() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
  logActivity({ category: "marketing", action: "Reset discount popup to defaults", resourceLink: "/admin/popup" });
}

export function onPopupChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// Helper used by the popup itself to decide whether to fire on the current path.
export function shouldShowOnPath(cfg: PopupConfig, pathname: string): boolean {
  if (cfg.hideOnPaths.some(p => pathname.startsWith(p))) return false;
  if (cfg.showOnPaths.length > 0) {
    return cfg.showOnPaths.some(p => pathname.startsWith(p));
  }
  return true;
}
