import { after, NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";

import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { recordClientFormNotice } from "@/lib/server/clientForms/clientFormNotices";
import { sendClientFormConfirmation } from "@/lib/server/clientForms/clientFormConfirmation";
import { triggerAutomations } from "@/server/automations";
import { findClientSupabaseConnection } from "@/lib/server/clientForms/clientSupabaseConnection";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export const runtime = "nodejs";

/**
 * "A form came in on a client's own website."
 *
 * Ed, 2026-08-27: *"internally we just get a notification to say they got the
 * form so we can track enquiries without merging or breaching data."*
 *
 * The client's website writes submissions into THEIR Supabase project. A
 * Supabase Database Webhook on that table posts here, and we keep only the
 * pointer — which client, which table, which row, when. The customer's name,
 * email and message never arrive at this endpoint's storage, even though the
 * webhook body contains them.
 *
 * ── Why this discards most of its own payload ────────────────────────────
 *
 * Supabase sends the whole inserted row in `record`. It would be one line to
 * keep it, and that one line would make AquaCRM a controller of every client's
 * customer data instead of a processor of event metadata. So `record` is read
 * for exactly one thing — the primary key — and dropped.
 *
 * That is also why there is no "store it just in case" fallback when the row id
 * is missing: a notice we cannot resolve is useless, and a payload we keep
 * because it was convenient is the whole problem.
 *
 * ── Why the secret is compared in constant time ──────────────────────────
 *
 * The header is the only thing standing between this and anybody who learns a
 * connection id. A `===` on a secret leaks its length and, over enough
 * requests, its contents — so `timingSafeEqual`, on hashes so that unequal
 * lengths do not throw before they are compared.
 *
 * ── Why an unknown connection answers 202 ────────────────────────────────
 *
 * Returning 404 for "no such connection" and 401 for "wrong secret" would let
 * somebody map which connection ids exist by reading status codes. Both answer
 * the same, and nothing downstream depends on the difference. A webhook has no
 * human to inform, so there is no cost to being uninformative.
 */

const MAX_PER_WINDOW = 120;
const WINDOW_MS = 60 * 1_000;
const SECRET_HEADER = "x-aqua-webhook-secret";

interface SupabaseWebhookBody {
  type?: unknown;
  table?: unknown;
  schema?: unknown;
  record?: unknown;
}

/** Equal without revealing how nearly. */
function secretMatches(supplied: string, expected: string): boolean {
  if (!supplied || !expected) return false;
  const a = crypto.createHash("sha256").update(supplied).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * The row's primary key, and nothing else.
 *
 * Supabase does not promise the column is called `id`, so the common
 * alternatives are tried — and WHICH one matched is returned alongside the
 * value, because the reader must filter on that same column. Only ever a KEY,
 * never a value that might carry somebody's details.
 */
function rowIdFrom(record: unknown): { key: string; id: string } | null {
  if (!record || typeof record !== "object") return null;
  const row = record as Record<string, unknown>;
  for (const key of ["id", "uuid", "submission_id", "submissionId"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return { key, id: value.trim().slice(0, 200) };
    if (typeof value === "number" && Number.isFinite(value)) return { key, id: String(value) };
  }
  return null;
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

  await ensureHydrated();

  const connection = findClientSupabaseConnection(connectionId);
  if (!connection) return accepted();

  const supplied = req.headers.get(SECRET_HEADER) ?? "";
  if (!secretMatches(supplied, connection.webhookSecret)) return accepted();

  const body = await req.json().catch(() => null) as SupabaseWebhookBody | null;
  if (!body) return accepted();

  // Inserts only. An update or delete on their side is their business, and
  // acting on one would mean tracking a lifecycle we deliberately do not hold.
  if (typeof body.type === "string" && body.type.toUpperCase() !== "INSERT") return accepted();

  // The COLUMN as well as the value: the reader has to name a column to filter
  // on, and guessing later would turn "we looked in the wrong column" into a
  // silent "that enquiry no longer exists".
  const row = rowIdFrom(body.record);
  if (!row) return accepted();

  // The table name is taken from OUR stored configuration, not from the
  // payload — a webhook that claims to be about a different table must not be
  // able to point a notice somewhere the client never authorised us to read.
  const notice = recordClientFormNotice({
    agencyId: connection.agencyId,
    clientId: connection.clientId,
    connectionId: connection.connectionId,
    table: connection.submissionsTable,
    rowId: row.id,
    rowKey: row.key,
  });
  await flushPendingWrites();

  // AFTER the response, like `webhooks/meta`. Reading their row and then
  // sending are two outbound calls; doing them inline would push this past the
  // timeout Supabase allows, and a slow webhook is a retried webhook. The
  // confirmation claims the notice before it sends, so a retry that beats us
  // here still cannot produce a second thank-you.
  after(async () => {
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
    await triggerAutomations(
      connection.agencyId,
      "client-form.received",
      { clientId: connection.clientId, noticeId: notice.id, connectionId: connection.connectionId },
      { idempotencyKey: `client-form:${notice.id}` },
    ).catch(() => undefined);
  });

  return accepted();
}
