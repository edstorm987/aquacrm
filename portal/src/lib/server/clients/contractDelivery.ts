// Delivering an agreement to the client — the ONE implementation.
//
// This is lifted verbatim out of `api/tenants/client-contracts` (the canonical
// send) so the one-button close can reuse it rather than growing a second,
// quieter copy that claims delivery without doing any. Both callers therefore
// resolve the same recipient, send the same email, and log the same honest
// `contract.delivered` / `contract.delivery_failed` activity.
//
// It never throws for a delivery failure: the agreement is already in the
// client's portal, so a failed email is a truthful outcome to report, not a
// reason to fail the write that already happened.

import "server-only";

import type { ClientContract } from "@/lib/clients/clientContracts";
import { sendTransactionalEmail, type TransactionalEmailResult } from "@/lib/server/email/transactionalEmail";
import { logActivity } from "@/server/activity";

export interface ContractDeliveryClient {
  name: string;
  ownerEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface ContractDeliveryInput {
  agencyId: string;
  clientId: string;
  client: ContractDeliveryClient;
  contract: ClientContract;
  /** Origin of the request, used to build the client's portal login link. */
  origin: string;
  actorUserId: string;
  actorEmail: string;
  signal?: AbortSignal;
}

export interface ContractDeliveryOutcome {
  delivery: TransactionalEmailResult;
  /** Empty when the client has no email on file — that is itself the reason. */
  recipient: string;
}

function trimmed(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function contractRecipientEmail(client: ContractDeliveryClient): string {
  const meta = client.metadata as { portalLoginEmail?: unknown; clientEmail?: unknown } | undefined;
  return trimmed(meta?.portalLoginEmail, 320)
    || trimmed(meta?.clientEmail, 320)
    || client.ownerEmail?.trim()
    || "";
}

export async function deliverContractToClient(input: ContractDeliveryInput): Promise<ContractDeliveryOutcome> {
  const { agencyId, clientId, client, contract, origin } = input;
  const recipient = contractRecipientEmail(client);

  let delivery: TransactionalEmailResult;
  if (recipient) {
    const portalUrl = `${origin}/login?brand=aquacrm&next=${encodeURIComponent("/portal/customer")}`;
    delivery = await sendTransactionalEmail({
      agencyId,
      clientId,
      to: recipient,
      signal: input.signal,
      fromName: "AquaCRM",
      subject: `Agreement ready for review · ${contract.title}`,
      bodyText: [`Hello ${client.name},`, "", `Your agreement “${contract.title}” is ready to review.`, contract.summary || "", "", `Review the agreement: ${portalUrl}`].filter(Boolean).join("\n"),
      bodyHtml: `<div style="font-family:Arial,sans-serif;background:#f3f6f5;padding:28px;color:#192321"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #dce4e1;padding:28px"><p style="margin:0 0 20px;color:#087f8c;font-size:13px;font-weight:700">AQUACRM AGREEMENT</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(contract.title)}</h1>${contract.summary ? `<p style="line-height:1.6;color:#58635f">${escapeHtml(contract.summary)}</p>` : ""}<a href="${escapeHtml(portalUrl)}" style="display:inline-block;margin-top:18px;background:#102d2a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700">Review agreement</a></div></div>`,
      externalRef: `contract-delivery:${agencyId}:${clientId}:${contract.id}:${contract.updatedAt}`,
    });
  } else {
    delivery = { delivered: false, via: "unconfigured", reason: "Add a client email before delivering this agreement." };
  }

  logActivity({
    agencyId,
    clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "finance",
    action: delivery.delivered ? "contract.delivered" : "contract.delivery_failed",
    message: delivery.delivered
      ? `Delivered agreement “${contract.title}” to ${recipient}.`
      : `Agreement “${contract.title}” is in the portal but email delivery failed.`,
    metadata: { contractId: contract.id, recipient, via: delivery.via, reason: delivery.reason },
  });

  return { delivery, recipient };
}

/**
 * Plain-English, TRUTHFUL account of what happened to the agreement — never
 * "sent" for something that was only saved, and never "emailed" for something
 * the provider refused. Shown after a close and echoed into the activity log.
 */
export function describeContractOutcome(
  contract: Pick<ClientContract, "status">,
  delivery: TransactionalEmailResult | undefined,
  recipient: string,
): string {
  if (contract.status !== "sent") {
    return "Agreement saved as a draft — it has no terms yet, so the client cannot review or accept it. Add the terms, then send it.";
  }
  if (delivery?.delivered) return `Agreement emailed to ${recipient} and published in their portal.`;
  if (delivery) {
    return `Agreement published in the client portal, but the email was not delivered — ${delivery.reason ?? "the email provider refused it"}.`;
  }
  return "Agreement published in the client portal.";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
