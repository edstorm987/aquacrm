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
import { installConfigWithSecrets } from "@/lib/server/plugins/pluginSecretConfig";
import type { ClientContract } from "@/lib/clients/clientContracts";
import { closeDealForClient } from "@/lib/server/closeDeal";
import { deliverContractToClient, describeContractOutcome } from "@/lib/server/clients/contractDelivery";
import type { TransactionalEmailResult } from "@/lib/server/email/transactionalEmail";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

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
  try {
    session = await requireRoleForClient([...AGENCY_ROLES], clientId);
  }
  catch (error) { return authErrorResponse(error); }

  // TENANCY first, then PERMISSION — in that order, deliberately.
  //
  // `getClientForAgency` answers null for a client of another agency and for one
  // that does not exist, so the 404 below is identical in both cases and
  // discloses nothing. That is the house convention (see the note at
  // src/server/phaseApplier.ts:51) and it is the answer this route's UI expects.
  //
  // The element check must therefore run AFTER it: once the ceiling stopped
  // falling back to legacy `manage` (issues #166) it refuses a cross-tenant id
  // outright, and running it first turned this route's documented 404 into a 403.
  // Ordered this way, an outsider still gets "Client not found", and a colleague
  // inside the agency who lacks `client.commercial` gets the 403 they should.
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

  try {
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.commercial", "manage");
  }
  catch (error) { return authErrorResponse(error); }

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
  // The keys live in the encrypted vault, not on the client-visible install
  // record — merge them back under their manifest ids before asking.
  const stripeConfig = installConfigWithSecrets("agency-finance", { agencyId: install.agencyId }, install.config);
  const createPayLink = stripeConfigured(stripeConfig)
    ? async (invoice: Invoice): Promise<string> => {
        const keys = readStripeKeysFromInstall(stripeConfig);
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
        // Same ceiling as the canonical contract route (action "update"), so a
        // set of terms the Contracts panel would store in full is not silently
        // truncated just because it arrived through the one-button close.
        contractBody: text(body?.contractBody, 50_000) || undefined,
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

    // Deliver the agreement the SAME way the canonical send does — the close
    // used to say "contract sent" while no delivery path ran at all (issues
    // #39). A contract with no terms never reaches "sent", so there is nothing
    // to deliver and nothing to claim; a resubmit delivered on its first pass.
    let delivery: TransactionalEmailResult | undefined;
    let recipient = "";
    if (!result.deduped && result.contract.status === "sent") {
      ({ delivery, recipient } = await deliverContractToClient({
        agencyId: session.agencyId,
        clientId,
        client,
        contract: result.contract,
        origin,
        actorUserId: session.userId,
        actorEmail: session.email,
        signal: request.signal,
      }));
    }
    const agreementOutcome = describeContractOutcome(result.contract, delivery, recipient);

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
        message: `Closed “${title}” — ${agreementOutcome} Invoice ${result.invoice.number} issued (${channel}).`,
        metadata: {
          contractId: result.contract.id,
          contractStatus: result.contract.status,
          invoiceId: result.invoice.id,
          channel,
          agreementDelivered: delivery?.delivered ?? false,
        },
      });
    }
    await flushPendingWrites();

    return NextResponse.json({
      ok: true,
      contractId: result.contract.id,
      contractStatus: result.contract.status,
      agreementOutcome,
      delivery,
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
