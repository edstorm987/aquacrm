import "server-only";

// The client's own thank-you to their own customer.
//
// Ed, 2026-08-27: *"we may also need to configure clients resend or twilios if
// we want to do automations confirmations thank yous etc."*
//
// ── The tension, and how it is resolved ──────────────────────────────────
//
// Sending a thank-you needs the customer's email address — the one piece of
// data this whole design exists to keep out of our store. The resolution is
// that the address is *read on demand, used, and never written*: it lives in
// this function's local scope for the length of one send and goes no further.
// Nothing about it reaches `clientFormNotices`, and the failure reasons are a
// fixed vocabulary precisely because "could not send to jane@example.com" is
// the most natural thing in the world to write into a log.
//
// ── Why it CLAIMS before it sends ────────────────────────────────────────
//
// Supabase retries webhook deliveries. A "have we sent it yet?" check that only
// recorded success would let two concurrent deliveries both decide they were
// first, and the customer gets two thank-yous from a client who configured one.
// So the claim is written first and the outcome recorded after: at worst a
// crash mid-send loses a confirmation, which is a great deal better than
// duplicating it.
//
// ── Why it runs after the response ───────────────────────────────────────
//
// Two outbound calls — read their row, then send — inside a webhook handler
// would push it past the timeout Supabase allows, and a slow webhook is a
// RETRIED webhook. `after()` is the same tool `webhooks/meta` already uses for
// this exact shape.

import { mutate, getState } from "@/server/storage";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { findClientSupabaseConnection } from "./clientSupabaseConnection";
import { readClientFormSubmission } from "./clientFormReader";
import type { ClientFormNotice } from "@/server/types";

/** Claim the notice, or report that somebody already has. */
function claim(noticeId: string): boolean {
  let claimed = false;
  mutate(state => {
    const notice = state.clientFormNotices[noticeId];
    if (!notice || notice.confirmationAt) return;
    notice.confirmationAt = Date.now();
    claimed = true;
  });
  return claimed;
}

function record(noticeId: string, status: ClientFormNotice["confirmationStatus"], reason?: ClientFormNotice["confirmationReason"]): void {
  mutate(state => {
    const notice = state.clientFormNotices[noticeId];
    if (!notice) return;
    notice.confirmationStatus = status;
    if (reason) notice.confirmationReason = reason;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Send the configured confirmation for one notice, once.
 *
 * Silent by design: this runs after the response, so there is no caller to
 * report to and nothing it does may affect the webhook's answer. Every outcome
 * lands on the notice instead, where somebody can see it.
 */
export async function sendClientFormConfirmation(noticeId: string): Promise<void> {
  const notice = getState().clientFormNotices[noticeId];
  if (!notice) return;

  const connection = findClientSupabaseConnection(notice.connectionId);
  if (!connection) return;

  // Configured by writing a subject. Blank means the client did not ask for
  // this, and sending a default would be mail nobody approved going out under
  // their name.
  const subject = connection.confirmationSubject;
  if (!subject) return;

  if (!claim(noticeId)) return;

  const submission = await readClientFormSubmission(notice);
  if (submission.status !== "ok") {
    record(noticeId, "failed", "unavailable");
    return;
  }

  // The only two values taken out of the row, both used and then dropped.
  const to = submission.mapped.core.email?.trim();
  const name = submission.mapped.core.name?.trim();
  if (!to) {
    record(noticeId, "skipped", "no-email");
    return;
  }

  const greeting = name ? `Hi ${name},` : "Hi,";
  const body = connection.confirmationBody?.trim()
    || "Thanks — we have your message and will be in touch.";
  const bodyText = `${greeting}\n\n${body}`;
  const bodyHtml = `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(body)}</p>`;

  try {
    const result = await sendTransactionalEmail({
      to,
      subject,
      bodyText,
      bodyHtml,
      agencyId: notice.agencyId,
      // Client-scoped, so this goes out through the CLIENT's own Resend or SMTP
      // connection and arrives from their address — not ours. A thank-you for
      // their customer should never look like it came from their agency.
      clientId: notice.clientId,
      // The notice id, not anything from the row. An external reference that
      // carried the customer's address would put it in the provider's logs.
      externalRef: `client-form-confirmation:${notice.id}`,
    });
    if (result.delivered) {
      record(noticeId, "sent");
    } else {
      // `unconfigured` means the client has no email connection yet, which is a
      // setup gap rather than a delivery failure and reads differently.
      record(noticeId, "failed", result.via === "unconfigured" ? "not-configured" : "send-failed");
    }
  } catch {
    // No error body: it may name the recipient.
    record(noticeId, "failed", "send-failed");
  }
}
