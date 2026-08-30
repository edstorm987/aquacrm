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
import type { ActivityLogPort, EmailEnqueuePort, EmailEnqueueResult, EventBusPort } from "./ports";

const partyKey = (kind: CommercialPartyKind, id: string) => `commercial/party/${kind}/${id}`;
const tokenKey = (token: string) => `commercial/token/${token}`;
const sequenceKey = (year: number) => `commercial/sequence/${year}`;
const invoiceNumberPrefix = (year: number) => `commercial/invoice-number/${year}/`;
const invoiceNumberKey = (year: number, sequence: number) => `${invoiceNumberPrefix(year)}${String(sequence).padStart(8, "0")}`;
const partyInvoiceKey = (kind: CommercialPartyKind, id: string) => `commercial/invoice-party/${kind}/${id}`;
const paymentPrefix = (packId: string) => `commercial/payment/${packId}/`;
const paymentKey = (packId: string, canonicalReference: string) => `${paymentPrefix(packId)}${encodeURIComponent(canonicalReference)}`;

const commercialQueues = new Map<AgencyId, Promise<void>>();

async function withCommercialLock<T>(agencyId: AgencyId, work: () => Promise<T>): Promise<T> {
  const previous = commercialQueues.get(agencyId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => gate);
  commercialQueues.set(agencyId, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (commercialQueues.get(agencyId) === queued) commercialQueues.delete(agencyId);
  }
}

function canonicalPaymentReference(value: string): string {
  return value.trim().toLowerCase();
}

export class CommercialPaymentConflictError extends Error {
  constructor() {
    super("That payment reference is already attached to a different amount or method.");
    this.name = "CommercialPaymentConflictError";
  }
}

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
    if (pack?.agencyId !== this.agencyId) return null;
    const ledgerKeys = await this.storage.list(paymentPrefix(pack.id));
    if (!ledgerKeys.length) return pack;
    const paymentsById = new Map(pack.payments.map(payment => [payment.id, payment]));
    for (const key of ledgerKeys) {
      const payment = await this.storage.get<CommercialPayment>(key);
      if (payment) paymentsById.set(payment.id, payment);
    }
    const payments = [...paymentsById.values()].sort((a, b) => a.paidAt - b.paidAt || a.id.localeCompare(b.id));
    const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    return {
      ...pack,
      payments,
      invoiceStatus: paid >= pack.totalCents ? "paid" : pack.invoiceStatus,
    };
  }

  async getByToken(token: string): Promise<CommercialPack | null> {
    const pointer = await this.storage.get<{ kind: CommercialPartyKind; partyId: string }>(tokenKey(token));
    return pointer ? this.get(pointer.kind, pointer.partyId) : null;
  }

  async save(input: SaveCommercialPackInput, actor: UserId): Promise<CommercialPack> {
    return withCommercialLock(this.agencyId, () => this.saveUnlocked(input, actor));
  }

  private async saveUnlocked(input: SaveCommercialPackInput, actor: UserId): Promise<CommercialPack> {
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
      invoiceNumber = await this.allocateInvoiceNumber(input.partyKind, input.partyId, year, ts);
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
      deliveryStatus: existing?.deliveryStatus,
      deliveryError: existing?.deliveryError,
      deliveryAttemptedAt: existing?.deliveryAttemptedAt,
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
    return withCommercialLock(this.agencyId, () => this.attachStripeUnlocked(kind, partyId, checkout));
  }

  private async attachStripeUnlocked(kind: CommercialPartyKind, partyId: string, checkout: { id: string; url: string }): Promise<CommercialPack | null> {
    const pack = await this.get(kind, partyId);
    if (!pack) return null;
    const next = { ...pack, stripeCheckoutId: checkout.id, stripeCheckoutUrl: checkout.url, updatedAt: now() };
    await this.persist(next);
    return next;
  }

  async attachStripeSubscription(kind: CommercialPartyKind, partyId: string, subscriptionId: string): Promise<CommercialPack | null> {
    return withCommercialLock(this.agencyId, () => this.attachStripeSubscriptionUnlocked(kind, partyId, subscriptionId));
  }

  private async attachStripeSubscriptionUnlocked(kind: CommercialPartyKind, partyId: string, subscriptionId: string): Promise<CommercialPack | null> {
    const pack = await this.get(kind, partyId);
    if (!pack) return null;
    const next = { ...pack, stripeSubscriptionId: subscriptionId, updatedAt: now() };
    await this.persist(next);
    return next;
  }

  async send(kind: CommercialPartyKind, partyId: string, baseUrl: string, actor: UserId): Promise<CommercialPack> {
    return withCommercialLock(this.agencyId, () => this.sendUnlocked(kind, partyId, baseUrl, actor));
  }

  private async sendUnlocked(kind: CommercialPartyKind, partyId: string, baseUrl: string, actor: UserId): Promise<CommercialPack> {
    const pack = await this.get(kind, partyId);
    if (!pack) throw new Error("Create the invoice and agreement first.");
    if (!this.email) throw new Error("Email sending is not configured.");
    const proposalUrl = `${baseUrl}/proposal/${pack.publicToken}`;
    const cadence = pack.billingCadence === "one-off" ? "One-off payment" : `Billing: ${pack.billingCadence}`;
    const publicBrand = pack.brandName ?? "Zimante Group";
    const paymentLink = pack.stripeCheckoutUrl
      ? `<p><a href="${escapeHtml(pack.stripeCheckoutUrl)}">Pay securely by card</a></p>`
      : `<p>Bank transfer or cash payment can be arranged with ${escapeHtml(publicBrand)}.</p>`;
    let result: EmailEnqueueResult;
    try {
      result = await (this.email.send?.({
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
    } catch (error) {
      // The provider refused before returning a result. Record the refusal on the
      // pack so the agency can see it and retry, then let the caller see the throw.
      await this.recordSendRefusal(pack, undefined, error instanceof Error ? error.message : String(error), actor);
      throw error;
    }
    // Three-valued delivery. `delivered === false` is an explicit provider refusal
    // and must not advance any sent milestone; `undefined` means the message was
    // only accepted into the queue, which is not confirmation either.
    if (result.delivered === false) {
      return this.recordSendRefusal(pack, result.messageId, result.error, actor);
    }
    const ts = now();
    const delivered = result.delivered === true;
    const next: CommercialPack = {
      ...pack,
      invoiceStatus: delivered && pack.invoiceStatus !== "paid" ? "sent" : pack.invoiceStatus,
      agreementStatus: delivered && pack.agreementStatus !== "accepted" ? "sent" : pack.agreementStatus,
      emailMessageId: result.messageId,
      deliveryStatus: delivered ? "delivered" : "queued",
      deliveryError: undefined,
      deliveryAttemptedAt: ts,
      sentAt: delivered ? ts : pack.sentAt,
      updatedAt: ts,
    };
    await this.persist(next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: delivered ? "commercial.sent" : "commercial.send.queued",
      message: delivered
        ? `Sent ${pack.invoiceNumber} and agreement to ${pack.partyKind} ${pack.partyId}.`
        : `Queued ${pack.invoiceNumber} and agreement for ${pack.partyKind} ${pack.partyId}. The provider has not confirmed delivery, so neither document is marked sent.`,
      metadata: { commercialPackId: pack.id, messageId: result.messageId, deliveryStatus: next.deliveryStatus },
    });
    return next;
  }

  /** Persist an explicit delivery refusal without advancing any sent milestone. */
  private async recordSendRefusal(
    pack: CommercialPack,
    messageId: string | undefined,
    error: string | undefined,
    actor: UserId,
  ): Promise<CommercialPack> {
    const ts = now();
    const reason = error?.trim() || "The email provider refused delivery.";
    const next: CommercialPack = {
      ...pack,
      emailMessageId: messageId ?? pack.emailMessageId,
      deliveryStatus: "failed",
      deliveryError: reason,
      deliveryAttemptedAt: ts,
      updatedAt: ts,
    };
    await this.persist(next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "commercial.send.failed",
      message: `Email delivery of ${pack.invoiceNumber} to ${pack.partyKind} ${pack.partyId} failed: ${reason} The invoice and agreement stay unsent until a retry is delivered.`,
      metadata: { commercialPackId: pack.id, messageId, error: reason },
    });
    return next;
  }

  async accept(token: string, acceptedBy: string): Promise<CommercialPack | null> {
    return withCommercialLock(this.agencyId, () => this.acceptUnlocked(token, acceptedBy));
  }

  private async acceptUnlocked(token: string, acceptedBy: string): Promise<CommercialPack | null> {
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
    return withCommercialLock(this.agencyId, () => this.recordPaymentUnlocked(kind, partyId, input, actor));
  }

  private async recordPaymentUnlocked(kind: CommercialPartyKind, partyId: string, input: {
    amountCents: number;
    method: CommercialPaymentMethod;
    reference?: string;
    paidAt?: number;
  }, actor: UserId): Promise<CommercialPack | null> {
    const pack = await this.get(kind, partyId);
    if (!pack) return null;
    const amountCents = Math.round(input.amountCents);
    if (amountCents <= 0) throw new Error("Payment amount must be positive.");
    const reference = input.reference?.trim() ?? "";
    const canonicalReference = canonicalPaymentReference(reference);
    if (!canonicalReference) throw new Error("A bank, receipt, cash-book, or provider reference is required.");
    const existing = pack.payments.find(payment =>
      canonicalPaymentReference(payment.reference ?? "") === canonicalReference);
    if (existing) {
      if (existing.amountCents !== amountCents || existing.method !== input.method) {
        throw new CommercialPaymentConflictError();
      }
      const ledgerPayment = await this.storage.get<CommercialPayment>(paymentKey(pack.id, canonicalReference));
      if (!ledgerPayment) {
        const migrated = {
          ...existing,
          activityRecordedAt: existing.activityRecordedAt ?? now(),
          eventEmittedAt: existing.eventEmittedAt ?? now(),
        };
        return this.persistPaymentState(pack, migrated);
      }
      return this.resumePaymentSideEffects(pack, ledgerPayment, actor);
    }

    let payment: CommercialPayment = {
      id: makeId("pay"),
      amountCents,
      method: input.method,
      reference,
      paidAt: input.paidAt ?? now(),
    };
    const ledgerKey = paymentKey(pack.id, canonicalReference);
    if (this.storage.setIfAbsent) {
      const inserted = await this.storage.setIfAbsent(ledgerKey, payment);
      if (!inserted) {
        const claimed = await this.storage.get<CommercialPayment>(ledgerKey);
        if (!claimed) throw new Error("Payment reference reservation could not be read. Retry safely.");
        if (claimed.amountCents !== amountCents || claimed.method !== input.method) {
          throw new CommercialPaymentConflictError();
        }
        payment = claimed;
      }
    } else {
      await this.storage.set(ledgerKey, payment);
    }
    const persisted = await this.persistPaymentState(pack, payment);
    return this.resumePaymentSideEffects(persisted, payment, actor);
  }

  private async resumePaymentSideEffects(
    pack: CommercialPack,
    originalPayment: CommercialPayment,
    actor: UserId,
  ): Promise<CommercialPack> {
    let payment = originalPayment;
    let current = pack;
    const paid = current.payments.reduce((sum, item) => sum + item.amountCents, 0);
    if (this.email && !payment.receiptSentAt) {
      try {
        const send = this.email.send ?? this.email.enqueue;
        const result = await send.call(this.email, {
          agencyId: this.agencyId,
          to: current.recipientEmail,
          subject: `Payment receipt · ${current.invoiceNumber}`,
          bodyHtml: `<h1>Payment received</h1><p>We recorded ${(payment.amountCents / 100).toFixed(2)} ${current.currency.toUpperCase()} against invoice ${current.invoiceNumber}.</p><p>Method: ${payment.method}<br>Reference: ${escapeHtml(payment.reference ?? "")}</p><p>Remaining balance: ${(Math.max(0, current.totalCents - paid) / 100).toFixed(2)} ${current.currency.toUpperCase()}</p><p>Please keep this email for your records.</p>`,
          bodyText: `Payment received: ${(payment.amountCents / 100).toFixed(2)} ${current.currency.toUpperCase()} against ${current.invoiceNumber}. Remaining balance: ${(Math.max(0, current.totalCents - paid) / 100).toFixed(2)} ${current.currency.toUpperCase()}.`,
          triggeredByPlugin: "leads-pipeline",
          externalRef: `commercial-payment:${current.id}:${payment.id}`,
        });
        // receiptSentAt is a delivery claim, so only confirmed delivery stamps it.
        // A refusal or a bare queue acceptance keeps the receipt unsent and leaves
        // this resume path free to retry it on the next recordPayment.
        if (result?.delivered === false) {
          payment = {
            ...payment,
            receiptMessageId: result.messageId ?? payment.receiptMessageId,
            receiptDeliveryStatus: "failed",
            receiptError: result.error?.trim() || "The email provider refused delivery.",
          };
        } else if (result?.delivered === true) {
          payment = {
            ...payment,
            receiptMessageId: result.messageId,
            receiptDeliveryStatus: "delivered",
            receiptError: undefined,
            receiptSentAt: now(),
          };
        } else {
          payment = {
            ...payment,
            receiptMessageId: result?.messageId ?? payment.receiptMessageId,
            receiptDeliveryStatus: "queued",
            receiptError: undefined,
          };
        }
        current = await this.persistPaymentState(current, payment);
      } catch (error) {
        // Payment evidence must persist even if the email provider is unavailable —
        // and the refusal itself is evidence, so it is retained rather than swallowed.
        payment = {
          ...payment,
          receiptDeliveryStatus: "failed",
          receiptError: error instanceof Error ? error.message : String(error),
        };
        try {
          current = await this.persistPaymentState(current, payment);
        } catch {
          // Storage is unavailable too; the ledger row still holds the payment.
        }
      }
    }
    if (!payment.activityRecordedAt) {
      try {
        await this.activity.logActivity({
          agencyId: this.agencyId,
          actorUserId: actor,
          category: "leads",
          action: "commercial.payment.recorded",
          message: `Recorded ${(payment.amountCents / 100).toFixed(2)} ${current.currency.toUpperCase()} by ${payment.method} against ${current.invoiceNumber}.`,
          metadata: { commercialPackId: current.id, paymentId: payment.id, method: payment.method },
        });
        payment = { ...payment, activityRecordedAt: now() };
        current = await this.persistPaymentState(current, payment);
      } catch {
        // The payment remains durable and the stable reference can resume this work.
      }
    }
    if (!payment.eventEmittedAt) {
      try {
        this.events.emit({ agencyId: this.agencyId }, "commercial.payment.recorded", {
          commercialPackId: current.id,
          payment,
        });
        payment = { ...payment, eventEmittedAt: now() };
        current = await this.persistPaymentState(current, payment);
      } catch {
        // The payment remains durable and the stable reference can resume this work.
      }
    }
    return current;
  }

  private async persistPaymentState(pack: CommercialPack, payment: CommercialPayment): Promise<CommercialPack> {
    const reference = canonicalPaymentReference(payment.reference ?? "");
    if (!reference) throw new Error("A durable payment reference is required.");
    await this.storage.set(paymentKey(pack.id, reference), payment);
    const latest = await this.get(pack.partyKind, pack.partyId) ?? pack;
    const payments = latest.payments.some(item => item.id === payment.id)
      ? latest.payments.map(item => item.id === payment.id ? payment : item)
      : [...latest.payments, payment];
    const paid = payments.reduce((sum, item) => sum + item.amountCents, 0);
    const next: CommercialPack = {
      ...latest,
      payments,
      invoiceStatus: paid >= latest.totalCents ? "paid" : latest.invoiceStatus,
      updatedAt: now(),
    };
    await this.persist(next);
    return next;
  }

  async setFinanceInvoiceId(kind: CommercialPartyKind, partyId: string, financeInvoiceId: string): Promise<void> {
    return withCommercialLock(this.agencyId, () => this.setFinanceInvoiceIdUnlocked(kind, partyId, financeInvoiceId));
  }

  private async setFinanceInvoiceIdUnlocked(kind: CommercialPartyKind, partyId: string, financeInvoiceId: string): Promise<void> {
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
    return withCommercialLock(this.agencyId, () => this.stripIdentityForErasureUnlocked(kind, partyId));
  }

  private async stripIdentityForErasureUnlocked(kind: CommercialPartyKind, partyId: string): Promise<boolean> {
    const pack = await this.get(kind, partyId);
    if (!pack) return false;
    if (!pack.recipientEmail && !pack.recipientName) return false;
    await this.persist({ ...pack, recipientEmail: "", recipientName: undefined, updatedAt: now() });
    return true;
  }

  private async allocateInvoiceNumber(
    kind: CommercialPartyKind,
    partyId: string,
    year: number,
    allocatedAt: number,
  ): Promise<string> {
    const claimKey = partyInvoiceKey(kind, partyId);
    const existingClaim = await this.storage.get<string>(claimKey);
    if (existingClaim) return existingClaim;

    let highest = (await this.storage.get<number>(sequenceKey(year))) ?? 0;
    for (const key of await this.storage.list(invoiceNumberPrefix(year))) {
      const parsed = Number(key.slice(invoiceNumberPrefix(year).length));
      if (Number.isInteger(parsed)) highest = Math.max(highest, parsed);
    }
    for (const key of await this.storage.list("commercial/party/")) {
      const pack = await this.storage.get<CommercialPack>(key);
      const match = pack?.invoiceNumber.match(new RegExp(`^MM-${year}-(\\d+)$`));
      if (match) highest = Math.max(highest, Number(match[1]));
    }

    let sequence = highest + 1;
    let invoiceNumber = `MM-${year}-${String(sequence).padStart(4, "0")}`;
    if (this.storage.setIfAbsent) {
      while (!await this.storage.setIfAbsent(invoiceNumberKey(year, sequence), {
        agencyId: this.agencyId,
        kind,
        partyId,
        invoiceNumber,
        allocatedAt,
      })) {
        sequence += 1;
        invoiceNumber = `MM-${year}-${String(sequence).padStart(4, "0")}`;
      }
      const claimed = await this.storage.setIfAbsent(claimKey, invoiceNumber);
      if (!claimed) {
        const winner = await this.storage.get<string>(claimKey);
        if (winner) return winner;
      }
    } else {
      await this.storage.set(invoiceNumberKey(year, sequence), {
        agencyId: this.agencyId,
        kind,
        partyId,
        invoiceNumber,
        allocatedAt,
      });
      await this.storage.set(claimKey, invoiceNumber);
    }
    const storedSequence = (await this.storage.get<number>(sequenceKey(year))) ?? 0;
    if (sequence > storedSequence) await this.storage.set(sequenceKey(year), sequence);
    return invoiceNumber;
  }

  private async persist(pack: CommercialPack): Promise<void> {
    await this.storage.set(partyKey(pack.partyKind, pack.partyId), pack);
    await this.storage.set(tokenKey(pack.publicToken), { kind: pack.partyKind, partyId: pack.partyId });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
