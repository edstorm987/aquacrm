import { after, NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";

import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { recordClientFormNotice } from "@/lib/server/clientForms/clientFormNotices";
import { sendClientFormConfirmation } from "@/lib/server/clientForms/clientFormConfirmation";
import { triggerAutomations } from "@/server/automations";
import { findClientSupabaseConnection } from "@/lib/server/clientForms/clientSupabaseConnection";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { assertFreshWriteAdmission, isWriteAdmissionDenied } from "@/lib/server/security/writeAdmission";

export const runtime = "nodejs";

/**
 * "A form came in on a client's own website."
 *
 * Ed, 2026-08-27: *"internally we just get a notification to say they got the
 * form so we can track enquiries without merging or breaching data."*
 *
 * After the 2026-09 secure-intake redesign the customer's submission is written
 * by the client-owned `aqua-form-submit` Edge Function, which then notifies us
 * with a SIGNED POINTER — the new submission's id, and nothing else. This
 * endpoint receives that pointer. The customer's name, email and message never
 * arrive here at all: the notification body is `{connectionId, rowKey, rowId,
 * ts}`, so there is no payload to discard and no way for this route to become a
 * controller of a client's customer data even by accident.
 *
 * ── Why the signature is verified over the raw bytes ──────────────────────
 *
 * The Edge Function signs `${ts}.${body}` with the connection's webhook secret
 * (HMAC-SHA256) and sends the signature and timestamp as headers. We recompute
 * it over the EXACT bytes we received — so the raw body is read before it is
 * parsed — and compare in constant time on hashes, so an unequal length cannot
 * throw before the values are compared. A stale timestamp is refused, bounding
 * replay; the notice itself is idempotent on (connection, row) as a backstop.
 *
 * The webhook secret is DISTINCT from the read secret: this route only ever
 * VERIFIES a notification with it, and never uses it to read anything back.
 *
 * ── Why an unknown/failed webhook answers 202 ─────────────────────────────
 *
 * Returning 404 for "no such connection" and 401 for "bad signature" would let
 * somebody map which connection ids exist by reading status codes. Everything —
 * unknown connection, bad signature, stale timestamp, wrong shape — answers the
 * same, and nothing downstream depends on the difference. A webhook has no human
 * to inform, so there is no cost to being uniformly uninformative.
 */

const MAX_PER_WINDOW = 120;
const WINDOW_MS = 60 * 1_000;
const SIGNATURE_HEADER = "x-aqua-signature";
const TIMESTAMP_HEADER = "x-aqua-timestamp";
/** How far a notification's timestamp may be from now — bounds replay. */
const MAX_SKEW_MS = 5 * 60 * 1_000;
/** A pointer is tiny; anything larger is not one of ours. */
const MAX_BODY_BYTES = 8_192;

interface PointerWebhookBody {
  connectionId?: unknown;
  rowKey?: unknown;
  rowId?: unknown;
  ts?: unknown;
}

/** Equal without revealing how nearly — on hashes, so unequal lengths are safe. */
function constantTimeEqual(supplied: string, expected: string): boolean {
  if (!supplied || !expected) return false;
  const a = crypto.createHash("sha256").update(supplied).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Accepted, and deliberately silent about why.
const accepted = () => NextResponse.json({ ok: true }, { status: 202 });

export async function POST(req: NextRequest, context: { params: Promise<{ connectionId: string }> }) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `client-form-webhook:${ip}`, max: MAX_PER_WINDOW, windowMs: WINDOW_MS });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const { connectionId } = await context.params;
  if (!connectionId) return accepted();

  await ensureHydrated({ fresh: true, forceFreshReload: true });

  const connection = findClientSupabaseConnection(connectionId);
  if (!connection) return accepted();

  // The signed pointer: a fresh timestamp and an HMAC over `${ts}.${rawBody}`
  // with the webhook secret. Read the RAW bytes BEFORE parsing — the signature
  // covers exactly what was sent.
  const tsHeader = req.headers.get(TIMESTAMP_HEADER) ?? "";
  const signature = req.headers.get(SIGNATURE_HEADER) ?? "";
  if (!tsHeader || !signature) return accepted();

  const tsNum = Number(tsHeader);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) return accepted();

  const rawBody = await req.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) return accepted();

  const expected = crypto.createHmac("sha256", connection.webhookSecret).update(`${tsHeader}.${rawBody}`).digest("hex");
  if (!constantTimeEqual(signature, expected)) return accepted();

  let body: PointerWebhookBody | null;
  try { body = JSON.parse(rawBody) as PointerWebhookBody; } catch { return accepted(); }
  if (!body || typeof body !== "object") return accepted();

  // The signed body names the connection it is about; it must match the path.
  // The secret is per-connection already, so this is defence in depth against a
  // signature captured for one connection being aimed at another.
  if (typeof body.connectionId === "string" && body.connectionId && body.connectionId !== connectionId) {
    return accepted();
  }

  // Only a KEY, never a value that might carry somebody's details. It arrives
  // signed by the client's own Edge Function, but is still bounded and typed.
  const rowId = typeof body.rowId === "string" && body.rowId.trim()
    ? body.rowId.trim().slice(0, 200)
    : typeof body.rowId === "number" && Number.isFinite(body.rowId)
      ? String(body.rowId)
      : "";
  if (!rowId) return accepted();
  const rowKey = typeof body.rowKey === "string" && body.rowKey.trim() ? body.rowKey.trim().slice(0, 100) : "id";

  await assertFreshWriteAdmission({
    kind: "tenant",
    tenantId: connection.agencyId,
    surface: "database.client-form-notice",
    actor: `client-form:${connection.connectionId}`,
  });

  // The label is OUR stored PUBLIC form id, taken from the connection, not from
  // the payload — the reader maps this connection to a fixed destination
  // server-side, so a notification cannot point a notice anywhere the client
  // never authorised us to read.
  const notice = recordClientFormNotice({
    agencyId: connection.agencyId,
    clientId: connection.clientId,
    connectionId: connection.connectionId,
    table: connection.formId,
    rowId,
    rowKey,
  });
  await flushPendingWrites();

  // AFTER the response, like `webhooks/meta`. Reading their row and then
  // sending are two outbound calls; doing them inline would push this past the
  // timeout the notifier allows, and a slow webhook is a retried webhook. The
  // confirmation claims the notice before it sends, so a retry that beats us
  // here still cannot produce a second thank-you.
  after(async () => {
    await assertFreshWriteAdmission({
      kind: "tenant",
      tenantId: connection.agencyId,
      surface: "provider.client-form-confirmation",
      actor: `client-form:${connection.connectionId}`,
    });
    await sendClientFormConfirmation(notice.id);
    // …and the general engine gets the same event.
    //
    // The built-in confirmation above is a zero-config default: a subject and a
    // body, and it works. It is NOT meant to be the only way to react to an
    // enquiry — AquaCRM already has an automation engine with workflows,
    // conditions and runs, and "what happens when a form arrives" belongs there
    // rather than in a second place that only this route knows about.
    //
    // The event carries the POINTER and nothing else, for the same reason the
    // notice does: a workflow that needs the customer's details reads them
    // through the client's connection, so the boundary holds no matter what
    // somebody builds on top of this.
    //
    // Keyed on the notice id, so a retried webhook re-runs nothing.
    await assertFreshWriteAdmission({
      kind: "tenant",
      tenantId: connection.agencyId,
      surface: "provider.client-form-automation",
      actor: `client-form:${connection.connectionId}`,
    });
    try {
      await triggerAutomations(
        connection.agencyId,
        "client-form.received",
        { clientId: connection.clientId, noticeId: notice.id, connectionId: connection.connectionId },
        { idempotencyKey: `client-form:${notice.id}` },
      );
    } catch (error) {
      if (isWriteAdmissionDenied(error)) throw error;
      // Confirmation has its own durable idempotency claim; a non-containment
      // automation failure remains isolated from webhook acknowledgement.
    }
  });

  return accepted();
}
