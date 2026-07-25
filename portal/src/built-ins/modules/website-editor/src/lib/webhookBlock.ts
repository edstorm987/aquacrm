// R043 — Webhook block + form submission dispatcher.
//
// `webhook-target` is a non-rendering block descriptor whose props
// describe an outbound webhook endpoint. Form blocks reference it by
// id via `submitTo: { kind: "webhook", id }`; the form-submission
// handler resolves the target and POSTs the payload (optionally
// signed via HMAC). Submission outcomes feed the integrations
// plugin's webhook log (R016) once wired.
//
// This module is a pure helper layer. The host (foundation routes
// + forms plugin) imports the resolver + dispatcher; UI work (the
// "Submit to" dropdown in the editor) is a follow-up.

import type { Block, BlockTreeJSON } from "../types/block";

// ─── Block-kind metadata ─────────────────────────────────────────────

export const WEBHOOK_TARGET_TYPE = "webhook-target" as const;

export interface WebhookTargetProps {
  url: string;
  method?: "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  // When set, the dispatcher computes HMAC-SHA256 of the body and
  // sets `x-aqua-signature: sha256=<hex>` on the request. The
  // operator pastes the secret into the editor; storage encrypts
  // at rest (R+1 — today plain string in block.props).
  signingSecret?: string;
  // Operator-facing label shown in the form-block dropdown.
  label?: string;
}

export interface WebhookTarget {
  id: string;
  props: WebhookTargetProps;
}

// ─── Form `submitTo` shape ───────────────────────────────────────────

export type FormSubmitTo =
  | { kind: "internal" }                    // legacy form-submission storage
  | { kind: "webhook"; id: string };        // → webhook-target block

// Validates that a given submitTo configuration is shaped correctly
// (used by the editor's save guard + the dispatcher entry).
export function isValidSubmitTo(s: unknown): s is FormSubmitTo {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  if (o.kind === "internal") return true;
  if (o.kind === "webhook") return typeof o.id === "string" && o.id.length > 0;
  return false;
}

// ─── Page-level target resolution ────────────────────────────────────

// Walk the block tree, return every webhook-target block. The form-
// block dropdown surfaces these. `disabled: true` props skip — the
// editor toggles a target off without removing it.
export function collectWebhookTargets(tree: BlockTreeJSON): WebhookTarget[] {
  const out: WebhookTarget[] = [];
  const walk = (blocks: readonly Block[]): void => {
    for (const b of blocks) {
      if (b.type === WEBHOOK_TARGET_TYPE) {
        const props = (b.props ?? {}) as Record<string, unknown>;
        if (props.disabled === true) continue;
        if (typeof props.url === "string" && props.url.length > 0) {
          out.push({ id: b.id, props: props as unknown as WebhookTargetProps });
        }
      }
      if (b.children && b.children.length) walk(b.children);
    }
  };
  walk(tree);
  return out;
}

export function findWebhookTarget(
  tree: BlockTreeJSON,
  id: string,
): WebhookTarget | undefined {
  return collectWebhookTargets(tree).find((t) => t.id === id);
}

// ─── HMAC signature ──────────────────────────────────────────────────

async function hmacHex(secret: string, body: string): Promise<string> {
  const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!cryptoApi?.subtle) {
    // Deterministic fallback for non-WebCrypto runtimes (smoke).
    let h = 0;
    const combined = secret + ":" + body;
    for (let i = 0; i < combined.length; i++) {
      h = (h * 31 + combined.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  const enc = new TextEncoder();
  const key = await cryptoApi.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await cryptoApi.subtle.sign("HMAC", key, enc.encode(body));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

// ─── Dispatcher ──────────────────────────────────────────────────────

export interface DispatchInput {
  target: WebhookTarget;
  payload: Record<string, unknown>;
  // Tests inject; production uses globalThis.fetch.
  fetchImpl?: typeof fetch;
  // Tests inject; production uses Date.now().
  now?: number;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  bodyPreview?: string;       // first 1KB of response, like R016
  error?: string;             // network/timeout/etc
  // Echo of what was sent — useful for the webhook log.
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    signedAt?: number;        // when HMAC was computed
  };
}

export const SIGNATURE_HEADER = "x-aqua-signature";
export const TIMESTAMP_HEADER = "x-aqua-timestamp";

const MAX_BODY_PREVIEW = 1024;

export async function dispatchWebhook(input: DispatchInput): Promise<DispatchResult> {
  const { target, payload } = input;
  const fetcher = input.fetchImpl ?? (globalThis.fetch?.bind(globalThis));
  const now = input.now ?? Date.now();

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [TIMESTAMP_HEADER]: String(now),
    ...(target.props.headers ?? {}),
  };

  let signedAt: number | undefined;
  if (target.props.signingSecret) {
    const sig = await hmacHex(target.props.signingSecret, `${now}.${body}`);
    headers[SIGNATURE_HEADER] = `sha256=${sig}`;
    signedAt = now;
  }

  const method = target.props.method ?? "POST";
  const requestEcho = { url: target.props.url, method, headers, body, signedAt };

  if (!fetcher) {
    return {
      ok: false, status: 0,
      error: "no fetch implementation available",
      request: requestEcho,
    };
  }

  try {
    const res = await fetcher(target.props.url, {
      method, headers, body,
    });
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      bodyPreview: text.slice(0, MAX_BODY_PREVIEW),
      request: requestEcho,
    };
  } catch (err) {
    return {
      ok: false, status: 0,
      error: err instanceof Error ? err.message : String(err),
      request: requestEcho,
    };
  }
}

// ─── Form-side helper ────────────────────────────────────────────────

// Resolves a form submission to either an internal handler or a
// webhook target on the same page. Returns `null` when the submitTo
// configuration is missing/invalid OR the named target doesn't exist.
// The form-submission route should fall through to the legacy
// internal handler when this returns `null`.
export function resolveFormSubmission(
  tree: BlockTreeJSON,
  submitTo: FormSubmitTo | undefined,
): WebhookTarget | "internal" | null {
  if (!submitTo) return "internal";
  if (!isValidSubmitTo(submitTo)) return null;
  if (submitTo.kind === "internal") return "internal";
  return findWebhookTarget(tree, submitTo.id) ?? null;
}
