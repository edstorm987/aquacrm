// R013 — Iframe embed postMessage bridge.
//
// Per chapter 12, the embedded customer surface (iframe loaded from
// the client's own website) talks to the host page via a small
// postMessage protocol. This module ships:
//
//   - Event type unions + type guards (parent + child both import).
//   - `dispatchToParent(event, targetOrigin?)` — child-side helper
//     that posts an event to `window.parent` with a sensible default.
//   - `subscribeToBridge(onEvent, allowedOrigins)` — parent-side
//     listener that filters by origin allow-list, parses payloads,
//     and invokes `onEvent` on each typed event.
//   - `measureContentHeight()` — measures the document scroll height
//     so the child can fire `aqua:height-changed` whenever it grows.
//
// Pure module — no DOM access at module scope; safe to import in
// SSR / smoke contexts.

export type EmbedEventType =
  | "aqua:auth-ok"
  | "aqua:height-changed"
  | "aqua:navigate"
  | "aqua:ready"
  | "aqua:error";

export interface AuthOkPayload {
  type: "aqua:auth-ok";
  user: { id: string; email?: string; role?: string };
  // Where the host should redirect after sign-in (parent-frame
  // navigation). Honours the host's allow-list — child suggests,
  // host enforces.
  redirect?: string;
}

export interface HeightChangedPayload {
  type: "aqua:height-changed";
  height: number;
}

export interface NavigatePayload {
  type: "aqua:navigate";
  // Parent should navigate the parent frame to this URL.
  // Same-origin or one of the client's `embedAllowedOrigins`; host
  // enforces the allow-list before navigating.
  url: string;
}

export interface ReadyPayload {
  type: "aqua:ready";
  // Optional tenancy identifiers so the host can confirm it's the
  // expected client / variant before honouring later events.
  clientSlug?: string;
  variant?: string;
}

export interface ErrorPayload {
  type: "aqua:error";
  message: string;
}

export type EmbedEvent =
  | AuthOkPayload
  | HeightChangedPayload
  | NavigatePayload
  | ReadyPayload
  | ErrorPayload;

export function isEmbedEvent(value: unknown): value is EmbedEvent {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === "aqua:auth-ok" ||
    t === "aqua:height-changed" ||
    t === "aqua:navigate" ||
    t === "aqua:ready" ||
    t === "aqua:error"
  );
}

// ─── Child side ────────────────────────────────────────────────────────────

export function dispatchToParent(event: EmbedEvent, targetOrigin = "*"): void {
  if (typeof window === "undefined" || !window.parent || window.parent === window) return;
  try {
    window.parent.postMessage(event, targetOrigin);
  } catch {
    // postMessage threw (rare — typically a structured-clone failure
    // on a non-cloneable payload). Swallow so the child surface
    // doesn't crash inside an iframe.
  }
}

export function measureContentHeight(): number {
  if (typeof document === "undefined") return 0;
  const b = document.body;
  const e = document.documentElement;
  return Math.max(
    b?.scrollHeight ?? 0,
    b?.offsetHeight ?? 0,
    e?.scrollHeight ?? 0,
    e?.offsetHeight ?? 0,
    e?.clientHeight ?? 0,
  );
}

// ─── Parent side ──────────────────────────────────────────────────────────

export interface BridgeSubscription {
  unsubscribe(): void;
}

export interface SubscribeOptions {
  // If empty, accept events from any origin. If non-empty, only
  // events whose `event.origin` is exact-matched in this list are
  // forwarded to the handler. Use this list to mirror your CSP
  // `frame-ancestors` allow-list — same source-of-truth.
  allowedOrigins?: string[];
}

export function subscribeToBridge(
  onEvent: (e: EmbedEvent, origin: string) => void,
  options: SubscribeOptions = {},
): BridgeSubscription {
  if (typeof window === "undefined") return { unsubscribe: () => undefined };
  const { allowedOrigins = [] } = options;
  const handler = (e: MessageEvent): void => {
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(e.origin)) return;
    if (!isEmbedEvent(e.data)) return;
    onEvent(e.data, e.origin);
  };
  window.addEventListener("message", handler);
  return {
    unsubscribe: () => window.removeEventListener("message", handler),
  };
}

// ─── CSP helper ────────────────────────────────────────────────────────────

// Builds the `Content-Security-Policy` `frame-ancestors` directive
// from an allow-list of origins. Used by the foundation middleware
// when serving `/embed/...` routes (T1 wires this in once the
// per-client embed route lands).
//
// `'self'` is always included so internal previews keep working.
export function buildFrameAncestorsHeader(allowedOrigins: string[]): string {
  const parts = ["'self'", ...allowedOrigins.map(o => o.trim()).filter(Boolean)];
  return `frame-ancestors ${parts.join(" ")}`;
}
