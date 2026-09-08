// Stored-code safe mode (assume-breach containment, Phase 0-C).
//
// The verification pass confirmed operator-pasted customHead / customFoot and
// HtmlBlock markup is rendered with dangerouslySetInnerHTML into an
// AUTHENTICATED, SAME-ORIGIN page (the /client-website-preview route requires
// an agency session and runs on aqua-crm.com), while the CSP allows
// 'unsafe-inline' — so a stored <img onerror>, <svg onload>, entity-encoded
// javascript: URI or <style> exfiltration renders and RUNS with the operator's
// cookies. The existing validation is REGEX-based (`/<script/`, `/<iframe/`,
// a fixed on*-attribute list) — exactly the approach the mission says must not
// be relied on: it misses <svg onload=>, <math>, <object>, srcset, CSS
// expression()/url() exfil, HTML-entity and split-tag evasions.
//
// A correct fix needs a real HTML parser + allowlist sanitiser, which needs a
// vetted new dependency (none is installed). Until origin isolation + a parser
// sanitiser land, this module FAILS CLOSED: in production, active custom
// head/foot/HTML injection is DISABLED. The editor still stores the markup and
// shows it in the editor's own sandboxed iframe; it is simply not stamped into
// the authenticated same-origin render. Non-production keeps rendering it so
// the feature can be developed and the parser sanitiser built and tested.
//
// The switch is server-controlled (NODE_ENV, baked at build) with an explicit
// break-glass (STORED_CODE_UNSAFE_RENDER=allow) that a future migration to a
// separate preview origin will remove. Setting the break-glass is loud.

export type StoredCodeMode = "safe" | "unsafe-render";

export function storedCodeMode(env: NodeJS.ProcessEnv = process.env): StoredCodeMode {
  if (env.NODE_ENV !== "production") return "unsafe-render";
  // Break-glass, production only, deliberately awkward to set and never a
  // default. It exists so a separate-origin preview rollout can flip it per
  // environment; it should never be on for aqua-crm.com.
  if (env.STORED_CODE_UNSAFE_RENDER === "allow") return "unsafe-render";
  return "safe";
}

/** True when raw operator markup may be stamped into the authenticated same-origin render. */
export function mayRenderStoredMarkup(env: NodeJS.ProcessEnv = process.env): boolean {
  return storedCodeMode(env) === "unsafe-render";
}

/**
 * The value to inject for a stored markup slot. In safe mode returns null (the
 * caller renders nothing / a placeholder); otherwise the original string.
 * Centralised so every sink (customHead, customFoot, HtmlBlock, FooterBlock,
 * MarqueeBlock, TextBlock, staticExport) makes the SAME decision.
 */
export function storedMarkupOrNull(value: string | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!value) return null;
  return mayRenderStoredMarkup(env) ? value : null;
}
