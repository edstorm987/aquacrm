// Per-client product catalog — CRUD over the per-install storage slice.
//
// The 02 implementation kept a hardcoded PRODUCTS array + localStorage
// overrides. In 04 each client's catalog lives entirely in the install
// storage namespace under keys:
//
//   products/<slug>     — the canonical Product row
//   override/<slug>     — partial override (promo flips)
//   inventory/<sku>     — InventoryItemSnapshot
//
// Reads merge override + inventory into the returned Product.

import { now } from "../lib/time";
import { makeId } from "../lib/ids";
import { applyOverride, computeAvailable } from "../lib/products";
import type {
  InventoryItemSnapshot,
  Product,
  ProductOverride,
} from "../lib/products";
import type { StoragePort } from "./ports";
import type { ProductCollection } from "../lib/admin/collections";

const PRODUCT_KEY_PREFIX = "products/";
const OVERRIDE_KEY_PREFIX = "override/";
const INVENTORY_KEY_PREFIX = "inventory/";
const COLLECTIONS_KEY = "collections";
const RENAME_OPERATION_PREFIX = "product-rename-operation/";
const localTails = new Map<string, Promise<void>>();

export class ProductConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductConflictError";
  }
}

interface ProductRenameOperation {
  productId: string;
  fromSlug: string;
  toSlug: string;
  expectedVersion: number;
  target: Product;
  status: "pending" | "completed";
  updatedAt: number;
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

export interface ProductListOptions {
  includeHidden?: boolean;
  includeArchived?: boolean;
}

export class ProductService {
  constructor(private storage: StoragePort) {}

  private productKey(slug: string): string { return `${PRODUCT_KEY_PREFIX}${slug}`; }
  private overrideKey(slug: string): string { return `${OVERRIDE_KEY_PREFIX}${slug}`; }
  private inventoryKey(sku: string): string { return `${INVENTORY_KEY_PREFIX}${sku}`; }

  // ─── Reads ──────────────────────────────────────────────────────────

  async getProduct(slug: string): Promise<Product | null> {
    const base = await this.storage.get<Product>(this.productKey(slug));
    if (!base) return null;
    const override = await this.storage.get<ProductOverride>(this.overrideKey(slug));
    const inv = await this.loadInventoryMap();
    return computeAvailable(applyOverride(base, override), inv);
  }

  async getProductById(id: string): Promise<Product | null> {
    const products = await this.listProducts({ includeHidden: true, includeArchived: true });
    return products
      .filter(product => product.id === id)
      .sort((left, right) => (right.version ?? 1) - (left.version ?? 1))[0] ?? null;
  }

  async listProducts(options: ProductListOptions = {}): Promise<Product[]> {
    const keys = await this.storage.list(PRODUCT_KEY_PREFIX);
    const base = await Promise.all(keys.map(k => this.storage.get<Product>(k)));
    const inv = await this.loadInventoryMap();
    const overrides = await this.loadOverrideMap();
    const merged = base
      .filter((p): p is Product => p !== undefined)
      .map(p => computeAvailable(applyOverride(p, overrides[p.slug]), inv));
    return merged.filter(p => {
      if (!options.includeHidden && p.hidden) return false;
      if (!options.includeArchived && p.archived) return false;
      return true;
    });
  }

  private async loadInventoryMap(): Promise<Record<string, InventoryItemSnapshot>> {
    const keys = await this.storage.list(INVENTORY_KEY_PREFIX);
    const items = await Promise.all(keys.map(k => this.storage.get<InventoryItemSnapshot>(k)));
    const out: Record<string, InventoryItemSnapshot> = {};
    for (const item of items) {
      if (item) out[item.sku] = item;
    }
    return out;
  }

  private async loadOverrideMap(): Promise<Record<string, ProductOverride>> {
    const keys = await this.storage.list(OVERRIDE_KEY_PREFIX);
    const items = await Promise.all(keys.map(k => this.storage.get<ProductOverride>(k)));
    const out: Record<string, ProductOverride> = {};
    for (const item of items) {
      if (item) out[item.slug] = item;
    }
    return out;
  }

  // ─── Writes ─────────────────────────────────────────────────────────

  async upsertProduct(product: Product): Promise<Product> {
    const next: Product = {
      ...product,
      createdAt: product.createdAt ?? now(),
      updatedAt: now(),
      version: product.version ?? 1,
    };
    await this.storage.set(this.productKey(product.slug), next);
    return next;
  }

  async saveProductDetails(
    input: Product,
    expectedVersion?: number,
  ): Promise<Product> {
    return this.withProductLock(async () => {
      if (expectedVersion !== undefined) {
        const replay = await this.findRenameOperation(input.id, input.slug, expectedVersion);
        if (replay) return this.executeRename(replay);
      }
      const existing = await this.getProductById(input.id);
      if (existing && expectedVersion !== undefined && (existing.version ?? 1) !== expectedVersion) {
        throw new ProductConflictError(
          `${existing.name} changed in another editor. Reload before saving your product details.`,
        );
      }
      const slugOwner = await this.getProduct(input.slug);
      if (slugOwner && slugOwner.id !== input.id) {
        throw new ProductConflictError(`Product slug ${input.slug} is already in use.`);
      }
      const next: Product = {
        ...(existing ?? input),
        // Details command deliberately cannot replace the separately edited
        // option and variant graph.
        ...input,
        options: existing?.options ?? input.options,
        variants: existing?.variants ?? input.variants,
        id: existing?.id ?? input.id,
        createdAt: existing?.createdAt ?? input.createdAt ?? now(),
        updatedAt: Math.max(now(), (existing?.updatedAt ?? 0) + 1),
        version: (existing?.version ?? 0) + 1,
      };
      if (!next.id.trim() || !next.slug.trim() || !next.name.trim()) {
        throw new ProductConflictError("Product id, slug and name are required.");
      }
      if (!Number.isSafeInteger(next.price) || next.price < 0) {
        throw new ProductConflictError("Product price must be a non-negative integer.");
      }
      if (existing && existing.slug !== next.slug) {
        const rename: ProductRenameOperation = {
          productId: next.id,
          fromSlug: existing.slug,
          toSlug: next.slug,
          expectedVersion: existing.version ?? 1,
          target: next,
          status: "pending",
          updatedAt: now(),
        };
        await this.storage.set(this.renameOperationKey(rename), rename);
        return this.executeRename(rename);
      }
      await this.storage.set(this.productKey(next.slug), next);
      return next;
    });
  }

  async createProduct(input: Product): Promise<Product> {
    return this.withProductLock(async () => {
      const slugOwner = await this.getProduct(input.slug);
      if (slugOwner) throw new ProductConflictError(`Product slug ${input.slug} is already in use.`);
      if (!input.slug.trim() || !input.name.trim()) {
        throw new ProductConflictError("Product slug and name are required.");
      }
      if (!Number.isSafeInteger(input.price) || input.price < 0) {
        throw new ProductConflictError("Product price must be a non-negative integer.");
      }
      const createdAt = now();
      const next: Product = {
        ...input,
        id: makeId("product"),
        createdAt,
        updatedAt: createdAt,
        version: 1,
      };
      await this.storage.set(this.productKey(next.slug), next);
      return next;
    });
  }

  async saveProductVariants(
    productId: string,
    expectedVersion: number,
    options: Product["options"],
    variants: Product["variants"],
  ): Promise<Product> {
    return this.withProductLock(async () => {
      const existing = await this.getProductById(productId);
      if (!existing) throw new ProductConflictError("Product no longer exists.");
      if ((existing.version ?? 1) !== expectedVersion) {
        throw new ProductConflictError(
          `${existing.name} changed in another editor. Reload and merge before saving variants.`,
        );
      }
      const optionIds = new Set<string>();
      const optionValues = new Map<string, Set<string>>();
      for (const option of options ?? []) {
        if (!option.id.trim() || optionIds.has(option.id)) {
          throw new ProductConflictError(`Option id ${option.id || "(missing)"} is duplicated or empty.`);
        }
        optionIds.add(option.id);
        const valueIds = new Set<string>();
        for (const value of option.values) {
          if (!value.id.trim() || valueIds.has(value.id)) {
            throw new ProductConflictError(`Option ${option.id} has a duplicated or empty value id.`);
          }
          valueIds.add(value.id);
        }
        optionValues.set(option.id, valueIds);
      }
      const variantIds = new Set<string>();
      const variantSkus = new Set<string>();
      for (const variant of variants ?? []) {
        if (!variant.id.trim() || variantIds.has(variant.id)) {
          throw new ProductConflictError(`Variant id ${variant.id || "(missing)"} is duplicated or empty.`);
        }
        variantIds.add(variant.id);
        if (variant.sku) {
          if (variantSkus.has(variant.sku)) throw new ProductConflictError(`Variant SKU ${variant.sku} is duplicated.`);
          variantSkus.add(variant.sku);
        }
        for (const [optionId, valueId] of Object.entries(variant.optionValues)) {
          if (!optionIds.has(optionId)) {
            throw new ProductConflictError(`Variant ${variant.id} references missing option ${optionId}.`);
          }
          if (!optionValues.get(optionId)?.has(valueId)) {
            throw new ProductConflictError(`Variant ${variant.id} references missing value ${optionId}=${valueId}.`);
          }
        }
        for (const option of options ?? []) {
          if (option.required !== false && !variant.optionValues[option.id]) {
            throw new ProductConflictError(`Variant ${variant.id} is missing required option ${option.id}.`);
          }
        }
        if (!Number.isSafeInteger(variant.price) || variant.price < 0) {
          throw new ProductConflictError(`Variant ${variant.id} has an invalid price.`);
        }
        if (variant.salePrice !== undefined && (!Number.isSafeInteger(variant.salePrice) || variant.salePrice < 0)) {
          throw new ProductConflictError(`Variant ${variant.id} has an invalid sale price.`);
        }
        if (variant.available !== undefined && (!Number.isSafeInteger(variant.available) || variant.available < 0)) {
          throw new ProductConflictError(`Variant ${variant.id} has invalid availability.`);
        }
      }
      const next: Product = {
        ...existing,
        options: options ?? [],
        variants: variants ?? [],
        updatedAt: Math.max(now(), (existing.updatedAt ?? 0) + 1),
        version: (existing.version ?? 1) + 1,
      };
      await this.storage.set(this.productKey(next.slug), next);
      return next;
    });
  }

  async archiveProduct(slug: string, expectedVersion?: number): Promise<Product | null> {
    return this.withProductLock(async () => {
      const existing = await this.getProduct(slug);
      if (!existing) return null;
      if (expectedVersion !== undefined && (existing.version ?? 1) !== expectedVersion) {
        throw new ProductConflictError(`${existing.name} changed before it could be archived.`);
      }
      const next: Product = {
        ...existing,
        archived: true,
        hidden: true,
        updatedAt: Math.max(now(), (existing.updatedAt ?? 0) + 1),
        version: (existing.version ?? 1) + 1,
      };
      await this.storage.set(this.productKey(slug), next);
      return next;
    });
  }

  async deleteProduct(slug: string): Promise<boolean> {
    const existing = await this.storage.get<Product>(this.productKey(slug));
    if (!existing) return false;
    await this.storage.del(this.productKey(slug));
    await this.storage.del(this.overrideKey(slug));
    return true;
  }

  // ─── Overrides ──────────────────────────────────────────────────────

  async setOverride(slug: string, override: ProductOverride): Promise<void> {
    await this.storage.set(this.overrideKey(slug), override);
  }

  async clearOverride(slug: string): Promise<void> {
    await this.storage.del(this.overrideKey(slug));
  }

  // ─── Inventory ──────────────────────────────────────────────────────

  async setInventory(item: InventoryItemSnapshot): Promise<void> {
    await this.storage.set(this.inventoryKey(item.sku), item);
  }

  async getInventory(sku: string): Promise<InventoryItemSnapshot | null> {
    const stored = await this.storage.get<InventoryItemSnapshot>(this.inventoryKey(sku));
    return stored ?? null;
  }

  async listInventory(): Promise<InventoryItemSnapshot[]> {
    const keys = await this.storage.list(INVENTORY_KEY_PREFIX);
    const items = await Promise.all(keys.map(k => this.storage.get<InventoryItemSnapshot>(k)));
    return items.filter((i): i is InventoryItemSnapshot => i !== undefined);
  }

  // Reserve stock for a pending sale; rollback via `releaseReserved`.
  async reserveStock(sku: string, quantity: number): Promise<{ ok: true } | { ok: false; error: string }> {
    const item = await this.getInventory(sku);
    if (!item) return { ok: false, error: `Unknown SKU: ${sku}` };
    if (item.unlimited) return { ok: true };
    const available = item.onHand - item.reserved;
    if (available < quantity) return { ok: false, error: `Out of stock for ${sku}` };
    await this.setInventory({ ...item, reserved: item.reserved + quantity, version: (item.version ?? 1) + 1 });
    return { ok: true };
  }

  async releaseReserved(sku: string, quantity: number): Promise<void> {
    const item = await this.getInventory(sku);
    if (!item || item.unlimited) return;
    await this.setInventory({
      ...item,
      reserved: Math.max(0, item.reserved - quantity),
      version: (item.version ?? 1) + 1,
    });
  }

  async commitSale(sku: string, quantity: number): Promise<void> {
    const item = await this.getInventory(sku);
    if (!item || item.unlimited) return;
    await this.setInventory({
      ...item,
      onHand: Math.max(0, item.onHand - quantity),
      reserved: Math.max(0, item.reserved - quantity),
      version: (item.version ?? 1) + 1,
    });
  }

  async reserveStockOnce(sku: string, quantity: number, operationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const item = await this.getInventory(sku);
    if (!item) return { ok: false, error: `Unknown SKU: ${sku}` };
    if (item.unlimited) return { ok: true };
    const state = item.checkoutOperations?.[operationId];
    if (state === "reserved" || state === "committed") return { ok: true };
    if (state === "released") return { ok: false, error: `Checkout ${operationId} already released ${sku}.` };
    const available = item.onHand - item.reserved;
    if (available < quantity) return { ok: false, error: `Out of stock for ${sku}` };
    await this.setInventory({
      ...item,
      reserved: item.reserved + quantity,
      checkoutOperations: { ...item.checkoutOperations, [operationId]: "reserved" },
      version: (item.version ?? 1) + 1,
    });
    return { ok: true };
  }

  async releaseReservedOnce(sku: string, quantity: number, operationId: string): Promise<void> {
    const item = await this.getInventory(sku);
    if (!item || item.unlimited) return;
    const state = item.checkoutOperations?.[operationId];
    if (state === "released" || state === "committed" || state === undefined) return;
    await this.setInventory({
      ...item,
      reserved: Math.max(0, item.reserved - quantity),
      checkoutOperations: { ...item.checkoutOperations, [operationId]: "released" },
      version: (item.version ?? 1) + 1,
    });
  }

  async commitSaleOnce(sku: string, quantity: number, operationId: string): Promise<void> {
    const item = await this.getInventory(sku);
    if (!item || item.unlimited) return;
    const state = item.checkoutOperations?.[operationId];
    if (state === "committed") return;
    if (state !== "reserved") {
      throw new Error(`Checkout ${operationId} has no active reservation for ${sku}.`);
    }
    await this.setInventory({
      ...item,
      onHand: Math.max(0, item.onHand - quantity),
      reserved: Math.max(0, item.reserved - quantity),
      checkoutOperations: { ...item.checkoutOperations, [operationId]: "committed" },
      version: (item.version ?? 1) + 1,
    });
  }

  private async withProductLock<T>(operation: () => Promise<T>): Promise<T> {
    if (this.storage.runExclusive) return this.storage.runExclusive("ecommerce:product-collection", operation);
    return localExclusive("ecommerce:product-collection", operation);
  }

  private renameOperationKey(operation: Pick<ProductRenameOperation, "productId" | "toSlug" | "expectedVersion">): string {
    return `${RENAME_OPERATION_PREFIX}${encodeURIComponent(operation.productId)}/${operation.expectedVersion}/${encodeURIComponent(operation.toSlug)}`;
  }

  private async findRenameOperation(
    productId: string,
    toSlug: string,
    expectedVersion: number,
  ): Promise<ProductRenameOperation | null> {
    return (await this.storage.get<ProductRenameOperation>(this.renameOperationKey({ productId, toSlug, expectedVersion }))) ?? null;
  }

  private async executeRename(operation: ProductRenameOperation): Promise<Product> {
    await this.storage.set(this.productKey(operation.toSlug), operation.target);
    const collections = (await this.storage.get<ProductCollection[]>(COLLECTIONS_KEY)) ?? [];
    const migrated = collections.map(collection => ({
      ...collection,
      productSlugs: collection.productSlugs.map(slug => slug === operation.fromSlug ? operation.toSlug : slug),
      updatedAt: collection.productSlugs.includes(operation.fromSlug) ? now() : collection.updatedAt,
    }));
    await this.storage.set(COLLECTIONS_KEY, migrated);
    await this.storage.del(this.productKey(operation.fromSlug));
    await this.storage.del(this.overrideKey(operation.fromSlug));
    await this.storage.set(this.renameOperationKey(operation), {
      ...operation,
      status: "completed",
      updatedAt: now(),
    } satisfies ProductRenameOperation);
    return operation.target;
  }
}
