import { NextResponse } from "next/server";

import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { containerFor as financeContainerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { sendTransactionalEmail } from "@/lib/server/transactionalEmail";
import { logActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as { clientId?: unknown; invoiceId?: unknown } | null;
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId.trim() : "";
    if (!clientId || !invoiceId) return NextResponse.json({ ok: false, error: "Client and invoice are required." }, { status: 400 });

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    const install = getInstall({ agencyId: session.agencyId }, "agency-finance");
    if (!install?.enabled) return NextResponse.json({ ok: false, error: "Agency Finance is not connected." }, { status: 409 });

    ensureAgencyFinanceFoundationRegistered();
    const finance = financeContainerFor({ agencyId: session.agencyId, storage: makePluginStorage(install.id) as never, install });
    const invoice = await finance.invoices.get(invoiceId);
    if (!invoice || invoice.clientId !== clientId) return NextResponse.json({ ok: false, error: "Invoice not found for this client." }, { status: 404 });
    if (!["sent", "overdue"].includes(invoice.status)) {
      return NextResponse.json({ ok: false, error: "Issue the invoice before sending its payment request." }, { status: 409 });
    }

    const metadata = client.metadata as { portalLoginEmail?: string; clientEmail?: string; stripeLink?: string } | undefined;
    const recipient = metadata?.portalLoginEmail?.trim() || metadata?.clientEmail?.trim() || client.ownerEmail?.trim() || "";
    if (!recipient) return NextResponse.json({ ok: true, delivered: false, reason: "Add a client email before delivering this request." });
    const origin = new URL(request.url).origin;
    const portalUrl = `${origin}/login?brand=aquacrm&next=${encodeURIComponent("/portal/customer")}`;
    const amount = money(invoice.totalCents, invoice.currency);
    const due = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(invoice.dueAt);
    const paymentUrl = metadata?.stripeLink?.trim() || portalUrl;
    const result = await sendTransactionalEmail({
      agencyId: session.agencyId,
      clientId,
      to: recipient,
      fromName: "AquaCRM",
      subject: `Payment request ${invoice.number} · ${amount}`,
      bodyText: [
        `Hello ${client.name},`,
        "",
        `Payment request ${invoice.number} for ${amount} is now available. Payment is due ${due}.`,
        invoice.lineItems[0]?.description ? `For: ${invoice.lineItems[0].description}` : "",
        "",
        `Open payment request: ${paymentUrl}`,
        metadata?.stripeLink ? `Client portal: ${portalUrl}` : "",
      ].filter(Boolean).join("\n"),
      bodyHtml: `<div style="font-family:Arial,sans-serif;background:#f3f6f5;padding:28px;color:#192321"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #dce4e1;padding:28px"><p style="margin:0 0 20px;color:#087f8c;font-size:13px;font-weight:700">AQUACRM PAYMENT REQUEST</p><h1 style="font-size:24px;margin:0 0 8px">${escapeHtml(invoice.number)} · ${escapeHtml(amount)}</h1><p style="margin:0 0 22px;color:#65716e">Due ${escapeHtml(due)}</p>${invoice.lineItems[0]?.description ? `<p style="line-height:1.6">${escapeHtml(invoice.lineItems[0].description)}</p>` : ""}<a href="${escapeHtml(paymentUrl)}" style="display:inline-block;margin-top:18px;background:#102d2a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700">${metadata?.stripeLink ? "Pay securely" : "Open client portal"}</a></div></div>`,
      externalRef: `payment-request:${session.agencyId}:${invoice.id}:${invoice.updatedAt}`,
    });

    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "finance",
      action: result.delivered ? "payment_request.delivered" : "payment_request.delivery_failed",
      message: result.delivered ? `Delivered payment request ${invoice.number} to ${recipient}.` : `Payment request ${invoice.number} is in the portal but email delivery failed.`,
      metadata: { invoiceId: invoice.id, recipient, via: result.via, reason: result.reason },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, delivered: result.delivered, via: result.via, reason: result.reason });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
