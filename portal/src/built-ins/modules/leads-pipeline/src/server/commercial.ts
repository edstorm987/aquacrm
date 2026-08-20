import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CommercialPack,
  CommercialPartyKind,
  CommercialPayment,
  CommercialPaymentMethod,
  SaveCommercialPackInput,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EmailEnqueuePort, EventBusPort } from "./ports";

const partyKey = (kind: CommercialPartyKind, id: string) => `commercial/party/${kind}/${id}`;
const tokenKey = (token: string) => `commercial/token/${token}`;
const sequenceKey = (year: number) => `commercial/sequence/${year}`;

export class CommercialService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private email?: EmailEnqueuePort,
  ) {}

  async get(kind: CommercialPartyKind, partyId: string): Promise<CommercialPack | null> {
    const pack = await this.storage.get<CommercialPack>(partyKey(kind, partyId));
    return pack?.agencyId === this.agencyId ? pack : null;
  }

  async getByToken(token: string): Promise<CommercialPack | null> {
    const pointer = await this.storage.get<{ kind: CommercialPartyKind; partyId: string }>(tokenKey(token));
    return pointer ? this.get(pointer.kind, pointer.partyId) : null;
  }

  async save(input: SaveCommercialPackInput, actor: UserId): Promise<CommercialPack> {
    if (!input.recipientEmail.trim()) throw new Error("Recipient email is required.");
    if (!input.lineItems.length) throw new Error("Add at least one invoice line.");
    if (!input.agreementBody.trim()) throw new Error("The service agreement cannot be empty.");
    if (input.signedDocumentDataUrl) {
      const validType = /^data:(?:application\/pdf|image\/(?:png|jpeg|webp));base64,/i.test(input.signedDocumentDataUrl);
      if (!validType) throw new Error("Signed agreement must be a PDF, PNG, JPEG, or WebP file.");
      if (input.signedDocumentDataUrl.length > 2_000_000) throw new Error("Signed agreement must be under 1.5 MB.");
    }
    const existing = await this.get(input.partyKind, input.partyId);
    const lineItems = input.lineItems.map(item => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitCents: Math.round(Number(item.unitCents)),
    }));
    if (lineItems.some(item => !item.description || item.quantity <= 0 || item.unitCents < 0)) {
      throw new Error("Every invoice line needs a description, positive quantity, and valid amount.");
    }
    const subtotalCents = lineItems.reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
    const taxCents = Math.max(0, Math.round(input.taxCents ?? 0));
    const ts = now();
    let invoiceNumber = existing?.invoiceNumber;
    if (!invoiceNumber) {
      const year = new Date(ts).getUTCFullYear();
      const seq = ((await this.storage.get<number>(sequenceKey(year))) ?? 0) + 1;
      await this.storage.set(sequenceKey(year), seq);
      invoiceNumber = `MM-${year}-${String(seq).padStart(4, "0")}`;
    }
    const pack: CommercialPack = {
      id: existing?.id ?? makeId("com"),
      agencyId: this.agencyId,
      companyId: input.companyId ?? existing?.companyId,
      brandName: input.brandName?.trim() || existing?.brandName,
      legalEntityName: input.legalEntityName?.trim() || existing?.legalEntityName,
      productIds: input.productIds ?? existing?.productIds ?? [],
      partyKind: input.partyKind,
      partyId: input.partyId,
      recipientName: input.recipientName?.trim() || undefined,
      recipientEmail: input.recipientEmail.trim().toLowerCase(),
      publicToken: existing?.publicToken ?? `${makeId("proposal")}${makeId("").replace(/^_/, "")}`,
      invoiceNumber,
      invoiceStatus: existing?.invoiceStatus ?? "draft",
      agreementStatus: existing?.agreementStatus ?? "draft",
      lineItems,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      currency: input.currency ?? existing?.currency ?? "gbp",
      dueAt: input.dueAt,
      billingCadence: input.billingCadence,
      installmentCount: input.billingCadence === "installments" ? Math.max(2, Math.round(input.installmentCount ?? 2)) : undefined,
      serviceLevel: input.serviceLevel.trim() || "Custom service",
      agreementTitle: input.agreementTitle.trim() || "Service level agreement",
      agreementBody: input.agreementBody.trim(),
      notes: input.notes?.trim() || undefined,
      signedDocumentName: input.signedDocumentName ?? existing?.signedDocumentName,
      signedDocumentDataUrl: input.signedDocumentDataUrl ?? existing?.signedDocumentDataUrl,
      payments: existing?.payments ?? [],
      stripeCheckoutId: existing?.stripeCheckoutId,
      stripeCheckoutUrl: existing?.stripeCheckoutUrl,
      stripeSubscriptionId: existing?.stripeSubscriptionId,
      financeInvoiceId: existing?.financeInvoiceId,
      emailMessageId: existing?.emailMessageId,
      sentAt: existing?.sentAt,
      acceptedAt: existing?.acceptedAt,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await this.persist(pack);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: existing ? "commercial.updated" : "commercial.created",
      message: `${existing ? "Updated" : "Created"} commercial pack ${pack.invoiceNumber} for ${pack.partyKind} ${pack.partyId}.`,
      metadata: { commercialPackId: pack.id, partyKind: pack.partyKind, partyId: pack.partyId },
    });
    return pack;
  }

  async attachStripe(kind: CommercialPartyKind, partyId: string, checkout: { id: string; url: string }): Promise<CommercialPack | null> {
    const pack = await this.get(kind, partyId);
    if (!pack) return null;
    const next = { ...pack, stripeCheckoutId: checkout.id, stripeCheckoutUrl: checkout.url, updatedAt: now() };
    await this.persist(next);
    return next;
  }

  async attachStripeSubscription(kind: CommercialPartyKind, partyId: string, subscriptionId: string): Promise<CommercialPack | null> {
    const pack = await this.get(kind, partyId);
    if (!pack) return null;
    const next = { ...pack, stripeSubscriptionId: subscriptionId, updatedAt: now() };
    await this.persist(next);
    return next;
  }

  async send(kind: CommercialPartyKind, partyId: string, baseUrl: string, actor: UserId): Promise<CommercialPack> {
    const pack = await this.get(kind, partyId);
    if (!pack) throw new Error("Create the invoice and agreement first.");
    if (!this.email) throw new Error("Email sending is not configured.");
    const proposalUrl = `${baseUrl}/proposal/${pack.publicToken}`;
    const cadence = pack.billingCadence === "one-off" ? "One-off payment" : `Billing: ${pack.billingCadence}`;
    const publicBrand = pack.brandName ?? "Zimante Group";
    const paymentLink = pack.stripeCheckoutUrl
      ? `<p><a href="${escapeHtml(pack.stripeCheckoutUrl)}">Pay securely by card</a></p>`
      : `<p>Bank transfer or cash payment can be arranged with ${escapeHtml(publicBrand)}.</p>`;
    const result = await (this.email.send?.({
      agencyId: this.agencyId,
      to: pack.recipientEmail,
      subject: `${pack.invoiceNumber} and ${pack.agreementTitle}`,
      bodyHtml: `<h1>Your ${escapeHtml(publicBrand)} proposal</h1><p>Hello ${escapeHtml(pack.recipientName ?? "there")},</p><p>Your invoice and service agreement are ready to review.</p><p><strong>${escapeHtml(pack.serviceLevel)}</strong><br>${escapeHtml(cadence)}<br>Total ${(pack.totalCents / 100).toFixed(2)} ${pack.currency.toUpperCase()}</p><p><a href="${escapeHtml(proposalUrl)}">Review invoice and agreement</a></p>${paymentLink}<p>Please keep this email for your records.</p>`,
      bodyText: `Your ${publicBrand} invoice and agreement are ready: ${proposalUrl}${pack.stripeCheckoutUrl ? `\nPay securely: ${pack.stripeCheckoutUrl}` : ""}`,
      triggeredByPlugin: "leads-pipeline",
      externalRef: `commercial:${pack.id}:${pack.updatedAt}`,
    }) ?? this.email.enqueue({
      agencyId: this.agencyId,
      to: pack.recipientEmail,
      subject: `${pack.invoiceNumber} and ${pack.agreementTitle}`,
      bodyText: `Your Milesymedia invoice and agreement are ready: ${proposalUrl}${pack.stripeCheckoutUrl ? `\nPay securely: ${pack.stripeCheckoutUrl}` : ""}`,
      triggeredByPlugin: "leads-pipeline",
      externalRef: `commercial:${pack.id}:${pack.updatedAt}`,
    }));
    const ts = now();
    const next: CommercialPack = {
      ...pack,
      invoiceStatus: pack.invoiceStatus === "paid" ? "paid" : "sent",
      agreementStatus: pack.agreementStatus === "accepted" ? "accepted" : "sent",
      emailMessageId: result.messageId,
      sentAt: ts,
      updatedAt: ts,
    };
    await this.persist(next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "commercial.sent",
      message: `Sent ${pack.invoiceNumber} and agreement to ${pack.partyKind} ${pack.partyId}.`,
      metadata: { commercialPackId: pack.id, messageId: result.messageId },
    });
    return next;
  }

  async accept(token: string, acceptedBy: string): Promise<CommercialPack | null> {
    const pack = await this.getByToken(token);
    if (!pack) return null;
    const ts = now();
    const next = { ...pack, agreementStatus: "accepted" as const, acceptedAt: ts, updatedAt: ts };
    await this.persist(next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      category: "leads",
      action: "commercial.agreement.accepted",
      message: `${pack.partyKind} ${pack.partyId} accepted ${pack.agreementTitle}.`,
      metadata: { commercialPackId: pack.id, acceptedBy },
    });
    return next;
  }

  async recordPayment(kind: CommercialPartyKind, partyId: string, input: {
    amountCents: number;
    method: CommercialPaymentMethod;
    reference?: string;
    paidAt?: number;
  }, actor: UserId): Promise<CommercialPack | null> {
    const pack = await this.get(kind, partyId);
    if (!pack) return null;
    if (input.amountCents <= 0) throw new Error("Payment amount must be positive.");
    if (input.reference && pack.payments.some(payment => payment.reference === input.reference)) return pack;
    const payment: CommercialPayment = {
      id: makeId("pay"),
      amountCents: Math.round(input.amountCents),
      method: input.method,
      reference: input.reference?.trim() || undefined,
      paidAt: input.paidAt ?? now(),
    };
    const payments = [...pack.payments, payment];
    const paid = payments.reduce((sum, item) => sum + item.amountCents, 0);
    let next: CommercialPack = {
      ...pack,
      payments,
      invoiceStatus: paid >= pack.totalCents ? "paid" : pack.invoiceStatus,
      updatedAt: now(),
    };
    await this.persist(next);
    if (this.email) {
      try {
        const send = this.email.send ?? this.email.enqueue;
        const receipt = await send.call(this.email, {
          agencyId: this.agencyId,
          to: pack.recipientEmail,
          subject: `Payment receipt · ${pack.invoiceNumber}`,
          bodyHtml: `<h1>Payment received</h1><p>We recorded ${(payment.amountCents / 100).toFixed(2)} ${pack.currency.toUpperCase()} against invoice ${pack.invoiceNumber}.</p><p>Method: ${payment.method}${payment.reference ? `<br>Reference: ${escapeHtml(payment.reference)}` : ""}</p><p>Remaining balance: ${(Math.max(0, pack.totalCents - paid) / 100).toFixed(2)} ${pack.currency.toUpperCase()}</p><p>Please keep this email for your records.</p>`,
          bodyText: `Payment received: ${(payment.amountCents / 100).toFixed(2)} ${pack.currency.toUpperCase()} against ${pack.invoiceNumber}. Remaining balance: ${(Math.max(0, pack.totalCents - paid) / 100).toFixed(2)} ${pack.currency.toUpperCase()}.`,
          triggeredByPlugin: "leads-pipeline",
          externalRef: `commercial-payment:${pack.id}:${payment.id}`,
        });
        payment.receiptSentAt = now();
        next = {
          ...next,
          payments: next.payments.map(item => item.id === payment.id ? payment : item),
          updatedAt: now(),
        };
        await this.persist(next);
      } catch {
        // Payment evidence must persist even if the email provider is unavailable.
      }
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "commercial.payment.recorded",
      message: `Recorded ${(payment.amountCents / 100).toFixed(2)} ${pack.currency.toUpperCase()} by ${payment.method} against ${pack.invoiceNumber}.`,
      metadata: { commercialPackId: pack.id, paymentId: payment.id, method: payment.method },
    });
    this.events.emit({ agencyId: this.agencyId }, "commercial.payment.recorded", { commercialPackId: pack.id, payment });
    return next;
  }

  async setFinanceInvoiceId(kind: CommercialPartyKind, partyId: string, financeInvoiceId: string): Promise<void> {
    const pack = await this.get(kind, partyId);
    if (pack) await this.persist({ ...pack, financeInvoiceId, updatedAt: now() });
  }

  // Right-to-be-forgotten: strip the recipient's identity from a pack, keep the
  // invoice + agreement. RETAIN-with-PII-stripped, the same disposition the
  // ecommerce hook applies to orders (keep the money record and its refs, drop
  // the person) — a commercial pack is the finance/contract record held for
  // legal defence under GDPR Art. 17(3)(e). Idempotent: a second run finds
  // nothing left to strip and returns false.
  //
  // NOTE: `agreementBody` and any `signedDocumentDataUrl` are deliberately
  // retained — they ARE the signed contract. Free text a human typed into
  // either may still name the recipient; that is a legal-hold record, not a
  // handle the erasure sweep should rewrite.
  async stripIdentityForErasure(kind: CommercialPartyKind, partyId: string): Promise<boolean> {
    const pack = await this.get(kind, partyId);
    if (!pack) return false;
    if (!pack.recipientEmail && !pack.recipientName) return false;
    await this.persist({ ...pack, recipientEmail: "", recipientName: undefined, updatedAt: now() });
    return true;
  }

  private async persist(pack: CommercialPack): Promise<void> {
    await this.storage.set(partyKey(pack.partyKind, pack.partyId), pack);
    await this.storage.set(tokenKey(pack.publicToken), { kind: pack.partyKind, partyId: pack.partyId });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
