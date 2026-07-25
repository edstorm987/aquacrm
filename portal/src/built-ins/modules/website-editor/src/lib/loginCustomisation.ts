"use client";

// Customisation for the public login & signup page. Faithful port of
// `02/src/lib/admin/loginCustomisation.ts`. Persists locally per-tenant
// under a localStorage key namespaced by the active client/agency
// session — the foundation rehydrates server-side via the
// `/api/portal/website-editor/login-customisation` API (Round-3 stub).
//
// Round-3 status: client-side localStorage cache + change events match
// 02 1:1; server-side persistence is a Round-4 follow-up (currently
// keys are global per-browser like 02). When T1 wires a TenantPort
// brand-kit getter/setter, swap `KEY` → `t/{agencyId}/{clientId}/...`.

const KEY = "lk_login_customisation_v1";
const EVENT = "lk-login-config-change";

export type LoginLayout = "split" | "centered" | "minimal";

export interface LoginFooterLink {
  label: string;
  href: string;
}

export interface LoginCustomisation {
  // Layout
  layout: LoginLayout;
  // Hero image (for split layout)
  heroImage: string;
  heroOverlayColor: string;
  heroOverlayOpacity: number;
  // Branding
  logoUrl: string;
  showLogo: boolean;
  // Headlines
  headline: string;
  subheadline: string;
  signupHeadline: string;
  signupSubheadline: string;
  // CTA labels
  loginButtonLabel: string;
  signupButtonLabel: string;
  // Toggles
  enableGoogle: boolean;
  enableSignup: boolean;
  enableForgotPassword: boolean;
  showSocialProof: boolean;
  socialProofText: string;
  // Footer
  footerLinks: LoginFooterLink[];
  // Colours
  primaryColor: string;
  bgColor: string;
  cardColor: string;
  textColor: string;
  // Custom CSS
  customCSS: string;
}

export const DEFAULT_LOGIN: LoginCustomisation = {
  layout: "centered",
  heroImage: "",
  heroOverlayColor: "#000000",
  heroOverlayOpacity: 0.4,
  logoUrl: "",
  showLogo: true,
  headline: "Welcome back",
  subheadline: "Sign in to continue.",
  signupHeadline: "Create your account",
  signupSubheadline: "Join the family.",
  loginButtonLabel: "Sign in",
  signupButtonLabel: "Create account",
  enableGoogle: true,
  enableSignup: true,
  enableForgotPassword: true,
  showSocialProof: false,
  socialProofText: "Trusted by 5,000+ happy customers worldwide",
  footerLinks: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/shipping-returns" },
  ],
  primaryColor: "#E8621A",
  bgColor: "",
  cardColor: "",
  textColor: "",
  customCSS: "",
};

export function getLoginCustomisation(): LoginCustomisation {
  if (typeof window === "undefined") return DEFAULT_LOGIN;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LOGIN;
    return { ...DEFAULT_LOGIN, ...(JSON.parse(raw) as Partial<LoginCustomisation>) };
  } catch {
    return DEFAULT_LOGIN;
  }
}

export function saveLoginCustomisation(patch: Partial<LoginCustomisation>) {
  if (typeof window === "undefined") return;
  const next = { ...getLoginCustomisation(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function resetLoginCustomisation() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function onLoginCustomisationChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// ─── Round-1 compatibility shim ──────────────────────────────────────────
//
// The Round-1 LoginFormBlock and other callers may have used the
// minimal-shape helper below. Keep them callable so existing code
// doesn't break; both forms read/write the same localStorage key.

export const DEFAULT_LOGIN_CUSTOMISATION = DEFAULT_LOGIN;

export function mergeLoginCustomisation(
  overrides: Partial<LoginCustomisation> | undefined,
): LoginCustomisation {
  return { ...DEFAULT_LOGIN, ...(overrides ?? {}) };
}
