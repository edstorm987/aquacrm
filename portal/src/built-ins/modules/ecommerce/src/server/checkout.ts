import { calculateShipping, type ShippingRate, type ShippingZone } from "../lib/admin/shipping";
import type { StripeLineItem } from "../lib/stripe/server";
import { now } from "../lib/time";
import type { Product } from "../lib/products";
import type { AppliedDiscount, DiscountService } from "./discounts";
import type { GiftCardService } from "./giftCards";
import type { ProductService } from "./productsStore";
import type { StoragePort } from "./ports";

const OPERATION_PREFIX = "checkout/operation/";
const SESSION_PREFIX = "checkout/by-session/";
const DISCOUNT_RESERVATION_PREFIX = "checkout/discount-reservation/";
const SHIPPING_ZONES_KEY = "shipping/zones";
const SHIPPING_RATES_KEY = "shipping/rates";
const DEFAULT_RESERVATION_TTL_MS = 60 * 60 * 1000;
const SUPPORTED_CURRENCIES = new Set(["gbp", "usd", "eur"]);
const localTails = new Map<string, Promise<void>>();

export type CheckoutOperationStatus =
  | "preparing"
  | "reserved"
  | "provider_created"
  | "paid"
  | "released"
  | "expired";

export interface CheckoutRequestItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface GiftCardPurchaseRequest {
  amount: number;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
}

export interface CheckoutRequest {
  version: 1;
  operationId: string;
  items: CheckoutRequestItem[];
  giftCardPurchase?: GiftCardPurchaseRequest;
  discountCode?: string;
  customerEmail?: string;
  endCustomerUserId?: string;
  referralCodeId?: string;
  shippingCountry?: string;
  successPath?: string;
  cancelPath?: string;
}

export interface CheckoutLineSnapshot {
  productId: string;
  productSlug: string;
  variantId?: string;
  sku?: string;
  name: string;
  description?: string;
  quantity: number;
  unitAmount: number;
  currency: string;
  taxBehavior: "inclusive" | "exclusive";
  digital: boolean;
  weightGrams: number;
  image?: string;
  downloadUrl?: string;
  taxable?: boolean;
  kind?: "catalogue" | "gift_card_purchase";
}

export interface CheckoutShippingSnapshot {
  country?: string;
  zoneId?: string;
  rateId?: string;
  amount: number;
  allowedCountries?: string[];
}

export interface CheckoutOperation {
  id: string;
  fingerprint: string;
  status: CheckoutOperationStatus;
  request: CheckoutRequest;
  lines: CheckoutLineSnapshot[];
  inventory: Array<{ sku: string; quantity: number }>;
  currency: string;
  subtotal: number;
  discount?: AppliedDiscount;
  discountAmount: number;
  shipping: CheckoutShippingSnapshot;
  taxAmount: number;
  taxAddedAmount: number;
  amountTotal: number;
  providerSessionId?: string;
  providerUrl?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  paidAt?: number;
  releasedAt?: number;
  issuedGiftCardCode?: string;
  giftCardRefundedAt?: number;
}

interface DiscountReservation {
  operationId: string;
  code: string;
  kind: "gift_card" | "custom";
  amount: number;
  status: "reserved" | "committed" | "released";
  createdAt: number;
  updatedAt: number;
}

export interface CheckoutConfig {
  agencyId: string;
  clientId: string;
  defaultCurrency?: string;
  taxRatePercent?: number;
  reservationTtlMs?: number;
  giftCardDenominations?: number[];
}

export interface CheckoutQuote {
  lines: CheckoutLineSnapshot[];
  currency: string;
  subtotal: number;
  discount?: AppliedDiscount;
  discountAmount: number;
  shipping: CheckoutShippingSnapshot;
  taxAmount: number;
  taxAddedAmount: number;
  amountTotal: number;
}

export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanOptionalString(value: unknown, field: string, max = 200): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new CheckoutValidationError(`${field} must be a string.`);
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > max) throw new CheckoutValidationError(`${field} is too long.`);
  return cleaned;
}

export function parseCheckoutRequest(value: unknown): CheckoutRequest {
  const body = record(value);
  if (!body) throw new CheckoutValidationError("Checkout body must be an object.");
  const allowed = new Set([
    "version", "operationId", "items", "giftCardPurchase", "discountCode", "customerEmail",
    "endCustomerUserId", "referralCodeId", "shippingCountry", "successPath", "cancelPath",
  ]);
  const unknown = Object.keys(body).find(key => !allowed.has(key));
  if (unknown) throw new CheckoutValidationError(`Unknown checkout field: ${unknown}.`);
  if (body.version !== 1) throw new CheckoutValidationError("Checkout version 1 is required.");
  const operationId = cleanOptionalString(body.operationId, "operationId", 120);
  if (!operationId || !/^[A-Za-z0-9._:-]{8,120}$/.test(operationId)) {
    throw new CheckoutValidationError("operationId must be 8-120 safe characters.");
  }
  if (!Array.isArray(body.items) || body.items.length > 50) {
    throw new CheckoutValidationError("Checkout items must be an array with at most 50 entries.");
  }
  const items = body.items.map((value, index): CheckoutRequestItem => {
    const item = record(value);
    if (!item) throw new CheckoutValidationError(`Item ${index + 1} must be an object.`);
    const itemAllowed = new Set(["productId", "variantId", "quantity"]);
    const itemUnknown = Object.keys(item).find(key => !itemAllowed.has(key));
    if (itemUnknown) throw new CheckoutValidationError(`Unknown item field: ${itemUnknown}.`);
    const productId = cleanOptionalString(item.productId, `items[${index}].productId`);
    const variantId = cleanOptionalString(item.variantId, `items[${index}].variantId`);
    if (!productId) throw new CheckoutValidationError(`items[${index}].productId is required.`);
    if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 99) {
      throw new CheckoutValidationError(`items[${index}].quantity must be an integer from 1 to 99.`);
    }
    return { productId, variantId, quantity: Number(item.quantity) };
  });
  let giftCardPurchase: GiftCardPurchaseRequest | undefined;
  if (body.giftCardPurchase !== undefined) {
    const gift = record(body.giftCardPurchase);
    if (!gift) throw new CheckoutValidationError("giftCardPurchase must be an object.");
    const giftAllowed = new Set(["amount", "recipientName", "recipientEmail", "senderName", "message"]);
    const giftUnknown = Object.keys(gift).find(key => !giftAllowed.has(key));
    if (giftUnknown) throw new CheckoutValidationError(`Unknown gift-card field: ${giftUnknown}.`);
    if (!Number.isSafeInteger(gift.amount) || Number(gift.amount) <= 0) {
      throw new CheckoutValidationError("Gift-card amount must be a positive integer.");
    }
    const recipientName = cleanOptionalString(gift.recipientName, "giftCardPurchase.recipientName", 160);
    const recipientEmail = cleanOptionalString(gift.recipientEmail, "giftCardPurchase.recipientEmail", 254);
    if (!recipientName || !recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      throw new CheckoutValidationError("Gift-card recipient name and email are required.");
    }
    giftCardPurchase = {
      amount: Number(gift.amount),
      recipientName,
      recipientEmail,
      senderName: cleanOptionalString(gift.senderName, "giftCardPurchase.senderName", 160) ?? "",
      message: cleanOptionalString(gift.message, "giftCardPurchase.message", 1000) ?? "",
    };
  }
  if (items.length === 0 && !giftCardPurchase) {
    throw new CheckoutValidationError("Checkout requires at least one catalogue item or gift card.");
  }
  if (giftCardPurchase && items.length > 0) {
    throw new CheckoutValidationError("Gift-card purchases use their own checkout and cannot be mixed with catalogue items.");
  }
  if (giftCardPurchase && body.discountCode) {
    throw new CheckoutValidationError("Discount codes cannot be applied to a gift-card purchase.");
  }
  const customerEmail = cleanOptionalString(body.customerEmail, "customerEmail", 254);
  if (customerEmail && !/^\S+@\S+\.\S+$/.test(customerEmail)) {
    throw new CheckoutValidationError("customerEmail is invalid.");
  }
  const shippingCountry = cleanOptionalString(body.shippingCountry, "shippingCountry", 2)?.toUpperCase();
  if (shippingCountry && !/^[A-Z]{2}$/.test(shippingCountry)) {
    throw new CheckoutValidationError("shippingCountry must be a two-letter country code.");
  }
  return {
    version: 1,
    operationId,
    items,
    giftCardPurchase,
    discountCode: cleanOptionalString(body.discountCode, "discountCode", 100)?.toUpperCase(),
    customerEmail,
    endCustomerUserId: cleanOptionalString(body.endCustomerUserId, "endCustomerUserId"),
    referralCodeId: cleanOptionalString(body.referralCodeId, "referralCodeId"),
    shippingCountry,
    successPath: cleanOptionalString(body.successPath, "successPath", 1000),
    cancelPath: cleanOptionalString(body.cancelPath, "cancelPath", 1000),
  };
}

function operationKey(operationId: string): string {
  return `${OPERATION_PREFIX}${encodeURIComponent(operationId)}`;
}

function sessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${encodeURIComponent(sessionId)}`;
}

function discountReservationKey(operationId: string): string {
  return `${DISCOUNT_RESERVATION_PREFIX}${encodeURIComponent(operationId)}`;
}

function fingerprint(request: CheckoutRequest): string {
  return JSON.stringify(request);
}

function positiveMoney(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CheckoutValidationError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function variantDescription(product: Product, variantId: string): string | undefined {
  const variant = product.variants?.find(row => row.id === variantId);
  if (!variant) return undefined;
  const labels = Object.entries(variant.optionValues).map(([optionId, valueId]) => {
    const option = product.options?.find(row => row.id === optionId);
    return option?.values.find(row => row.id === valueId)?.label ?? valueId;
  });
  return labels.filter(Boolean).join(" · ") || undefined;
}

async function localExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  localTails.set(key, tail);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

export class CheckoutService {
  constructor(
    private storage: StoragePort,
    private products: ProductService,
    private discounts: DiscountService,
    private giftCards: GiftCardService,
  ) {}

  async getOperation(operationId: string): Promise<CheckoutOperation | null> {
    return (await this.storage.get<CheckoutOperation>(operationKey(operationId))) ?? null;
  }

  async getOperationBySession(sessionId: string): Promise<CheckoutOperation | null> {
    const operationId = await this.storage.get<string>(sessionKey(sessionId));
    return operationId ? this.getOperation(operationId) : null;
  }

  async quote(request: CheckoutRequest, config: CheckoutConfig): Promise<CheckoutQuote> {
    const lines = await this.resolveLines(request, config);
    const currency = lines[0]?.currency;
    if (!currency) throw new CheckoutValidationError("Checkout has no priced items.");
    const subtotal = positiveMoney(
      lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0),
      "subtotal",
    );
    const discount = await this.resolveDiscount(request, config, subtotal);
    const discountAmount = Math.min(subtotal, discount?.amountOff ?? 0);
    const shipping = await this.resolveShipping(request, lines, subtotal, discount);
    const { taxAmount, taxAddedAmount } = this.calculateTax(lines, discountAmount, config.taxRatePercent ?? 0);
    return {
      lines,
      currency,
      subtotal,
      discount,
      discountAmount,
      shipping,
      taxAmount,
      taxAddedAmount,
      amountTotal: positiveMoney(subtotal - discountAmount + shipping.amount + taxAddedAmount, "amountTotal"),
    };
  }

  async prepare(request: CheckoutRequest, config: CheckoutConfig): Promise<CheckoutOperation> {
    return this.withLock(async () => {
      await this.releaseExpiredOperations(true);
      const requestFingerprint = fingerprint(request);
      const stored = await this.getOperation(request.operationId);
      if (stored) {
        if (stored.fingerprint !== requestFingerprint) {
          throw new CheckoutValidationError(`Checkout operation ${request.operationId} was replayed with a different cart.`);
        }
        if (stored.status === "released" || stored.status === "expired") {
          throw new CheckoutValidationError(`Checkout operation ${request.operationId} is no longer active.`);
        }
        if (stored.status !== "preparing") return stored;
      }

      const lines = stored?.lines.length ? stored.lines : await this.resolveLines(request, config);
      const currency = lines[0]?.currency;
      if (!currency) throw new CheckoutValidationError("Checkout has no priced items.");
      const subtotal = lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
      positiveMoney(subtotal, "subtotal");
      const discount = stored?.discount ?? await this.resolveDiscount(request, config, subtotal);
      const discountAmount = Math.min(subtotal, discount?.amountOff ?? 0);
      const shipping = stored?.shipping ?? await this.resolveShipping(request, lines, subtotal, discount);
      const { taxAmount, taxAddedAmount } = this.calculateTax(lines, discountAmount, config.taxRatePercent ?? 0);
      const amountTotal = positiveMoney(
        subtotal - discountAmount + shipping.amount + taxAddedAmount,
        "amountTotal",
      );
      const inventory = this.inventoryTotals(lines);
      const createdAt = stored?.createdAt ?? now();
      let operation: CheckoutOperation = {
        id: request.operationId,
        fingerprint: requestFingerprint,
        status: "preparing",
        request,
        lines,
        inventory,
        currency,
        subtotal,
        discount,
        discountAmount,
        shipping,
        taxAmount,
        taxAddedAmount,
        amountTotal,
        createdAt,
        updatedAt: now(),
        expiresAt: stored?.expiresAt ?? createdAt + (config.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS),
      };
      await this.storage.set(operationKey(operation.id), operation);

      try {
        for (const item of inventory) {
          const reserved = await this.products.reserveStockOnce(item.sku, item.quantity, operation.id);
          if (!reserved.ok) throw new CheckoutValidationError(reserved.error);
        }
        await this.reserveDiscount(operation);
      } catch (error) {
        if (error instanceof CheckoutValidationError) {
          await this.releaseInternal(operation, "released");
        }
        throw error;
      }

      operation = { ...operation, status: "reserved", updatedAt: now() };
      await this.storage.set(operationKey(operation.id), operation);
      return operation;
    });
  }

  async recordProviderSession(
    operationId: string,
    session: { id: string; url: string },
  ): Promise<CheckoutOperation> {
    return this.withLock(async () => {
      const operation = await this.getOperation(operationId);
      if (!operation) throw new CheckoutValidationError(`Unknown checkout operation ${operationId}.`);
      if (operation.providerSessionId && operation.providerSessionId !== session.id) {
        throw new CheckoutValidationError(`Checkout operation ${operationId} already belongs to another provider session.`);
      }
      if (operation.status !== "reserved" && operation.status !== "provider_created" && operation.status !== "paid") {
        throw new CheckoutValidationError(`Checkout operation ${operationId} cannot create a provider session from ${operation.status}.`);
      }
      const next: CheckoutOperation = operation.status === "paid" ? operation : {
        ...operation,
        status: "provider_created",
        providerSessionId: session.id,
        providerUrl: session.url,
        updatedAt: now(),
      };
      await this.storage.set(operationKey(operation.id), next);
      await this.storage.set(sessionKey(session.id), operation.id);
      return next;
    });
  }

  async settle(
    operationId: string,
    providerSessionId: string,
    lockHeld = false,
  ): Promise<CheckoutOperation> {
    const execute = async (): Promise<CheckoutOperation> => {
      const operation = await this.getOperation(operationId);
      if (!operation) throw new CheckoutValidationError(`Unknown checkout operation ${operationId}.`);
      if (operation.status === "paid") return operation;
      if (operation.status !== "provider_created" || operation.providerSessionId !== providerSessionId) {
        throw new CheckoutValidationError(`Checkout operation ${operationId} does not match provider session ${providerSessionId}.`);
      }
      for (const item of operation.inventory) {
        await this.products.commitSaleOnce(item.sku, item.quantity, operation.id);
      }
      const reservation = await this.storage.get<DiscountReservation>(discountReservationKey(operation.id));
      if (reservation?.status === "reserved") {
        if (reservation.kind === "gift_card") {
          const redeemed = await this.giftCards.redeemOnce(reservation.code, reservation.amount, operation.id);
          if (!redeemed.ok) throw new CheckoutValidationError(redeemed.reason);
        } else {
          await this.discounts.incrementCustomUseOnce(reservation.code, operation.id);
        }
        await this.storage.set(discountReservationKey(operation.id), {
          ...reservation,
          status: "committed",
          updatedAt: now(),
        } satisfies DiscountReservation);
      }
      const issuedGiftCard = operation.request.giftCardPurchase
        ? await this.giftCards.issueOnce(operation.request.giftCardPurchase, operation.id)
        : null;
      const next: CheckoutOperation = {
        ...operation,
        status: "paid",
        paidAt: now(),
        updatedAt: now(),
        issuedGiftCardCode: issuedGiftCard?.code ?? operation.issuedGiftCardCode,
      };
      await this.storage.set(operationKey(operation.id), next);
      return next;
    };
    return lockHeld ? execute() : this.withLock(execute);
  }

  async release(operationId: string, expired = false, lockHeld = false): Promise<CheckoutOperation | null> {
    const execute = async (): Promise<CheckoutOperation | null> => {
      const operation = await this.getOperation(operationId);
      if (!operation) return null;
      return this.releaseInternal(operation, expired ? "expired" : "released");
    };
    return lockHeld ? execute() : this.withLock(execute);
  }

  async restoreGiftCardAfterFullRefund(operationId: string, lockHeld = false): Promise<CheckoutOperation> {
    const execute = async (): Promise<CheckoutOperation> => {
      const operation = await this.getOperation(operationId);
      if (!operation) throw new CheckoutValidationError(`Unknown checkout operation ${operationId}.`);
      if (operation.giftCardRefundedAt) return operation;
      if (operation.status !== "paid" || operation.discount?.type !== "gift_card" || !operation.discountAmount) {
        return operation;
      }
      await this.giftCards.refundOnce(
        operation.discount.code,
        operation.discountAmount,
        `checkout-full-refund:${operation.id}`,
      );
      const next = { ...operation, giftCardRefundedAt: now(), updatedAt: now() };
      await this.storage.set(operationKey(operation.id), next);
      return next;
    };
    return lockHeld ? execute() : this.withLock(execute);
  }

  providerLineItems(operation: CheckoutOperation): StripeLineItem[] {
    const lines: StripeLineItem[] = operation.lines.map(line => ({
      name: line.name,
      description: line.description,
      amount: line.unitAmount,
      currency: line.currency as StripeLineItem["currency"],
      quantity: line.quantity,
      images: line.image && /^https?:\/\//i.test(line.image) ? [line.image] : undefined,
    }));
    if (operation.shipping.amount > 0) {
      lines.push({
        name: "Shipping",
        amount: operation.shipping.amount,
        currency: operation.currency as StripeLineItem["currency"],
        quantity: 1,
      });
    }
    if (operation.taxAddedAmount > 0) {
      lines.push({
        name: "Tax",
        amount: operation.taxAddedAmount,
        currency: operation.currency as StripeLineItem["currency"],
        quantity: 1,
      });
    }
    return lines;
  }

  private async resolveLines(request: CheckoutRequest, config: CheckoutConfig): Promise<CheckoutLineSnapshot[]> {
    const lines: CheckoutLineSnapshot[] = [];
    for (const item of request.items) {
      const product = await this.products.getProductById(item.productId);
      if (!product || product.hidden || product.archived) {
        throw new CheckoutValidationError(`Product ${item.productId} is unavailable.`);
      }
      const variant = item.variantId
        ? product.variants?.find(row => row.id === item.variantId)
        : undefined;
      if (item.variantId && !variant) {
        throw new CheckoutValidationError(`Variant ${item.variantId} is unavailable for ${product.name}.`);
      }
      if (!item.variantId && (product.variants?.length ?? 0) > 0) {
        throw new CheckoutValidationError(`Choose a variant for ${product.name}.`);
      }
      if (variant && typeof variant.available === "number" && variant.available < item.quantity) {
        throw new CheckoutValidationError(`Variant ${variant.id} is out of stock.`);
      }
      const rawPrice = variant
        ? (product.onSale && variant.salePrice !== undefined ? variant.salePrice : variant.price)
        : (product.onSale && product.salePrice !== undefined ? product.salePrice : product.price);
      const unitAmount = positiveMoney(rawPrice, `price for ${product.name}`);
      if (unitAmount <= 0) throw new CheckoutValidationError(`${product.name} does not have a payable price.`);
      const currency = (product.currency ?? config.defaultCurrency ?? "gbp").trim().toLowerCase();
      if (!SUPPORTED_CURRENCIES.has(currency)) {
        throw new CheckoutValidationError(`Currency ${currency || "(missing)"} is not supported.`);
      }
      if (lines[0] && lines[0].currency !== currency) {
        throw new CheckoutValidationError("A checkout cannot mix currencies.");
      }
      lines.push({
        productId: product.id,
        productSlug: product.slug,
        variantId: variant?.id,
        sku: variant?.sku ?? product.stockSku,
        name: product.name,
        description: variant ? variantDescription(product, variant.id) : undefined,
        quantity: item.quantity,
        unitAmount,
        currency,
        taxBehavior: product.taxBehavior ?? "inclusive",
        digital: product.digital === true,
        weightGrams: product.digital ? 0 : Math.max(0, Math.round(product.weightGrams ?? 0)),
        image: variant?.image ?? product.image,
        downloadUrl: product.digital ? product.downloadUrl : undefined,
        taxable: true,
        kind: "catalogue",
      });
    }
    if (request.giftCardPurchase) {
      const allowed = config.giftCardDenominations ?? [2_500, 5_000, 10_000];
      if (!allowed.includes(request.giftCardPurchase.amount)) {
        throw new CheckoutValidationError("That gift-card denomination is not available.");
      }
      const currency = (config.defaultCurrency ?? "gbp").trim().toLowerCase();
      if (!SUPPORTED_CURRENCIES.has(currency)) {
        throw new CheckoutValidationError(`Currency ${currency || "(missing)"} is not supported.`);
      }
      lines.push({
        productId: "gift-card",
        productSlug: "gift-card",
        name: "Gift card",
        description: `For ${request.giftCardPurchase.recipientName}`,
        quantity: 1,
        unitAmount: request.giftCardPurchase.amount,
        currency,
        taxBehavior: "inclusive",
        digital: true,
        weightGrams: 0,
        taxable: false,
        kind: "gift_card_purchase",
      });
    }
    return lines;
  }

  private async resolveDiscount(
    request: CheckoutRequest,
    config: CheckoutConfig,
    subtotal: number,
  ): Promise<AppliedDiscount | undefined> {
    if (request.discountCode) {
      const result = await this.discounts.resolveCode(request.discountCode, subtotal, []);
      if (!result.ok) throw new CheckoutValidationError(result.reason);
      return result.discount;
    }
    if (request.endCustomerUserId) {
      return (await this.discounts.resolveForUser({
        agencyId: config.agencyId,
        clientId: config.clientId,
        userId: request.endCustomerUserId,
        subtotal,
      })) ?? undefined;
    }
    return undefined;
  }

  private async resolveShipping(
    request: CheckoutRequest,
    lines: CheckoutLineSnapshot[],
    subtotal: number,
    discount?: AppliedDiscount,
  ): Promise<CheckoutShippingSnapshot> {
    if (lines.every(line => line.digital)) return { amount: 0 };
    const zones = (await this.storage.get<ShippingZone[]>(SHIPPING_ZONES_KEY)) ?? [];
    const rates = (await this.storage.get<ShippingRate[]>(SHIPPING_RATES_KEY)) ?? [];
    if (zones.length === 0 && rates.length === 0) {
      throw new CheckoutValidationError("Shipping is not configured for physical products.");
    }
    const zone = request.shippingCountry
      ? zones.find(row => row.countries.map(country => country.toUpperCase()).includes(request.shippingCountry!))
      : zones.find(row => row.default);
    if (!zone) throw new CheckoutValidationError("No shipping zone serves this checkout.");
    if (zone.countries.length === 0) throw new CheckoutValidationError(`Shipping zone ${zone.name} has no countries.`);
    const quote = calculateShipping({
      rates,
      zoneId: zone.id,
      cartSubtotal: subtotal,
      weightGrams: lines.reduce((sum, line) => sum + line.weightGrams * line.quantity, 0),
    });
    if (!quote) throw new CheckoutValidationError(`No active shipping rate is configured for ${zone.name}.`);
    const customCode = discount ? await this.discounts.getCustomCode(discount.code) : null;
    return {
      country: request.shippingCountry,
      zoneId: zone.id,
      rateId: quote.rateId,
      amount: customCode?.type === "freeship" ? 0 : positiveMoney(quote.amount, "shipping amount"),
      allowedCountries: zone.countries.map(country => country.toUpperCase()),
    };
  }

  private calculateTax(
    lines: CheckoutLineSnapshot[],
    discountAmount: number,
    taxRatePercent: number,
  ): { taxAmount: number; taxAddedAmount: number } {
    if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) {
      throw new CheckoutValidationError("Configured tax rate must be between 0 and 100 percent.");
    }
    const rateBps = Math.round(taxRatePercent * 100);
    if (rateBps === 0) return { taxAmount: 0, taxAddedAmount: 0 };
    const subtotal = lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
    let remainingDiscount = discountAmount;
    let taxAmount = 0;
    let taxAddedAmount = 0;
    lines.forEach((line, index) => {
      const lineTotal = line.unitAmount * line.quantity;
      const lineDiscount = index === lines.length - 1
        ? remainingDiscount
        : Math.min(remainingDiscount, Math.round(discountAmount * lineTotal / subtotal));
      remainingDiscount -= lineDiscount;
      const taxable = Math.max(0, lineTotal - lineDiscount);
      if (line.taxable === false) return;
      if (line.taxBehavior === "exclusive") {
        const added = Math.round(taxable * rateBps / 10_000);
        taxAmount += added;
        taxAddedAmount += added;
      } else {
        taxAmount += Math.round(taxable * rateBps / (10_000 + rateBps));
      }
    });
    return { taxAmount, taxAddedAmount };
  }

  private inventoryTotals(lines: CheckoutLineSnapshot[]): Array<{ sku: string; quantity: number }> {
    const totals = new Map<string, number>();
    for (const line of lines) {
      if (!line.sku) continue;
      totals.set(line.sku, (totals.get(line.sku) ?? 0) + line.quantity);
    }
    return [...totals.entries()].map(([sku, quantity]) => ({ sku, quantity }));
  }

  private async reserveDiscount(operation: CheckoutOperation): Promise<void> {
    const discount = operation.discount;
    if (!discount) return;
    const existing = await this.storage.get<DiscountReservation>(discountReservationKey(operation.id));
    if (existing?.status === "reserved" || existing?.status === "committed") return;
    const giftCard = await this.giftCards.getCard(discount.code);
    const custom = giftCard ? null : await this.discounts.getCustomCode(discount.code);
    if (!giftCard && !custom) return;
    const keys = await this.storage.list(DISCOUNT_RESERVATION_PREFIX);
    const rows = await Promise.all(keys.map(key => this.storage.get<DiscountReservation>(key)));
    const active = rows.filter((row): row is DiscountReservation =>
      Boolean(row && row.operationId !== operation.id && row.code === discount.code && row.status === "reserved"),
    );
    if (giftCard) {
      const reserved = active.reduce((sum, row) => sum + row.amount, 0);
      if (giftCard.balance - reserved < operation.discountAmount) {
        throw new CheckoutValidationError("This gift card no longer has enough available balance.");
      }
    }
    if (custom?.maxUses && custom.uses + active.length >= custom.maxUses) {
      throw new CheckoutValidationError(`Discount code ${custom.code} has reached its usage limit.`);
    }
    await this.storage.set(discountReservationKey(operation.id), {
      operationId: operation.id,
      code: discount.code,
      kind: giftCard ? "gift_card" : "custom",
      amount: operation.discountAmount,
      status: "reserved",
      createdAt: now(),
      updatedAt: now(),
    } satisfies DiscountReservation);
  }

  private async releaseInternal(
    operation: CheckoutOperation,
    status: "released" | "expired",
  ): Promise<CheckoutOperation> {
    if (operation.status === "paid" || operation.status === "released" || operation.status === "expired") {
      return operation;
    }
    for (const item of operation.inventory) {
      await this.products.releaseReservedOnce(item.sku, item.quantity, operation.id);
    }
    const reservation = await this.storage.get<DiscountReservation>(discountReservationKey(operation.id));
    if (reservation?.status === "reserved") {
      await this.storage.set(discountReservationKey(operation.id), {
        ...reservation,
        status: "released",
        updatedAt: now(),
      } satisfies DiscountReservation);
    }
    const next: CheckoutOperation = {
      ...operation,
      status,
      releasedAt: now(),
      updatedAt: now(),
    };
    await this.storage.set(operationKey(operation.id), next);
    return next;
  }

  private async releaseExpiredOperations(lockHeld = false): Promise<void> {
    const execute = async () => {
      const keys = await this.storage.list(OPERATION_PREFIX);
      for (const key of keys) {
        const operation = await this.storage.get<CheckoutOperation>(key);
        if (!operation || operation.expiresAt > now()) continue;
        if (operation.status === "preparing" || operation.status === "reserved" || operation.status === "provider_created") {
          await this.releaseInternal(operation, "expired");
        }
      }
    };
    if (lockHeld) return execute();
    await this.withLock(execute);
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    if (this.storage.runExclusive) {
      return this.storage.runExclusive("ecommerce:checkout-collection", operation);
    }
    return localExclusive("ecommerce:checkout-collection", operation);
  }
}
