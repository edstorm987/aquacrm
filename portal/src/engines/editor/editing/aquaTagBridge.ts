/**
 * The one contract between the Aqua Tag and the editor.
 *
 * The tag is the thing that has mapped a page: connect it, press Map, and a
 * click on the live site resolves to an exact element. Everything the editor
 * does with a selection — show the words, hand it to the assistant, drop it
 * into the builder, jump to its file — is downstream of that one message
 * arriving intact. There is only ever ONE selection mechanism; what changes
 * per mode is only where the selection is sent.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 *
 * The two halves drifted because the contract was written twice, as bare
 * string literals, with nothing tying them together. The tag posts
 * `aqua-explorer:selected`; the Dev editor listened for `aqua:portal-block-select`
 * and dropped everything else on the floor. Both were "correct" in their own
 * file and nothing could ever have told anybody they disagreed.
 *
 * So this file is the single definition of the protocol for every TypeScript
 * consumer. Import the constants and the parser from here; do not retype a
 * message name as a literal anywhere else, because a literal is exactly how
 * the last drift happened.
 *
 * The tag itself CANNOT import this — `aquaTagSource.ts` is a template string
 * of browser JavaScript served at `/aqua-tag.js`, so it has no module system
 * and no types. That half is held in agreement by a test instead:
 * `scripts/smoke-aqua-tag-bridge.test.ts` reads the tag source and asserts its
 * literals, its protocol version, and the exact field list built by
 * `explorerDescribe` all match the declarations below. If you change one side,
 * that test fails until you change the other. That is the drift guard — please
 * do not weaken it.
 *
 * Client-safe on purpose: no server imports, no Node built-ins, no `next/*`.
 * It runs inside the editor in the browser.
 */

/**
 * Bumped only when the shape below changes incompatibly.
 *
 * The tag checks this on EVERY inbound message and silently returns when it
 * disagrees, so an editor→tag message without a matching `version` is not an
 * error — it is silence, which is far harder to debug. That is why every
 * outbound builder in this file sets it for you.
 */
export const AQUA_TAG_PROTOCOL_VERSION = 1 as const;

/**
 * Every message name in the protocol, exactly as the tag spells it.
 *
 * Copied from `src/lib/integrations/aquaTagSource.ts` and pinned by the drift
 * guard in both directions — a name added to the tag but not to this map fails
 * the test just as loudly as a name that stops matching.
 */
export const AQUA_TAG_MESSAGES = {
  /** editor → tag: "are you there?" Requires a `requestId`. */
  ping: "aqua-explorer:ping",
  /** tag → editor: the answer to a ping, carrying what the page can do. */
  ready: "aqua-explorer:ready",
  /** editor → tag: "describe yourself." Requires a `requestId`. */
  inspect: "aqua-explorer:inspect",
  /** tag → editor: the answer to an inspect. */
  diagnostics: "aqua-explorer:diagnostics",
  /** editor → tag: start highlighting and reporting clicks. */
  enable: "aqua-explorer:enable",
  /** editor → tag: stop. Clears the selection and reports the clearing. */
  disable: "aqua-explorer:disable",
  /** tag → editor: what the operator just clicked, or null when cleared. */
  selected: "aqua-explorer:selected",
  /** editor → tag: change one mapped element in place, for preview only. */
  patch: "aqua-explorer:patch",
  /** editor → tag: put every patched element back how it was found. */
  reset: "aqua-explorer:reset",
  /**
   * editor → tag: throttle what the page's SCRIPTS request, or null to clear.
   *
   * Honest scope, stated once here and repeated in the UI: the tag runs inside
   * the page, so it can wrap `window.fetch` and `XMLHttpRequest` and apply
   * genuine latency, bandwidth pacing and offline failure to everything the
   * page's own scripts request. It CANNOT slow the page load itself — the
   * document, stylesheets and images are fetched by the browser before any
   * script runs, and only DevTools can throttle those. Nothing in this
   * protocol fakes a slow load, and nothing ever should.
   */
  throttle: "aqua-explorer:throttle",
  /**
   * tag → editor: what is ACTUALLY in force after a throttle message.
   *
   * The editor renders this reply, never its own request — a wrap that could
   * not be installed (no `fetch` on some ancient browser) answers null, and
   * the UI says "not throttled" instead of lying amber.
   */
  throttleApplied: "aqua-explorer:throttle-applied",
} as const;

export type AquaTagMessageName = (typeof AQUA_TAG_MESSAGES)[keyof typeof AQUA_TAG_MESSAGES];

/**
 * The style properties the protocol carries, in one place.
 *
 * The tag reads exactly these in `explorerDescribe` and writes exactly these
 * in `explorerPatchElement`'s allow-list. Both lists are pinned to this one by
 * the drift guard, so read-back and write-through can never disagree about
 * which properties exist.
 */
export const AQUA_TAG_STYLE_PROPERTIES = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "textAlign",
] as const;

export type AquaTagStyleProperty = (typeof AQUA_TAG_STYLE_PROPERTIES)[number];

export type AquaTagElementStyles = Record<AquaTagStyleProperty, string>;

/**
 * One mapped element, field for field as `explorerDescribe` builds it.
 *
 * `text` is absent on images and `src`/`alt` are absent on everything else —
 * the tag sends `undefined` for the branch that does not apply, which drops
 * the key during structured cloning. Treat both as genuinely optional.
 */
export interface AquaTagElement {
  /** Stable for the lifetime of the page. The tag's handle for patching. */
  id: string;
  tagName: string;
  kind: "text" | "image";
  /** What to call it in the inspector: the edit label, aria-label, alt, or its own text. */
  label: string;
  /** Text elements only. Capped at 5000 characters by the tag. */
  text?: string;
  /** Images only. */
  src?: string;
  /** Images only. */
  alt?: string;
  styles: AquaTagElementStyles;
}

/**
 * Every field of `AquaTagElement`, available at runtime.
 *
 * The drift guard needs to compare the declared shape against the object the
 * tag actually builds, and a TypeScript interface does not exist at runtime to
 * be compared. This maps it to a value — and the `Record<keyof …, true>` is
 * doing real work rather than being ceremony: adding a field to the interface
 * without adding it here is a missing-property error, and adding one here that
 * is not on the interface is an excess-property error. So `tsc` holds the
 * interface and this list together, and the test holds this list and the tag
 * together. Neither half can move on its own.
 */
const ELEMENT_FIELDS: Record<keyof AquaTagElement, true> = {
  id: true,
  tagName: true,
  kind: true,
  label: true,
  text: true,
  src: true,
  alt: true,
  styles: true,
};

export const AQUA_TAG_ELEMENT_FIELDS = Object.keys(ELEMENT_FIELDS) as (keyof AquaTagElement)[];

/** What the editor may change on a mapped element. Preview-only; nothing here is saved. */
export interface AquaTagPatch {
  text?: string;
  src?: string;
  alt?: string;
  styles?: Partial<AquaTagElementStyles>;
}

export interface AquaTagCapabilities {
  inspect: boolean;
  visualEditing: boolean;
  /**
   * Whether this tag build can throttle the page's scripted requests.
   *
   * Parsed leniently (absent reads as false, never as malformed) because the
   * tag is served with `max-age=300, stale-while-revalidate=3600` — a page can
   * be running a cached build from before this capability existed, and that
   * page's handshake must still complete.
   */
  networkThrottle: boolean;
  /** How many elements on this page the tag can resolve a click to. */
  editableElements: number;
}

/**
 * What a throttle actually applies. All three at once, not either/or:
 * a Slow-3G preset is latency AND pacing together.
 */
export interface AquaTagThrottleProfile {
  /** Waited out before every scripted request leaves, in milliseconds. */
  latencyMs: number;
  /**
   * Fetch response bodies are paced to roughly this many kilobits per second
   * by delaying each chunk in proportion to its size. 0 means unpaced.
   * XHR responses get latency and offline only — their body stream cannot be
   * paced from outside the request object.
   */
  downKbps: number;
  /** Scripted requests fail the way a dead network fails: fetch rejects with a TypeError, XHR fires `error`. */
  offline: boolean;
}

export interface AquaTagDiagnostics {
  path: string;
  title: string;
  readyState: string;
  viewport: { width: number; height: number };
  document: { width: number; height: number };
  counts: {
    editableElements: number;
    forms: number;
    images: number;
    links: number;
    resources: number;
  };
  performance: {
    responseMs?: number;
    domContentLoadedMs?: number;
    loadMs?: number;
    firstContentfulPaintMs?: number;
  };
  connection?: {
    effectiveType?: string;
    downlinkMbps?: number;
    saveData?: boolean;
  };
  recentErrors: string[];
}

// ── tag → editor ────────────────────────────────────────────────────────────

export interface AquaTagReadyMessage {
  type: typeof AQUA_TAG_MESSAGES.ready;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  requestId: string;
  propertyId: string;
  path: string;
  title: string;
  capabilities: AquaTagCapabilities;
}

export interface AquaTagDiagnosticsMessage {
  type: typeof AQUA_TAG_MESSAGES.diagnostics;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  requestId: string;
  diagnostics: AquaTagDiagnostics;
}

export interface AquaTagSelectedMessage {
  type: typeof AQUA_TAG_MESSAGES.selected;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  /** null when the selection was cleared — that is a real event, not an absence. */
  element: AquaTagElement | null;
}

export interface AquaTagThrottleAppliedMessage {
  type: typeof AQUA_TAG_MESSAGES.throttleApplied;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  /** The profile in force RIGHT NOW — null means normal speed. This is the truth the UI renders. */
  profile: AquaTagThrottleProfile | null;
}

export type AquaTagInboundMessage =
  | AquaTagReadyMessage
  | AquaTagDiagnosticsMessage
  | AquaTagSelectedMessage
  | AquaTagThrottleAppliedMessage;

/**
 * The same `Record<keyof …, true>` trick, for every OTHER shape the tag builds.
 *
 * `AQUA_TAG_ELEMENT_FIELDS` alone covered the element and left every ENVELOPE
 * around it unguarded — the ready reply, the capabilities block, the
 * diagnostics report and the `selected` wrapper itself. That is a real hole
 * rather than a theoretical one: a verifier applied eight single-side envelope
 * drifts (`requestId` → `replyTo`, a dropped `propertyId`, an extra field, …)
 * and all eight passed the guard while making `parseAquaTagMessage` return null
 * — the tag shouting and the editor hearing nothing, which is precisely the bug
 * this module exists to prevent.
 *
 * So every envelope is listed here and every list is pinned to the tag's own
 * object literals by `scripts/smoke-aqua-tag-bridge.test.ts`, in BOTH
 * directions: a field the tag gains that these do not know fails just as loudly
 * as one it loses.
 */
function fieldsOf<T>(fields: Record<keyof T, true>): (keyof T)[] {
  return Object.keys(fields) as (keyof T)[];
}

export const AQUA_TAG_READY_FIELDS = fieldsOf<AquaTagReadyMessage>({
  type: true,
  version: true,
  requestId: true,
  propertyId: true,
  path: true,
  title: true,
  capabilities: true,
});

export const AQUA_TAG_CAPABILITY_FIELDS = fieldsOf<AquaTagCapabilities>({
  inspect: true,
  visualEditing: true,
  networkThrottle: true,
  editableElements: true,
});

export const AQUA_TAG_THROTTLE_APPLIED_FIELDS = fieldsOf<AquaTagThrottleAppliedMessage>({
  type: true,
  version: true,
  profile: true,
});

export const AQUA_TAG_THROTTLE_PROFILE_FIELDS = fieldsOf<AquaTagThrottleProfile>({
  latencyMs: true,
  downKbps: true,
  offline: true,
});

export const AQUA_TAG_DIAGNOSTICS_MESSAGE_FIELDS = fieldsOf<AquaTagDiagnosticsMessage>({
  type: true,
  version: true,
  requestId: true,
  diagnostics: true,
});

export const AQUA_TAG_DIAGNOSTICS_FIELDS = fieldsOf<AquaTagDiagnostics>({
  path: true,
  title: true,
  readyState: true,
  viewport: true,
  document: true,
  counts: true,
  performance: true,
  connection: true,
  recentErrors: true,
});

export const AQUA_TAG_COUNT_FIELDS = fieldsOf<AquaTagDiagnostics["counts"]>({
  editableElements: true,
  forms: true,
  images: true,
  links: true,
  resources: true,
});

export const AQUA_TAG_PERFORMANCE_FIELDS = fieldsOf<AquaTagDiagnostics["performance"]>({
  responseMs: true,
  domContentLoadedMs: true,
  loadMs: true,
  firstContentfulPaintMs: true,
});

export const AQUA_TAG_CONNECTION_FIELDS = fieldsOf<NonNullable<AquaTagDiagnostics["connection"]>>({
  effectiveType: true,
  downlinkMbps: true,
  saveData: true,
});

export const AQUA_TAG_SELECTED_FIELDS = fieldsOf<AquaTagSelectedMessage>({
  type: true,
  version: true,
  element: true,
});

/** Both halves of a measured box, so the guard can pin them as one thing. */
export const AQUA_TAG_SIZE_FIELDS = ["width", "height"] as const;

// ── editor → tag ────────────────────────────────────────────────────────────

export interface AquaTagPingMessage {
  type: typeof AQUA_TAG_MESSAGES.ping;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  requestId: string;
}

export interface AquaTagInspectMessage {
  type: typeof AQUA_TAG_MESSAGES.inspect;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  requestId: string;
}

export interface AquaTagEnableMessage {
  type: typeof AQUA_TAG_MESSAGES.enable;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
}

export interface AquaTagDisableMessage {
  type: typeof AQUA_TAG_MESSAGES.disable;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
}

export interface AquaTagPatchMessage {
  type: typeof AQUA_TAG_MESSAGES.patch;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  elementId: string;
  patch: AquaTagPatch;
}

export interface AquaTagResetMessage {
  type: typeof AQUA_TAG_MESSAGES.reset;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
}

export interface AquaTagThrottleMessage {
  type: typeof AQUA_TAG_MESSAGES.throttle;
  version: typeof AQUA_TAG_PROTOCOL_VERSION;
  /** null clears — the tag restores the untouched fetch and XHR it saved. */
  profile: AquaTagThrottleProfile | null;
}

export type AquaTagOutboundMessage =
  | AquaTagPingMessage
  | AquaTagInspectMessage
  | AquaTagEnableMessage
  | AquaTagDisableMessage
  | AquaTagPatchMessage
  | AquaTagResetMessage
  | AquaTagThrottleMessage;

/**
 * Builders rather than object literals at the call site.
 *
 * Forgetting `version` is not a visible failure — the tag returns early and
 * the editor waits forever for a reply that was never going to come. Building
 * the message here means a caller cannot forget.
 */
export function aquaTagPing(requestId: string): AquaTagPingMessage {
  return { type: AQUA_TAG_MESSAGES.ping, version: AQUA_TAG_PROTOCOL_VERSION, requestId };
}

export function aquaTagInspect(requestId: string): AquaTagInspectMessage {
  return { type: AQUA_TAG_MESSAGES.inspect, version: AQUA_TAG_PROTOCOL_VERSION, requestId };
}

export function aquaTagEnable(): AquaTagEnableMessage {
  return { type: AQUA_TAG_MESSAGES.enable, version: AQUA_TAG_PROTOCOL_VERSION };
}

export function aquaTagDisable(): AquaTagDisableMessage {
  return { type: AQUA_TAG_MESSAGES.disable, version: AQUA_TAG_PROTOCOL_VERSION };
}

export function aquaTagPatchMessage(elementId: string, patch: AquaTagPatch): AquaTagPatchMessage {
  return { type: AQUA_TAG_MESSAGES.patch, version: AQUA_TAG_PROTOCOL_VERSION, elementId, patch };
}

export function aquaTagReset(): AquaTagResetMessage {
  return { type: AQUA_TAG_MESSAGES.reset, version: AQUA_TAG_PROTOCOL_VERSION };
}

export function aquaTagThrottle(profile: AquaTagThrottleProfile | null): AquaTagThrottleMessage {
  return { type: AQUA_TAG_MESSAGES.throttle, version: AQUA_TAG_PROTOCOL_VERSION, profile };
}

// ── Parsing what arrives ────────────────────────────────────────────────────
//
// Everything below validates rather than casts. This data crossed an origin
// boundary: it was structured-cloned out of a page the editor does not own and
// cannot vouch for, and on a client's own website that page may be running
// third-party scripts nobody in this codebase has read. `as AquaTagElement` on
// that is a lie the compiler will happily believe, so every field is checked.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Present-and-a-string, or absent. A present non-string is a malformed message, not an absence. */
function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseStyles(value: unknown): AquaTagElementStyles | null {
  if (!isRecord(value)) return null;
  const styles = {} as AquaTagElementStyles;
  for (const property of AQUA_TAG_STYLE_PROPERTIES) {
    const entry = value[property];
    if (typeof entry !== "string") return null;
    styles[property] = entry;
  }
  return styles;
}

/**
 * A described element, or null.
 *
 * Exported because a selection is the payload the rest of the editor cares
 * about, and the assistant and builder destinations will want to validate one
 * they were handed rather than trusting a caller.
 */
export function parseAquaTagElement(value: unknown): AquaTagElement | null {
  if (!isRecord(value)) return null;
  const styles = parseStyles(value.styles);
  if (!styles) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (typeof value.tagName !== "string") return null;
  if (value.kind !== "text" && value.kind !== "image") return null;
  if (typeof value.label !== "string") return null;
  if (!optionalString(value.text)) return null;
  if (!optionalString(value.src)) return null;
  if (!optionalString(value.alt)) return null;
  const element: AquaTagElement = {
    id: value.id,
    tagName: value.tagName,
    kind: value.kind,
    label: value.label,
    styles,
  };
  // Rebuilt key by key rather than spread: a spread would carry through any
  // extra properties the sending page attached, and those would then travel
  // into the editor's state and out to the assistant unexamined.
  if (typeof value.text === "string") element.text = value.text;
  if (typeof value.src === "string") element.src = value.src;
  if (typeof value.alt === "string") element.alt = value.alt;
  return element;
}

function parseCapabilities(value: unknown): AquaTagCapabilities | null {
  if (!isRecord(value)) return null;
  if (typeof value.inspect !== "boolean") return null;
  if (typeof value.visualEditing !== "boolean") return null;
  if (!isFiniteNumber(value.editableElements)) return null;
  return {
    inspect: value.inspect,
    visualEditing: value.visualEditing,
    // Lenient on purpose — see the interface. A cached pre-throttle tag build
    // simply doesn't say this, and its handshake must not fail for it.
    networkThrottle: value.networkThrottle === true,
    editableElements: value.editableElements,
  };
}

/**
 * A throttle profile, or null. Null covers both "malformed" and "not one" —
 * a caller deciding between clear-and-apply should check for null first.
 *
 * Exported because the UI validates custom input through the same gate the
 * parser uses, so "what the editor will send" and "what the editor will
 * believe back" can never disagree about what a profile is.
 */
export function parseAquaTagThrottleProfile(value: unknown): AquaTagThrottleProfile | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNumber(value.latencyMs) || value.latencyMs < 0) return null;
  if (!isFiniteNumber(value.downKbps) || value.downKbps < 0) return null;
  if (typeof value.offline !== "boolean") return null;
  // Rebuilt key by key, same rule as the element: no spread, no stray fields.
  return { latencyMs: value.latencyMs, downKbps: value.downKbps, offline: value.offline };
}

function parseSize(value: unknown): { width: number; height: number } | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNumber(value.width) || !isFiniteNumber(value.height)) return null;
  return { width: value.width, height: value.height };
}

function parseCounts(value: unknown): AquaTagDiagnostics["counts"] | null {
  if (!isRecord(value)) return null;
  // The declared list rather than a retyped one: a fourth copy of these five
  // names is a fourth place they can drift from the tag.
  const counts = {} as AquaTagDiagnostics["counts"];
  for (const key of AQUA_TAG_COUNT_FIELDS) {
    const entry = value[key];
    if (!isFiniteNumber(entry)) return null;
    counts[key] = entry;
  }
  return counts;
}

function optionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function parseDiagnostics(value: unknown): AquaTagDiagnostics | null {
  if (!isRecord(value)) return null;
  const viewport = parseSize(value.viewport);
  const documentSize = parseSize(value.document);
  const counts = parseCounts(value.counts);
  if (!viewport || !documentSize || !counts) return null;
  if (typeof value.path !== "string" || typeof value.title !== "string") return null;
  if (typeof value.readyState !== "string") return null;
  if (!Array.isArray(value.recentErrors)) return null;
  const performanceValue = isRecord(value.performance) ? value.performance : {};
  const diagnostics: AquaTagDiagnostics = {
    path: value.path,
    title: value.title,
    readyState: value.readyState,
    viewport,
    document: documentSize,
    counts,
    performance: {
      responseMs: optionalNumber(performanceValue.responseMs),
      domContentLoadedMs: optionalNumber(performanceValue.domContentLoadedMs),
      loadMs: optionalNumber(performanceValue.loadMs),
      firstContentfulPaintMs: optionalNumber(performanceValue.firstContentfulPaintMs),
    },
    // Error strings are rendered in the inspector, so only strings survive —
    // an object here would stringify to "[object Object]" at best.
    recentErrors: value.recentErrors.filter((entry): entry is string => typeof entry === "string"),
  };
  if (isRecord(value.connection)) {
    diagnostics.connection = {
      effectiveType: typeof value.connection.effectiveType === "string" ? value.connection.effectiveType : undefined,
      downlinkMbps: optionalNumber(value.connection.downlinkMbps),
      saveData: value.connection.saveData === true,
    };
  }
  return diagnostics;
}

/**
 * The one entry point for anything arriving from a tagged page.
 *
 * Returns a typed message or null. Null covers "not ours", "wrong protocol
 * version" and "malformed" alike, because the caller's response to all three
 * is the same: ignore it. A `window` receives messages from extensions, from
 * React's own dev tooling and from any other frame on the page, so the common
 * case for null is simply traffic that was never meant for the editor.
 *
 * Note this does NOT check where the message came from. Call
 * `acceptAquaTagMessage` instead unless you have already done that yourself.
 */
export function parseAquaTagMessage(data: unknown): AquaTagInboundMessage | null {
  if (!isRecord(data)) return null;
  if (data.version !== AQUA_TAG_PROTOCOL_VERSION) return null;

  if (data.type === AQUA_TAG_MESSAGES.selected) {
    if (data.element === null) {
      return { type: AQUA_TAG_MESSAGES.selected, version: AQUA_TAG_PROTOCOL_VERSION, element: null };
    }
    const element = parseAquaTagElement(data.element);
    if (!element) return null;
    return { type: AQUA_TAG_MESSAGES.selected, version: AQUA_TAG_PROTOCOL_VERSION, element };
  }

  if (data.type === AQUA_TAG_MESSAGES.ready) {
    const capabilities = parseCapabilities(data.capabilities);
    if (!capabilities) return null;
    if (typeof data.requestId !== "string" || data.requestId.length === 0) return null;
    if (typeof data.propertyId !== "string") return null;
    if (typeof data.path !== "string" || typeof data.title !== "string") return null;
    return {
      type: AQUA_TAG_MESSAGES.ready,
      version: AQUA_TAG_PROTOCOL_VERSION,
      requestId: data.requestId,
      propertyId: data.propertyId,
      path: data.path,
      title: data.title,
      capabilities,
    };
  }

  if (data.type === AQUA_TAG_MESSAGES.throttleApplied) {
    if (data.profile === null) {
      return { type: AQUA_TAG_MESSAGES.throttleApplied, version: AQUA_TAG_PROTOCOL_VERSION, profile: null };
    }
    const profile = parseAquaTagThrottleProfile(data.profile);
    if (!profile) return null;
    return { type: AQUA_TAG_MESSAGES.throttleApplied, version: AQUA_TAG_PROTOCOL_VERSION, profile };
  }

  if (data.type === AQUA_TAG_MESSAGES.diagnostics) {
    const diagnostics = parseDiagnostics(data.diagnostics);
    if (!diagnostics) return null;
    if (typeof data.requestId !== "string" || data.requestId.length === 0) return null;
    return {
      type: AQUA_TAG_MESSAGES.diagnostics,
      version: AQUA_TAG_PROTOCOL_VERSION,
      requestId: data.requestId,
      diagnostics,
    };
  }

  return null;
}

// ── Origin policy ───────────────────────────────────────────────────────────
//
// SECURITY-CRITICAL. Read this before changing anything below it.
//
// The editor points a preview iframe at whatever the project says its site is:
// a portal on this origin, a client's own website, Ed's game build. The tag
// runs INSIDE that page and posts selections up to the parent. So there are
// two directions and each gets something wrong if it is loosened.
//
// INBOUND — which messages the editor will believe.
//   The old rule was `event.origin !== window.location.origin → drop`, which is
//   why a tagged external site never worked: its messages are correctly formed
//   and are thrown away for coming from the site they were supposed to come
//   from. Widening it to "any origin" would be much worse. `window` receives
//   postMessage from every frame on the page and from browser extensions, so
//   an unchecked handler lets anything on the internet hand the editor an
//   element it will then show as the operator's selection and send on to the
//   assistant.
//   The rule instead: derive ONE origin from the URL the editor itself pointed
//   the iframe at, and compare exactly. Exactly — not `startsWith`, not
//   `endsWith`, not `includes`. `https://example.com.attacker.net` ends with
//   nothing useful and starts with nothing useful, but a sloppy comparison
//   passes it.
//   `event.source` is checked too, against the iframe's own contentWindow. The
//   origin says which site sent it; the source says which frame. Without the
//   source check any OTHER frame on the same origin — a nested ad iframe on a
//   client's site, say — can post as if it were the preview.
//
// OUTBOUND — where the editor is willing to post.
//   `postMessage(payload, "*")` broadcasts to whatever now occupies that frame.
//   If the preview navigated, that is somebody else's page, and the payload can
//   carry the operator's draft copy. So the target origin is the same single
//   derived origin, and there is no fallback: no origin means do not send.
//
// A null return therefore means "no origin is trusted for this frame" and the
// only correct response is to stop. Please do not add a `?? "*"`, and do not
// add a same-origin special case — `window.location.origin` is already the
// answer this returns for a same-origin preview URL.

/**
 * The single origin the editor will talk to for a given preview URL.
 *
 * Returns null — never "*", never a guess — when no exact origin can be
 * established: an empty or unparseable URL, a relative URL with no base to
 * resolve it against, or a scheme that has no meaningful origin at all
 * (`about:`, `data:`, `blob:`, `javascript:`, `file:`). Only http and https
 * produce a trusted origin, because only those are origins the tag can
 * actually be served on.
 *
 * @param frameUrl The URL the editor pointed the preview iframe at.
 * @param base Usually `window.location.href`, so a same-origin relative
 *   preview path resolves to the editor's own origin.
 */
export function aquaTagOrigin(frameUrl: string | null | undefined, base?: string | null): string | null {
  if (typeof frameUrl !== "string" || frameUrl.trim().length === 0) return null;
  let url: URL;
  try {
    url = base ? new URL(frameUrl, base) : new URL(frameUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Opaque origins serialise to the literal string "null". Comparing an
  // incoming "null" origin against a stored "null" would make every opaque
  // sender equal to every other — the exact hole this function exists to close.
  if (!url.origin || url.origin === "null") return null;
  return url.origin;
}

/**
 * What a project says its live page is — and where the editor should point.
 *
 * Structural rather than importing `DevProject`, because `@/server/types` is
 * not something this client-safe module should drag in, and because the guard
 * only ever needs these two fields.
 */
export interface AquaTagBrowserTarget {
  /** The address somebody typed into the project. */
  siteUrl?: string;
  /**
   * The last MAP run. `map.tag.finalUrl` is the page that ACTUALLY answered,
   * after `fetchPublicSiteHtml` followed up to five redirects.
   */
  map?: { tag?: { finalUrl?: string } | null } | null;
}

/**
 * The address the preview frame should load, which is not always the one typed.
 *
 * SEVERE bug this exists to fix. A project whose `siteUrl` is
 * `https://edsgame.com/` maps fine — MAP follows the redirect, records
 * `finalUrl: https://www.edsgame.com/`, and the setup card even says "Aqua Tag
 * answering at https://www.edsgame.com/". But the editor seeded its browser
 * from `siteUrl`, so it derived ONE trusted origin of `https://edsgame.com`
 * while the frame actually landed on `https://www.edsgame.com`. Exact string
 * comparison then rejected every message the tag sent: the handshake reply was
 * untrusted, no click ever arrived, and the panel blamed the tag —
 * "Nothing answered on that page" — on a page where the tag was answering
 * perfectly. bare-domain → www is the common case, so this made the whole
 * feature look broken on most real sites.
 *
 * The fix is to USE the value MAP already computed, NOT to loosen the origin
 * rule. There is still exactly one trusted origin and still an exact string
 * comparison — it is simply derived from the page the tag really answers on.
 * Do not "fix" a future variant of this by accepting a SET of origins, by
 * treating apex and www as equivalent, or by prefix/suffix matching: those turn
 * one wrong-origin bug into a class of trust bugs.
 *
 * A `finalUrl` is only preferred when it yields a real http/https origin, so a
 * malformed or non-web recorded value falls back rather than blanking the box.
 */
export function aquaTagBrowserUrl(project: AquaTagBrowserTarget | null | undefined): string {
  const siteUrl = (project?.siteUrl ?? "").trim();
  const finalUrl = (project?.map?.tag?.finalUrl ?? "").trim();
  if (finalUrl && aquaTagOrigin(finalUrl)) return finalUrl;
  return siteUrl;
}

/** How a caller describes the frame it is willing to hear from. */
export interface AquaTagOriginPolicy {
  /** The result of `aquaTagOrigin` for the current preview URL. */
  allowedOrigin: string | null;
  /**
   * The preview iframe's `contentWindow`. Null before the iframe mounts —
   * and a message that arrives before then cannot be from it, so null means
   * trust nothing rather than skip the check.
   */
  frameWindow: unknown;
}

/**
 * The shape of the part of a `MessageEvent` this module reads.
 *
 * Structural rather than the DOM type so the policy can be exercised in a
 * plain Node test — the security rule is the thing most worth testing, and it
 * should not need a browser to test it.
 */
export interface AquaTagMessageEnvelope {
  origin: string;
  source: unknown;
  data: unknown;
}

/** Whether a message came from the frame and origin the editor is talking to. */
export function isAquaTagMessageTrusted(
  event: AquaTagMessageEnvelope,
  policy: AquaTagOriginPolicy,
): boolean {
  const { allowedOrigin, frameWindow } = policy;
  if (typeof allowedOrigin !== "string" || allowedOrigin.length === 0) return false;
  // Defence in depth: `aquaTagOrigin` cannot return these, but a caller could
  // pass a hand-built policy, and this is the line where that would matter.
  if (allowedOrigin === "*" || allowedOrigin === "null") return false;
  if (typeof event.origin !== "string" || event.origin !== allowedOrigin) return false;
  // No frame to compare against means the check cannot be performed, and an
  // unperformable check fails closed.
  if (!frameWindow) return false;
  return event.source === frameWindow;
}

/**
 * Trust, then parse. The function a message handler should call.
 *
 * Kept as one call so the two halves cannot be separated by accident: parsing
 * without the origin check is how an unowned page gets to speak as the
 * preview.
 */
export function acceptAquaTagMessage(
  event: AquaTagMessageEnvelope,
  policy: AquaTagOriginPolicy,
): AquaTagInboundMessage | null {
  if (!isAquaTagMessageTrusted(event, policy)) return null;
  return parseAquaTagMessage(event.data);
}
