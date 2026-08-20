// POST /api/tenants/close-deal — the one-button "close the deal" for an
// existing client. One action → contract (sent) + invoice (issued) + routed
// payment (Stripe pay-link, or a manual bank/cash intent). Thin wiring around
// the tested orchestration in `@/lib/server/closeDeal`.
//
// SAFETY: record + route + surface only — money flows to Ed's own Stripe/bank/
// cash directly; the app never holds funds. (Lead → client conversion is a
// separate, flagged follow-up that touches leads-pipeline.)

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { containerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { normaliseCurrency } from "@/built-ins/modules/agency-finance/src/lib/currencies";
import type { Invoice } from "@/built-ins/modules/agency-finance/src/lib/domain";
import { normaliseChannel } from "@/built-ins/modules/agency-finance/src/lib/channels";
import { createInvoiceCheckout, readStripeKeysFromInstall, stripeConfigured } from "@/built-ins/modules/agency-finance/src/lib/stripe";
import type { ClientContract } from "@/lib/clientContracts";
import { closeDealForClient } from "@/lib/server/closeDeal";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { logActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

function makeId(prefix: string): string { return `${prefix}_${crypto.randomBytes(8).toString("hex")}`; }
function text(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

interface Body {
  clientId?: unknown;
  title?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  channel?: unknown;
  dueInDays?: unknown;
  contractSummary?: unknown;
  contractBody?: unknown;
  idempotencyKey?: unknown;
}

export async function POST(request: Request) {
  await ensureHydrated();
  const body = await request.json().catch(() => null) as Body | null;
  const clientId = text(body?.clientId, 120);
  const title = text(body?.title, 180);
  const amountCents = typeof body?.amountCents === "number" ? Math.round(body.amountCents) : 0;
  if (!clientId || !title || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "Client, a deal title, and a positive amount are required." }, { status: 400 });
  }

  let session;
  try { session = await requireRoleForClient([...AGENCY_ROLES], clientId); }
  catch (error) { return authErrorResponse(error); }

  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

  const install = getInstall({ agencyId: session.agencyId }, "agency-finance");
  if (!install?.enabled) return NextResponse.json({ ok: false, error: "Agency Finance is not connected." }, { status: 409 });

  ensureAgencyFinanceFoundationRegistered();
  const finance = containerFor({ agencyId: session.agencyId, storage: makePluginStorage(install.id) as never, install });

  const currency = normaliseCurrency(text(body?.currency, 8) || "gbp");
  // Channel defaults to Stripe (the plan's default for online); the legacy/
  // unknown values fold to "other" via the normaliser.
  const channel = normaliseChannel((text(body?.channel, 20) || "stripe") as never);
  const dueInDays = typeof body?.dueInDays === "number" && Number.isFinite(body.dueInDays)
    ? Math.min(365, Math.max(0, Math.round(body.dueInDays)))
    : 30;
  const dueAt = Date.now() + dueInDays * 86_400_000;
  const existingContracts = (client.metadata?.contracts as ClientContract[] | undefined) ?? [];

  const origin = new URL(request.url).origin;
  const createPayLink = stripeConfigured(install.config)
    ? async (invoice: Invoice): Promise<string> => {
        const keys = readStripeKeysFromInstall(install.config);
        const out = await createInvoiceCheckout(keys, {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          amountCents: invoice.totalCents,
          currency: invoice.currency,
          description: `Payment for invoice ${invoice.number}`,
          successUrl: `${origin}/portal/agency/agency-finance/invoices/${invoice.id}?paid=1`,
          cancelUrl: `${origin}/portal/agency/agency-finance/invoices/${invoice.id}`,
        });
        return out.url;
      }
    : undefined;

  try {
    const result = await closeDealForClient(
      {
        title,
        amountCents,
        currency,
        channel,
        dueAt,
        contractSummary: text(body?.contractSummary, 2_000) || undefined,
        contractBody: text(body?.contractBody, 20_000) || undefined,
        idempotencyKey: text(body?.idempotencyKey, 200) || undefined,
      },
      {
        clientId,
        finance,
        existingContracts,
        saveContracts: (contracts) => { updateClient(session.agencyId, clientId, { metadata: { contracts } }); },
        createPayLink,
        makeId,
        now: Date.now(),
        actor: session.userId,
      },
    );

    // Don't re-log a "deal closed" for an accidental resubmit that reused the
    // first close.
    if (!result.deduped) {
      logActivity({
        agencyId: session.agencyId,
        clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "finance",
        action: "deal.closed",
        message: `Closed “${title}” — contract sent + invoice ${result.invoice.number} issued (${channel}).`,
        metadata: { contractId: result.contract.id, invoiceId: result.invoice.id, channel },
      });
    }
    await flushPendingWrites();

    return NextResponse.json({
      ok: true,
      contractId: result.contract.id,
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.number,
      channel: result.channel,
      payLink: result.payLink,
      paymentInstruction: result.paymentInstruction,
      deduped: result.deduped ?? false,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "close_failed" }, { status: 400 });
  }
}
