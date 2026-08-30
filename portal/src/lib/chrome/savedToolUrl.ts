// A saved tool's URL — the one value in this app a person types and the app
// then renders as an `href`.
//
// Ed, 2026-08-30: *"i might want to grab the url create a tool save the url link
// name it colour pallete tool and then it makes a card i click the card and boom
// sends me there in a new tab."*
//
// ── This is the same loaded gun as the file next door ─────────────────────
//
// `customCss.ts` refuses the three CSS constructs that turn a stylesheet into a
// network request. This is that posture applied to the other end of the same
// record. An arbitrary string from a text field, stored, and rendered back into
// an `href` is stored XSS: `href="javascript:…"` executes on click, and
// escaping the value protects nothing because the BROWSER is doing the work,
// not a script tag.
//
// ── An allow-list, where the stylesheet gets a denylist ───────────────────
//
// That difference is deliberate, not an inconsistency. CSS has three dangerous
// constructs and a thousand harmless ones, so a denylist is the proportionate
// tool. A URL scheme is a CLOSED set, and exactly two of them mean "open this
// in a tab". So `https:` and `http:` are named, and `javascript:`, `data:`,
// `vbscript:`, `file:`, `blob:` — and every scheme nobody has invented yet —
// are refused by default rather than by being remembered.
//
// ── Two more refusals, and why each one is here ───────────────────────────
//
//   • **Control characters are stripped before anything is judged.** The URL
//     parser removes tabs and newlines, and so does every browser reading an
//     href — which is exactly how `java\nscript:alert(1)` walks past a check
//     written as `startsWith("javascript:")`. Stripping first means the string
//     this file judges is the string the browser will act on.
//   • **Embedded credentials** (`https://user:pass@host`) are refused. The card
//     shows a label, so what somebody reads and where the click goes are
//     already two different things; a userinfo section is how that gap gets
//     exploited, and a password is not something this record should ever hold.
//
// ── What this does NOT promise ────────────────────────────────────────────
//
// That the destination is safe. An allowed `https:` link can redirect anywhere.
// What it promises is narrower and worth stating plainly: clicking a saved
// card cannot execute script in the portal, and cannot read a local file. The
// card is opened with `rel="noopener noreferrer"` for the rest — `noopener` so
// the opened page gets no handle on the portal tab, and `noreferrer` because
// portal URLs carry client and project ids that must not ride the Referer
// header to somebody else's server.
//
// ── Where this runs ───────────────────────────────────────────────────────
//
// On write AND on read, exactly like `customCss`, for the same reason: the
// realm state files are hand-edited in this repo, a record outlives the rule
// it was stored under, and a value that reaches an `href` must be trustworthy
// at the moment it is RENDERED rather than at the moment it was accepted. The
// read-side call site is `normaliseSavedTool` in
// `lib/server/chrome/userChromeLayout.ts`, which runs on every read.

/** Longer than any link worth a card; short enough that a full palette stays small. */
export const MAX_TOOL_URL_LENGTH = 1_024;

/** The only two schemes that mean "open this in a tab". */
const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

/* eslint-disable-next-line no-control-regex -- stripping these is the point. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export interface SavedToolUrlCheck {
  ok: boolean;
  /** The URL as the parser reads it — this is what gets stored, not what was typed. */
  url?: string;
  /** Why it was refused — shown verbatim, so it must read as an explanation. */
  reason?: string;
}

/** Is this address safe to store and hand back as something the person clicks? */
export function checkSavedToolUrl(value: string): SavedToolUrlCheck {
  const trimmed = value.replace(CONTROL_CHARS, "").trim();
  if (!trimmed) {
    return { ok: false, reason: "A web address is needed — it is what the card opens." };
  }
  if (trimmed.length > MAX_TOOL_URL_LENGTH) {
    // Refused, never truncated: half a URL is a link to somewhere else.
    return {
      ok: false,
      reason: `Too long — ${trimmed.length.toLocaleString()} characters, the limit is ${MAX_TOOL_URL_LENGTH.toLocaleString()}.`,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // No scheme at all, or nothing a URL parser recognises. Refused rather than
    // repaired here — the add form offers `https://` in the field, visibly and
    // before saving, so the guess belongs to the person and not to the store.
    return { ok: false, reason: "That is not a web address. It needs to start with https:// — the form will put that in for you." };
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      reason: `Only https:// and http:// addresses can be saved. "${parsed.protocol}" is refused because a card is something you click, and some schemes run code instead of opening a page.`,
    };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "A link with a username or password in it is not saved — put the address in, and sign in on the site itself." };
  }
  return { ok: true, url: parsed.toString() };
}

/**
 * The URL, or "" for anything refused.
 *
 * The counterpart to `customCssForInjection`, and the same idea: one function
 * that answers with a value already safe to render, so a caller cannot reach
 * for the input where it meant the checked output. A refusal is total — there
 * is no partly-applied URL, in the same way there is no half a stylesheet.
 */
export function savedToolHref(value: string | undefined): string {
  const check = checkSavedToolUrl(value ?? "");
  return check.ok && check.url ? check.url : "";
}
